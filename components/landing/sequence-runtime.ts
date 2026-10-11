import { clamp } from '../../lib/landing/hero';
import { BUILDING_CROP, FRAME_COUNT, blendFrames, easeToward, fitFrame, frameFloat, frameSrc, type FrameFormat, loadOrder, phoneCurve, phoneFade, phoneMotion, SEQ_START } from '../../lib/landing/sequence';

export type SequenceOptions = { reducedMotion: boolean; saveData: boolean; phone: () => boolean };
const CONCURRENCY = 4;
// Phone motion targets: end scale, tilt and turn (degrees). Kept subtle on purpose.
const END_SCALE = .62, TILT = 8, TURN = -5;

/**
 * Draws the pre-rendered building into .lx-seq-canvas from scroll position. Returns a cleanup.
 * Phones: the building floats over the page (fixed, feathered by a radial mask, no box or edge). One eased,
 * smoothed scroll progress drives its frame, its rise toward the top, its shrink and a slight tilt, so it
 * never stops and restarts. Desktop without WebGL: the frames play in place, in the desktop layout.
 */
export function startSequence(root: HTMLElement, options: SequenceOptions): () => void {
  const visual = root.querySelector<HTMLElement>('.lx-visual');
  const canvas = visual?.querySelector<HTMLCanvasElement>('.lx-seq-canvas');
  const poster = visual?.querySelector<HTMLImageElement>('.lx-seq-poster');
  const main = root.querySelector<HTMLElement>('.lx-main');
  const story = root.querySelector<HTMLElement>('.lx-story');
  const hero = root.querySelector<HTMLElement>('.lx-hero');
  const context = canvas?.getContext('2d');
  if (!visual || !canvas || !main || !story || !hero || !context) return () => {};
  const still = options.reducedMotion || options.saveData;
  const images: HTMLImageElement[] = [];
  const loaded = new Array<boolean>(FRAME_COUNT).fill(false);
  const queue = still ? [FRAME_COUNT - 1] : loadOrder();
  let format: FrameFormat = 'webp';
  let stopped = false, frame = 0, dirty = true, visible = true, active = 0, idle = 0, timer = 0;
  let progress = -1, drawnKey = '', geometryKey = '';
  // Layout values that only change on resize.
  let heroBottom = 0, range = 1, headerBottom = 69;
  const floating = () => options.phone() && !options.reducedMotion;

  function measure() {
    heroBottom = hero!.offsetTop + hero!.offsetHeight;
    headerBottom = root.querySelector<HTMLElement>('.lx-header')?.getBoundingClientRect().bottom ?? 69;
    // The story ends (and the building has faded) once its last line passes a little above mid screen.
    range = Math.max(1, story!.offsetTop + story!.offsetHeight - innerHeight * .55);
    root.style.setProperty('--lx-hero-b', `${Math.round(heroBottom)}px`);
  }
  function target() {
    if (options.phone()) return clamp(scrollY / range);
    return clamp(-main!.getBoundingClientRect().top / Math.max(1, main!.offsetHeight - innerHeight));
  }
  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(canvas!.clientWidth * ratio), height = Math.round(canvas!.clientHeight * ratio);
    if (width && height && (canvas!.width !== width || canvas!.height !== height)) { canvas!.width = width; canvas!.height = height; }
    measure(); dirty = true; geometryKey = ''; schedule();
  }
  function place(p: number) {
    if (!floating()) { if (geometryKey) { visual!.style.transform = visual!.style.opacity = visual!.style.visibility = ''; geometryKey = ''; } return; }
    const startTop = heroBottom - 24, endTop = headerBottom - 28;
    const g = phoneMotion(p, range / Math.max(1, startTop - endTop)), fade = phoneFade(p);
    const top = startTop + (endTop - startTop) * g, scale = 1 + (END_SCALE - 1) * g;
    const transform = `translate3d(0,${top.toFixed(2)}px,0) perspective(900px) rotateX(${(TILT * g).toFixed(2)}deg) rotateY(${(TURN * g).toFixed(2)}deg) scale(${scale.toFixed(4)})`;
    const key = `${transform}|${fade.toFixed(3)}`;
    if (key === geometryKey) return;
    visual!.style.transform = transform;
    visual!.style.opacity = fade.toFixed(3);
    visual!.style.visibility = fade <= 0 ? 'hidden' : '';
    geometryKey = key;
  }
  function paint(image: HTMLImageElement, alpha: number) {
    const w = canvas!.width, h = canvas!.height;
    context!.globalAlpha = alpha;
    if (floating() || (options.phone() && options.reducedMotion)) {
      // Fit the building's own bounding box into the inner part of the box, so the radial mask never cuts it.
      const sw = image.naturalWidth, sh = image.naturalHeight;
      const sx = BUILDING_CROP.x * sw, sy = BUILDING_CROP.y * sh, cw = BUILDING_CROP.w * sw, ch = BUILDING_CROP.h * sh;
      const dh = Math.min(h * .7, (w * .46) * ch / cw), dw = dh * cw / ch;
      context!.drawImage(image, sx, sy, cw, ch, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      const box = fitFrame(w, h, 'contain');
      context!.drawImage(image, box.x, box.y, box.width, box.height);
    }
  }
  function draw() {
    frame = 0;
    if (stopped || document.hidden || !canvas!.width) return;
    const goal = still ? (options.phone() ? 0 : 1) : target();
    // One progress value, eased toward the scroll target each frame, drives everything below.
    progress = progress < 0 || still ? goal : easeToward(progress, goal, .15);
    if (Math.abs(progress - goal) < .0005) progress = goal;
    place(progress);
    const sceneProgress = still ? 1 : options.phone() ? SEQ_START + (1 - SEQ_START) * phoneCurve(Math.min(1, progress / .96)) : progress;
    const position = frameFloat(sceneProgress);
    const pick = visible ? blendFrames(position, loaded) : null;
    if (pick) {
      const key = `${pick.base}:${pick.over}:${pick.mix.toFixed(3)}`;
      if (key !== drawnKey || dirty) {
        context!.globalAlpha = 1;
        context!.clearRect(0, 0, canvas!.width, canvas!.height);
        // Solid black under the frames; on phones the radial mask feathers it into the page, so text passing
        // beneath the building dissolves softly instead of meeting an edge.
        context!.fillStyle = '#000'; context!.fillRect(0, 0, canvas!.width, canvas!.height);
        // Crossfade the two neighbouring frames for sub-frame smoothness.
        paint(images[pick.base], 1);
        if (pick.mix > 0) paint(images[pick.over], pick.mix);
        context!.globalAlpha = 1;
        drawnKey = key; dirty = false;
        visual!.classList.add('lx-seq-live');
      }
    }
    const debug = canvas as HTMLCanvasElement & { lxFrame?: number; lxProgress?: number };
    debug.lxFrame = position; debug.lxProgress = progress;
    if (progress !== goal) schedule();
  }
  function schedule() { if (!frame && !stopped && !document.hidden) frame = requestAnimationFrame(draw); }
  function fetchFrame(index: number) {
    const image = new Image();
    image.decoding = 'async';
    images[index] = image; active++;
    image.src = frameSrc(index, format);
    image.decode().then(() => {
      if (stopped) return;
      loaded[index] = true;
      dirty = true; schedule();
    }, () => {}).finally(() => { active--; pump(); });
  }
  function pump() {
    while (!stopped && active < CONCURRENCY && queue.length) fetchFrame(queue.shift()!);
  }
  function usePoster() {
    // The poster already is frame 0: draw it right away instead of waiting for the background loads.
    if (!poster || !poster.complete || !poster.naturalWidth || loaded[0] || still) return;
    images[0] = poster; loaded[0] = true; dirty = true; schedule();
  }
  function begin() {
    if (stopped) return;
    // Follow whatever the browser picked for the poster's <picture>: AVIF where supported, else WebP.
    format = poster?.currentSrc.endsWith('.avif') ? 'avif' : 'webp';
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) idle = ric(pump, { timeout: 1200 }); else timer = window.setTimeout(pump, 200);
  }
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) { dirty = true; schedule(); }
  }, { rootMargin: '120px' });
  const sizing = new ResizeObserver(resize);
  observer.observe(visual); sizing.observe(canvas);
  if (!still || options.phone()) window.addEventListener('scroll', schedule, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  poster?.addEventListener('load', usePoster);
  if (document.readyState === 'complete') begin(); else window.addEventListener('load', begin, { once: true });
  measure(); usePoster(); resize();
  return () => {
    stopped = true; cancelAnimationFrame(frame); clearTimeout(timer);
    const cancelIdle = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    if (idle) cancelIdle?.(idle);
    observer.disconnect(); sizing.disconnect();
    window.removeEventListener('scroll', schedule); window.removeEventListener('load', begin);
    document.removeEventListener('visibilitychange', schedule); poster?.removeEventListener('load', usePoster);
    images.forEach((image, index) => { if (image && image !== poster && !loaded[index]) image.src = ''; });
    visual.classList.remove('lx-seq-live');
    visual.style.transform = visual.style.opacity = visual.style.visibility = '';
    root.style.removeProperty('--lx-hero-b');
    context.clearRect(0, 0, canvas.width, canvas.height);
  };
}
