/** The poster is the permanent backing layer, including on video/decode failure. */
export function HeroMedia() {
  return <div className="lx-media" aria-hidden="true">
    {/* Native responsive images keep the exact generated assets and their byte budgets. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/landing/building-1600.webp" srcSet="/landing/building-800.webp 800w, /landing/building-1600.webp 1600w"
      sizes="(max-width: 768px) 100vw, 64vw" width={1600} height={1066} alt="" loading="lazy" decoding="async" />
    <video width={1280} height={854} muted playsInline preload="none" aria-hidden="true" tabIndex={-1}>
      <source data-src="/landing/building-720.webm" media="(max-width: 768px)" type="video/webm" />
      <source data-src="/landing/building-720.mp4" media="(max-width: 768px)" type="video/mp4" />
      <source data-src="/landing/building-1280.webm" type="video/webm" />
      <source data-src="/landing/building-1280.mp4" type="video/mp4" />
    </video>
  </div>;
}
