import { useEffect, useRef, useState } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';

interface ImageCropperProps {
  file: File;
  /** width / height of the crop box and output image, e.g. 3 for a 3:1 banner, 1 for a square avatar. */
  aspect: number;
  outputWidth?: number;
  onCancel: () => void;
  onCropped: (file: File) => void;
}

/**
 * Minimal drag-to-pan + slider-to-zoom cropper — no external dependency, since nothing else in
 * this codebase needed image editing yet. The source image always covers the crop box ("cover"
 * fit at zoom 1), so panning/zooming can never reveal empty space around it.
 */
export function ImageCropper({ file, aspect, outputWidth = 1200, onCancel, onCropped }: ImageCropperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);

  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  // Tracks which (image, box-size) pair the current zoom/offset were centered for, so a new file
  // or a resize re-centers exactly once. Set during render rather than in an effect — this is
  // React's documented "adjusting state when a prop changes" pattern, and avoids an extra
  // commit-then-effect render pass for something this simple.
  const [centeredFor, setCenteredFor] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setImgEl(img);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setBoxSize({ w: el.clientWidth, h: el.clientWidth / aspect });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [aspect]);

  // Re-center whenever a new image loads or the box is (re)measured.
  const readyKey = imgEl && boxSize.w > 0 ? `${imgEl.src}#${boxSize.w}x${boxSize.h}` : null;
  if (readyKey !== null && readyKey !== centeredFor) {
    setCenteredFor(readyKey);
    const baseScale = Math.max(boxSize.w / imgEl!.naturalWidth, boxSize.h / imgEl!.naturalHeight);
    const dispW = imgEl!.naturalWidth * baseScale;
    const dispH = imgEl!.naturalHeight * baseScale;
    setZoom(1);
    setOffset({ x: (boxSize.w - dispW) / 2, y: (boxSize.h - dispH) / 2 });
  }

  function baseScaleFor(img: HTMLImageElement) {
    return Math.max(boxSize.w / img.naturalWidth, boxSize.h / img.naturalHeight);
  }

  function clamp(x: number, y: number, z: number) {
    if (!imgEl) return { x, y };
    const scale = baseScaleFor(imgEl) * z;
    const dispW = imgEl.naturalWidth * scale;
    const dispH = imgEl.naturalHeight * scale;
    const minX = Math.min(0, boxSize.w - dispW);
    const minY = Math.min(0, boxSize.h - dispH);
    return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffsetX: offset.x, startOffsetY: offset.y };
    setDragging(true);
  }
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clamp(dragRef.current.startOffsetX + dx, dragRef.current.startOffsetY + dy, zoom));
  }
  function handlePointerUp() {
    dragRef.current = null;
    setDragging(false);
  }

  function handleZoomChange(next: number) {
    setZoom(next);
    setOffset(o => clamp(o.x, o.y, next));
  }

  function handleApply() {
    if (!imgEl) return;
    const outH = Math.round(outputWidth / aspect);
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const scale = baseScaleFor(imgEl) * zoom;
    const sx = -offset.x / scale;
    const sy = -offset.y / scale;
    const sW = boxSize.w / scale;
    const sH = boxSize.h / scale;
    ctx.drawImage(imgEl, sx, sy, sW, sH, 0, 0, outputWidth, outH);
    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    canvas.toBlob((blob) => {
      if (!blob) return;
      onCropped(new File([blob], file.name, { type: mime }));
    }, mime, 0.9);
  }

  const dispW = imgEl ? imgEl.naturalWidth * baseScaleFor(imgEl) * zoom : 0;
  const dispH = imgEl ? imgEl.naturalHeight * baseScaleFor(imgEl) * zoom : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        ref={containerRef}
        style={{
          position: 'relative', width: '100%', aspectRatio: String(aspect),
          overflow: 'hidden', borderRadius: 8, background: 'var(--raised)',
          touchAction: 'none', cursor: dragging ? 'grabbing' : imgEl ? 'grab' : 'default',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {imgEl && (
          <img
            src={imgEl.src}
            alt="Crop preview"
            draggable={false}
            style={{ position: 'absolute', left: offset.x, top: offset.y, width: dispW, height: dispH, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none' }}
          />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ZoomOut size={14} color="var(--txt-dim)" aria-hidden />
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => handleZoomChange(Number(e.target.value))}
          aria-label="Zoom"
          style={{ flex: 1 }}
        />
        <ZoomIn size={14} color="var(--txt-dim)" aria-hidden />
      </div>
      <div style={{ fontSize: 11, color: 'var(--txt-dim)', textAlign: 'center' }}>Drag to reposition · use the slider to zoom</div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button
          onClick={onCancel}
          style={{ padding: '7px 14px', background: 'var(--raised)', border: '1px solid var(--line2)', borderRadius: 6, fontSize: 12.5, color: 'var(--txt-mut)', cursor: 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          disabled={!imgEl}
          style={{ padding: '7px 16px', background: 'var(--brand)', border: 'none', borderRadius: 6, fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: imgEl ? 'pointer' : 'not-allowed', opacity: imgEl ? 1 : 0.6 }}
        >
          Apply crop
        </button>
      </div>
    </div>
  );
}
