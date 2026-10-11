// Pure helpers for the pre-rendered building sequence (public/landing/seq).
// Frame i was rendered from the desktop scene at scroll progress i / (FRAME_COUNT - 1).
import { clamp } from './hero';

export const FRAME_COUNT = 120;
export const FRAME_WIDTH = 600;
export const FRAME_HEIGHT = 833;
export const frameSrc = (index: number) => `/landing/seq/f${String(index).padStart(3, '0')}.webp`;

export function frameIndex(progress: number, count = FRAME_COUNT) {
  return Math.round(clamp(progress) * (count - 1));
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
 * Phone pacing keyed to the copy: the frame progress (desktop scene progress) to reach as each
 * text block arrives at the reading line. Floors assemble during the hero, the building is complete
 * for "A request becomes a plan", lights blue (Open) for step 01, turns gold (Scheduled) through
 * step 02, is fully lit for step 03, and finishes its turn as the stage releases.
 */
export const PHONE_KEYFRAMES = [.3, .47, .57, .68] as const;

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

/** Destination rectangle for drawing a frame into a box, as cover (anchored) or contain. */
export function fitFrame(boxWidth: number, boxHeight: number, mode: 'cover' | 'contain', anchorY = .5) {
  const scale = mode === 'cover'
    ? Math.max(boxWidth / FRAME_WIDTH, boxHeight / FRAME_HEIGHT)
    : Math.min(boxWidth / FRAME_WIDTH, boxHeight / FRAME_HEIGHT);
  const width = FRAME_WIDTH * scale, height = FRAME_HEIGHT * scale;
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) * anchorY, width, height };
}
