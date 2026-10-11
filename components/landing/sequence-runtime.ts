import { clamp } from '../../lib/landing/hero';
import { FRAME_COUNT, PHONE_KEYFRAMES, SEQ_START, fitFrame, frameIndex, frameSrc, type FrameFormat, loadOrder, nearestLoaded, phoneAnchor, piecewise } from '../../lib/landing/sequence';

export type SequenceOptions = { reducedMotion: boolean; saveData: boolean; phone: () => boolean };
const CONCURRENCY = 4;

/** Draws the pre-rendered building into .lx-seq-canvas from scroll position. Returns a cleanup. */
export function startSequence(root: HTMLElement, options: SequenceOptions): () => void {
  const visual = root.querySelector<HTMLElement>('.lx-visual');
  const canvas = visual?.querySelector<HTMLCanvasElement>('.lx-seq-canvas');
  const main = root.querySelector<HTMLElement>('.lx-main');
  const story = root.querySelector<HTMLElement>('.lx-story');
  const scene = root.querySelector<HTMLElement>('.lx-scene');
  const anchors = [root.querySelector<HTMLElement>('.lx-rise p'), ...root.querySelectorAll<HTMLElement>('.lx-steps article')].filter((el): el is HTMLElement => !!el);
  const context = canvas?.getContext('2d', { alpha: false });
  if (!visual || !canvas || !main || !story || !scene || !context) return () => {};
  const still = options.reducedMotion || options.saveData;
  const images: HTMLImageElement[] = [];
  const loaded = new Array<boolean>(FRAME_COUNT).fill(false);
  const queue = still ? [FRAME_COUNT - 1] : loadOrder();
  let format: FrameFormat = 'webp';
  let stopped = false, frame = 0, drawn = -1, dirty = true, visible = true, active = 0, idle = 0, timer = 0;
  // Layout values that only change on resize; reading them on every scroll would force style work.
  let stickTop = 0, releaseGap = 0, storyPadding = 0;

  function measure() {
    const sceneStyle = getComputedStyle(scene!);
    stickTop = parseFloat(sceneStyle.top) || 0;
    releaseGap = parseFloat(sceneStyle.marginBottom) || 0;
    storyPadding = parseFloat(getComputedStyle(story!).paddingBottom) || 0;
  }
  function progress() {
    if (still) return 1;
    if (options.phone()) {
      const stageBottom = stickTop + scene!.offsetHeight;
      const release = scrollY + story!.getBoundingClientRect().bottom - storyPadding - (stageBottom + releaseGap);
      // Each text block hits its keyframe when its top reaches a reading line in the free area under the stage.
      const reading = stageBottom + (innerHeight - stageBottom) * .45;
      const arrivals = anchors.slice(0, PHONE_KEYFRAMES.length).map(el => scrollY + el.getBoundingClientRect().top - reading);
      return piecewise(scrollY, [0, ...arrivals, release], [SEQ_START, ...PHONE_KEYFRAMES.slice(0, arrivals.length), 1]);
    }
    return clamp(-main!.getBoundingClientRect().top / Math.max(1, main!.offsetHeight - innerHeight));
  }
  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const width = Math.round(canvas!.clientWidth * ratio), height = Math.round(canvas!.clientHeight * ratio);
    if (width && height && (canvas!.width !== width || canvas!.height !== height)) { canvas!.width = width; canvas!.height = height; }
    measure(); dirty = true; schedule();
  }
  function draw() {
    frame = 0;
    if (stopped || !visible || document.hidden || !canvas!.width) return;
    const index = nearestLoaded(frameIndex(progress()), loaded);
    if (index < 0 || (index === drawn && !dirty)) return;
    const phone = options.phone();
    const box = fitFrame(canvas!.width, canvas!.height, phone ? 'cover' : 'contain', phone ? phoneAnchor(index) : .5);
    context!.fillStyle = '#000';
    context!.fillRect(0, 0, canvas!.width, canvas!.height);
    context!.drawImage(images[index], box.x, box.y, box.width, box.height);
    drawn = index; dirty = false;
    visual!.classList.add('lx-seq-live');
  }
  function schedule() { if (!frame && !stopped && visible && !document.hidden) frame = requestAnimationFrame(draw); }
  function pump() {
    while (!stopped && active < CONCURRENCY && queue.length) {
      const index = queue.shift()!;
      const image = new Image();
      image.decoding = 'async';
      images[index] = image; active++;
      image.src = frameSrc(index, format);
      image.decode().then(() => {
        if (stopped) return;
        loaded[index] = true;
        // A newly loaded frame can be closer to the current target than the one on screen.
        dirty = true; schedule();
      }, () => {}).finally(() => { active--; pump(); });
    }
  }
  function begin() {
    if (stopped) return;
    // Follow whatever the browser picked for the poster's <picture>: AVIF where supported, else WebP.
    const poster = visual!.querySelector<HTMLImageElement>('.lx-seq-poster');
    format = poster?.currentSrc.endsWith('.avif') ? 'avif' : 'webp';
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) idle = ric(pump, { timeout: 1200 }); else timer = window.setTimeout(pump, 200);
  }
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (!visible) { cancelAnimationFrame(frame); frame = 0; } else { dirty = true; schedule(); }
  }, { rootMargin: '120px' });
  const sizing = new ResizeObserver(resize);
  observer.observe(visual); sizing.observe(canvas);
  if (!still) window.addEventListener('scroll', schedule, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  if (document.readyState === 'complete') begin(); else window.addEventListener('load', begin, { once: true });
  resize();
  return () => {
    stopped = true; cancelAnimationFrame(frame); clearTimeout(timer);
    const cancelIdle = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
    if (idle) cancelIdle?.(idle);
    observer.disconnect(); sizing.disconnect();
    window.removeEventListener('scroll', schedule); window.removeEventListener('load', begin);
    document.removeEventListener('visibilitychange', schedule);
    images.forEach((image, index) => { if (image && !loaded[index]) image.src = ''; });
    visual.classList.remove('lx-seq-live');
    context.fillStyle = '#000'; context.fillRect(0, 0, canvas.width, canvas.height);
  };
}
