/**
 * scene3d.js — fixed WebGL stage behind the whole page.
 * Glass hero knot + iridescent shapes that drift at different scroll speeds,
 * a soft particle field, and mouse parallax. Fails silently without WebGL.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('stage');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

try {
  init();
} catch (err) {
  console.warn('3D scene disabled:', err);
  if (canvas) canvas.remove();
}

function init() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const FOV = 35;
  const DIST = 14;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.z = DIST;

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 6, 8);
  scene.add(key);
  const rim = new THREE.PointLight(0xc084fc, 40, 30);
  rim.position.set(-6, -2, 4);
  scene.add(rim);

  let W = 1;
  let H = 1;
  let viewH = 1;
  let viewW = 1;
  const pxToWorld = (px, py) => ({
    x: (px / W - 0.5) * viewW,
    y: -(py / H - 0.5) * viewH
  });

  // ---- objects -------------------------------------------------------
  const pastel = [0x059669, 0x34d399, 0x10b981];
  const mat = (color, extra = {}) => new THREE.MeshPhysicalMaterial({
    color, roughness: 0.18, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1,
    iridescence: 1, iridescenceIOR: 1.4, envMapIntensity: 1.2, ...extra
  });

  const items = [];
  const add = (mesh, fx, pageY, speed, spin, scale) => {
    mesh.scale.setScalar(scale);
    scene.add(mesh);
    items.push({ mesh, fx, pageY, speed, spin, phase: Math.random() * 6.28, scale });
    return mesh;
  };

  // Hero centrepiece: glass torus knot
  const heroMat = new THREE.MeshPhysicalMaterial({
    color: 0xd1fae5, roughness: 0.04, metalness: 0, transmission: 1, thickness: 1.8,
    ior: 1.45, iridescence: 1, iridescenceIOR: 1.6, clearcoat: 1, envMapIntensity: 1.6,
    attenuationColor: new THREE.Color(0x10b981), attenuationDistance: 1.6
  });
  const hero = add(new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.34, 220, 36, 2, 3), heroMat), 0.72, 380, 1, [0.1, 0.18, 0], 1.25);

  // Supporting shapes scattered down the page
  add(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), mat(0x059669, { wireframe: true, iridescence: 0 })), 0.06, 900, 0.8, [0.2, 0.3, 0.1], 0.9);
  add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.32, 32, 80), mat(0x0f172a, { wireframe: true, iridescence: 0 })), 0.93, 1500, 0.7, [0.3, 0.1, 0.2], 0.8);
  add(new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mat(0x10b981, { wireframe: true, iridescence: 0 })), 0.05, 2300, 0.85, [0.25, 0.35, 0], 0.75);
  add(new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), mat(0x0f172a, { roughness: 0.05 })), 0.95, 3000, 0.6, [0.05, 0.1, 0], 0.85);
  add(new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.22, 140, 24), mat(0x059669, { wireframe: true, iridescence: 0 })), 0.07, 3700, 0.75, [0.2, 0.2, 0.1], 0.8);
  add(new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), mat(0x0f172a, { wireframe: true, iridescence: 0 })), 0.94, 4400, 0.8, [0.25, 0.15, 0.2], 0.7);
  add(new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), mat(0x059669, { wireframe: true, iridescence: 0 })), 0.08, 5200, 0.9, [0.1, 0.25, 0], 1.0);
  add(new THREE.Mesh(new THREE.TorusGeometry(1, 0.25, 32, 80), mat(0x10b981, { wireframe: true, iridescence: 0 })), 0.92, 6000, 0.7, [0.3, 0.2, 0.1], 0.75);
  add(new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mat(0x0f172a, { wireframe: true, iridescence: 0 })), 0.06, 6800, 0.8, [0.2, 0.3, 0.1], 0.7);
  add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 48), mat(0x059669, { roughness: 0.05 })), 0.94, 7600, 0.65, [0.1, 0.1, 0], 0.7);

  // Tiny floating spheres for depth
  const tinyGeo = new THREE.SphereGeometry(1, 24, 24);
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(tinyGeo, mat(pastel[i % pastel.length], { roughness: 0.1 }));
    add(m, Math.random() < 0.5 ? Math.random() * 0.1 : 0.9 + Math.random() * 0.1, 200 + Math.random() * 8000, 0.4 + Math.random() * 0.9, [0.1, 0.1, 0], 0.08 + Math.random() * 0.16);
  }

  // Particle dust
  const N = 420;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 30;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 16 - 2;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0x059669, size: 0.05, transparent: true, opacity: 0.55, depthWrite: false
  }));
  scene.add(dust);

  // ---- sizing --------------------------------------------------------
  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    viewH = 2 * Math.tan((FOV * Math.PI) / 360) * DIST;
    viewW = viewH * camera.aspect;
  }
  resize();
  window.addEventListener('resize', resize);

  // ---- input ---------------------------------------------------------
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / W - 0.5) * 2;
    mouse.ty = (e.clientY / H - 0.5) * 2;
  }, { passive: true });

  let scrollY = window.scrollY;
  let smooth = scrollY;
  window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });

  // ---- loop ----------------------------------------------------------
  const clock = new THREE.Clock();
  function frame() {
    const t = reduced ? 0 : clock.getElapsedTime();
    smooth += (scrollY - smooth) * (reduced ? 1 : 0.08);
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;

    const narrow = W < 900;
    for (const it of items) {
      const isHero = it.mesh === hero;
      const fx = narrow ? (isHero ? 0.5 : (it.fx < 0.5 ? 0.02 : 0.98)) : it.fx;
      const py = it.pageY - smooth * it.speed;
      const p = pxToWorld(fx * W, py);
      const depth = isHero ? 0 : (it.speed - 0.7) * 3;
      const k = isHero ? 0.6 : 1;
      it.mesh.position.set(
        p.x + mouse.x * (0.35 + it.speed * 0.5) * k,
        p.y - mouse.y * (0.25 + it.speed * 0.35) * k + Math.sin(t * 0.8 + it.phase) * 0.18,
        depth
      );
      it.mesh.rotation.x = it.spin[0] * t + (isHero ? -mouse.y * 0.5 : it.phase);
      it.mesh.rotation.y = it.spin[1] * t + (isHero ? mouse.x * 0.7 : 0);
      it.mesh.rotation.z = it.spin[2] * t;
      it.mesh.scale.setScalar(it.scale * (narrow ? 0.7 : 1));
      it.mesh.visible = py > -400 && py < H + 400;
    }
    dust.rotation.y = t * 0.02 + mouse.x * 0.05;
    rim.position.x = -6 + mouse.x * 4;

    renderer.render(scene, camera);
    if (!reduced) requestAnimationFrame(frame);
  }
  frame();
  if (reduced) window.addEventListener('scroll', frame, { passive: true });
}
