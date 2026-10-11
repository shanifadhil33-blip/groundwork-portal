import { FRAME_HEIGHT, FRAME_WIDTH, frameSrc } from '../../lib/landing/sequence';
/** Server markup for the image-sequence building: a tiny first-frame poster and the canvas the runtime draws into. */
export function SequenceFrames() {
  return <>
    <picture>
      <source type="image/avif" srcSet={frameSrc(0, 'avif')} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lx-seq-poster" src={frameSrc(0, 'webp')} width={FRAME_WIDTH} height={FRAME_HEIGHT} alt="" aria-hidden="true" decoding="async" fetchPriority="high" />
    </picture>
    <canvas className="lx-seq-canvas" aria-hidden="true" />
  </>;
}
