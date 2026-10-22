/**
 * Modelo 3D girando suavemente (pantalla de acceso). Basado en burger-bg.js del modelo de Wonka's.
 * Se carga con import() dinámico para que three.js no pese en el resto de la app.
 * El decodificador Draco está en /draco/ (copiado de three/examples/jsm/libs/draco/gltf).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface ModelOptions {
  src: string;
  /** Alto del modelo como fracción del alto del contenedor */
  size?: number;
  /** Radianes por segundo (0.35 ≈ una vuelta cada 18 s) */
  speed?: number;
  /** Cuánto sube y baja flotando (fracción del tamaño) */
  float?: number;
  /** Inclinación hacia la cámara para ver la parte de arriba */
  tilt?: number;
  shadow?: boolean;
  onLoad?: () => void;
  onError?: (e: unknown) => void;
}

export function mountModel(container: HTMLElement, opts: ModelOptions): () => void {
  const o = { size: 0.6, speed: 0.35, float: 0.025, tilt: 0.18, shadow: true, ...opts };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
  const key = new THREE.DirectionalLight(0xfff1dc, 2.2); key.position.set(-2, 3, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd6a0, 1.6); rim.position.set(2, 1.5, -3); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xfffaf0, 0xc9a77a, 0.5));

  const pivot = new THREE.Group(); scene.add(pivot);
  const spinner = new THREE.Group(); pivot.add(spinner);

  // Sombra de contacto: un degradado radial (casi no gasta GPU)
  let shadowMesh: THREE.Mesh | null = null;
  if (o.shadow) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!, grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.38)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.visible = false;
    pivot.add(shadowMesh);
  }

  const draco = new DRACOLoader().setDecoderPath('/draco/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  loader.load(o.src, gltf => {
    const m = gltf.scene;
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    m.position.sub(center);
    const s = 1 / (size.y || 1); m.scale.setScalar(s);
    m.position.multiplyScalar(s);
    spinner.add(m);
    if (shadowMesh) { shadowMesh.position.y = -0.52; shadowMesh.scale.setScalar(size.x * s * 1.25); shadowMesh.visible = true; }
    layout();
    o.onLoad?.();
  }, undefined, e => o.onError?.(e));

  function layout() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    // Que quepa a lo alto y también a lo ancho (en pantallas angostas)
    const distH = (1 / o.size) / (2 * Math.tan(vFov / 2));
    const distW = distH / Math.min(1, camera.aspect);
    camera.position.set(0, 0, Math.max(distH, distW));
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(layout); ro.observe(container);
  layout();

  const clock = new THREE.Clock();
  let raf = 0, running = true;
  // Equipos lentos (PC de caja sin tarjeta gráfica): si los primeros cuadros tardan, se baja la resolución del 3D
  let frames = 0, slowSince = performance.now(), degraded = false, last = 0;
  const tick = () => {
    if (!running) return;
    const now = performance.now();
    // Máximo ~45 cuadros por segundo: el giro es lento y así gasta menos
    if (now - last < 22) { raf = requestAnimationFrame(tick); return; }
    last = now;
    if (!degraded && ++frames === 30) {
      const msPerFrame = (now - slowSince) / 30;
      if (msPerFrame > 50) { degraded = true; renderer.setPixelRatio(Math.min(1, window.devicePixelRatio) * (msPerFrame > 120 ? 0.6 : 1)); layout(); }
    }
    const t = clock.getElapsedTime();
    if (!reduceMotion) {
      spinner.rotation.y = t * o.speed;
      spinner.position.y = Math.sin(t * 1.2) * o.float;
    }
    pivot.rotation.x = o.tilt;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  tick();
  // Pausa cuando la pestaña no se ve (ahorra batería)
  const onVis = () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else if (!running) { running = true; tick(); } };
  document.addEventListener('visibilitychange', onVis);

  return () => {
    running = false; cancelAnimationFrame(raf); ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    renderer.dispose(); pmrem.dispose(); draco.dispose();
    if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement);
  };
}
