'use client';
import { useEffect, useRef, useState } from 'react';
import { shouldUse3D } from '../../lib/landing/capabilities';
import { buildingFrame, clamp, selectHero, shouldLoadHeroVideo } from '../../lib/landing/hero';
const endpoint = 'https://groundwork-portal.vercel.app/api/mcp';
export function CopyConfig() {
  const [message, setMessage] = useState('Copy');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    try { await navigator.clipboard.writeText(`"url": "${endpoint}"`); setMessage('Copied'); }
    catch { setMessage('Select to copy'); }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage('Copy'), 2500);
  }
  return <div className="lx-config"><code>"url": "{endpoint}"</code><button type="button" onClick={copy} aria-label="Copy MCP configuration"><span aria-live="polite">{message}</span></button></div>;
}
export function LandingExperience() {
  const mount = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = mount.current!;
    const root = host.closest<HTMLElement>('.lx-root')!;
    const main = root.querySelector<HTMLElement>('.lx-main')!;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const small = matchMedia('(max-width: 768px)');
    const coarse = matchMedia('(pointer: coarse)');
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; addEventListener?: (type: string, listener: () => void) => void; removeEventListener?: (type: string, listener: () => void) => void } };
    let cleanupScene: (() => void) | undefined;
    const hero = root.querySelector<HTMLElement>('.lx-hero')!;
    const story = root.querySelector<HTMLElement>('.lx-story')!;
    const steps = [...root.querySelectorAll<HTMLElement>('.lx-steps article')];
    const floors = [...root.querySelectorAll<SVGElement>('.lx-floor')];
    const video = root.querySelector<HTMLVideoElement>('.lx-media video')!;
    const visual = root.querySelector<HTMLElement>('.lx-visual')!;
    let variant = selectHero(location.search);
    root.dataset.hero = variant;
    let disposed = false, generation = 0, frame = 0, near = false, videoLoaded = false;
    let targetTime = 0;
    function seek() {
      if (!videoLoaded || video.readyState < 2 || video.seeking || !Number.isFinite(video.duration)) return;
      if (Math.abs(video.currentTime - targetTime) > 1 / 30) video.currentTime = targetTime;
    }
    function videoReady() { if (videoLoaded) { video.classList.add('lx-video-ready'); scroll(); } }
    function videoError() { video.classList.remove('lx-video-ready'); }
    function mediaEligibility() {
      const allowed = shouldLoadHeroVideo(variant, motion.matches, !!nav.connection?.saveData, near);
      if (allowed && !videoLoaded) {
        videoLoaded = true;
        video.preload = 'auto';
        video.querySelectorAll('source').forEach(source => { source.src = source.dataset.src!; });
        video.load();
      } else if (videoLoaded && (variant !== 'media' || motion.matches || nav.connection?.saveData)) {
        videoLoaded = false;
        video.preload = 'none';
        video.classList.remove('lx-video-ready');
        video.querySelectorAll('source').forEach(source => source.removeAttribute('src'));
        video.load();
      }
    }
    const mediaObserver = new IntersectionObserver(entries => {
      near = entries[0].isIntersecting; mediaEligibility(); if (near) scroll();
    }, { rootMargin: '240px' });
    mediaObserver.observe(visual);
    video.addEventListener('loadeddata', videoReady);
    video.addEventListener('seeked', scroll);
    video.addEventListener('error', videoError);
    const sections = root.querySelectorAll<HTMLElement>('.lx-reveal-text');
    const reveal = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('lx-visible'); reveal.unobserve(e.target); }
    }), { threshold: .12 });
    sections.forEach(section => { reveal.observe(section); section.classList.add('lx-observed'); });
    function update() {
      frame = 0;
      if (document.hidden) return;
      const progress = clamp(-main.getBoundingClientRect().top / Math.max(1, main.offsetHeight - innerHeight));
      root.style.setProperty('--lx-ghost', String(1 - clamp((progress - .72) / .18) * .88));
      const heroBottom = hero.getBoundingClientRect().bottom;
      const assembly = clamp(.22 + (innerHeight - heroBottom) / (innerHeight * .65));
      const positions = steps.map(step => step.getBoundingClientRect().top);
      const trigger = innerHeight * .72;
      let stage = clamp((trigger - positions[0]) / 100);
      if (trigger >= positions[1]) stage = 1 + clamp((trigger - positions[1]) / 100);
      if (trigger >= positions[2]) stage = 2 + clamp((trigger - positions[2]) / 100);
      // Each floor has a static set of colored paths. Only opacity and transform change.
      if (variant === 'code' && !visual.classList.contains('lx-ready')) {
        floors.forEach((floor, index) => {
          const state = buildingFrame(assembly, stage, index, motion.matches);
          floor.style.setProperty('--floor-rise', `${(1 - state.rise) * 48}px`);
          floor.style.setProperty('--floor-opacity', String(state.rise));
          floor.style.setProperty('--light-open', String(state.open));
          floor.style.setProperty('--light-scheduled', String(state.scheduled));
          floor.style.setProperty('--light-done', String(state.done));
        });
      }
      if (variant === 'media' && videoLoaded && near && !motion.matches) {
        const rect = story.getBoundingClientRect();
        const scrub = clamp(-rect.top / Math.max(1, story.offsetHeight - innerHeight));
        targetTime = scrub * Math.max(0, (Number.isFinite(video.duration) ? video.duration : 5) - .04);
        seek();
      }
    }
    function scroll() { if (!frame) frame = requestAnimationFrame(update); }
    async function eligibility() {
      const ticket = ++generation;
      variant = selectHero(location.search); root.dataset.hero = variant;
      mediaEligibility(); scroll();
      cleanupScene?.(); cleanupScene = undefined;
      const allowed = shouldUse3D({ reducedMotion: motion.matches, smallScreen: small.matches, coarsePointer: coarse.matches,
        hardwareConcurrency: nav.hardwareConcurrency, deviceMemory: nav.deviceMemory, saveData: nav.connection?.saveData,
        webgl: 'WebGLRenderingContext' in window });
      if (!allowed || variant !== 'code') return;
      const canvas = document.createElement('canvas');
      let context: WebGL2RenderingContext | null = null;
      const release = () => context?.getExtension('WEBGL_lose_context')?.loseContext();
      try {
        context = canvas.getContext('webgl2', { antialias: true, alpha: true, powerPreference: 'low-power' });
        if (!context) return;
        const { createScene } = await import('./scene');
        if (disposed || ticket !== generation || context.isContextLost()) { release(); return; }
        const disposeScene = await createScene(host, main, canvas, context);
        if (disposed || ticket !== generation) disposeScene();
        else cleanupScene = disposeScene;
      } catch { release(); host.parentElement?.classList.remove('lx-ready'); }
    }
    void eligibility(); scroll();
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', scroll, { passive: true });
    window.addEventListener('popstate', eligibility);
    document.addEventListener('visibilitychange', scroll);
    [motion, small, coarse].forEach(m => m.addEventListener('change', eligibility));
    nav.connection?.addEventListener?.('change', eligibility);
    return () => {
      disposed = true; generation++; cleanupScene?.(); reveal.disconnect(); mediaObserver.disconnect(); cancelAnimationFrame(frame);
      video.removeEventListener('loadeddata', videoReady); video.removeEventListener('seeked', scroll);
      video.removeEventListener('error', videoError);
      video.querySelectorAll('source').forEach(source => source.removeAttribute('src'));
      if (videoLoaded) video.load();
      window.removeEventListener('popstate', eligibility); document.removeEventListener('visibilitychange', scroll);
      sections.forEach(s => s.classList.remove('lx-observed', 'lx-visible'));
      window.removeEventListener('scroll', scroll); window.removeEventListener('resize', scroll);
      [motion, small, coarse].forEach(m => m.removeEventListener('change', eligibility));
      nav.connection?.removeEventListener?.('change', eligibility);
    };
  }, []);
  return <div ref={mount} className="lx-canvas" aria-hidden="true" />;
}
