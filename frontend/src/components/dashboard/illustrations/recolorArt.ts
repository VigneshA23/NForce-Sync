/**
 * Re-tints the red parts of a raster artwork (OneHR's hero scene: red backdrop, leaves, glow) to
 * another hue, leaving everything else — skin, the navy suit, the green plant, the white mug —
 * untouched. A plain CSS hue-rotate can't do that: it would turn the face and plant too.
 *
 * Per pixel: how "red" it is (hue distance from red + saturation) gives a 0–1 weight; the pixel's
 * hue is moved to the target hue by that weight. Skin (orange-side hue, moderate saturation, high
 * lightness) is excluded on all three counts, so faces and hands stay natural.
 */

// Asymmetric: skin and warm highlights lie on the orange side of red, so that side is narrow;
// the backdrop's deep shadows drift toward magenta, so that side reaches further.
const ORANGE_FULL_DEG = 8;
const ORANGE_NONE_DEG = 18;
const MAGENTA_FULL_DEG = 22;
const MAGENTA_NONE_DEG = 40;
// Skin sits at moderate saturation and high lightness; the backdrop is saturated and mid/dark.
const SAT_NONE = 0.42;
const SAT_FULL = 0.6;
// Magenta side holds no skin, so its muted reds (the translucent chart card, dark corners) count too.
const MAGENTA_SAT_NONE = 0.1;
const MAGENTA_SAT_FULL = 0.26;
const LIGHT_FULL = 0.55;
const LIGHT_NONE = 0.72;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

// The masks are soft where the figure meets the backdrop; only recolor where they are clearly
// opaque, so skin along that soft edge (hairline, jaw, fingers) is never partly tinted.
const MASK_NONE = 0.55;
const MASK_FULL = 0.92;

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = h / 360;
  return [hue2rgb(p, q, hk + 1 / 3) * 255, hue2rgb(p, q, hk) * 255, hue2rgb(p, q, hk - 1 / 3) * 255];
}

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** 0–1: how strongly a pixel counts as "the red backdrop" (vs. skin, lips, warm highlights). */
export function redWeight(hueDeg: number, sat: number, light = 0.4): number {
  if (hueDeg >= 180) {
    const hueW = 1 - smooth(MAGENTA_FULL_DEG, MAGENTA_NONE_DEG, 360 - hueDeg);
    return hueW * smooth(MAGENTA_SAT_NONE, MAGENTA_SAT_FULL, sat);
  }
  const hueW = 1 - smooth(ORANGE_FULL_DEG, ORANGE_NONE_DEG, hueDeg);
  const lightW = 1 - smooth(LIGHT_FULL, LIGHT_NONE, light);
  return hueW * smooth(SAT_NONE, SAT_FULL, sat) * lightW;
}

/** Recolor RGBA pixel data in place, moving red hues to `targetHex`'s hue. `mask` (RGBA pixels of
 *  the same size) limits the recolor to where its alpha is set — OneHR's accent masks are clear
 *  over the person, so skin can never be tinted whatever its hue. */
export function recolorPixels(data: Uint8ClampedArray, targetHex: string, mask?: Uint8ClampedArray): void {
  const n = parseInt(targetHex.slice(1), 16);
  const [targetHue, targetSat] = rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const [h, s, l] = rgbToHsl(r, g, b);
    const w = redWeight(h, s, l) * (mask ? smooth(MASK_NONE, MASK_FULL, mask[i + 3] / 255) : 1);
    if (w <= 0) continue;
    // Keep the pixel's own lightness (the art's shading); take the target's hue, and pull
    // saturation toward the target's so muted accents (e.g. purple) don't come out neon.
    const [nr, ng, nb] = hslToRgb(targetHue, s * 0.6 + targetSat * 0.4, l);
    data[i] = r + (nr - r) * w;
    data[i + 1] = g + (ng - g) * w;
    data[i + 2] = b + (nb - b) * w;
  }
}

const cache = new Map<string, Promise<string>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

/** Object URL of `src` recolored to `targetHex` — computed once per (src, color) and cached.
 *  With `maskSrc`, only the area the mask's alpha covers is recolored. */
export function recoloredImageUrl(src: string, targetHex: string, maskSrc?: string): Promise<string> {
  const key = `${src}|${targetHex}|${maskSrc ?? ''}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const [img, maskImg] = await Promise.all([loadImage(src), maskSrc ? loadImage(maskSrc) : null]);
      const w = img.naturalWidth, h = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2d context unavailable');
      let mask: Uint8ClampedArray | undefined;
      if (maskImg) {
        ctx.drawImage(maskImg, 0, 0, w, h);
        mask = ctx.getImageData(0, 0, w, h).data;
        ctx.clearRect(0, 0, w, h);
      }
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, w, h);
      recolorPixels(pixels.data, targetHex, mask);
      ctx.putImageData(pixels, 0, 0);
      return new Promise<string>((resolve, reject) =>
        canvas.toBlob(blob => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('toBlob failed'))), 'image/png'));
    })();
    p.catch(() => cache.delete(key)); // let a later render retry
    cache.set(key, p);
  }
  return p;
}
