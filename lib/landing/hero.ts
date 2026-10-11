export type HeroVariant = 'code' | 'media';
export const DEFAULT_HERO: HeroVariant = 'code';

export function selectHero(search: string): HeroVariant {
  const value = new URLSearchParams(search).get('hero');
  return value === 'code' || value === 'media' ? value : DEFAULT_HERO;
}

// Runs directly after the root opens, before its visible content is parsed.
// Only the validated enum is written to the DOM; the URL never becomes markup.
export const heroBootstrap = `(()=>{const r=document.currentScript?.parentElement;if(r){const h=new URLSearchParams(location.search).get('hero');r.dataset.hero=h==='code'||h==='media'?h:${JSON.stringify(DEFAULT_HERO)}}})();`;
export const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function buildingFrame(assembly: number, stage: number, floor: number, reducedMotion: boolean) {
  const rise = reducedMotion ? 1 : clamp(assembly * 11 - floor);
  return {
    rise,
    open: reducedMotion ? 1 : clamp(stage * 3 - floor * .08),
    scheduled: reducedMotion ? 1 : clamp((stage - 1) * 3 - floor * .08),
    done: reducedMotion ? 1 : clamp((stage - 2) * 3 - floor * .08),
  };
}

export function shouldLoadHeroVideo(variant: HeroVariant, reducedMotion: boolean, saveData: boolean, near: boolean) {
  return variant === 'media' && !reducedMotion && !saveData && near;
}
