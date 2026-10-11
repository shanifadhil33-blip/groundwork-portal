import { clamp } from '../../lib/landing/hero';
import { BUILDING_CROP, FRAME_COUNT, blendFrames, fitFrame, flowState, frameFloat, frameSrc, type FrameFormat, loadOrder, phoneCurve, phoneGeometry, phoneKeyframes, type PhoneLayout, phonePath, phoneTransform, SEQ_START } from '../../lib/landing/sequence';

export type SequenceOptions = { reducedMotion: boolean; saveData: boolean; phone: () => boolean };
const CONCURRENCY = 4;

function documentTop(element: HTMLElement) {
  // offsetTop ignores transforms and translate, so animated values never feed back into the layout we measure.
  let top = 0;
  for (let node: HTMLElement | null = element; node; node = node.offsetParent as HTMLElement | null) top += node.offsetTop;
  return top;
}

/**
 * Draws the pre-rendered building into .lx-seq-canvas from scroll position. Returns a cleanup.
 *
 * Phones: the stage sits in the document flow, so its position is the page's own scroll (handled by the
 * compositor, zero lag). The extra rise, shrink, slight tilt and dissolve, and the text fades, are CSS scroll
 * driven animations sampled from one curve, so they also run on the compositor. Browsers without scroll
 * timelines get the same values set synchronously in the scroll handler. Nothing is eased toward a target:
 * the frame index is read straight from the scroll position (with a crossfade between neighbouring frames).
 * Desktop without WebGL: the frames play in place, in the desktop layout.
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
  const compositor = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: scroll()');
  const images: HTMLImageElement[] = [];
  const loaded = new Array<boolean>(FRAME_COUNT).fill(false);
  const queue = still ? [FRAME_COUNT - 1] : loadOrder();
  const flow = [...root.querySelectorAll<HTMLElement>('.lx-rise p, .lx-legend, .lx-steps article > *, .lx-agent-copy > *')];
  let format: FrameFormat = 'webp';
  let stopped = false, frame = 0, dirty = true, active = 0, idle = 0, timer = 0, drawnKey = '';
  let layout: PhoneLayout | null = null, flowTops: number[] = [], styleKey = '';
  let style: HTMLStyleElement | null = null;
  const floating = () => options.phone() && !options.reducedMotion;

  function measure() {
    if (!floating()) { teardownStage(); return; }
    const heroBottom = hero!.offsetTop + hero!.offsetHeight;
    root.style.setProperty('--lx-hero-b', `${Math.round(heroBottom)}px`);
    // The layout viewport height does not change when the phone's toolbar slides away, unlike innerHeight.
    const viewHeight = document.documentElement.clientHeight || innerHeight;
    const headerBottom = root.querySelector<HTMLElement>('.lx-header')?.getBoundingClientRect().bottom ?? 69;
    const range = Math.max(1, documentTop(story!) + story!.offsetHeight - viewHeight * .55);
    const startTop = heroBottom - 24, boxHeight = visual!.offsetHeight;
    layout = { range, startTop, boxHeight, viewHeight, path: phonePath(range, startTop - (headerBottom + 10)) };
    flowTops = flow.map(documentTop);
    flow.forEach((element, index) => { element.dataset.flow = String(index); });
    root.dataset.timeline = compositor ? 'css' : 'js';
    if (compositor) {
      const key = [range, startTop, boxHeight, viewHeight, ...flowTops].map(Math.round).join(',');
      if (key !== styleKey) {
        style ??= document.head.appendChild(document.createElement('style'));
        style.dataset.lxStage = '';
        style.textContent = phoneKeyframes(layout, flowTops);
        styleKey = key;
      }
    } else applyFallback();
  }
  function teardownStage() {
    if (!layout && !root.dataset.timeline) return;
    layout = null; styleKey = '';
    style?.remove(); style = null;
    delete root.dataset.timeline;
    visual!.style.transform = visual!.style.opacity = '';
    flow.forEach(element => { element.style.opacity = element.style.translate = ''; delete element.dataset.flow; });
  }
  /** Without scroll timelines: the same values, set right in the scroll handler, no smoothing. */
  function applyFallback() {
    if (!layout || compositor) return;
    const g = phoneGeometry(layout, scrollY);
    visual!.style.transform = phoneTransform(g);
    visual!.style.opacity = g.opacity.toFixed(3);
    flow.forEach((element, index) => {
      const f = flowState(layout!, flowTops[index], scrollY);
      element.style.opacity = f.opacity.toFixed(3);
      element.style.translate = `0 ${f.sink.toFixed(2)}px`;
    });
  }
  function sceneProgress() {
    if (still) return 1;
    if (layout) return SEQ_START + (1 - SEQ_START) * phoneCurve(clamp(scrollY / layout.range / .92));
    if (options.phone()) return SEQ_START;
    return clamp(-main!.getBoundingClientRect().top / Math.max(1, main!.offsetHeight - innerHeight));
  }
  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(canvas!.clientWidth * ratio), height = Math.round(canvas!.clientHeight * ratio);
    if (width && height && (canvas!.width !== width || canvas!.height !== height)) { canvas!.width = width; canvas!.height = height; }
    measure(); dirty = true; schedule();
  }
  function paint(image: HTMLImageElement, alpha: number) {
    const w = canvas!.width, h = canvas!.height;
    context!.globalAlpha = alpha;
    if (options.phone()) {
      // Fit the building's own bounding box into the inner part of the stage, so the radial mask never cuts it.
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
    const position = frameFloat(sceneProgress());
    const pick = blendFrames(position, loaded);
    if (pick) {
      const key = `${pick.base}:${pick.over}:${pick.mix.toFixed(3)}`;
      if (key !== drawnKey || dirty) {
        context!.globalAlpha = 1;
        // Solid black under the frames; on phones the radial mask feathers it into the page.
        context!.fillStyle = '#000'; context!.fillRect(0, 0, canvas!.width, canvas!.height);
        paint(images[pick.base], 1);
        if (pick.mix > 0) paint(images[pick.over], pick.mix);
        context!.globalAlpha = 1;
        drawnKey = key; dirty = false;
        visual!.classList.add('lx-seq-live');
      }
    }
    (canvas as HTMLCanvasElement & { lxFrame?: number }).lxFrame = position;
  }
  function schedule() { if (!frame && !stopped && !document.hidden) frame = requestAnimationFrame(draw); }
  function onScroll() { applyFallback(); schedule(); }
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
  const sizing = new ResizeObserver(resize);
  sizing.observe(canvas); sizing.observe(main);
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  poster?.addEventListener('load', usePoster);
  if (document.readyState === 'complete') begin(); else window.addEventListener('load', begin, { once: true });
  usePoster(); resize();
  return () => {
    stopped = true; cancelAnimationFrame(frame); clearTimeout(timer);
    const cancelIdle = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    if (idle) cancelIdle?.(idle);
    sizing.disconnect();
    window.removeEventListener('scroll', onScroll); window.removeEventListener('load', begin);
    document.removeEventListener('visibilitychange', schedule); poster?.removeEventListener('load', usePoster);
    images.forEach((image, index) => { if (image && image !== poster && !loaded[index]) image.src = ''; });
    visual.classList.remove('lx-seq-live');
    teardownStage();
    root.style.removeProperty('--lx-hero-b');
    context.clearRect(0, 0, canvas.width, canvas.height);
  };
}
