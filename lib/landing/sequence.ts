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

/** Unrounded frame position (0..FRAME_COUNT-1) for a desktop scene progress value. */
export function frameFloat(progress: number, count = FRAME_COUNT) {
  return clamp((progress - SEQ_START) / (1 - SEQ_START)) * (count - 1);
}

/**
 * Phone timing: one continuous, strictly rising curve over the whole story scroll, with no holds.
 * It starts calm (slope 0.25, so the building already moves while the hero scrolls) and gently speeds up,
 * which lands the colours near the copy: just turning blue at step 01 (Scheduled starts), blue to ochre
 * through step 02, all ochre by step 03.
 */
export function phoneCurve(t: number) {
  const x = clamp(t);
  return .25 * x + .75 * Math.pow(x, 2.2);
}

/** Scene progress for the phone story: scrolled fraction from the top of the page to where the stage releases. */
export function phoneProgress(scrollY: number, release: number) {
  return SEQ_START + (1 - SEQ_START) * phoneCurve(release > 0 ? scrollY / release : 1);
}

/** One smoothing step toward the scroll target (per animation frame). Snaps when close enough. */
export function easeToward(current: number, target: number, rate = .15) {
  const next = current + (target - current) * rate;
  return Math.abs(target - next) < .02 ? target : next;
}

/**
 * Frames to draw for a fractional position: the two neighbours and the crossfade amount when both are
 * loaded; otherwise the nearest loaded frame on its own. Null when nothing is loaded yet.
 */
export function blendFrames(position: number, loaded: ArrayLike<boolean>) {
  const low = Math.floor(position), high = Math.min(loaded.length - 1, low + 1), mix = position - low;
  if (loaded[low] && loaded[high]) return { base: low, over: high, mix: high === low ? 0 : mix };
  const nearest = nearestLoaded(Math.round(position), loaded);
  return nearest < 0 ? null : { base: nearest, over: nearest, mix: 0 };
}

/**
 * Vertical cover anchor on the phone stage. Early frames have empty sky above the floors, so they sit low
 * in the image: anchor near the bottom so the floors fill the stage right under the hero; ease back toward
 * centre as the building rises so the roof is never cropped. Reads as a gentle camera tilt.
 */
export function phoneAnchor(index: number) {
  return .95 - .45 * clamp(index / 40);
}

/** Building bounding box inside every frame (fractions of the frame), so it can be fitted without cropping. */
export const BUILDING_CROP = { x: .056, y: .133, w: .898, h: .82 } as const;

/**
 * Phone path: one curve for the building's top, in px, from scroll progress p = scrollY / range (p may pass 1).
 * Its velocity (px per scrolled px) is -1 + HOLD * w(p): it starts moving exactly with the page, eases smoothly
 * into an almost still drift near the top while the steps are read, then eases back to the page's own speed and
 * scrolls away with the content. w is built from sin^2 ramps, so velocity and acceleration are continuous:
 * no holds, no pushes, no jumps. The building dissolves (fade + a little scale) before it could reach the header.
 */
export const PATH = { hold: .97, rampFrom: .08, fallFrom: .78, fallTo: 1.2, fadeFrom: .62, fadeTo: .95 } as const;
const smooth = (x: number) => { const u = clamp(x); return u * u * (3 - 2 * u); };
const sin2 = (x: number) => Math.sin(Math.PI / 2 * clamp(x)) ** 2;

export function phonePath(range: number, travel: number) {
  const { hold, rampFrom, fallFrom, fallTo } = PATH;
  // Pick where the slowdown completes so the building settles exactly `travel` px above where it starts.
  const rampTo = Math.min(.7, Math.max(rampFrom + .2, (travel / Math.max(1, range) - hold * rampFrom / 2) / (1 - hold / 2)));
  const weight = (p: number) => sin2((p - rampFrom) / (rampTo - rampFrom)) * (1 - sin2((p - fallFrom) / (fallTo - fallFrom)));
  const velocity = (p: number) => -1 + hold * weight(Math.max(0, p));
  // Integrate once per layout; past fallTo the curve is the page's own motion.
  const step = .0005, table: number[] = [0];
  for (let i = 1; i * step <= fallTo + step; i++) table.push(table[i - 1] + (velocity((i - .5) * step) + velocity((i - 1.5) * step + step)) / 2 * step * range);
  const end = table.length - 1;
  const offset = (p: number) => {
    const x = Math.max(0, p) / step;
    if (x >= end) return table[end] - (x - end) * step * range;
    const i = Math.floor(x), f = x - i;
    return table[i] + (table[i + 1] - table[i]) * f;
  };
  return { rampTo, offset, velocity, // Scale and tilt finish easing in just after the dissolve begins, so size never holds still while visible.
  settle: (p: number) => smooth(p / Math.max(rampTo, PATH.fadeFrom + .06)) };
}

/** Dissolve while the last steps finish: 1 = fully visible, 0 = gone. */
export function phoneFade(p: number) {
  return 1 - smooth((p - PATH.fadeFrom) / (PATH.fadeTo - PATH.fadeFrom));
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

/** Phone stage tuning: end scale, tilt and turn (degrees), the text fade zone and the entry fade (px). */
export const PHONE_STAGE = { endScale: .54, tilt: 8, turn: -5, fadeZone: 72, sink: 8, entry: 90 } as const;

export type PhoneLayout = { range: number; startTop: number; boxHeight: number; viewHeight: number; path: ReturnType<typeof phonePath> };

/**
 * Where the building is at scroll position y, relative to its place in the document flow. The element itself
 * scrolls with the page (compositor, zero lag); this only adds the path's offset, scale, tilt and dissolve.
 */
export function phoneGeometry(layout: PhoneLayout, y: number) {
  const p = Math.max(0, y) / Math.max(1, layout.range), g = layout.path.settle(p), fade = phoneFade(p);
  const scale = (1 + (PHONE_STAGE.endScale - 1) * g) * (1 - .08 * (1 - fade));
  const shift = layout.path.offset(p) + Math.max(0, y);
  return { shift, scale, tilt: PHONE_STAGE.tilt * g, turn: PHONE_STAGE.turn * g, opacity: fade, top: layout.startTop + layout.path.offset(p), bottom: layout.startTop + layout.path.offset(p) + layout.boxHeight * scale };
}

export function phoneTransform(geometry: ReturnType<typeof phoneGeometry>) {
  return `translate3d(0,${geometry.shift.toFixed(2)}px,0) perspective(900px) rotateX(${geometry.tilt.toFixed(3)}deg) rotateY(${geometry.turn.toFixed(3)}deg) scale(${geometry.scale.toFixed(4)})`;
}

/** Text at scroll y: eases in as it enters from the bottom, dissolves (and sinks a few px) before reaching the building. */
export function flowState(layout: PhoneLayout, documentTop: number, y: number) {
  const top = documentTop - y, edge = phoneGeometry(layout, y).bottom;
  const smooth01 = (x: number) => { const u = clamp(x); return u * u * (3 - 2 * u); };
  const away = smooth01((top - edge) / PHONE_STAGE.fadeZone), entry = smooth01((layout.viewHeight - top) / PHONE_STAGE.entry);
  return { opacity: away * entry, sink: PHONE_STAGE.sink * (1 - away) };
}

/** The scroll length the stage animation covers; past it the building simply scrolls with the page. */
export function phoneLength(layout: PhoneLayout) { return Math.ceil(PATH.fallTo * layout.range) + 40; }

/**
 * CSS for a compositor driven stage: keyframes sampled from the same curve, on a root scroll timeline with a
 * px range, so they do not depend on the page height or the browser's toolbar. Linear between dense samples.
 */
export function phoneKeyframes(layout: PhoneLayout, flowTops: number[], step = 16) {
  const length = phoneLength(layout), rows: string[] = [];
  const at = (y: number) => `${(y / length * 100).toFixed(3)}%`;
  const frames: string[] = [];
  for (let y = 0; y <= length; y += step) {
    const g = phoneGeometry(layout, y);
    frames.push(`${at(y)}{transform:${phoneTransform(g)};opacity:${g.opacity.toFixed(3)}}`);
  }
  if ((length / step) % 1) { const g = phoneGeometry(layout, length); frames.push(`100%{transform:${phoneTransform(g)};opacity:${g.opacity.toFixed(3)}}`); }
  rows.push(`@keyframes lx-stage{${frames.join('')}}`);
  // Text: only the stretch where its opacity changes needs keyframes; outside it the value holds.
  const textLength = length + layout.viewHeight * 2;
  flowTops.forEach((top, index) => {
    const from = Math.max(0, top - layout.viewHeight - 8), to = Math.min(textLength, top + 40);
    const key = (y: number) => { const f = flowState(layout, top, y); return `${(y / textLength * 100).toFixed(3)}%{opacity:${f.opacity.toFixed(3)};translate:0 ${f.sink.toFixed(2)}px}`; };
    const points: string[] = [key(0)];
    let last = -1;
    for (let y = from; y <= to; y += 6) {
      const o = flowState(layout, top, y).opacity;
      if (Math.abs(o - last) < .004 && y + 6 <= to) continue;
      points.push(key(y)); last = o;
    }
    points.push(key(textLength));
    rows.push(`@keyframes lx-flow-${index}{${points.join('')}}`);
    rows.push(`.lx-root[data-timeline=css] [data-flow="${index}"]{animation:lx-flow-${index} linear both;animation-timeline:scroll(root block);animation-range:0px ${textLength}px}`);
  });
  rows.push(`.lx-root[data-timeline=css] .lx-visual{animation:lx-stage linear both;animation-timeline:scroll(root block);animation-range:0px ${length}px}`);
  return rows.join('\n');
}
