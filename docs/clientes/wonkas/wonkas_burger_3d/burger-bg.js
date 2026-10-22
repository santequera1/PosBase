// burger-bg.js — Hamburguesa 3D girando como fondo (three.js, sin dependencias de build).
// Uso:
//   import { mountBurger } from './burger-bg.js';
//   const stop = mountBurger(document.getElementById('burger-bg'), { src: './hamburguesa.glb' });
//   // stop() la desmonta (útil al salir del login en una SPA).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function mountBurger(container, opts = {}) {
  const o = {
    src: './hamburguesa.glb',
    size: 0.78,          // alto de la hamburguesa como fracción de la altura de la ventana
    speed: 0.35,         // velocidad de giro en radianes/segundo (0.35 ≈ una vuelta cada 18 s)
    float: 0.025,        // cuánto sube/baja flotando (fracción del tamaño)
    tilt: 0.18,          // inclinación hacia la cámara (radianes) para ver el pan de arriba
    offsetX: 0,          // corrimiento horizontal (-1 izquierda … 1 derecha)
    offsetY: 0,
    shadow: true,
    ...opts,
  };
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
  camera.position.set(0, 0.0, 4);

  const key = new THREE.DirectionalLight(0xfff1dc, 2.2); key.position.set(-2, 3, 3); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd6a0, 1.6); rim.position.set(2, 1.5, -3); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xfffaf0, 0xc9a77a, 0.5));

  const pivot = new THREE.Group(); scene.add(pivot);
  const spinner = new THREE.Group(); pivot.add(spinner);

  // Sombra suave de contacto (un degradado radial, no cuesta nada de GPU)
  let shadowMesh = null;
  if (o.shadow) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(70,45,20,0.35)'); grd.addColorStop(1, 'rgba(70,45,20,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    shadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    shadowMesh.rotation.x = -Math.PI / 2;
    pivot.add(shadowMesh);
  }

  const draco = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  let modelH = 1;
  loader.load(o.src, (gltf) => {
    const m = gltf.scene;
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    m.position.sub(center);                       // centrar en el eje de giro
    const s = 1 / size.y; m.scale.setScalar(s);   // normalizar a 1 unidad de alto
    m.position.multiplyScalar(s);
    modelH = 1;
    spinner.add(m);
    if (shadowMesh) { shadowMesh.position.y = -0.52; shadowMesh.scale.setScalar(size.x * s * 1.25); }
    layout();
  });

  function layout() {
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // Distancia para que la hamburguesa ocupe `size` de la altura visible
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const dist = (modelH / o.size) / (2 * Math.tan(vFov / 2));
    camera.position.set(0, 0, dist);
    const visH = 2 * Math.tan(vFov / 2) * dist, visW = visH * camera.aspect;
    pivot.position.set(o.offsetX * visW / 2, o.offsetY * visH / 2, 0);
  }
  const ro = new ResizeObserver(layout); ro.observe(container);

  const clock = new THREE.Clock();
  let raf = 0, running = true;
  function tick() {
    if (!running) return;
    const t = clock.getElapsedTime();
    if (!reduceMotion) {
      spinner.rotation.y = t * o.speed;
      spinner.position.y = Math.sin(t * 1.2) * o.float;
    }
    pivot.rotation.x = o.tilt;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  tick();
  // Pausar cuando la pestaña no está visible (ahorra batería en el POS)
  const onVis = () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else if (!running) { running = true; clock.getDelta(); tick(); } };
  document.addEventListener('visibilitychange', onVis);

  return () => {
    running = false; cancelAnimationFrame(raf); ro.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    renderer.dispose(); pmrem.dispose(); draco.dispose();
    container.removeChild(renderer.domElement);
  };
}
