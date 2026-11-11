import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ------------------------------------------------------------------
   Gallery House — Akar Design. Floor plan → luxury 3D, scroll-driven.
   Units: metres. x = east, z = south, z=0 = north wall of main block.
------------------------------------------------------------------- */
const H = 3.2, EXT = 0.4, INT = 0.15, DOOR_H = 2.4, EYE = 1.6, RADIUS = 0.24;
const params = new URLSearchParams(location.search);
const LITE = params.has('lite') || matchMedia('(pointer:coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
const BLOOM = !LITE && !params.has('nobloom');

// ---------- renderer / scene ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: !BLOOM, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, LITE ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none', display: 'none' });
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 1500);
camera.rotation.order = 'YXZ';

// ---------- golden-hour sky ----------
const SUN_DIR = new THREE.Vector3(-0.42, 0.2, 0.88).normalize();
function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN_DIR } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader: `uniform vec3 sunDir; varying vec3 vP;
      void main(){
        float h = vP.y;
        vec3 zen = vec3(0.10,0.14,0.30), mid = vec3(0.52,0.42,0.52), hor = vec3(1.25,0.72,0.38), gnd = vec3(0.32,0.24,0.18);
        vec3 c = h > 0.0 ? mix(mix(hor, mid, smoothstep(0.0,0.22,h)), zen, smoothstep(0.18,0.85,h)) : mix(hor*0.8, gnd, smoothstep(0.0,0.2,-h));
        float s = max(dot(vP, sunDir), 0.0);
        c += vec3(1.6,0.9,0.45)*pow(s, 6.0)*0.55 + vec3(4.0,2.6,1.4)*pow(s, 900.0);
        gl_FragColor = vec4(c, 1.0);
      }`
  });
}
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMaterial()); scene.add(sky);
scene.fog = new THREE.Fog(0xd8a77c, 160, 900);
{ // environment map from the sky (so glass, water and brass reflect golden hour)
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMaterial()));
  const warm = new THREE.Mesh(new THREE.PlaneGeometry(30, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1.4), side: THREE.DoubleSide }));
  warm.position.set(0, 30, 0); warm.rotation.x = Math.PI / 2; envScene.add(warm);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.5;
}

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xffd9b0, 0x4a3a2c, 0.4); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb672, 3.2);
const SITE_C = new THREE.Vector3(20, 0, 8);
sun.position.copy(SITE_C).addScaledVector(SUN_DIR, 70);
sun.target.position.copy(SITE_C);
sun.castShadow = true;
sun.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -46, right: 46, top: 30, bottom: -30, near: 1, far: 160 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// ---------- procedural textures ----------
function canvasTex(size, draw, srgb = true, w = size) {
  const c = document.createElement('canvas'); c.width = w; c.height = size;
  const g = c.getContext('2d'); draw(g, size, w);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const rnd = (() => { let s = 7654321; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
function shade(hex, f) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, f); return '#' + c.getHexString(); }

// Calacatta-style marble: white ground, soft grey clouds, crisp grey and gold veins, large slabs
function marble(base = '#f2eee7', slabs = 2, gold = true) {
  return canvasTex(1024, (g, S) => {
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    g.filter = 'blur(18px)';
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(170,165,160,${rnd() * 0.10})`; g.beginPath(); g.ellipse(rnd() * S, rnd() * S, 60 + rnd() * 220, 20 + rnd() * 90, rnd() * 3, 0, 7); g.fill(); }
    const vein = (w, col, blur) => {
      g.filter = `blur(${blur}px)`; g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
      let x = rnd() * S, y = -50, a = Math.PI / 2 + (rnd() - 0.5) * 1.2;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 70; k++) { a += (rnd() - 0.5) * 0.5; x += Math.cos(a) * 22; y += Math.sin(a) * 22 + 6; g.lineTo(x, y); if (rnd() < 0.08) { g.stroke(); g.lineWidth = w * (0.3 + rnd() * 0.9); g.beginPath(); g.moveTo(x, y); } }
      g.stroke();
    };
    for (let i = 0; i < 7; i++) vein(10 + rnd() * 16, 'rgba(120,118,115,.18)', 8);
    for (let i = 0; i < 9; i++) vein(1.5 + rnd() * 2.5, `rgba(${90 + rnd() * 30},${88 + rnd() * 25},${85 + rnd() * 20},.55)`, 0.6);
    if (gold) for (let i = 0; i < 3; i++) vein(1.2 + rnd() * 1.5, 'rgba(176,138,74,.55)', 0.5);
    g.filter = 'none';
    const t = S / slabs; g.fillStyle = 'rgba(150,140,128,.35)';
    for (let i = 0; i <= slabs; i++) { g.fillRect(i * t - 1, 0, 2, S); g.fillRect(0, i * t - 1, S, 2); }
  });
}
function planks(base, rows = 8) {
  return canvasTex(512, (g, S) => {
    const rh = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * S;
      while (x < S) {
        const len = S * (0.45 + rnd() * 0.6);
        g.fillStyle = shade(base, (rnd() - 0.5) * 0.07); g.fillRect(x, r * rh, len, rh);
        for (let k = 0; k < 9; k++) {
          g.strokeStyle = `rgba(30,15,5,${0.06 + rnd() * 0.1})`; g.lineWidth = 1;
          const y = r * rh + rnd() * rh; g.beginPath(); g.moveTo(x, y);
          g.bezierCurveTo(x + len * .3, y + (rnd() - .5) * 6, x + len * .6, y + (rnd() - .5) * 6, x + len, y); g.stroke();
        }
        g.fillStyle = 'rgba(20,10,4,.45)'; g.fillRect(x, r * rh, 1.5, rh); x += len;
      }
      g.fillStyle = 'rgba(20,10,4,.4)'; g.fillRect(0, r * rh, S, 1.2);
    }
  });
}
function herringbone(base) {
  return canvasTex(512, (g, S) => {
    g.fillStyle = '#3a2716'; g.fillRect(0, 0, S, S);
    const L = 128, W = 32;
    for (let row = -4; row < 20; row++) for (let col = -4; col < 12; col++) {
      for (let k = 0; k < 2; k++) {
        g.save(); g.translate(col * L + k * W + row * W, row * W * 2); g.rotate(k ? -Math.PI / 4 : Math.PI / 4);
        g.fillStyle = shade(base, (rnd() - 0.5) * 0.1); g.fillRect(0, 0, L * 0.7, W * 0.7 - 1.2);
        for (let q = 0; q < 4; q++) { g.fillStyle = `rgba(40,20,8,${rnd() * 0.1})`; g.fillRect(0, rnd() * W * 0.7, L * 0.7, 1); }
        g.restore();
      }
    }
  });
}
function panelTex(base) {
  return canvasTex(512, (g, S) => {
    const cols = 4, cw = S / cols;
    for (let c = 0; c < cols; c++) {
      g.fillStyle = shade(base, (rnd() - 0.5) * 0.06); g.fillRect(c * cw, 0, cw, S);
      for (let k = 0; k < 26; k++) {
        g.strokeStyle = `rgba(15,7,2,${0.06 + rnd() * 0.12})`; g.lineWidth = 0.6 + rnd() * 1.4;
        let x = c * cw + rnd() * cw; g.beginPath(); g.moveTo(x, 0);
        for (let y = 0; y <= S; y += 32) { x += (rnd() - 0.5) * 3; g.lineTo(x, y); } g.stroke();
      }
      g.fillStyle = 'rgba(10,5,2,.65)'; g.fillRect(c * cw, 0, 3, S);
    }
  });
}
function travertine(base = '#d8c6a6', n = 2) {
  return canvasTex(512, (g, S) => {
    g.fillStyle = '#b9a685'; g.fillRect(0, 0, S, S);
    const t = S / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      g.fillStyle = shade(base, (rnd() - 0.5) * 0.05); g.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
      for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(${rnd() > .5 ? '255,248,235' : '150,125,90'},${rnd() * .18})`; g.fillRect(i * t + rnd() * t, j * t + rnd() * t, 8 + rnd() * 60, 1 + rnd() * 2.5); }
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(120,95,60,${0.2 + rnd() * .3})`; g.beginPath(); g.ellipse(i * t + rnd() * t, j * t + rnd() * t, 1 + rnd() * 3, 0.6 + rnd(), 0, 0, 7); g.fill(); }
    }
  });
}
function speckle(base, dots, alpha = 0.25) {
  return canvasTex(512, (g, S) => {
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    for (let k = 0; k < dots; k++) { g.fillStyle = `rgba(${rnd() > .5 ? '255,255,240' : '40,40,20'},${rnd() * alpha})`; const r = 1 + rnd() * 3; g.fillRect(rnd() * S, rnd() * S, r, r); }
  });
}
// tileable water normal map (sum of integer-frequency waves)
function waterNormals() {
  const N = 256, hgt = new Float32Array(N * N), waves = [];
  for (let i = 0; i < 14; i++) waves.push([1 + (rnd() * 6 | 0), 1 + (rnd() * 6 | 0) * (rnd() > .5 ? 1 : -1), rnd() * 6.28, 0.3 + rnd()]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let h = 0; for (const [a, b, p, amp] of waves) h += amp / (a + Math.abs(b)) * Math.sin((a * x + b * y) / N * Math.PI * 2 + p); hgt[y * N + x] = h; }
  return canvasTex(N, (g) => {
    const img = g.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = hgt[y * N + (x + 1) % N] - hgt[y * N + (x + N - 1) % N], dy = hgt[((y + 1) % N) * N + x] - hgt[((y + N - 1) % N) * N + x];
      const v = new THREE.Vector3(-dx * 9, -dy * 9, 1).normalize(), i = (y * N + x) * 4;
      img.data[i] = (v.x * 0.5 + 0.5) * 255; img.data[i + 1] = (v.y * 0.5 + 0.5) * 255; img.data[i + 2] = (v.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
}
const TEX = {
  marble: marble(), marbleBath: marble('#f4f1ec', 1), marbleCounter: marble('#f5f2ec', 1),
  marbleDark: marble('#2a2724', 1, true),
  oak: planks('#b48a5e'), herring: herringbone('#a77c52'), walnut: planks('#6b4a30'),
  panel: panelTex('#5a3b24'), travertine: travertine(), travertineWall: travertine('#d9c8a8', 4),
  gravel: speckle('#c9bba0', 9000, .35), grass: speckle('#7f9150', 14000, .2),
  water: waterNormals()
};
TEX.water.repeat.set(3, 3);

// ---------- materials ----------
const phys = (o) => new THREE.MeshPhysicalMaterial(o);
const std = (o) => new THREE.MeshStandardMaterial(o);
const worldUV = (m, s) => { m.userData.uv = s; return m; };
const velvet = (color, sheen) => phys({ color, roughness: 0.85, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(sheen) });
const M = {
  plaster: std({ color: 0xf2ebe0, roughness: 0.9 }),
  plasterInt: std({ color: 0xf3ede3, roughness: 0.88 }),
  travWall: worldUV(std({ color: 0xffffff, map: TEX.travertineWall, roughness: 0.85 }), 2.4),
  plinth: worldUV(std({ color: 0xcdbb9a, map: TEX.travertineWall, roughness: 0.9 }), 2.4),
  panel: worldUV(std({ color: 0xffffff, map: TEX.panel, roughness: 0.45 }), 2.4),
  roofSide: std({ color: 0xf2ebe0, roughness: 0.9 }), roofTop: std({ color: 0x7c766c, roughness: 1 }), ceiling: std({ color: 0xf7f2ea, roughness: 0.95 }),
  timber: worldUV(std({ color: 0xffffff, roughness: 0.45, map: TEX.walnut }), 1.6),
  lacquer: phys({ color: 0x15120f, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 }),
  boucle: phys({ color: 0xeee6d8, roughness: 1, sheen: 0.6, sheenColor: new THREE.Color(0xffffff) }),
  velvetGreen: velvet(0x1f3b30, 0x5f8f78), velvetTaupe: velvet(0x8c7766, 0xd8c4b0), velvetRust: velvet(0x7a3622, 0xd48a62), velvetNavy: velvet(0x1b2233, 0x55648a),
  leather: phys({ color: 0x7a4422, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.5 }),
  linen: std({ color: 0xf6f1e8, roughness: 1 }),
  brass: phys({ color: 0xd2a55a, roughness: 0.28, metalness: 1 }),
  brassBrushed: phys({ color: 0xc89a52, roughness: 0.42, metalness: 1 }),
  black: phys({ color: 0x0d0d0d, roughness: 0.35, metalness: 0.6 }),
  counter: worldUV(phys({ color: 0xffffff, roughness: 0.12, map: TEX.marbleCounter, clearcoat: 0.6 }), 1.6),
  marbleDark: worldUV(phys({ color: 0xffffff, roughness: 0.15, map: TEX.marbleDark, clearcoat: 0.6 }), 1.4),
  ceramic: phys({ color: 0xfbfaf7, roughness: 0.12, clearcoat: 1 }),
  planterStone: worldUV(std({ color: 0xe2d2b4, map: TEX.travertineWall, roughness: 0.85 }), 1.6),
  soil: std({ color: 0x3e2f22, roughness: 1 }),
  olive: std({ color: 0x7f8c62, roughness: 0.85, flatShading: true }), olive2: std({ color: 0x9aa47c, roughness: 0.85, flatShading: true }),
  palm: std({ color: 0x5d7a3c, roughness: 0.8, side: THREE.DoubleSide }),
  bark: std({ color: 0x6b5a48, roughness: 1 }), palmBark: std({ color: 0x8a7458, roughness: 1 }),
  glass: phys({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 }),
  frame: phys({ color: 0x111111, roughness: 0.35, metalness: 0.7 }),
  glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(5.0, 3.4, 1.8) }),
  glowSoft: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.6, 0.85) }),
  bulb: phys({ color: 0xfff1d6, emissive: 0xffc98a, emissiveIntensity: 2.6, roughness: 0.2 }),
  pool: phys({ color: 0x0f5d6c, roughness: 0.03, metalness: 0.0, normalMap: TEX.water, normalScale: new THREE.Vector2(0.18, 0.18), emissive: 0x0b6676, emissiveIntensity: 0.5, transparent: true, opacity: 0.9, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5 }),
  mirrorWater: phys({ color: 0x0b1416, roughness: 0.02, metalness: 0.2, normalMap: TEX.water, normalScale: new THREE.Vector2(0.08, 0.08), clearcoat: 1, clearcoatRoughness: 0.0, envMapIntensity: 2.0 }),
  poolTile: std({ color: 0x9fd6dc, emissive: 0x2a9fb0, emissiveIntensity: 0.6, roughness: 0.3 }),
};
M.books = std({ roughness: 0.8, map: canvasTex(256, (g, S) => {
  g.fillStyle = '#3d2817'; g.fillRect(0, 0, S, S);
  const cols = ['#5a1f1a', '#1e2c3a', '#b89a62', '#24382c', '#e6d8bf', '#3b2a4a', '#8a5a34', '#151a20', '#cdb48a', '#6b1f2a'];
  for (let shelf = 0; shelf < 4; shelf++) {
    let x = 0; const y0 = shelf * S / 4;
    while (x < S) { const w = 4 + rnd() * 9, h = S / 4 * (0.62 + rnd() * 0.3); g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x, y0 + S / 4 - h - 6, w - 1, h); if (rnd() < .3) { g.fillStyle = 'rgba(210,170,90,.8)'; g.fillRect(x + 1, y0 + S / 4 - h + 6, w - 3, 2); } x += w; if (rnd() < .06) x += 16; }
    g.fillStyle = '#2a1a0e'; g.fillRect(0, y0 + S / 4 - 6, S, 6);
  }
}) });

// ---------- helpers ----------
const colliders = [];
const roofGroup = new THREE.Group(); scene.add(roofGroup);
const ceilFx = new THREE.Group(); scene.add(ceilFx);
const world = new THREE.Group(); scene.add(world);
function addCol(x0, x1, z0, z1) { colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) }); }
function boxUV(geo, w, h, d, s) {
  const uv = geo.attributes.uv; // faces: +x,-x,+y,-y,+z,-z ; 4 verts each
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / s, uv.getY(i) * dims[f][1] / s); }
}
function box(w, h, d, x, y, z, mat, opt = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (mat.userData && mat.userData.uv) boxUV(geo, w, h, d, mat.userData.uv);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = opt.cast !== false; m.receiveShadow = opt.receive !== false;
  (opt.parent || world).add(m);
  if (opt.collide) addCol(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
  return m;
}
function cyl(rt, rb, h, x, y, z, mat, opt = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, opt.seg || 32), mat);
  m.position.set(x, y + h / 2, z); m.castShadow = opt.cast !== false; m.receiveShadow = true;
  (opt.parent || world).add(m);
  if (opt.collide) { const r = Math.max(rt, rb); addCol(x - r, x + r, z - r, z + r); }
  return m;
}
function sphere(r, x, y, z, mat, parent = world, cast = true) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat); m.position.set(x, y, z); m.castShadow = cast; parent.add(m); return m; }
function piece(x, z, rot = 0) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; world.add(g); return g; }
function gbox(g, w, h, d, x, y, z, mat) { return box(w, h, d, x, y, z, mat, { parent: g }); }
function floor(x0, x1, z0, z1, mat, scale, y = 0.005) {
  const w = x1 - x0, d = z1 - z0;
  const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / scale + x0 / scale, uv.getY(i) * d / scale - z1 / scale);
  const m = new THREE.Mesh(geo, mat); m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; world.add(m); return m;
}
const FLOOR = {
  marble: phys({ map: TEX.marble, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1 }),
  marbleBath: phys({ map: TEX.marbleBath, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }),
  herring: phys({ map: TEX.herring, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
  walnut: phys({ map: TEX.walnut, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
  trav: std({ map: TEX.travertine, roughness: 0.75 }),
  gravel: std({ map: TEX.gravel, roughness: 1 }),
};

/** axis-aligned wall with openings [{c,w,type:'door'|'open'|'window',sill,head}] */
function wall(x1, z1, x2, z2, t, mat, openings = [], opt = {}) {
  const alongX = z1 === z2;
  const a = Math.min(alongX ? x1 : z1, alongX ? x2 : z2) - (opt.noExtend ? 0 : t / 2);
  const b = Math.max(alongX ? x1 : z1, alongX ? x2 : z2) + (opt.noExtend ? 0 : t / 2);
  const fixed = alongX ? z1 : x1;
  const height = opt.h || H;
  const seg = (s0, s1, y0, y1, collide, m = mat) => {
    if (s1 - s0 < 0.001 || y1 - y0 < 0.001) return;
    const len = s1 - s0, c = (s0 + s1) / 2;
    if (alongX) box(len, y1 - y0, t, c, y0, fixed, m, { collide, cast: m !== M.glass });
    else box(t, y1 - y0, len, fixed, y0, c, m, { collide, cast: m !== M.glass });
  };
  const ops = [...openings].sort((p, q) => p.c - q.c);
  let s = a;
  for (const o of ops) {
    const o0 = o.c - o.w / 2, o1 = o.c + o.w / 2;
    seg(s, o0, 0, height, true);
    if (o.type === 'door') {
      const hd = o.head || DOOR_H, ct = t + 0.03;
      seg(o0, o1, hd, height, false);
      if (alongX) { box(0.04, hd, ct, o0 + 0.02, 0, fixed, M.brassBrushed); box(0.04, hd, ct, o1 - 0.02, 0, fixed, M.brassBrushed); box(o.w, 0.04, ct, o.c, hd - 0.04, fixed, M.brassBrushed); }
      else { box(ct, hd, 0.04, fixed, 0, o0 + 0.02, M.brassBrushed); box(ct, hd, 0.04, fixed, 0, o1 - 0.02, M.brassBrushed); box(ct, 0.04, o.w, fixed, hd - 0.04, o.c, M.brassBrushed); }
    }
    if (o.type === 'window') {
      const sill = o.sill ?? 0.9, head = o.head ?? 2.4;
      seg(o0, o1, 0, sill, true); seg(o0, o1, head, height, false);
      const gl = alongX ? box(o.w, head - sill, 0.02, o.c, sill, fixed, M.glass, { cast: false }) : box(0.02, head - sill, o.w, fixed, sill, o.c, M.glass, { cast: false });
      gl.renderOrder = 2;
      const ft = 0.045, n = Math.max(1, Math.round(o.w / 1.4));
      if (alongX) { box(o.w, ft, 0.08, o.c, sill, fixed, M.frame); box(o.w, ft, 0.08, o.c, head - ft, fixed, M.frame); for (let i = 0; i <= n; i++) box(ft, head - sill, 0.08, o0 + o.w * i / n, sill, fixed, M.frame); }
      else { box(0.08, ft, o.w, fixed, sill, o.c, M.frame); box(0.08, ft, o.w, fixed, head - ft, o.c, M.frame); for (let i = 0; i <= n; i++) box(0.08, head - sill, ft, fixed, sill, o0 + o.w * i / n, M.frame); }
      if (sill < 1.8) { if (alongX) addCol(o0, o1, fixed - t / 2, fixed + t / 2); else addCol(fixed - t / 2, fixed + t / 2, o0, o1); }
    }
    s = o1;
  }
  seg(s, b, 0, height, true);
}
/** floor-to-ceiling glazing with slim black mullions; openings = sliding-door gaps */
function glassWall(x1, z1, x2, z2, openings = [], spacing = 1.5) {
  const alongX = z1 === z2;
  const a = Math.min(alongX ? x1 : z1, alongX ? x2 : z2), b = Math.max(alongX ? x1 : z1, alongX ? x2 : z2);
  const f = alongX ? z1 : x1;
  const put = (s0, s1, y0, y1, mat, th = 0.02, col = false) => {
    const len = s1 - s0, c = (s0 + s1) / 2;
    const m = alongX ? box(len, y1 - y0, th, c, y0, f, mat, { cast: mat !== M.glass }) : box(th, y1 - y0, len, f, y0, c, mat, { cast: mat !== M.glass });
    if (mat === M.glass) m.renderOrder = 2;
    if (col) { if (alongX) addCol(s0, s1, f - 0.1, f + 0.1); else addCol(f - 0.1, f + 0.1, s0, s1); }
    return m;
  };
  const ops = [...openings].sort((p, q) => p.c - q.c);
  const spans = []; let s = a;
  for (const o of ops) { spans.push([s, o.c - o.w / 2]); s = o.c + o.w / 2; }
  spans.push([s, b]);
  for (const [s0, s1] of spans) {
    put(s0, s1, 0, H, M.glass, 0.02, true);
    const n = Math.max(1, Math.round((s1 - s0) / spacing));
    for (let i = 0; i <= n; i++) { const p = s0 + (s1 - s0) * i / n; put(p - 0.02, p + 0.02, 0, H, M.frame, 0.07); }
  }
  put(a, b, 0, 0.04, M.frame, 0.09); put(a, b, H - 0.06, H, M.frame, 0.09);
  for (const o of ops) { const p0 = o.c - o.w / 2; const m = alongX ? box(o.w * 0.5, H - 0.1, 0.02, p0 - o.w * 0.25, 0.04, f + 0.06, M.glass, { cast: false }) : box(0.02, H - 0.1, o.w * 0.5, f + 0.06, 0.04, p0 - o.w * 0.25, M.glass, { cast: false }); m.renderOrder = 2; }
}
function roofSlab(x0, x1, z0, z1, y = H, th = 0.34) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, th, z1 - z0), [M.roofSide, M.roofSide, M.roofTop, M.ceiling, M.roofSide, M.roofSide]);
  m.position.set((x0 + x1) / 2, y + th / 2, (z0 + z1) / 2); m.castShadow = true; m.receiveShadow = true; roofGroup.add(m); return m;
}
const lights = [];
function lamp(x, y, z, intensity = 8, dist = 10, color = 0xffc78a) { const l = new THREE.PointLight(color, intensity * (color === 0xffc78a ? 0.55 : 1), dist, 2); l.position.set(x, y, z); world.add(l); lights.push(l); return l; }
const dlGeo = new THREE.CircleGeometry(0.07, 20); dlGeo.rotateX(Math.PI / 2);
const dlRing = new THREE.RingGeometry(0.07, 0.1, 20); dlRing.rotateX(Math.PI / 2);
function downlights(x0, x1, z0, z1, nx, nz) {
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const m = new THREE.Mesh(dlGeo, M.glow); m.position.set(x0 + (x1 - x0) * (i + 0.5) / nx, H - 0.004, z0 + (z1 - z0) * (j + 0.5) / nz); ceilFx.add(m);
    const r = new THREE.Mesh(dlRing, M.brass); r.position.copy(m.position); r.position.y -= 0.001; ceilFx.add(r);
  }
}
function cove(x0, x1, z0, z1, inset = 0.35) {
  const y = H - 0.08, t = 0.04;
  const add = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), M.glowSoft); m.position.set(x, y, z); ceilFx.add(m); };
  add(x1 - x0 - 2 * inset, t, (x0 + x1) / 2, z0 + inset); add(x1 - x0 - 2 * inset, t, (x0 + x1) / 2, z1 - inset);
  add(t, z1 - z0 - 2 * inset, x0 + inset, (z0 + z1) / 2); add(t, z1 - z0 - 2 * inset, x1 - inset, (z0 + z1) / 2);
}

// ---------- rooms ----------
const ROOMS = [
  { id: 'entry', name: 'Entry Court', x0: -14, x1: 0, z0: 2, z1: 14, spawn: [-12, 8], look: [5, 8] },
  { id: 'foyer', name: 'Foyer', x0: 0, x1: 5, z0: 5, z1: 11, spawn: [1.2, 8], look: [10, 8] },
  { id: 'gallery', name: 'Gallery', x0: 5, x1: 31, z0: 6.5, z1: 9.5, spawn: [6.4, 8], look: [31, 8] },
  { id: 'dining', name: 'Dining', x0: 5, x1: 12, z0: 0, z1: 6.5, spawn: [11, 6.0], look: [7.5, 2.6] },
  { id: 'kitchen', name: 'Kitchen', x0: 12, x1: 18, z0: 0, z1: 6.5, spawn: [14.5, 6.0], look: [15.5, 1.0] },
  { id: 'bedroom', name: 'Primary Bedroom', x0: 18, x1: 25, z0: 0, z1: 6.5, spawn: [21, 6.0], look: [21.5, 1.0] },
  { id: 'dressing', name: 'Dressing', x0: 25, x1: 28, z0: 0, z1: 6.5, spawn: [26.5, 5.4], look: [26.5, 0.5] },
  { id: 'bath', name: 'Bath', x0: 28, x1: 31, z0: 0, z1: 6.5, spawn: [30, 6.0], look: [29.5, 0.6] },
  { id: 'guest', name: 'Guest Suite', x0: 5, x1: 14, z0: 9.5, z1: 16, spawn: [9.5, 10.1], look: [11, 14.5] },
  { id: 'library', name: 'Library', x0: 14, x1: 22, z0: 9.5, z1: 16, spawn: [17, 10.1], look: [17, 15.5] },
  { id: 'garden', name: 'Garden Court', x0: 22, x1: 31, z0: 9.5, z1: 16, spawn: [26.5, 10.2], look: [27, 14.5] },
  { id: 'living', name: 'Living Room', x0: 31, x1: 42, z0: 3.5, z1: 12.5, spawn: [32.2, 8], look: [42, 6.5] },
  { id: 'terrace', name: 'Terrace & Pool', x0: 42, x1: 50, z0: -2, z1: 18, spawn: [43, 0.2], look: [47, 9] },
];
const byId = Object.fromEntries(ROOMS.map(r => [r.id, r]));
const area = r => (r.x1 - r.x0) * (r.z1 - r.z0);

// ---------- site ----------
{
  const g = new THREE.PlaneGeometry(1200, 1200); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 300, uv.getY(i) * 300);
  const ground = new THREE.Mesh(g, std({ map: TEX.grass, color: 0xd8e0a8, roughness: 1 }));
  ground.position.y = -0.3; ground.receiveShadow = true; scene.add(ground);
  box(14, 0.3, 12, -7, -0.3, 8, M.plinth); box(5, 0.3, 6, 2.5, -0.3, 8, M.plinth);
  box(26.4, 0.3, 16.4, 18, -0.3, 8, M.plinth); box(11, 0.3, 9, 36.5, -0.3, 8, M.plinth);
  box(8, 0.3, 6, 46, -0.3, 1, M.plinth); box(8, 0.3, 6, 46, -0.3, 15, M.plinth);
  box(1.5, 0.3, 8, 42.75, -0.3, 8, M.plinth);
  floor(-60, -14, 6.6, 9.4, FLOOR.trav, 2.4, -0.29);
  const hedge = std({ color: 0x4f6234, roughness: 1 });
  for (const z of [5.9, 10.1]) box(44, 0.7, 0.6, -36, -0.3, z, hedge);
}

// ---------- floors ----------
floor(-14, 0, 2, 14, FLOOR.trav, 2.4);
floor(0, 5, 5, 11, FLOOR.marble, 3);
floor(5, 31, 6.5, 9.5, FLOOR.marble, 3);
floor(5, 12, 0, 6.5, FLOOR.herring, 2.4);
floor(12, 18, 0, 6.5, FLOOR.marble, 3);
floor(18, 25, 0, 6.5, FLOOR.herring, 2.4);
floor(25, 28, 0, 6.5, FLOOR.walnut, 2);
floor(28, 31, 0, 6.5, FLOOR.marbleBath, 1.6);
floor(5, 14, 9.5, 16, FLOOR.herring, 2.4);
floor(14, 22, 9.5, 16, FLOOR.walnut, 2);
floor(22, 31, 9.5, 16, FLOOR.gravel, 3);
floor(31, 42, 3.5, 12.5, FLOOR.marble, 3);
floor(42, 50, -2, 4, FLOOR.trav, 2.4); floor(42, 50, 12, 18, FLOOR.trav, 2.4);
floor(42, 43.5, 4, 12, FLOOR.trav, 2.4);

// ---------- walls ----------
wall(5, 0, 31, 0, EXT, M.plaster, [
  { c: 8.5, w: 3.0, type: 'window', sill: 0.05, head: 3.0 },
  { c: 15.5, w: 2.0, type: 'window', sill: 1.15, head: 2.6 },
  { c: 21.5, w: 4.0, type: 'window', sill: 1.75, head: 3.0 },
  { c: 29.6, w: 1.4, type: 'window', sill: 1.8, head: 2.9 },
]);
wall(5, 16, 31, 16, EXT, M.plaster, [
  { c: 9.5, w: 4.5, type: 'window', sill: 0.05, head: 3.0 },
  { c: 20.2, w: 2.4, type: 'window', sill: 0.05, head: 3.0 },
]);
wall(5, 0, 5, 16, EXT, M.travWall, [{ c: 8, w: 3, type: 'open' }, { c: 12.8, w: 2.6, type: 'window', sill: 0.05, head: 3.0 }]);
wall(31, 0, 31, 16, EXT, M.plaster, [{ c: 8, w: 3, type: 'open' }, { c: 11, w: 2.0, type: 'window', sill: 0.05, head: 3.0 }]);
wall(0, 5, 5, 5, EXT, M.travWall);
wall(0, 11, 5, 11, EXT, M.travWall);
wall(0, 5, 0, 11, EXT, M.travWall, [{ c: 8, w: 1.4, type: 'door', head: 2.9 }, { c: 10.0, w: 0.9, type: 'window', sill: 0.05, head: 2.9 }, { c: 6.0, w: 0.9, type: 'window', sill: 0.05, head: 2.9 }]);
wall(5, 6.5, 31, 6.5, INT, M.plasterInt, [{ c: 11, w: 1, type: 'door' }, { c: 14.5, w: 1, type: 'door' }, { c: 21, w: 1, type: 'door' }, { c: 30, w: 1, type: 'door' }]);
wall(12, 0, 12, 6.5, INT, M.plasterInt);
wall(18, 0, 18, 6.5, INT, M.plasterInt);
wall(25, 0, 25, 6.5, INT, M.plasterInt, [{ c: 5.3, w: 0.9, type: 'door' }]);
wall(28, 0, 28, 6.5, INT, M.plasterInt, [{ c: 4.0, w: 0.9, type: 'door' }]);
wall(5, 9.5, 22, 9.5, INT, M.plasterInt, [{ c: 9.5, w: 1, type: 'door' }, { c: 17, w: 1, type: 'door' }]);
wall(14, 9.5, 14, 16, INT, M.plasterInt);
wall(22, 9.5, 22, 16, INT, M.plasterInt);
glassWall(22.1, 9.5, 31, 9.5, [{ c: 26.5, w: 1.2 }]);
wall(31, 3.5, 42, 3.5, EXT, M.plaster);
wall(31, 12.5, 42, 12.5, EXT, M.plaster, [{ c: 36.5, w: 6, type: 'window', sill: 0.05, head: 3.0 }]);
glassWall(42, 3.7, 42, 12.3, [{ c: 6.5, w: 2.0 }], 1.45);
wall(42, -2, 50, -2, 0.3, M.travWall, [], { h: 0.95 });
wall(42, 18, 50, 18, 0.3, M.travWall, [], { h: 0.95 });
wall(42, -2, 42, 3.3, 0.3, M.travWall, [], { h: 0.95, noExtend: true });
wall(42, 12.7, 42, 18, 0.3, M.travWall, [], { h: 0.95, noExtend: true });
wall(50, -2, 50, 3.7, 0.3, M.travWall, [], { h: 0.95, noExtend: true });   // east parapet, open where the pool spills over
wall(50, 12.3, 50, 18, 0.3, M.travWall, [], { h: 0.95, noExtend: true });

// walnut panelling + brass reveals
function panelWall(x0, z0, x1, z1, h = H, normal = 1) {
  const alongX = z0 === z1, len = alongX ? x1 - x0 : z1 - z0, t = 0.04;
  if (alongX) box(len, h, t, (x0 + x1) / 2, 0, z0, M.panel, { cast: false }); else box(t, h, len, x0, 0, (z0 + z1) / 2, M.panel, { cast: false });
  const n = Math.round(len / 0.9);
  for (let i = 1; i < n; i++) { const s = (alongX ? x0 : z0) + len * i / n; if (alongX) box(0.012, h, 0.01, s, 0, z0 + normal * 0.025, M.brass, { cast: false }); else box(0.01, h, 0.012, x0 + normal * 0.025, 0, s, M.brass, { cast: false }); }
  if (alongX) box(len, 0.02, 0.06, (x0 + x1) / 2, h - 0.02, z0, M.brass, { cast: false }); else box(0.06, 0.02, len, x0, h - 0.02, (z0 + z1) / 2, M.brass, { cast: false });
}
panelWall(0.2, 5.22, 4.8, 5.22);
panelWall(0.2, 10.78, 4.8, 10.78, H, -1);
panelWall(5.22, 0.2, 5.22, 6.42);
panelWall(18.1, 0.22, 24.9, 0.22, 1.7);
panelWall(31.2, 3.72, 41.8, 3.72);
panelWall(12.1, 0.2, 12.1, 6.42);
box(26, 0.06, 0.012, 18, 0, 6.585, M.brass, { cast: false }); box(17, 0.06, 0.012, 13.5, 0, 9.415, M.brass, { cast: false });

// ---------- roofs ----------
roofSlab(-2.2, 5, 4.6, 11.4);
roofSlab(4.8, 31.2, -0.2, 6.65);
roofSlab(4.8, 22.0, 9.35, 16.2);
roofSlab(4.8, 31.2, 6.65, 6.95); roofSlab(4.8, 31.2, 9.05, 9.35);
{ const sk = box(26.4, 0.03, 2.1, 18, H + 0.22, 8, M.glass, { parent: roofGroup, cast: false }); sk.renderOrder = 3;
  for (let x = 6; x <= 30; x += 3) box(0.04, 0.06, 2.1, x, H + 0.16, 8, M.frame, { parent: roofGroup }); }
roofSlab(31, 44.4, 3.0, 13.0);
roofSlab(22.0, 31.2, 9.35, 9.7); roofSlab(22.0, 31.2, 15.8, 16.2);
roofSlab(30.8, 31.2, 9.35, 16.2); roofSlab(21.8, 22.2, 9.35, 16.2);
box(13.4, 0.05, 0.02, 37.7, H + 0.06, 13.01, M.brass, { parent: roofGroup }); box(0.02, 0.05, 10, 44.41, H + 0.06, 8, M.brass, { parent: roofGroup });
box(0.02, 0.05, 6.8, -2.21, H + 0.06, 8, M.brass, { parent: roofGroup });

// ---------- lighting fixtures ----------
function chandelier(x, z, yTop, r, n, tiers = 2) {
  cyl(0.008, 0.008, H - yTop, x, yTop, z, M.brass, { seg: 6, cast: false });
  for (let t = 0; t < tiers; t++) {
    const rr = r * (1 - t * 0.33), y = yTop - t * 0.3, k = Math.round(n * (1 - t * 0.3));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.018, 8, 64), M.brass); ring.rotation.x = Math.PI / 2; ring.position.set(x, y, z); world.add(ring);
    for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2 + t * 0.3; cyl(0.004, 0.004, 0.12, x + Math.cos(a) * rr, y - 0.12, z + Math.sin(a) * rr, M.brass, { seg: 4, cast: false }); sphere(0.055, x + Math.cos(a) * rr, y - 0.16, z + Math.sin(a) * rr, M.bulb, world, false); }
    if (t > 0) for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; cyl(0.004, 0.004, 0.3, x + Math.cos(a) * rr, y, z + Math.sin(a) * rr, M.brass, { seg: 4, cast: false }); }
  }
}
function spiralPendants(cx, cz) {
  const n = 34;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), a = t * Math.PI * 4.2, r = 0.25 + t * 0.85, y = 3.0 - t * 1.0;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    cyl(0.003, 0.003, H - y, x, y, z, M.brass, { seg: 4, cast: false });
    sphere(0.06 + 0.02 * Math.sin(i), x, y - 0.03, z, M.bulb, world, false);
  }
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.03, 48), M.brass); disc.position.set(cx, H - 0.02, cz); ceilFx.add(disc);
}
function pendant(x, z, y = 2.2) { cyl(0.004, 0.004, H - y, x, y, z, M.black, { seg: 4, cast: false }); cyl(0.09, 0.2, 0.28, x, y - 0.28, z, M.brass, { cast: false }); sphere(0.06, x, y - 0.3, z, M.bulb, world, false); }

// ---------- landscape ----------
function olive(x, z, s = 1, collide = true) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); world.add(g);
  for (const [dx, dz, h] of [[0.25, 0.3, 1.7], [-0.3, -0.15, 1.5], [0.05, -0.3, 1.8]]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.13, h, 7), M.bark);
    c.position.set(dx * 0.5, h / 2, dz * 0.5); c.rotation.set(dz * 0.6, 0, -dx * 0.6); c.castShadow = true; g.add(c);
  }
  const geo = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(geo, i % 3 ? M.olive : M.olive2), a = i / 9 * Math.PI * 2;
    m.position.set(Math.cos(a) * (0.5 + rnd() * 0.5), 1.9 + rnd() * 0.7, Math.sin(a) * (0.5 + rnd() * 0.5));
    m.scale.set(0.55 + rnd() * 0.3, 0.32 + rnd() * 0.15, 0.55 + rnd() * 0.3); m.castShadow = true; g.add(m);
  }
  if (collide) addCol(x - .3 * s, x + .3 * s, z - .3 * s, z + .3 * s);
}
function frondGeo(L = 2.6, W = 0.55) {
  const geo = new THREE.PlaneGeometry(L, W, 10, 2), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = (p.getX(i) + L / 2) / L, w = p.getY(i); p.setXYZ(i, t * L, 0.55 * t - 1.5 * t * t, w * (Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.05) * (1 - t * 0.3)); }
  geo.computeVertexNormals(); return geo;
}
const FROND = frondGeo();
function palm(x, z, h = 6, lean = 0.6, rot = 0, collide = true) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; world.add(g);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, h * 0.55, 0), new THREE.Vector3(lean, h, 0));
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.15, 8), M.palmBark); trunk.castShadow = true; g.add(trunk);
  for (let i = 1; i < 14; i++) { const p = curve.getPoint(i / 14); const r = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 4, 10), M.palmBark); r.position.copy(p); r.rotation.x = Math.PI / 2; g.add(r); }
  const top = curve.getPoint(1);
  for (let i = 0; i < 12; i++) { const f = new THREE.Mesh(FROND, M.palm); f.position.copy(top); f.rotation.set(0, i / 12 * Math.PI * 2 + rnd() * 0.3, (rnd() - 0.3) * 0.5); f.castShadow = true; g.add(f); }
  if (collide) addCol(x - .25, x + .25, z - .25, z + .25);
}
function roundPlanter(x, z, r, h, tree = 0) {
  cyl(r, r * 0.86, h, x, 0, z, M.planterStone, { collide: true });
  cyl(r * 0.88, r * 0.88, 0.02, x, h - 0.05, z, M.soil);
  const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.005, 0.012, 6, 48), M.brass); band.rotation.x = Math.PI / 2; band.position.set(x, h - 0.04, z); world.add(band);
  if (tree) olive(x, z, tree, false);
}
function rug(x0, x1, z0, z1, color, border = 0xc9a45c) {
  box(x1 - x0, 0.012, z1 - z0, (x0 + x1) / 2, 0.006, (z0 + z1) / 2, std({ color: border, roughness: 1 }), { cast: false });
  box(x1 - x0 - 0.16, 0.014, z1 - z0 - 0.16, (x0 + x1) / 2, 0.006, (z0 + z1) / 2, phys({ color, roughness: 1, sheen: 0.8, sheenColor: new THREE.Color(0xffffff) }), { cast: false });
}
const ART_PAL = [['#b5542e', '#efe4d0', '#1d2a33', '#c9a45c', '#6a2a1e'], ['#2f4a3e', '#ece2cf', '#a3482a', '#151a1d', '#d6b170'], ['#d9a066', '#2a2326', '#efe6d6', '#6f7f80', '#9b3b2b'], ['#0f1a24', '#e9dcc6', '#c47a3a', '#3e5d55', '#b99254']];
function art(x, z, facing, w, h, seed, y = 1.6) {
  const tex = canvasTex(512, (g, S) => {
    const pal = ART_PAL[seed % ART_PAL.length];
    g.fillStyle = pal[1]; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 9; k++) {
      g.fillStyle = pal[(k + seed) % 5]; g.globalAlpha = 0.85 + rnd() * 0.15;
      const ty = (k + seed) % 4;
      if (ty === 0) { g.beginPath(); g.arc(rnd() * S, rnd() * S, 40 + rnd() * 140, 0, Math.PI * 2); g.fill(); }
      else if (ty === 1) { g.beginPath(); g.arc(rnd() * S, S, 80 + rnd() * 160, Math.PI, 0); g.fill(); }
      else if (ty === 2) { g.lineWidth = 6 + rnd() * 20; g.strokeStyle = pal[(k + 2) % 5]; g.beginPath(); g.moveTo(rnd() * S, rnd() * S); g.bezierCurveTo(rnd() * S, rnd() * S, rnd() * S, rnd() * S, rnd() * S, rnd() * S); g.stroke(); }
      else g.fillRect(rnd() * S * 0.7, rnd() * S * 0.7, 60 + rnd() * 220, 20 + rnd() * 160);
    }
    g.globalAlpha = 1;
  });
  const g = piece(x, z, facing);
  gbox(g, w + 0.1, h + 0.1, 0.05, 0, y - h / 2 - 0.05, 0, M.brass);
  gbox(g, w + 0.04, h + 0.04, 0.055, 0, y - h / 2 - 0.02, 0, M.black);
  const c = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std({ map: tex, roughness: 0.85 })); c.position.set(0, y, 0.03); g.add(c);
  gbox(g, Math.min(0.8, w * 0.5), 0.04, 0.1, 0, y + h / 2 + 0.12, 0.08, M.brass);
  return g;
}
function chair(x, z, rot, seat = M.velvetGreen) {
  const g = piece(x, z, rot);
  gbox(g, 0.5, 0.1, 0.5, 0, 0.4, 0, seat);
  const back = gbox(g, 0.5, 0.55, 0.08, 0, 0.5, 0.22, seat); back.rotation.x = -0.08;
  for (const [a, b] of [[-.21, -.21], [.21, -.21], [-.21, .21], [.21, .21]]) gbox(g, 0.03, 0.4, 0.03, a, 0, b, M.brass);
}
function sofaPiece(g, len, mat, depth = 1.05) {
  gbox(g, len, 0.38, depth, 0, 0.04, 0, mat); gbox(g, len, 0.42, 0.24, 0, 0.42, depth / 2 - 0.12, mat);
  gbox(g, 0.22, 0.24, depth, -len / 2 + 0.11, 0.42, 0, mat); gbox(g, 0.22, 0.24, depth, len / 2 - 0.11, 0.42, 0, mat);
  const n = Math.max(1, Math.round(len / 1.1)); for (let i = 0; i < n; i++) gbox(g, (len - 0.5) / n - 0.03, 0.14, depth - 0.32, -len / 2 + 0.25 + (len - 0.5) * (i + 0.5) / n, 0.42, -0.08, mat);
  gbox(g, len - 0.1, 0.04, depth - 0.1, 0, 0.0, 0, M.brass);
}

// ================= furnishing =================
// Entry court: travertine, twin reflecting pools, olives, palms, bollard lights
for (const [z0, z1] of [[3.0, 6.3], [9.7, 13.0]]) {
  box(10.2, 0.08, z1 - z0 + 0.2, -7.5, 0, (z0 + z1) / 2, M.planterStone);
  const w = box(10, 0.012, z1 - z0, -7.5, 0.08, (z0 + z1) / 2, M.mirrorWater, { cast: false }); w.receiveShadow = true;
  addCol(-12.6, -2.4, z0 - 0.1, z1 + 0.1);
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.06), M.glow); l.position.set(-12 + i * 3, 0.095, z0 < 8 ? z1 - 0.06 : z0 + 0.06); world.add(l); }
}
olive(-13.1, 2.9, 1.25); olive(-13.1, 13.1, 1.2); olive(-1.4, 3.0, 0.9); olive(-1.4, 13.0, 0.9);
palm(-13.2, 6.0, 6.2, 0.9, 0.4); palm(-13.2, 10.0, 7.0, 1.0, -0.4);
for (const z of [6.75, 9.25]) for (let x = -13; x <= -1; x += 3) { box(0.06, 0.5, 0.06, x, 0, z, M.black); sphere(0.05, x, 0.55, z, M.bulb, world, false); }
{ const g = piece(0.25, 7.3, -0.12); gbox(g, 1.35, 2.85, 0.07, 0.68, 0, 0, M.panel); gbox(g, 0.04, 1.4, 0.05, 1.2, 0.7, 0.07, M.brass); }
// Foyer
spiralPendants(2.5, 8);
box(1.8, 0.85, 0.42, 2.5, 0, 5.48, M.lacquer, { collide: true }); box(1.84, 0.03, 0.46, 2.5, 0.85, 5.48, M.marbleDark);
cyl(0.13, 0.08, 0.55, 1.9, 0.88, 5.5, M.brass); art(2.5, 5.27, 0, 1.3, 1.0, 3, 1.85);
roundPlanter(4.3, 10.3, 0.32, 0.6, 0.35);
rug(1.2, 3.8, 6.8, 9.2, 0x2a2420);
lamp(2.5, 2.4, 8, 10, 8);
// Dining
box(3.6, 0.06, 1.15, 8.7, 0.72, 3.2, M.marbleDark);
box(0.5, 0.72, 0.5, 7.6, 0, 3.2, M.brassBrushed); box(0.5, 0.72, 0.5, 9.8, 0, 3.2, M.brassBrushed);
addCol(6.9, 10.5, 2.62, 3.78);
for (const dx of [-1.15, 0, 1.15]) { chair(8.7 + dx, 2.3, Math.PI); chair(8.7 + dx, 4.1, 0); }
chair(6.55, 3.2, -Math.PI / 2); chair(10.85, 3.2, Math.PI / 2);
box(0.5, 0.85, 3.0, 5.52, 0, 3.2, M.lacquer, { collide: true }); box(0.52, 0.03, 3.02, 5.52, 0.85, 3.2, M.counter);
cyl(0.12, 0.08, 0.4, 5.52, 0.88, 2.3, M.ceramic); cyl(0.09, 0.11, 0.28, 5.52, 0.88, 4.0, M.brass);
art(5.28, 3.2, Math.PI / 2, 2.0, 1.3, 1, 1.95);
chandelier(8.7, 3.2, 2.3, 0.75, 18);
rug(6.4, 11.0, 1.6, 4.8, 0x2f2a25); lamp(8.7, 2.2, 3.2, 10, 9);
downlights(5.5, 11.5, 0.5, 6, 3, 1); cove(5, 12, 0, 6.5);
// Kitchen
box(5.4, 0.9, 0.62, 15, 0, 0.51, M.lacquer, { collide: true }); box(5.44, 0.04, 0.66, 15, 0.9, 0.51, M.counter);
box(5.4, 0.66, 0.02, 15, 0.94, 0.21, M.counter, { cast: false });
box(0.7, 0.01, 0.5, 16.6, 0.94, 0.5, M.black);
box(0.9, 0.5, 0.45, 16.6, 1.9, 0.43, M.brassBrushed);
box(0.6, 0.02, 0.4, 13.7, 0.93, 0.5, M.black); cyl(0.015, 0.015, 0.35, 13.7, 0.94, 0.3, M.brass, { seg: 8 });
box(1.8, 0.75, 0.36, 13.9, 2.1, 0.38, M.panel); box(1.3, 0.75, 0.36, 17.4, 2.1, 0.38, M.panel);
box(2.6, 0.88, 1.1, 15, 0, 3.2, M.lacquer, { collide: true }); box(2.8, 0.08, 1.2, 15, 0.88, 3.2, M.counter);
for (const dx of [-0.8, 0, 0.8]) { cyl(0.2, 0.2, 0.08, 15 + dx, 0.68, 4.15, M.leather); cyl(0.02, 0.02, 0.68, 15 + dx, 0, 4.15, M.brass, { seg: 6 }); }
pendant(14.2, 3.2, 2.05); pendant(15, 3.2, 2.05); pendant(15.8, 3.2, 2.05); lamp(15, 2.4, 3, 9, 9);
downlights(12.5, 17.5, 0.5, 6, 3, 2);
// Primary bedroom
{ const g = piece(21.5, 1.3, 0);
  gbox(g, 2.1, 0.35, 2.2, 0, 0.05, 0, M.velvetTaupe); gbox(g, 1.9, 0.25, 2.05, 0, 0.4, 0.04, M.linen);
  gbox(g, 1.96, 0.07, 1.1, 0, 0.62, 0.45, M.velvetRust); gbox(g, 2.6, 1.45, 0.16, 0, 0, -1.08, M.velvetTaupe);
  for (const dx of [-0.5, 0.5]) gbox(g, 0.7, 0.18, 0.3, dx, 0.64, -0.82, M.linen);
  gbox(g, 2.2, 0.03, 2.3, 0, 0.0, 0, M.brass); }
addCol(20.4, 22.6, 0.2, 2.4);
for (const dx of [-1.6, 1.6]) { box(0.55, 0.5, 0.45, 21.5 + dx, 0, 0.5, M.lacquer, { collide: true }); cyl(0.12, 0.16, 0.38, 21.5 + dx, 0.5, 0.5, M.brass); sphere(0.16, 21.5 + dx, 1.05, 0.5, M.bulb, world, false); }
box(0.6, 0.75, 1.5, 18.45, 0, 3.8, M.panel, { collide: true }); box(0.62, 0.03, 1.52, 18.45, 0.75, 3.8, M.marbleDark); chair(19.1, 3.8, -Math.PI / 2, M.velvetTaupe);
{ const g = piece(23.9, 4.6, -2.3); sofaPiece(g, 0.95, M.velvetGreen, 0.9); }
rug(19.6, 23.4, 2.2, 5.2, 0xb8a58a); lamp(21.5, 2.5, 3.4, 8, 9);
downlights(18.5, 24.5, 0.5, 6, 3, 2); cove(18, 25, 0, 6.5);
// Dressing
box(2.7, 2.6, 0.62, 26.5, 0, 0.5, M.panel, { collide: true });
for (const dx of [-0.9, 0, 0.9]) box(0.02, 1.0, 0.03, 26.5 + dx + 0.06, 0.9, 0.82, M.brass);
box(0.6, 2.6, 2.4, 27.6, 0, 2.6, M.panel, { collide: true });
box(1.2, 0.85, 0.7, 26.1, 0, 3.4, M.lacquer, { collide: true }); box(1.22, 0.03, 0.72, 26.1, 0.85, 3.4, M.marbleDark);
lamp(26.5, 2.4, 3, 5, 6); downlights(25.3, 27.7, 1.5, 6, 1, 3);
// Bath
box(2.4, 0.56, 0.88, 29.5, 0, 0.66, M.ceramic, { collide: true }); box(2.2, 0.02, 0.66, 29.5, 0.5, 0.66, M.pool, { cast: false });
cyl(0.015, 0.015, 0.9, 30.6, 0.56, 1.1, M.brass, { seg: 8 });
box(0.5, 0.82, 1.6, 30.55, 0, 3.0, M.marbleDark, { collide: true }); box(0.54, 0.04, 1.64, 30.55, 0.82, 3.0, M.counter);
cyl(0.18, 0.15, 0.12, 30.55, 0.86, 3.0, M.ceramic);
box(0.03, 1.1, 1.2, 30.77, 1.1, 3.0, phys({ color: 0xffffff, metalness: 1, roughness: 0.02 }), { cast: false }); box(0.035, 1.16, 1.26, 30.785, 1.07, 3.0, M.brass);
lamp(29.5, 2.4, 3, 6, 7); downlights(28.3, 30.7, 0.8, 6, 1, 3);
// Gallery
[[7.9, 2.0], [12.75, 1.6], [17.8, 2.4], [24.0, 2.6], [27.6, 1.6]].forEach(([x, w], i) => art(x, 6.6, 0, w, w * 0.62, i, 1.65));
[[7.2, 2.4], [13.2, 2.4], [19.8, 2.2]].forEach(([x, w], i) => art(x, 9.4, Math.PI, w, w * 0.6, i + 2, 1.65));
for (const z of [6.72, 9.28]) { const m = new THREE.Mesh(new THREE.BoxGeometry(25.6, 0.03, 0.05), M.glowSoft); m.position.set(18, H - 0.06, z); ceilFx.add(m); }
{ cyl(0.32, 0.32, 0.95, 25.0, 0, 8.9, M.marbleDark, { collide: true }); const s = new THREE.Mesh(new THREE.TorusKnotGeometry(0.2, 0.065, 120, 12, 2, 3), M.brass); s.position.set(25, 1.28, 8.9); s.castShadow = true; world.add(s); }
lamp(10, 2.6, 8, 7, 9); lamp(18, 2.6, 8, 7, 9); lamp(26, 2.6, 8, 7, 9);
// Guest suite
{ const g = piece(11.2, 14.7, Math.PI);
  gbox(g, 1.9, 0.35, 2.15, 0, 0.05, 0, M.velvetNavy); gbox(g, 1.7, 0.25, 2.0, 0, 0.4, 0.04, M.linen);
  gbox(g, 1.76, 0.07, 1.1, 0, 0.62, 0.45, M.velvetNavy); gbox(g, 2.3, 1.3, 0.14, 0, 0, -1.07, M.velvetNavy); }
addCol(10.25, 12.15, 13.6, 15.8);
for (const dx of [-1.35, 1.35]) box(0.45, 0.5, 0.4, 11.2 + dx, 0, 15.5, M.lacquer, { collide: true });
{ const g = piece(6.3, 14.9, -2.4); sofaPiece(g, 0.95, M.leather, 0.9); }
box(1.4, 2.4, 0.62, 6.0, 0, 10.0, M.panel, { collide: true });
rug(8.6, 13.6, 11.4, 14.2, 0xd8c8ae); lamp(10, 2.5, 12.8, 8, 9); downlights(6, 13.5, 10.3, 15.5, 3, 2);
// Library
box(0.38, 3.0, 6.0, 14.27, 0, 12.75, M.books, { collide: true });
box(4.2, 3.0, 0.38, 16.45, 0, 15.73, M.books, { collide: true });
box(0.38, 3.0, 5.2, 21.73, 0, 13.25, M.books, { collide: true });
for (const [x, z, r] of [[17.6, 12.8, Math.PI * 0.75], [19.4, 14.1, Math.PI * 1.25]]) { const g = piece(x, z, r); sofaPiece(g, 0.95, M.leather, 0.92); addCol(x - .45, x + .45, z - .45, z + .45); }
cyl(0.38, 0.38, 0.05, 18.7, 0.48, 13.6, M.marbleDark); cyl(0.04, 0.2, 0.48, 18.7, 0, 13.6, M.brass, { collide: true });
cyl(0.015, 0.015, 1.5, 16.6, 0, 14.6, M.brass, { seg: 6 }); cyl(0.2, 0.25, 0.25, 16.6, 1.5, 14.6, M.brass); sphere(0.07, 16.6, 1.5, 14.6, M.bulb, world, false);
rug(16.0, 21.0, 11.6, 15.3, 0x5a2a24); lamp(18, 2.5, 12.8, 8, 9); downlights(15, 21, 10.3, 15.4, 3, 2); cove(14, 22, 9.5, 16);
// Garden court
olive(24.6, 13.6, 1.35); palm(29.3, 11.5, 6.5, 0.8, 2.2);
roundPlanter(27, 13.6, 1.0, 0.55); cyl(0.9, 0.9, 0.02, 27, 0.5, 13.6, M.soil);
for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), M.olive2); s.position.set(27 + Math.cos(a) * .55, .62, 13.6 + Math.sin(a) * .55); s.castShadow = true; world.add(s); }
box(1.8, 0.45, 0.45, 26.5, 0, 15.4, M.planterStone, { collide: true });
for (let i = 0; i < 6; i++) box(0.8, 0.03, 0.45, 26.5 + Math.sin(i) * 0.3, 0, 10.4 + i * 0.6, M.planterStone, { cast: false });
lamp(23, 0.3, 10.3, 3, 4); lamp(30.5, 0.3, 15.5, 3, 4);
// Living room
rug(33.6, 39.6, 5.6, 9.8, 0xe2d6c2);
{ const g = piece(36.6, 10.35, 0); sofaPiece(g, 4.0, M.boucle, 1.1); gbox(g, 0.42, 0.38, 0.12, -1.3, 0.56, 0.24, M.velvetRust); gbox(g, 0.42, 0.38, 0.12, 1.2, 0.56, 0.24, M.velvetGreen); }
addCol(34.6, 38.6, 9.8, 10.9);
{ const g = piece(33.2, 7.6, -Math.PI / 2); sofaPiece(g, 2.2, M.velvetGreen, 0.95); } addCol(32.7, 33.7, 6.5, 8.7);
cyl(0.62, 0.62, 0.06, 36.6, 0.36, 7.6, M.marbleDark, { collide: true }); cyl(0.5, 0.45, 0.36, 36.6, 0, 7.6, M.brass);
cyl(0.11, 0.08, 0.26, 36.4, 0.42, 7.5, M.ceramic); sphere(0.1, 36.85, 0.52, 7.75, M.brass);
{ const g = piece(39.7, 7.6, Math.PI / 2 + 0.35); sofaPiece(g, 0.95, M.leather, 0.92); } addCol(39.2, 40.2, 7.1, 8.1);
box(7.0, 0.62, 0.45, 36.5, 0, 4.0, M.lacquer, { collide: true }); box(7.04, 0.04, 0.49, 36.5, 0.62, 4.0, M.marbleDark);
art(36.5, 3.76, 0, 3.6, 1.7, 0, 1.85);
cyl(0.14, 0.1, 0.55, 33.8, 0.66, 4.0, M.ceramic); cyl(0.1, 0.12, 0.32, 39.3, 0.66, 4.0, M.brass);
roundPlanter(41.3, 11.8, 0.32, 0.6, 0.4);
chandelier(36.6, 7.6, 2.5, 1.0, 24, 3);
lamp(36.6, 2.3, 7.6, 12, 12); lamp(33.5, 2.5, 5, 5, 7);
downlights(31.8, 41.2, 4.2, 11.8, 4, 3); cove(31, 42, 3.5, 12.5);
// Terrace & infinity pool (pool x43.5..49.7, z4..12; vanishing edge on the east)
{
  const px0 = 43.5, px1 = 49.7, pz0 = 4, pz1 = 12, depth = 0.28;
  box(px1 - px0, 0.01, pz1 - pz0, (px0 + px1) / 2, -depth, (pz0 + pz1) / 2, M.poolTile, { cast: false });
  box(px1 - px0, depth, 0.05, (px0 + px1) / 2, -depth, pz0 + 0.025, M.poolTile); box(px1 - px0, depth, 0.05, (px0 + px1) / 2, -depth, pz1 - 0.025, M.poolTile);
  box(0.05, depth, pz1 - pz0, px0 + 0.025, -depth, (pz0 + pz1) / 2, M.poolTile);
  box(0.12, depth - 0.03, pz1 - pz0, px1 - 0.06, -depth, (pz0 + pz1) / 2, M.marbleDark, { cast: false });
  box(0.5, 0.02, pz1 - pz0 + 0.4, px1 + 0.25, -0.5, (pz0 + pz1) / 2, M.mirrorWater, { cast: false });
  box(0.08, 0.5, pz1 - pz0 + 0.6, px1 + 0.54, -0.6, (pz0 + pz1) / 2, M.plinth);
  const water = box(px1 - px0 - 0.02, 0.02, pz1 - pz0 - 0.06, (px0 + px1) / 2, -0.03, (pz0 + pz1) / 2, M.pool, { cast: false }); water.renderOrder = 1; water.receiveShadow = true;
  // sheet of water spilling over the vanishing edge
  const spill = box(0.01, 0.45, pz1 - pz0 - 0.06, px1 + 0.005, -0.48, (pz0 + pz1) / 2, phys({ color: 0x2a8fa0, roughness: 0.05, transparent: true, opacity: 0.55, normalMap: TEX.water, emissive: 0x0f6f80, emissiveIntensity: 0.4 }), { cast: false });
  const cop = M.planterStone;
  box(px1 - px0 + 0.3, 0.04, 0.3, (px0 + px1) / 2 - 0.15, 0, pz0 - 0.15, cop); box(px1 - px0 + 0.3, 0.04, 0.3, (px0 + px1) / 2 - 0.15, 0, pz1 + 0.15, cop);
  box(0.3, 0.04, pz1 - pz0, px0 - 0.15, 0, (pz0 + pz1) / 2, cop);
  addCol(px0, px1 + 0.7, pz0, pz1);
  for (const z of [5.5, 8, 10.5]) { const m = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 4, 4.5) })); m.position.set(px0 + 0.06, -0.15, z); m.rotation.y = Math.PI / 2; world.add(m); }
  lamp(46.5, -0.12, 6, 6, 8, 0x5fe0f0); lamp(46.5, -0.12, 10, 6, 8, 0x5fe0f0);
}
roundPlanter(49.2, 0.8, 0.5, 0.7, 0.55); roundPlanter(49.2, 15.2, 0.5, 0.7, 0.55);
roundPlanter(43.0, 13.4, 0.38, 0.6, 0.45); roundPlanter(43.0, 17.0, 0.38, 0.6, 0.45);
palm(48.8, -1.1, 7.2, 1.1, -2.4); palm(48.8, 17.1, 6.6, 1.0, 2.4);
function lounger(x, z, rot) {
  const g = piece(x, z, rot);
  gbox(g, 0.72, 0.26, 1.95, 0, 0.04, 0, M.panel); gbox(g, 0.64, 0.1, 1.3, 0, 0.3, 0.27, M.boucle);
  const back = gbox(g, 0.64, 0.09, 0.72, 0, 0.42, -0.6, M.boucle); back.rotation.x = 0.55;
  gbox(g, 0.74, 0.02, 1.97, 0, 0.02, 0, M.brass);
  addCol(x - 0.45, x + 0.45, z - 1.0, z + 1.0);
}
lounger(44.6, 1.4, Math.PI); lounger(46.1, 1.4, Math.PI); lounger(44.6, 14.6, 0); lounger(46.1, 14.6, 0);
cyl(0.25, 0.25, 0.45, 45.35, 0, 1.4, M.marbleDark);
{ cyl(0.03, 0.03, 2.4, 47.6, 0, 14.6, M.brass, { seg: 8 }); const u = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.4, 12), M.boucle); u.position.set(47.6, 2.45, 14.6); u.castShadow = true; world.add(u); }
for (const z of [-1.6, 17.6]) for (let x = 43; x <= 49; x += 2) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.04, 0.04), M.glow); l.position.set(x, 0.9, z + (z < 0 ? 0.17 : -0.17)); world.add(l); }

// estate landscaping
for (let i = 0; i < 46; i++) {
  const a = rnd() * Math.PI * 2, r = 30 + rnd() * 60, x = 18 + Math.cos(a) * r * 1.3, z = 8 + Math.sin(a) * r;
  if (x < -12 && Math.abs(z - 8) < 6) continue;           // keep the approach clear
  if (Math.hypot(x + 30, z - 40) < 26 || Math.hypot(x - 70, z + 22) < 26 || Math.hypot(x + 14, z - 26) < 16) continue; // keep hero / finale sightlines clear
  if (rnd() < 0.55) olive(x, z, 1.1 + rnd() * 0.8, false); else palm(x, z, 6 + rnd() * 4, 0.5 + rnd(), rnd() * 6, false);
}
for (const [x, z] of [[-16, 2.5], [-16, 13.5], [52, -4], [52, 20], [30, -4], [12, 19]]) olive(x, z, 1.4, false);

// ---------- floating labels (free dollhouse mode) ----------
for (const r of ROOMS) {
  const el = document.createElement('div'); el.className = 'label';
  el.innerHTML = `${r.name}<small>${area(r).toFixed(0)} M²</small>`;
  el.addEventListener('pointerdown', e => { e.stopPropagation(); teleport(r.id); });
  const o = new CSS2DObject(el); o.position.set((r.x0 + r.x1) / 2, r.id === 'terrace' ? 1.6 : 3.7, (r.z0 + r.z1) / 2); scene.add(o);
}

// ---------- post-processing ----------
let composer = null;
if (BLOOM) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.45, 1.45));
  composer.addPass(new OutputPass());
}

/* ================================================================
   SCROLL STORY — camera on CatmullRom splines driven by scroll
================================================================ */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const KEYS = [
  { p: V(-30, 17, 40), l: V(16, 1, 6), ch: 'hero' },
  { p: V(-30, 10, 22), l: V(-3, 0.8, 8) },
  { p: V(-24, 4.5, 11), l: V(-1, 1.6, 8) },
  { p: V(-15.5, 1.75, 8), l: V(0, 1.9, 8), ch: 'entry' },
  { p: V(-3.4, 1.65, 8), l: V(4, 1.9, 8), ch: 'entry' },
  { p: V(1.3, 1.6, 8.0), l: V(3.4, 2.65, 8.0), ch: 'foyer' },
  { p: V(5.9, 1.6, 8), l: V(18, 1.7, 8), ch: 'gallery' },
  // dining
  { p: V(11, 1.6, 7.9), l: V(10.2, 1.4, 3.5) },
  { p: V(11, 1.6, 6.15), l: V(7.8, 1.25, 2.6), ch: 'dining' },
  { p: V(11.3, 1.6, 8.0), l: V(14.5, 1.4, 5) },
  // kitchen
  { p: V(14.5, 1.6, 7.9), l: V(15.2, 1.3, 3) },
  { p: V(14.5, 1.6, 6.15), l: V(15.8, 1.1, 1.0), ch: 'dining' },
  { p: V(14.9, 1.6, 8.0), l: V(17, 1.4, 11) },
  // library
  { p: V(17, 1.6, 8.0), l: V(17.6, 1.3, 13) },
  { p: V(17, 1.6, 9.85), l: V(18.6, 1.15, 14.2), ch: 'library' },
  { p: V(17.4, 1.6, 8.0), l: V(21, 1.4, 5) },
  // primary suite
  { p: V(21, 1.6, 8.0), l: V(21.3, 1.2, 3) },
  { p: V(21, 1.6, 6.15), l: V(21.6, 0.95, 1.2), ch: 'primary' },
  { p: V(21.4, 1.6, 8.0), l: V(26.5, 1.5, 11) },
  // garden court
  { p: V(26.5, 1.65, 8.0), l: V(26.9, 1.5, 13) },
  { p: V(26.5, 1.7, 10.1), l: V(27.2, 1.4, 14.5), ch: 'garden' },
  { p: V(27.0, 1.6, 8.0), l: V(34, 1.5, 8) },
  // living + terrace
  { p: V(30.2, 1.6, 8.0), l: V(38, 1.5, 7.5) },
  { p: V(32.6, 1.75, 9.2), l: V(39, 1.25, 6.4), ch: 'living' },
  { p: V(36.6, 1.65, 5.25), l: V(44, 1.1, 6.6) },
  { p: V(40.4, 1.6, 6.3), l: V(46, 1.0, 6.5) },
  { p: V(42.0, 1.6, 6.5), l: V(48, 0.8, 5.5) },
  { p: V(42.85, 1.65, 5.2), l: V(50, 0.3, 6) },
  { p: V(43.1, 1.75, 1.6), l: V(53, -0.4, 8.5), ch: 'terrace' },
  { p: V(44.6, 1.5, -0.9), l: V(51, -0.3, 11), ch: 'terrace' },
  { p: V(70, 15, -22), l: V(30, 6, 7), ch: 'cta' },
];
const NK = KEYS.length;
const posCurve = new THREE.CatmullRomCurve3(KEYS.map(k => k.p), false, 'centripetal');
const lookCurve = new THREE.CatmullRomCurve3(KEYS.map(k => k.l), false, 'centripetal');
const R = byId;
const chRange = id => { const ks = KEYS.map((k, i) => k.ch === id ? i : -1).filter(i => i >= 0); return id === 'hero' ? [0, 0.35] : [ks[0], ks[ks.length - 1]]; };
const CHAPTERS = [
  { id: 'hero', nav: 'Overview', kick: 'Akar Design presents', title: 'Gallery House', meta: '', copy: 'A single-storey private residence in marble, walnut and light — drawn from its floor plan, rendered in three dimensions.', range: null, cls: 'hero' },
  { id: 'entry', nav: 'Arrival', kick: '01 · Arrival', title: 'Entry Court', meta: `<b>${area(R.entry)} m²</b> · Open-air forecourt`, copy: 'Travertine underfoot, twin reflecting pools and sculpted olives frame a slow, ceremonial approach.', range: null, cls: 'left' },
  { id: 'foyer', nav: 'Foyer', kick: '02 · Welcome', title: 'The Foyer', meta: `<b>${area(R.foyer)} m²</b> · Walnut & Calacatta`, copy: 'A spiral of glass pendants descends through a walnut-lined vestibule, catching the light like suspended water.', range: null, cls: 'right' },
  { id: 'gallery', nav: 'Gallery', kick: '03 · The spine', title: 'The Gallery', meta: `<b>${area(R.gallery)} m²</b> · 26 m skylit promenade`, copy: 'Book-matched marble, brass reveals and museum-scale art along a corridor washed in daylight from above.', range: null, cls: 'left' },
  { id: 'dining', nav: 'Dining & Kitchen', kick: '04 · Gather', title: 'Dining & Kitchen', meta: `<b>${area(R.dining)} + ${area(R.kitchen)} m²</b> · Seats eight`, copy: 'A tiered brass chandelier above a Nero Marquina table, beside a chef’s kitchen in lacquer and white marble.', range: null, cls: 'right' },
  { id: 'library', nav: 'Library', kick: '05 · Retreat', title: 'The Library', meta: `<b>${area(R.library)} m²</b> · Floor-to-ceiling walnut`, copy: 'Cognac leather, oxblood wool and three walls of books — a room made for long, unhurried afternoons.', range: null, cls: 'left' },
  { id: 'primary', nav: 'Primary Suite', kick: '06 · Private', title: 'Primary Suite', meta: `<b>${area(R.bedroom) + area(R.dressing) + area(R.bath)} m²</b> · Bedroom, dressing & bath`, copy: 'Velvet, walnut panelling and soft cove light, opening to a dressing room and a marble bath with a freestanding tub.', range: null, cls: 'right' },
  { id: 'garden', nav: 'Garden Court', kick: '07 · Sanctuary', title: 'Garden Court', meta: `<b>${area(R.garden)} m²</b> · Open to the sky`, copy: 'An open-air courtyard of olive, palm and stone, held behind a full-height glazed wall to the gallery.', range: null, cls: 'left' },
  { id: 'living', nav: 'Living', kick: '08 · Entertain', title: 'Living Room', meta: `<b>${area(R.living)} m²</b> · 9 m glass wall`, copy: 'Bouclé, emerald velvet and a three-tier chandelier — the lounge dissolves into the terrace at golden hour.', range: null, cls: 'right' },
  { id: 'terrace', nav: 'Terrace & Pool', kick: '09 · Horizon', title: 'Infinity Pool', meta: `<b>${area(R.terrace)} m²</b> · Terrace & vanishing-edge pool`, copy: 'Lit from below, the water slips over its edge and into the evening — palms, travertine and a long horizon.', range: null, cls: 'left' },
  { id: 'cta', nav: 'Explore', kick: 'Akar Design · PropTech 3D & VR', title: 'Explore in 3D with Akar Design', meta: '', copy: 'From floor plan to immersive walkthrough — for developers, architects and the homes they imagine.', range: null, cls: 'cta' },
];
CHAPTERS.forEach(c => c.range = chRange(c.id));
const panelsEl = document.getElementById('panels'), chapList = document.getElementById('chapList');
for (const c of CHAPTERS) {
  const d = document.createElement('section'); d.className = 'panel ' + c.cls; d.id = 'ch-' + c.id;
  d.innerHTML = `<div class="kick">${c.kick}</div><h2>${c.title}</h2>${c.meta ? `<div class="meta">${c.meta}</div>` : ''}<p>${c.copy}</p>` +
    (c.id === 'cta' ? `<div class="ctaRow"><a href="https://akar.design" target="_blank" rel="noopener">Explore in 3D with Akar Design</a><button data-free>Explore this house freely</button></div>` : '');
  panelsEl.appendChild(d); c.el = d;
  const li = document.createElement('li'); li.innerHTML = `<span>${c.nav}</span><i></i>`; li.onclick = () => jumpTo(c.range[0]); chapList.appendChild(li); c.li = li;
}
panelsEl.querySelectorAll('[data-free]').forEach(b => b.onclick = () => enterFree('orbit'));
const scroller = document.getElementById('scroller');
const STEP_VH = 52;
scroller.style.height = `${(NK - 1) * STEP_VH + 100}vh`;
const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
function jumpTo(k) { window.scrollTo({ top: k / (NK - 1) * maxScroll(), behavior: 'smooth' }); }
const story = { target: 0, cur: 0 };
function readScroll() { if (mode === 'story') story.target = THREE.MathUtils.clamp(window.scrollY / maxScroll(), 0, 1); }
addEventListener('scroll', readScroll, { passive: true });
const smooth = (e0, e1, x) => { const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { mouse.x = e.clientX / innerWidth - 0.5; mouse.y = e.clientY / innerHeight - 0.5; } });
const _p = new THREE.Vector3(), _l = new THREE.Vector3();
let lastActive = -1;
const railFill = document.getElementById('railFill'), scrollHint = document.getElementById('scrollHint');
function updateStory(dt) {
  story.cur += (story.target - story.cur) * (1 - Math.exp(-dt * 2.6));
  if (Math.abs(story.target - story.cur) < 1e-5) story.cur = story.target;
  const u = story.cur;
  posCurve.getPoint(u, _p); lookCurve.getPoint(u, _l);
  mouse.sx += (mouse.x - mouse.sx) * Math.min(1, dt * 2); mouse.sy += (mouse.y - mouse.sy) * Math.min(1, dt * 2);
  camera.position.copy(_p); camera.lookAt(_l);
  camera.rotateY(-mouse.sx * 0.06); camera.rotateX(-mouse.sy * 0.035);
  const kf = u * (NK - 1);
  let best = 0, bestD = 1e9;
  CHAPTERS.forEach((c, i) => {
    const [a, b] = c.range, d = kf < a ? a - kf : kf > b ? kf - b : 0;
    const o = 1 - smooth(0.22, 0.6, d);
    c.el.style.opacity = o.toFixed(3);
    c.el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
    const shift = (kf < a ? 1 : kf > b ? -1 : 0) * (1 - o) * 30;
    if (innerWidth <= 760 && c.cls !== 'cta') c.el.style.transform = `translateY(${shift}px)`;
    else if (c.cls === 'hero') c.el.style.transform = `translate(-50%, ${shift}px)`;
    else if (c.cls === 'cta') c.el.style.transform = `translate(-50%, calc(-50% + ${shift}px))`;
    else c.el.style.transform = `translateY(calc(-46% + ${shift}px))`;
    c.el.classList.toggle('live', o > 0.5);
    if (d < bestD) { bestD = d; best = i; }
  });
  if (best !== lastActive) { CHAPTERS.forEach((c, i) => c.li.classList.toggle('on', i === best)); lastActive = best; }
  railFill.style.height = (u * 100).toFixed(2) + '%';
  scrollHint.style.opacity = String(1 - smooth(0.005, 0.03, u));
}

/* ================================================================
   FREE EXPLORE — dollhouse orbit + first-person walk (+ auto tour)
================================================================ */
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true; orbit.maxPolarAngle = 1.42; orbit.minDistance = 8; orbit.maxDistance = 160; orbit.enabled = false;
const ORBIT_HOME = { pos: V(-4, 36, 48), target: V(19, 0, 7.5) };
let mode = 'story';
const player = { x: 0, z: 8, yaw: 0, pitch: 0 };
const keys = {}, joy = { x: 0, y: 0 };
let tour = null;
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const helpEl = document.getElementById('help');
function setHelp() {
  helpEl.className = 'dk';
  if (mode === 'orbit') helpEl.innerHTML = isTouch ? 'Drag to orbit · pinch to zoom · tap a room label to step inside' : 'Drag to orbit · right-drag to pan · scroll to zoom · click a room label or the plan to step inside';
  else if (tour) helpEl.innerHTML = 'Auto tour playing · press any key to take over';
  else helpEl.innerHTML = isTouch ? 'Left joystick to move · drag on the right to look' : 'Click to look · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows move · <kbd>Shift</kbd> faster · <kbd>Esc</kbd> release · <kbd>1</kbd> dollhouse';
}
const savedOrbit = { pos: ORBIT_HOME.pos.clone(), target: ORBIT_HOME.target.clone() };
let storyScrollY = 0;
function enterFree(m = 'orbit') {
  if (mode === 'story') { storyScrollY = window.scrollY; document.body.classList.remove('story'); document.body.classList.add('free'); }
  mode = 'none'; setMode(m);
}
function exitFree() {
  stopTour(); if (document.pointerLockElement) document.exitPointerLock();
  orbit.enabled = false; mode = 'story';
  document.body.classList.remove('free', 'walk'); document.body.classList.add('story');
  labelRenderer.domElement.style.display = 'none';
  camera.fov = 55; camera.updateProjectionMatrix();
  window.scrollTo(0, storyScrollY); readScroll(); story.cur = story.target;
}
function setMode(m) {
  if (m === mode) return;
  if (m === 'walk') { if (mode === 'orbit') { savedOrbit.pos.copy(camera.position); savedOrbit.target.copy(orbit.target); } orbit.enabled = false; camera.fov = 70; }
  else { stopTour(); if (document.pointerLockElement) document.exitPointerLock(); orbit.enabled = true; camera.fov = 45; camera.position.copy(savedOrbit.pos); orbit.target.copy(savedOrbit.target); orbit.update(); }
  camera.updateProjectionMatrix();
  mode = m;
  labelRenderer.domElement.style.display = m === 'orbit' ? '' : 'none';
  document.body.classList.toggle('walk', m === 'walk');
  document.getElementById('btnOrbit').classList.toggle('on', m === 'orbit');
  document.getElementById('btnWalk').classList.toggle('on', m === 'walk');
  setHelp();
}
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
function teleport(id) {
  const r = byId[id]; if (!r) return;
  if (mode === 'story') enterFree('walk');
  stopTour(); setMode('walk');
  player.x = r.spawn[0]; player.z = r.spawn[1]; player.yaw = yawTo(player.x, player.z, r.look[0], r.look[1]); player.pitch = -0.05;
  toast(r.name);
}
function roomAt(x, z) { return ROOMS.filter(r => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1).sort((a, b) => area(a) - area(b))[0]; }
function teleportPoint(x, z) {
  const r = roomAt(x, z);
  if (!blocked(x, z)) { stopTour(); setMode('walk'); player.x = x; player.z = z; if (r) player.yaw = yawTo(x, z, (r.x0 + r.x1) / 2 + 0.01, (r.z0 + r.z1) / 2); toast(r ? r.name : 'Grounds'); }
  else if (r) teleport(r.id);
}
let toastT;
function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.className = 'dk show'; clearTimeout(toastT); toastT = setTimeout(() => el.className = 'dk', 1600); }
function blocked(x, z, r = RADIUS) { for (const c of colliders) if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return true; return false; }
function move(dx, dz) {
  const sub = Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.1) || 1;
  for (let i = 0; i < sub; i++) { const nx = player.x + dx / sub; if (!blocked(nx, player.z)) player.x = nx; const nz = player.z + dz / sub; if (!blocked(player.x, nz)) player.z = nz; }
  player.x = THREE.MathUtils.clamp(player.x, -55, 75); player.z = THREE.MathUtils.clamp(player.z, -25, 40);
}
addEventListener('keydown', e => {
  if (mode === 'story') return;
  if (tour && !['ShiftLeft', 'ShiftRight'].includes(e.code)) stopTour();
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'Digit1') setMode('orbit');
  if (e.code === 'Digit2' && mode !== 'walk') teleport('entry');
  if (e.code === 'KeyT') toggleTour();
  if (e.code === 'Escape' && mode === 'orbit') exitFree();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const cvs = renderer.domElement;
let dragging = false, lastX = 0, lastY = 0;
cvs.addEventListener('mousedown', e => {
  if (mode !== 'walk' || isTouch) return;
  if (tour) stopTour();
  if (!document.pointerLockElement && cvs.requestPointerLock) { try { const p = cvs.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {} }
  dragging = true; lastX = e.clientX; lastY = e.clientY;
});
addEventListener('mouseup', () => dragging = false);
addEventListener('mousemove', e => {
  if (mode !== 'walk') return;
  let mx, my;
  if (document.pointerLockElement === cvs) { mx = e.movementX; my = e.movementY; }
  else if (dragging) { mx = e.clientX - lastX; my = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; } else return;
  player.yaw -= mx * 0.0024; player.pitch = THREE.MathUtils.clamp(player.pitch - my * 0.0024, -1.3, 1.3);
});
const joyEl = document.getElementById('joy'), knob = document.getElementById('knob');
let joyId = null, lookId = null, lookX = 0, lookY = 0;
joyEl.addEventListener('touchstart', e => { e.preventDefault(); if (tour) stopTour(); joyId = e.changedTouches[0].identifier; joyMove(e.changedTouches[0]); }, { passive: false });
function joyMove(t) {
  const r = joyEl.getBoundingClientRect(); let x = (t.clientX - r.left - r.width / 2) / (r.width / 2), y = (t.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  joy.x = x; joy.y = y; knob.style.transform = `translate(${x * 34}px,${y * 34}px)`;
}
cvs.addEventListener('touchstart', e => { if (mode !== 'walk') return; if (tour) stopTour(); const t = e.changedTouches[0]; lookId = t.identifier; lookX = t.clientX; lookY = t.clientY; }, { passive: true });
addEventListener('touchmove', e => {
  if (mode === 'story') return;
  for (const t of e.changedTouches) {
    if (t.identifier === joyId) { e.preventDefault(); joyMove(t); }
    else if (t.identifier === lookId && mode === 'walk') { player.yaw -= (t.clientX - lookX) * 0.005; player.pitch = THREE.MathUtils.clamp(player.pitch - (t.clientY - lookY) * 0.005, -1.2, 1.2); lookX = t.clientX; lookY = t.clientY; }
  }
}, { passive: false });
addEventListener('touchend', e => { for (const t of e.changedTouches) { if (t.identifier === joyId) { joyId = null; joy.x = joy.y = 0; knob.style.transform = ''; } if (t.identifier === lookId) lookId = null; } });

// auto tour (free mode)
const TOUR_PTS = [[-12.5, 8], [-6, 8], [-1.4, 8], [2.5, 8], [6.5, 8], [13, 8], [20, 8], [27, 8], [30.4, 8], [32.0, 6.0], [36.5, 5.3], [40.3, 5.6], [42.0, 6.5], [42.8, 4.2], [43.2, 1.8], [45.6, 0.0]];
const tourCurve = new THREE.CatmullRomCurve3(TOUR_PTS.map(([x, z]) => V(x, 0, z)), false, 'centripetal');
const TOUR_DUR = tourCurve.getLength() / 1.55, POOL_LOOK = V(47, 0, 9);
const tourStops = [[0.0, 'Entry Court'], [0.14, 'Foyer'], [0.2, 'Gallery'], [0.53, 'Living Room'], [0.82, 'Terrace & Pool']];
function startTour() {
  if (mode === 'story') enterFree('walk'); setMode('walk'); tour = { t: 0, stop: 0 };
  const p0 = tourCurve.getPointAt(0), p1 = tourCurve.getPointAt(0.02);
  player.x = p0.x; player.z = p0.z; player.yaw = yawTo(p0.x, p0.z, p1.x, p1.z); player.pitch = -0.03;
  document.getElementById('btnTour').textContent = '■ Stop tour'; setHelp();
}
function stopTour() { if (!tour) return; tour = null; document.getElementById('btnTour').textContent = '▶ Auto tour'; setHelp(); }
function toggleTour() { tour ? stopTour() : startTour(); }
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
function angLerp(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }
function updateTour(dt) {
  tour.t += dt / TOUR_DUR; const u = ease(Math.min(tour.t, 1));
  const p = tourCurve.getPointAt(u); player.x = p.x; player.z = p.z;
  const look = u > 0.9 ? POOL_LOOK : tourCurve.getPointAt(Math.min(u + 0.035, 1));
  player.yaw = angLerp(player.yaw, yawTo(p.x, p.z, look.x, look.z), Math.min(1, dt * 2.2));
  player.pitch += (-0.04 - player.pitch) * Math.min(1, dt * 2);
  while (tour.stop < tourStops.length && u >= tourStops[tour.stop][0]) { toast(tourStops[tour.stop][1]); tour.stop++; }
  if (tour.t >= 1) { stopTour(); toast('Tour complete — explore freely'); }
}
document.getElementById('btnFree').onclick = () => enterFree('orbit');
document.getElementById('btnStory').onclick = exitFree;
document.getElementById('btnOrbit').onclick = () => setMode('orbit');
document.getElementById('btnWalk').onclick = () => { if (mode !== 'walk') teleport('entry'); };
document.getElementById('btnTour').onclick = toggleTour;
const list = document.getElementById('roomList');
for (const r of ROOMS) { const li = document.createElement('li'); li.dataset.id = r.id; li.innerHTML = `<i></i>${r.name}<em>${area(r).toFixed(0)} m²</em>`; li.onclick = () => teleport(r.id); list.appendChild(li); }
const mm = document.getElementById('minimap'), mg = mm.getContext('2d');
const MM = { x0: -15, x1: 51, z0: -3, z1: 19 }, mmScale = mm.width / (MM.x1 - MM.x0);
const toMM = (x, z) => [(x - MM.x0) * mmScale, (z - MM.z0) * mmScale];
function drawMinimap() {
  mg.clearRect(0, 0, mm.width, mm.height);
  const cur = mode === 'walk' ? roomAt(player.x, player.z) : null;
  for (const r of ROOMS) {
    const [a, b] = toMM(r.x0, r.z0), [c, d] = toMM(r.x1, r.z1);
    mg.fillStyle = r === cur ? 'rgba(201,164,92,.45)' : ['entry', 'garden', 'terrace'].includes(r.id) ? 'rgba(244,239,230,.06)' : 'rgba(244,239,230,.12)';
    mg.fillRect(a, b, c - a, d - b); mg.strokeStyle = r === cur ? '#e3c68a' : 'rgba(201,164,92,.55)'; mg.lineWidth = r === cur ? 3 : 1.3; mg.strokeRect(a, b, c - a, d - b);
  }
  { const [a, b] = toMM(43.5, 4), [c, d] = toMM(49.7, 12); mg.fillStyle = 'rgba(95,200,215,.6)'; mg.fillRect(a, b, c - a, d - b); }
  mg.fillStyle = '#f4efe6'; mg.font = '500 12px Manrope,system-ui'; mg.textAlign = 'center'; mg.textBaseline = 'middle';
  for (const r of ROOMS) { if (r.id === 'dressing' || r.id === 'bath') continue; const [x, y] = toMM((r.x0 + r.x1) / 2, r.id === 'terrace' ? 16 : (r.z0 + r.z1) / 2); mg.fillText(r.id === 'bedroom' ? 'Suite' : r.id === 'terrace' ? 'Pool' : r.name.replace(' Court', '').replace(' Room', '').replace(' Suite', ''), x, y); }
  mg.fillStyle = '#c9a45c'; mg.font = '600 11px Manrope,system-ui'; mg.fillText('N ↑', 22, 12);
  if (mode === 'walk') {
    const [x, y] = toMM(player.x, player.z), fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw), a0 = Math.atan2(fz, fx);
    mg.fillStyle = 'rgba(201,164,92,.35)'; mg.beginPath(); mg.moveTo(x, y); mg.arc(x, y, 34, a0 - 0.6, a0 + 0.6); mg.closePath(); mg.fill();
    mg.fillStyle = '#c9a45c'; mg.strokeStyle = '#0e0d0b'; mg.lineWidth = 2; mg.beginPath(); mg.arc(x, y, 6, 0, Math.PI * 2); mg.fill(); mg.stroke();
  }
}
mm.addEventListener('click', e => { const r = mm.getBoundingClientRect(); teleportPoint(MM.x0 + (e.clientX - r.left) / r.width * (MM.x1 - MM.x0), MM.z0 + (e.clientY - r.top) / r.height * (MM.z1 - MM.z0)); });
let lastRoomId = null;
function updateRoomList() { const r = mode === 'walk' ? roomAt(player.x, player.z) : null, id = r ? r.id : null; if (id === lastRoomId) return; lastRoomId = id; for (const li of list.children) li.classList.toggle('cur', li.dataset.id === id); }

// ---------- roof fade (hidden from above, present at eye level) ----------
const roofMats = [M.roofSide, M.roofTop, M.ceiling];
let roofOp = -1;
function setRoof(op) {
  if (Math.abs(op - roofOp) < 0.005) return;
  const wasT = roofOp < 0.999, isT = op < 0.999; roofOp = op;
  for (const m of roofMats) { m.opacity = op; if (isT !== wasT) { m.transparent = isT; m.needsUpdate = true; } }
  roofGroup.visible = op > 0.01; ceilFx.visible = op > 0.5;
}

// ---------- loop ----------
const clock = new THREE.Clock();
let elapsed = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); elapsed += dt;
  TEX.water.offset.set(elapsed * 0.018, elapsed * 0.011);
  if (mode === 'story') { updateStory(dt); setRoof(1 - smooth(4.2, 8.5, camera.position.y)); }
  else if (mode === 'orbit') { orbit.update(); setRoof(0); }
  else {
    setRoof(1);
    if (tour) updateTour(dt);
    else {
      let f = 0, s = 0;
      if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
      if (keys.KeyD || keys.ArrowRight) s += 1; if (keys.KeyA || keys.ArrowLeft) s -= 1;
      if (keys.KeyQ) player.yaw += dt * 1.8; if (keys.KeyE) player.yaw -= dt * 1.8;
      f -= joy.y; s += joy.x;
      const len = Math.hypot(f, s);
      if (len > 0.05) { const sp = (keys.ShiftLeft || keys.ShiftRight ? 4.6 : 2.3) * dt / Math.max(1, len), sy = Math.sin(player.yaw), cy = Math.cos(player.yaw); move((-sy * f + cy * s) * sp, (-cy * f - sy * s) * sp); }
    }
    camera.position.set(player.x, EYE, player.z); camera.rotation.set(player.pitch, player.yaw, 0);
  }
  if (composer) composer.render(); else renderer.render(scene, camera);
  if (mode === 'orbit') labelRenderer.render(scene, camera);
  if (mode !== 'story') { drawMinimap(); updateRoomList(); }
  requestAnimationFrame(frame);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
  readScroll();
});

// ---------- boot ----------
setHelp(); readScroll(); story.cur = story.target;
if (params.get('room')) teleport(params.get('room'));
else if (params.get('mode') === 'free') enterFree('orbit');
requestAnimationFrame(() => { frame(); setTimeout(() => document.getElementById('loader').classList.add('hide'), 250); window.__ready = true; });

window.galleryHouse = {
  get mode() { return mode; }, setMode, teleport, startTour, stopTour, enterFree, exitFree, player, colliders, rooms: ROOMS,
  chapters: CHAPTERS.map(c => ({ id: c.id, k: c.range[0] })), numKeys: NK,
  story: { get progress() { return story.cur; }, get target() { return story.target; }, snap() { readScroll(); story.cur = story.target; }, scrollForKey: k => k / (NK - 1) * maxScroll() },
  camera, lite: LITE, bloom: BLOOM, lights: lights.length, posCurve, blocked,
  lookFrom(x, z, tx, tz, pitch = -0.04) { if (mode === 'story') enterFree('walk'); setMode('walk'); player.x = x; player.z = z; player.yaw = yawTo(x, z, tx, tz); player.pitch = pitch; },
};
