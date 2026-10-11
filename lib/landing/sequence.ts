// Pure helpers for the pre-rendered building sequence (public/landing/seq).
// Frame i was rendered from the desktop scene at progress SEQ_START + (1 - SEQ_START) * i / (FRAME_COUNT - 1).
// It starts once the first floors already reach the top of the frame, so the stage is never mostly empty.
// AVIF frames are 900x1250; the WebP fallback is 720x1000 (same aspect).
import { clamp } from './hero';

export const FRAME_COUNT = 120;
export const FRAME_WIDTH = 900;
export const FRAME_HEIGHT = 1250;
export const SEQ_START = .07;
export type FrameFormat = 'avif' | 'webp';
export const frameSrc = (index: number, format: FrameFormat = 'avif') => `/landing/seq/f${String(index).padStart(3, '0')}.${format}`;

/** Frame for a desktop scene progress value (0..1); anything before SEQ_START shows the first frame. */
export function frameIndex(progress: number, count = FRAME_COUNT) {
  return Math.round(clamp((progress - SEQ_START) / (1 - SEQ_START)) * (count - 1));
}

/** The loaded frame closest to target, preferring the earlier one on ties; -1 when none is loaded. */
export function nearestLoaded(target: number, loaded: ArrayLike<boolean>) {
  for (let distance = 0; distance < loaded.length; distance++) {
    if (loaded[target - distance]) return target - distance;
    if (loaded[target + distance]) return target + distance;
  }
  return -1;
}

/** Coarse to fine, so the whole timeline is roughly covered early: ends, every 8th, 4th, 2nd, then the rest. */
export function loadOrder(count = FRAME_COUNT) {
  const order: number[] = [0, count - 1];
  const seen = new Set(order);
  for (const step of [8, 4, 2, 1]) for (let i = 0; i < count; i += step) if (!seen.has(i)) { seen.add(i); order.push(i); }
  return order;
}

/**
 * Phone pacing keyed to the copy, in desktop scene progress, reached as each text block arrives at the
 * reading line. The scene's bands go unlit (Open) -> blue (Scheduled, from .33) -> ochre (Done, from .49,
 * all floors by .65). So: building complete and unlit for "A request becomes a plan" and step 01,
 * fully blue for step 02, fully ochre for step 03, then it finishes its turn as the stage releases.
 */
export const PHONE_KEYFRAMES = [.26, .32, .48, .68] as const;

/** Piecewise linear map through (xs[i], ys[i]); xs are forced non decreasing. */
export function piecewise(x: number, xs: readonly number[], ys: readonly number[]) {
  let previous = -Infinity;
  const points = xs.map((value, index) => { previous = Math.max(previous, value); return [previous, ys[index]] as const; });
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    if (x <= x1) return x1 === x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return points[points.length - 1][1];
}

/**
 * Vertical cover anchor on the phone stage. Early frames have empty sky above the floors, so they sit low
 * in the image: anchor near the bottom so the floors fill the stage right under the hero; ease back toward
 * centre as the building rises so the roof is never cropped. Reads as a gentle camera tilt.
 */
export function phoneAnchor(index: number) {
  return .95 - .45 * clamp(index / 40);
}

/** Destination rectangle for drawing a frame into a box, as cover (anchored) or contain. */
export function fitFrame(boxWidth: number, boxHeight: number, mode: 'cover' | 'contain', anchorY = .5, insetTop = 0) {
  const area = Math.max(1, boxHeight - insetTop);
  const scale = mode === 'cover'
    ? Math.max(boxWidth / FRAME_WIDTH, area / FRAME_HEIGHT)
    : Math.min(boxWidth / FRAME_WIDTH, area / FRAME_HEIGHT);
  const width = FRAME_WIDTH * scale, height = FRAME_HEIGHT * scale;
  return { x: (boxWidth - width) / 2, y: insetTop + (area - height) * anchorY, width, height };
}

/** Clear band (CSS px) kept above the image on the phone stage, so the roof never touches the header. */
export const PHONE_INSET_TOP = 24;
