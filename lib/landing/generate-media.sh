#!/usr/bin/env bash
# Run from the repository root. Requires ffmpeg with libwebp/libvpx-vp9/libx264.
set -euo pipefail
original=design/building-night-source.png
for width in 1600 800; do
  ffmpeg -y -hide_banner -loglevel error -i "$original" -vf "scale=$width:-2" -c:v libwebp -quality 76 -frames:v 1 "public/landing/building-$width.webp"
done
# A perspective-aligned floor mask: the central corner is lower than the sides.
# Each floor fades up over .45s, bottom to top. The five-second shot pushes 2%.
band="clip(floor((0.97-Y/H-0.30*abs(X/W-0.5))/0.105),0,8)"
ramp="(0.30+0.70*clip((T-0.25-($band)*0.43)/0.45,0,1))"
for width in 1280 720; do
  if [ "$width" = 1280 ]; then height=854; crf=30; else height=480; crf=28; fi
  filter="scale=$width:$height,format=gbrp,geq=r='r(X,Y)*$ramp':g='g(X,Y)*$ramp':b='b(X,Y)*$ramp',zoompan=z='1+0.02*on/119':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${width}x${height}:fps=24,format=yuv420p"
  ffmpeg -y -hide_banner -loglevel error -loop 1 -framerate 24 -i "$original" -vf "$filter" -t 5 -an -c:v libx264 -preset slow -crf "$crf" -g 12 -keyint_min 12 -sc_threshold 0 -movflags +faststart "public/landing/building-$width.mp4"
  # Derive VP9 from the encoded shot, keeping identical dimensions and timing.
  ffmpeg -y -hide_banner -loglevel error -i "public/landing/building-$width.mp4" -an -c:v libvpx-vp9 -b:v 0 -crf 38 -g 12 -row-mt 1 "public/landing/building-$width.webm"
done
