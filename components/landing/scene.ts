import type * as Three from 'three';
export async function createScene(host: HTMLDivElement, main: HTMLElement, canvas: HTMLCanvasElement, context: WebGL2RenderingContext): Promise<() => void> {
  const T = await import('three');
  let renderer: Three.WebGLRenderer;
  try { renderer = new T.WebGLRenderer({ canvas, context, antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch { context.getExtension('WEBGL_lose_context')?.loseContext(); return () => {}; }
  const geometries: Three.BufferGeometry[] = [], materials: Three.Material[] = [];
  const geometry = <G extends Three.BufferGeometry>(g: G): G => { geometries.push(g); return g; };
  const material = <M extends Three.Material>(m: M): M => { materials.push(m); return m; };
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(32, 1, .1, 100);
  camera.position.set(11, 9, 16); camera.lookAt(0, 3.5, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  const building = new T.Group(); scene.add(building);
  scene.add(new T.AmbientLight(0xffffff, .6));
  const key = new T.DirectionalLight(0xffffff, 3); key.position.set(4, 12, 6); scene.add(key);
  const rim = new T.DirectionalLight(0x89a9b0, 2); rim.position.set(-5, 5, -4); scene.add(rim);
  const dark = material(new T.MeshStandardMaterial({ color: 0x151515, roughness: .78, metalness: .15 }));
  const edges = material(new T.LineBasicMaterial({ color: 0x888888, transparent: true, opacity: .28 }));
  function box(w: number, h: number, d: number, parent: Three.Object3D, y: number) {
    const g = geometry(new T.BoxGeometry(w, h, d));
    const mesh = new T.Mesh(g, dark); mesh.position.y = y; parent.add(mesh);
    const lines = new T.LineSegments(geometry(new T.EdgesGeometry(g)), edges); lines.position.y = y; parent.add(lines);
  }
  box(5.8, .18, 4.5, building, -.1);
  const core = new T.Group(); building.add(core);
  box(.55, 7.35, .55, core, 3.55);
  const floors: { group: Three.Group; band: Three.MeshStandardMaterial; y: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const group = new T.Group(); building.add(group);
    const w = i > 6 ? 3.8 : 4.8, d = i > 6 ? 2.8 : 3.8;
    box(w, .18, d, group, 0); box(w - .16, .52, d - .16, group, .35);
    const band = material(new T.MeshStandardMaterial({ color: 0x292929, emissive: 0x000000, roughness: .45 }));
    const strip = new T.Mesh(geometry(new T.BoxGeometry(w - .12, .095, d - .12)), band); strip.position.y = .52; group.add(strip);
    // Small mullions keep the lit bands architectural rather than neon rings.
    for (let n = 0; n < 7; n++) {
      const mullion = new T.Mesh(geometry(new T.BoxGeometry(.035, .48, d)), dark);
      mullion.position.set(-w / 2 + .28 + n * (w - .56) / 6, .35, 0); group.add(mullion);
    }
    floors.push({ group, band, y: i * .78 });
  }
  const grid = new T.GridHelper(14, 14, 0x292929, 0x151515); grid.position.y = -.22; scene.add(grid);
  geometries.push(grid.geometry); materials.push(...(Array.isArray(grid.material) ? grid.material : [grid.material]));
  let frame = 0, visible = true, stopped = false, pointerX = 0, pointerY = 0;
  function draw() {
    frame = 0; if (stopped || !visible || document.hidden) return;
    const progress = Math.max(0, Math.min(1, -main.getBoundingClientRect().top / (main.offsetHeight - innerHeight)));
    building.rotation.y = -.35 + progress * .8 + pointerX * .035;
    building.rotation.x = pointerY * .018;
    core.scale.y = Math.max(.03, Math.min(1, (progress + .03) / .33));
    floors.forEach(({ group, band, y }, i) => {
      const assembly = Math.max(0, Math.min(1, (progress + .045 - i * .022) / .12));
      group.visible = assembly > 0;
      group.scale.y = Math.max(.01, assembly); group.position.y = y + (1 - assembly) * 2.5;
      const stage = (progress - .33 - i * .02) / .16;
      const color = stage >= 1 ? 0xc69753 : stage >= 0 ? 0x89a9b0 : 0x292929;
      band.color.setHex(color); band.emissive.setHex(stage >= 0 ? color : 0); band.emissiveIntensity = stage >= 1 ? .55 : .3;
    });
    renderer.render(scene, camera);
    host.parentElement?.classList.add('lx-ready');
  }
  function schedule() { if (!frame && !stopped && visible && !document.hidden) frame = requestAnimationFrame(draw); }
  function resize() { renderer.setSize(host.clientWidth, host.clientHeight); camera.aspect = host.clientWidth / Math.max(1, host.clientHeight); camera.updateProjectionMatrix(); schedule(); }
  function pointer(e: PointerEvent) { pointerX = e.clientX / innerWidth - .5; pointerY = e.clientY / innerHeight - .5; schedule(); }
  function lost(e: Event) { e.preventDefault(); cleanup(); }
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (!visible) { cancelAnimationFrame(frame); frame = 0; } else schedule(); });
  const sizing = new ResizeObserver(resize);
  function cleanup() {
    if (stopped) return; stopped = true; cancelAnimationFrame(frame); observer.disconnect(); sizing.disconnect();
    window.removeEventListener('scroll', schedule); window.removeEventListener('pointermove', pointer);
    document.removeEventListener('visibilitychange', schedule); renderer.domElement.removeEventListener('webglcontextlost', lost);
    host.parentElement?.classList.remove('lx-ready'); renderer.domElement.remove();
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); renderer.dispose(); renderer.forceContextLoss();
  }
  try {
    host.appendChild(renderer.domElement); renderer.domElement.setAttribute('aria-hidden', 'true');
    renderer.domElement.addEventListener('webglcontextlost', lost); observer.observe(host); sizing.observe(host);
    window.addEventListener('scroll', schedule, { passive: true }); window.addEventListener('pointermove', pointer, { passive: true });
    document.addEventListener('visibilitychange', schedule); resize(); draw();
  } catch { cleanup(); }
  return cleanup;
}
