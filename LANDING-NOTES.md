# Landing hero comparison

`/` and `/?hero=code` use scroll-assembled SVG floors on phones, small/coarse-pointer screens, and desktop fallbacks. Open → Scheduled → Done crossfades dusty blue → ochre → sage/teal. Reduced motion shows the finished building. Desktop three.js eligibility and scene are unchanged. Mobile sections now size to their content, with one compact sticky visual bounded by the hero/steps story. Copy, section order, footer, fixed-header CTA, Geist, black background, and glass headline highlights are preserved.

`/?hero=media` uses a responsive poster immediately, then loads a muted decorative video near the viewport only when reduced motion and Save-Data are off. Scroll scrubs its five-second timeline; the poster remains behind it and handles failures. Query selection runs in a tiny inline bootstrap plus a client effect; the page never reads server search parameters.

## Assets

All derivatives are in `public/landing/`. The generated original is archived at `public/landing/src/building-night.png` and is never referenced by the page.

| Asset | Dimensions | Bytes |
| --- | --- | ---: |
| Original PNG (archive) | 1536 × 1024 | 1,467,135 |
| Desktop poster | 1600 × 1066 WebP | 95,984 |
| Phone poster | 800 × 534 WebP | 32,000 |
| Desktop MP4 | 1280 × 854 | 534,242 |
| Desktop WebM | 1280 × 854 | 646,621 |
| Phone MP4 | 720 × 480 | 262,133 |
| Phone WebM | 720 × 480 | 267,588 |

Videos are 5 seconds at 24 fps, H.264/VP9, with a 12-frame GOP; MP4 uses faststart. A 2% camera push accompanies perspective-aligned floor brightness ramps. Every poster is below 120 KB and every video below 900 KB.

## Tuning

- Change only `DEFAULT_HERO` in `lib/landing/hero.ts` to select the default.
- `buildingFrame` controls SVG floor staggering and status crossfades. `experience.tsx` controls scroll thresholds, the 240px media preload margin, and scrubbing.
- The compact CSS rule uses `clamp(170px,26svh,230px)` for the stage. The fixed header remains above it. No mobile section reserves viewport-height spacer gaps.
- Run `bash lib/landing/generate-media.sh` from the repo root to recreate derivatives. Adjust `band`, `ramp`, zoom, CRF, or GOP there. Assets are native responsive images with explicit dimensions; videos have no source URLs until eligible.

## Validation

`pnpm typecheck` passes. The requested `pnpm exec vitest run tests/landing.test.tsx` is blocked by the sandbox's read-only `node_modules/.vite-temp`. All 19 landing tests pass with a temporary native-loaded Vitest config that omits database setup and uses `/tmp` for cache. Tests cover server copy/order, query/bootstrap selection, reduced motion, video loading gates, responsive dimensions, and asset budgets. FFprobe confirms dimensions/codecs/duration; start/end video frames were inspected.

Phone browser verification at 390×844 and 360×740 remains required outside this sandbox: starting Next returned `listen EPERM`, and Chromium launch was blocked by socket permissions. The compact layout is implemented, but actual device scrolling/hydration and visual gap checks could not be verified here.

## Image provenance

Created with the built-in image generation tool. Prompt: “Use case: ads-marketing. Asset type: website architectural hero image, landscape 3:2 composition. A single striking modern nine-storey mid-rise building at night, clean elevated three-quarter isometric view, entire building visible centered with modest black margin. Pure solid #000000 background and black ground, no scenery. Restrained photoreal architectural model photography, matte charcoal concrete, precise stacked floor plates with subtle upper setbacks and recessed windows. Floors lit internally in warm ochre #C69753 and terracotta #C8845B, with a few dusty blue #89A9B0 windows. Crisp restrained editorial lighting, readable silhouette, tactile matte materials. No text, no people, no logos, no lens flares, no bloom, no glows, no gradients in background, no other objects. Building fills most of the frame vertically. Save the generated image as an available local file.”
