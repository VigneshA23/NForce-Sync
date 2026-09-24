import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';

export interface DraggablePosition {
  right: number;
  bottom: number;
}

interface UseDraggablePositionOptions {
  /** Per-user sessionStorage key, matching this widget's own conversation-persistence idiom. */
  storageKey: string | null;
  defaultPosition: DraggablePosition;
  /** The actual fixed-position element, used to measure size for viewport clamping. */
  elementRef: RefObject<HTMLElement | null>;
}

function readStored(key: string | null): DraggablePosition | null {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.right === 'number' && typeof parsed?.bottom === 'number') return parsed;
  } catch {
    // Corrupt/blocked storage — fall back to the default position silently.
  }
  return null;
}

function writeStored(key: string | null, pos: DraggablePosition) {
  if (!key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify(pos));
  } catch {
    // Best-effort — a lost position just means it resets to default next open.
  }
}

const DRAG_THRESHOLD_PX = 4;

/**
 * Pointer-events based drag (mouse + touch in one code path), matching ImageCropper.tsx's
 * pattern. Position is tracked as `{ right, bottom }` — the same coordinate space the
 * launcher/panel already use for `position: fixed` — clamped to the viewport and re-clamped on
 * resize. Persists per-user in sessionStorage once a drag actually moves the element.
 */
export function useDraggablePosition({ storageKey, defaultPosition, elementRef }: UseDraggablePositionOptions) {
  const [position, setPosition] = useState<DraggablePosition>(() => readStored(storageKey) ?? defaultPosition);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startRight: number; startBottom: number } | null>(null);
  const movedRef = useRef(false);

  const clamp = useCallback((pos: DraggablePosition): DraggablePosition => {
    const el = elementRef.current;
    const w = el?.offsetWidth ?? 0;
    const h = el?.offsetHeight ?? 0;
    const maxRight = Math.max(0, window.innerWidth - w);
    const maxBottom = Math.max(0, window.innerHeight - h);
    return {
      right: Math.min(maxRight, Math.max(0, pos.right)),
      bottom: Math.min(maxBottom, Math.max(0, pos.bottom)),
    };
  }, [elementRef]);

  useEffect(() => {
    // Deferred a frame: the element isn't laid out yet when this effect first runs, so clamping
    // synchronously here would measure a 0x0 box. rAF runs after that layout pass.
    const raf = requestAnimationFrame(() => setPosition((p) => clamp(p)));
    function onResize() {
      setPosition((p) => clamp(p));
    }
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPointerDown(e: PointerEvent) {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startRight: position.right, startBottom: position.bottom };
    movedRef.current = false;
    setDragging(true);
  }

  function onPointerMove(e: PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) movedRef.current = true;
    // Moving the pointer right/down shrinks the distance from the right/bottom edge.
    setPosition(clamp({ right: dragRef.current.startRight - dx, bottom: dragRef.current.startBottom - dy }));
  }

  function onPointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    if (movedRef.current) {
      setPosition((p) => {
        writeStored(storageKey, p);
        return p;
      });
    }
  }

  /** Suppresses the click that follows a real drag, so dragging the bubble doesn't also toggle it open/closed. */
  function onClickCapture(e: { preventDefault: () => void; stopPropagation: () => void }) {
    if (movedRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  return {
    position,
    dragging,
    dragHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    onClickCapture,
  };
}
