'use client';
import { useEffect, useRef, useState } from 'react';
import { shouldUse3D } from '../../lib/landing/capabilities';
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
    let disposed = false, generation = 0, frame = 0;
    const sections = root.querySelectorAll<HTMLElement>('.lx-reveal-text');
    const reveal = new IntersectionObserver(entries => entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('lx-visible'); reveal.unobserve(e.target); }
    }), { threshold: .12 });
    sections.forEach(section => { reveal.observe(section); section.classList.add('lx-observed'); });
    function update() {
      frame = 0;
      const progress = Math.max(0, Math.min(1, -main.getBoundingClientRect().top / (main.offsetHeight - innerHeight)));
      root.style.setProperty('--lx-ghost', String(1 - Math.max(0, Math.min(1, (progress - .72) / .18)) * .88));
    }
    function scroll() { if (!frame) frame = requestAnimationFrame(update); }
    async function eligibility() {
      const ticket = ++generation;
      cleanupScene?.(); cleanupScene = undefined;
      const allowed = shouldUse3D({ reducedMotion: motion.matches, smallScreen: small.matches, coarsePointer: coarse.matches,
        hardwareConcurrency: nav.hardwareConcurrency, deviceMemory: nav.deviceMemory, saveData: nav.connection?.saveData,
        webgl: 'WebGLRenderingContext' in window });
      if (!allowed) return;
      const canvas = document.createElement('canvas');
      let context: WebGL2RenderingContext | null = null;
      const release = () => context?.getExtension('WEBGL_lose_context')?.loseContext();
      try {
        context = canvas.getContext('webgl2', { antialias: true, alpha: true, powerPreference: 'low-power' });
        if (!context) return;
        const { createScene } = await import('./scene');
        if (disposed || ticket !== generation || context.isContextLost()) { release(); return; }
        cleanupScene = await createScene(host, main, canvas, context);
        if (disposed || ticket !== generation) { cleanupScene(); cleanupScene = undefined; }
      } catch { release(); host.parentElement?.classList.remove('lx-ready'); }
    }
    void eligibility(); update();
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('resize', scroll, { passive: true });
    [motion, small, coarse].forEach(m => m.addEventListener('change', eligibility));
    nav.connection?.addEventListener?.('change', eligibility);
    return () => {
      disposed = true; generation++; cleanupScene?.(); reveal.disconnect(); cancelAnimationFrame(frame);
      sections.forEach(s => s.classList.remove('lx-observed', 'lx-visible'));
      window.removeEventListener('scroll', scroll); window.removeEventListener('resize', scroll);
      [motion, small, coarse].forEach(m => m.removeEventListener('change', eligibility));
      nav.connection?.removeEventListener?.('change', eligibility);
    };
  }, []);
  return <div ref={mount} className="lx-canvas" aria-hidden="true" />;
}
