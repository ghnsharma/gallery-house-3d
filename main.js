import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ------------------------------------------------------------------
   Gallery House — floor plan → 3D. Units: metres.
   x = east, z = south, z=0 is the north wall of the main block.
------------------------------------------------------------------- */
const H = 3.2, EXT = 0.4, INT = 0.15, DOOR_H = 2.2, EYE = 1.6, RADIUS = 0.24;
const params = new URLSearchParams(location.search);

// ---------- renderer / scene ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xeee3cf, 90, 320);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 1200);
camera.rotation.order = 'YXZ';

// sky dome (gradient, not tone-mapped)
{
  const g = new THREE.SphereGeometry(600, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { top: { value: new THREE.Color(0x6fa3d6) }, mid: { value: new THREE.Color(0xbcd6ea) }, bot: { value: new THREE.Color(0xf2e6d2) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h>0.0 ? mix(mix(bot,mid,smoothstep(0.0,0.18,h)), top, smoothstep(0.18,0.75,h)) : bot; gl_FragColor = vec4(c,1.0);} '
  });
  const sky = new THREE.Mesh(g, m); sky.renderOrder = -1; scene.add(sky);
}

// lights
const hemi = new THREE.HemisphereLight(0xfff3e0, 0x8c7a5c, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe3bd, 3.0);
const SITE_C = new THREE.Vector3(18, 0, 8);
sun.position.copy(SITE_C).add(new THREE.Vector3(-26, 42, 30));
sun.target.position.copy(SITE_C);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -44, right: 44, top: 34, bottom: -34, near: 1, far: 140 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
scene.add(sun, sun.target);

// ---------- procedural textures ----------
function canvasTex(size, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const rnd = (() => { let s = 1234567; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
function shade(hex, f) { const c = new THREE.Color(hex); c.offsetHSL(0, 0, f); return '#' + c.getHexString(); }
function planks(base, rows = 8, grain = true) {
  return canvasTex(512, (g, S) => {
    const rh = S / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * S;
      while (x < S) {
        const len = S * (0.45 + rnd() * 0.6);
        g.fillStyle = shade(base, (rnd() - 0.5) * 0.08);
        g.fillRect(x, r * rh, len, rh);
        if (grain) for (let k = 0; k < 7; k++) {
          g.strokeStyle = `rgba(60,35,15,${0.05 + rnd() * 0.07})`; g.lineWidth = 1;
          const y = r * rh + rnd() * rh; g.beginPath(); g.moveTo(x, y);
          g.bezierCurveTo(x + len * .3, y + (rnd() - .5) * 6, x + len * .6, y + (rnd() - .5) * 6, x + len, y); g.stroke();
        }
        g.fillStyle = 'rgba(40,25,10,.35)'; g.fillRect(x, r * rh, 2, rh);
        x += len;
      }
      g.fillStyle = 'rgba(40,25,10,.3)'; g.fillRect(0, r * rh, S, 1.5);
    }
  });
}
function tiles(base, n, grout, stagger = false, noise = 0.05) {
  return canvasTex(512, (g, S) => {
    g.fillStyle = grout; g.fillRect(0, 0, S, S);
    const t = S / n;
    for (let j = 0; j < n; j++) for (let i = -1; i < n + 1; i++) {
      const off = stagger && j % 2 ? t / 2 : 0;
      g.fillStyle = shade(base, (rnd() - 0.5) * noise);
      g.fillRect(i * t + off + 1.5, j * t + 1.5, t - 3, t - 3);
      for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${rnd() > .5 ? '255,255,255' : '80,60,40'},${rnd() * .05})`; g.fillRect(i * t + off + rnd() * t, j * t + rnd() * t, 2 + rnd() * 5, 2 + rnd() * 5); }
    }
  });
}
function speckle(base, dots, alpha = 0.25) {
  return canvasTex(512, (g, S) => {
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    for (let k = 0; k < dots; k++) { g.fillStyle = `rgba(${rnd() > .5 ? '255,255,250' : '60,50,35'},${rnd() * alpha})`; const r = 1 + rnd() * 3; g.fillRect(rnd() * S, rnd() * S, r, r); }
  });
}
const TEX = {
  oak: planks('#b98a5e'), walnut: planks('#8a5d3b'), deck: planks('#9c7b5b', 6),
  stone: tiles('#d8ccb6', 4, '#bfb29b'), marble: tiles('#ece6dc', 2, '#d6cfc3', false, 0.03),
  paving: tiles('#c6bba8', 3, '#a69a86', true), terracotta: tiles('#c9906a', 6, '#a77558'),
  gravel: speckle('#cbbfa8', 9000, .35), grass: speckle('#8d9f62', 14000, .22), pooltile: tiles('#5fb3c4', 10, '#e8f2f2', false, .06)
};

// ---------- materials ----------
const M = {
  plaster: new THREE.MeshStandardMaterial({ color: 0xf1e9dc, roughness: 0.92 }),
  plasterInt: new THREE.MeshStandardMaterial({ color: 0xf5efe5, roughness: 0.9 }),
  stoneWall: new THREE.MeshStandardMaterial({ color: 0xcdbb9c, roughness: 0.95 }),
  plinth: new THREE.MeshStandardMaterial({ color: 0xb3a487, roughness: 0.95 }),
  roofTop: new THREE.MeshStandardMaterial({ color: 0x8f8778, roughness: 1 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xf7f1e7, roughness: 0.95 }),
  timber: new THREE.MeshStandardMaterial({ color: 0x9a6b42, roughness: 0.6, map: TEX.walnut }),
  timberLight: new THREE.MeshStandardMaterial({ color: 0xd2ad82, roughness: 0.6, map: TEX.oak }),
  darkTimber: new THREE.MeshStandardMaterial({ color: 0x5b3d26, roughness: 0.55 }),
  fabric: new THREE.MeshStandardMaterial({ color: 0xd9cbb4, roughness: 1 }),
  fabricDark: new THREE.MeshStandardMaterial({ color: 0x6f6252, roughness: 1 }),
  fabricRust: new THREE.MeshStandardMaterial({ color: 0xa6603c, roughness: 1 }),
  fabricSage: new THREE.MeshStandardMaterial({ color: 0x8b9776, roughness: 1 }),
  linen: new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 1 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x2f2b27, roughness: 0.4, metalness: 0.8 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc49a5a, roughness: 0.35, metalness: 0.9 }),
  counter: new THREE.MeshStandardMaterial({ color: 0xe9e3d8, roughness: 0.3, map: TEX.marble }),
  ceramic: new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.15 }),
  stoneDark: new THREE.MeshStandardMaterial({ color: 0x9e937f, roughness: 0.9 }),
  planterStone: new THREE.MeshStandardMaterial({ color: 0xb9ad96, roughness: 0.95 }),
  soil: new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x6f8a4b, roughness: 0.9, flatShading: true }),
  leaf2: new THREE.MeshStandardMaterial({ color: 0x86995a, roughness: 0.9, flatShading: true }),
  bark: new THREE.MeshStandardMaterial({ color: 0x6b5139, roughness: 1 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xd6eaf0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
  frame: new THREE.MeshStandardMaterial({ color: 0x3a3631, roughness: 0.5, metalness: 0.6 }),
  water: new THREE.MeshPhysicalMaterial({ color: 0x3f9fb4, roughness: 0.04, metalness: 0.05, transparent: true, opacity: 0.82, clearcoat: 1 }),
  books: null,
};
// books texture
M.books = new THREE.MeshStandardMaterial({ roughness: 0.85, map: canvasTex(256, (g, S) => {
  g.fillStyle = '#5b3d26'; g.fillRect(0, 0, S, S);
  const cols = ['#8c3b2a', '#2f4a5c', '#c9a46a', '#3d5a40', '#e4d6bd', '#6a4a7a', '#a8693e', '#1f2b33', '#d0b48a'];
  for (let shelf = 0; shelf < 4; shelf++) {
    let x = 0; const y0 = shelf * S / 4;
    while (x < S) { const w = 4 + rnd() * 9, h = S / 4 * (0.62 + rnd() * 0.3); g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x, y0 + S / 4 - h - 6, w - 1, h); x += w; if (rnd() < .05) x += 14; }
    g.fillStyle = '#4a311f'; g.fillRect(0, y0 + S / 4 - 6, S, 6);
  }
}) });

// ---------- helpers ----------
const colliders = [];       // {x0,x1,z0,z1}
const roofGroup = new THREE.Group(); scene.add(roofGroup);
const world = new THREE.Group(); scene.add(world);
function addCol(x0, x1, z0, z1) { colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) }); }

/** box by centre-x, bottom-y, centre-z */
function box(w, h, d, x, y, z, mat, opt = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = opt.cast !== false; m.receiveShadow = opt.receive !== false;
  (opt.parent || world).add(m);
  if (opt.collide) addCol(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
  return m;
}
function cyl(rt, rb, h, x, y, z, mat, opt = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, opt.seg || 28), mat);
  m.position.set(x, y + h / 2, z); m.castShadow = opt.cast !== false; m.receiveShadow = true;
  (opt.parent || world).add(m);
  if (opt.collide) { const r = Math.max(rt, rb); addCol(x - r, x + r, z - r, z + r); }
  return m;
}
/** group helper for rotated furniture: local coords, then placed */
function piece(x, z, rot = 0) { const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; world.add(g); return g; }
function gbox(g, w, h, d, x, y, z, mat) { return box(w, h, d, x, y, z, mat, { parent: g }); }

function floor(x0, x1, z0, z1, tex, scale, color = 0xffffff, rough = 0.8, y = 0.005) {
  const w = x1 - x0, d = z1 - z0;
  const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / scale, uv.getY(i) * d / scale);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, color, roughness: rough }));
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; world.add(m); return m;
}

/**
 * Axis-aligned wall from (x1,z1) to (x2,z2) with thickness t.
 * openings: [{c, w, type:'door'|'open'|'window', sill, head}]
 */
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
    if (o.type === 'door') seg(o0, o1, o.head || DOOR_H, height, false);
    if (o.type === 'window') {
      const sill = o.sill ?? 0.9, head = o.head ?? 2.4;
      seg(o0, o1, 0, sill, true); seg(o0, o1, head, height, false);
      // glass + frame
      const gl = alongX ? box(o.w, head - sill, 0.03, o.c, sill, fixed, M.glass, { cast: false }) : box(0.03, head - sill, o.w, fixed, sill, o.c, M.glass, { cast: false });
      gl.renderOrder = 2;
      const ft = 0.06;
      if (alongX) { box(o.w, ft, t + 0.02, o.c, sill - ft / 2, fixed, M.frame); box(o.w, ft, t * 0.4, o.c, head - ft / 2, fixed, M.frame); }
      else { box(t + 0.02, ft, o.w, fixed, sill - ft / 2, o.c, M.frame); box(t * 0.4, ft, o.w, fixed, head - ft / 2, o.c, M.frame); }
      if (sill < 1.8) { if (alongX) addCol(o0, o1, fixed - t / 2, fixed + t / 2); else addCol(fixed - t / 2, fixed + t / 2, o0, o1); }
    }
    s = o1;
  }
  seg(s, b, 0, height, true);
}

/** full-height glazed wall with mullions; openings = [{c,w}] (sliding door gaps) */
function glassWall(x1, z1, x2, z2, openings = [], spacing = 1.5) {
  const alongX = z1 === z2;
  const a = Math.min(alongX ? x1 : z1, alongX ? x2 : z2), b = Math.max(alongX ? x1 : z1, alongX ? x2 : z2);
  const f = alongX ? z1 : x1;
  const put = (s0, s1, y0, y1, mat, th = 0.03, col = false) => {
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
    put(s0, s1, 0, H, M.glass, 0.03, true);
    const n = Math.max(1, Math.round((s1 - s0) / spacing));
    for (let i = 0; i <= n; i++) { const p = s0 + (s1 - s0) * i / n; put(p - 0.03, p + 0.03, 0, H, M.frame, 0.1); }
  }
  put(a, b, 0, 0.06, M.frame, 0.12);               // sill track
  put(a, b, H - 0.12, H, M.frame, 0.14);           // head
  for (const o of ops) {                           // slid-open door panels parked beside opening
    const p0 = o.c - o.w / 2;
    const m = alongX ? box(o.w * 0.5, H - 0.2, 0.03, p0 - o.w * 0.25, 0.06, f + 0.08, M.glass, { cast: false })
      : box(0.03, H - 0.2, o.w * 0.5, f + 0.08, 0.06, p0 - o.w * 0.25, M.glass, { cast: false });
    m.renderOrder = 2;
  }
}

function roofSlab(x0, x1, z0, z1, y = H, th = 0.32) {
  const geo = new THREE.BoxGeometry(x1 - x0, th, z1 - z0);
  const m = new THREE.Mesh(geo, [M.plaster, M.plaster, M.roofTop, M.ceiling, M.plaster, M.plaster]);
  m.position.set((x0 + x1) / 2, y + th / 2, (z0 + z1) / 2); m.castShadow = true; m.receiveShadow = true; roofGroup.add(m); return m;
}

// ---------- rooms ----------
const ROOMS = [
  { id: 'entry', name: 'Entry Court', x0: -14, x1: 0, z0: 2, z1: 14, col: '#d4cab8', spawn: [-11, 8], look: [5, 8], note: 'open' },
  { id: 'foyer', name: 'Foyer', x0: 0, x1: 5, z0: 5, z1: 11, col: '#e1d6c3', spawn: [1.2, 8], look: [10, 8] },
  { id: 'gallery', name: 'Gallery', x0: 5, x1: 31, z0: 6.5, z1: 9.5, col: '#e8dcc6', spawn: [6.4, 8], look: [31, 8] },
  { id: 'dining', name: 'Dining', x0: 5, x1: 12, z0: 0, z1: 6.5, col: '#d9b994', spawn: [11, 6.0], look: [7.5, 2.6] },
  { id: 'kitchen', name: 'Kitchen', x0: 12, x1: 18, z0: 0, z1: 6.5, col: '#d8cfbf', spawn: [14.5, 6.0], look: [15.5, 1.0] },
  { id: 'bedroom', name: 'Primary Bedroom', x0: 18, x1: 25, z0: 0, z1: 6.5, col: '#cfa985', spawn: [21, 6.0], look: [21.5, 1.0] },
  { id: 'dressing', name: 'Dressing', x0: 25, x1: 28, z0: 0, z1: 6.5, col: '#c8a07e', spawn: [26.5, 5.4], look: [26.5, 0.5] },
  { id: 'bath', name: 'Bath', x0: 28, x1: 31, z0: 0, z1: 6.5, col: '#e6e2da', spawn: [30, 6.0], look: [29.5, 0.6] },
  { id: 'guest', name: 'Guest Suite', x0: 5, x1: 14, z0: 9.5, z1: 16, col: '#d2ae8a', spawn: [9.5, 10.1], look: [11, 14.5] },
  { id: 'library', name: 'Library', x0: 14, x1: 22, z0: 9.5, z1: 16, col: '#b88d66', spawn: [17, 10.1], look: [17, 15.5] },
  { id: 'garden', name: 'Garden Court', x0: 22, x1: 31, z0: 9.5, z1: 16, col: '#a7b57e', spawn: [26.5, 10.2], look: [27, 14.5], note: 'open-air' },
  { id: 'living', name: 'Living Room', x0: 31, x1: 42, z0: 3.5, z1: 12.5, col: '#cda47c', spawn: [32.2, 8], look: [42, 6.5] },
  { id: 'terrace', name: 'Terrace & Pool', x0: 42, x1: 50, z0: -2, z1: 18, col: '#bfa587', spawn: [43, 0.2], look: [47, 9], note: 'outdoor' },
];
const byId = Object.fromEntries(ROOMS.map(r => [r.id, r]));

// ---------- site / ground ----------
{
  const g = new THREE.PlaneGeometry(600, 600); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 150, uv.getY(i) * 150);
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: TEX.grass, color: 0xd6dcc0, roughness: 1 }));
  ground.position.y = -0.3; ground.receiveShadow = true; scene.add(ground);
  // plinths (raised 0.3 m) under the built footprint
  box(14, 0.3, 12, -7, -0.3, 8, M.plinth);          // entry court
  box(5, 0.3, 6, 2.5, -0.3, 8, M.plinth);            // foyer
  box(26.4, 0.3, 16.4, 18, -0.3, 8, M.plinth);       // main block
  box(11, 0.3, 9, 36.5, -0.3, 8, M.plinth);          // living
  // terrace plinth around the pool hole (pool x43.5..48.5, z4..12)
  box(8, 0.3, 6, 46, -0.3, 1, M.plinth); box(8, 0.3, 6, 46, -0.3, 15, M.plinth);
  box(1.5, 0.3, 8, 42.75, -0.3, 8, M.plinth); box(1.5, 0.3, 8, 49.25, -0.3, 8, M.plinth);
  // driveway / approach path
  floor(-40, -14, 6.8, 9.2, TEX.paving, 3, 0xd8d0c0, .9, -0.29);
}

// ---------- floors ----------
floor(-14, 0, 2, 14, TEX.paving, 3, 0xffffff, 0.9);
floor(-14, 0, 7, 9, TEX.stone, 2.4, 0xcfc4b0, 0.85, 0.008);
floor(0, 5, 5, 11, TEX.stone, 2.4);
floor(5, 31, 6.5, 9.5, TEX.stone, 2.4);
floor(5, 12, 0, 6.5, TEX.oak, 2);
floor(12, 18, 0, 6.5, TEX.stone, 2.4, 0xf1ebe0);
floor(18, 25, 0, 6.5, TEX.oak, 2);
floor(25, 28, 0, 6.5, TEX.oak, 2);
floor(28, 31, 0, 6.5, TEX.marble, 1.2, 0xffffff, 0.35);
floor(5, 14, 9.5, 16, TEX.oak, 2);
floor(14, 22, 9.5, 16, TEX.walnut, 2, 0xd9c0a8);
floor(22, 31, 9.5, 16, TEX.gravel, 3);
floor(31, 42, 3.5, 12.5, TEX.oak, 2);
// terrace deck, around the pool
floor(42, 50, -2, 4, TEX.deck, 2); floor(42, 50, 12, 18, TEX.deck, 2);
floor(42, 43.5, 4, 12, TEX.deck, 2); floor(48.5, 50, 4, 12, TEX.deck, 2);

// ---------- walls ----------
// main block exterior (0.4)
wall(5, 0, 31, 0, EXT, M.plaster, [
  { c: 8.5, w: 3.0, type: 'window', sill: 0.6, head: 2.6 },
  { c: 15.5, w: 2.0, type: 'window', sill: 1.15, head: 2.4 },
  { c: 21.5, w: 4.0, type: 'window', sill: 1.7, head: 2.8 },
  { c: 29.6, w: 1.4, type: 'window', sill: 1.8, head: 2.7 },
]);
wall(5, 16, 31, 16, EXT, M.plaster, [
  { c: 9.5, w: 4.5, type: 'window', sill: 0.5, head: 2.6 },
  { c: 20.3, w: 2.2, type: 'window', sill: 0.6, head: 2.6 },
]);
wall(5, 0, 5, 16, EXT, M.stoneWall, [
  { c: 8, w: 3, type: 'open' },                                    // gallery open to foyer
  { c: 12.8, w: 2.6, type: 'window', sill: 0.6, head: 2.6 },
]);
wall(31, 0, 31, 16, EXT, M.plaster, [
  { c: 8, w: 3, type: 'open' },                                    // gallery open to living
  { c: 11, w: 2.0, type: 'window', sill: 0.5, head: 2.6 },          // living ↔ garden court
]);
// foyer (0.4)
wall(0, 5, 5, 5, EXT, M.plaster);
wall(0, 11, 5, 11, EXT, M.plaster);
wall(0, 5, 0, 11, EXT, M.stoneWall, [
  { c: 8, w: 1.2, type: 'door', head: 2.6 },                       // front door
  { c: 9.9, w: 1.0, type: 'window', sill: 0.3, head: 2.6 },
]);
// north-room partitions (0.15)
wall(5, 6.5, 31, 6.5, INT, M.plasterInt, [
  { c: 11, w: 1, type: 'door' }, { c: 14.5, w: 1, type: 'door' }, { c: 21, w: 1, type: 'door' }, { c: 30, w: 1, type: 'door' },
]);
wall(12, 0, 12, 6.5, INT, M.plasterInt);
wall(18, 0, 18, 6.5, INT, M.plasterInt);
wall(25, 0, 25, 6.5, INT, M.plasterInt, [{ c: 5.3, w: 0.9, type: 'door' }]);
wall(28, 0, 28, 6.5, INT, M.plasterInt, [{ c: 4.0, w: 0.9, type: 'door' }]);
// south side
wall(5, 9.5, 22, 9.5, INT, M.plasterInt, [{ c: 9.5, w: 1, type: 'door' }, { c: 17, w: 1, type: 'door' }]);
wall(14, 9.5, 14, 16, INT, M.plasterInt);
wall(22, 9.5, 22, 16, INT, M.plasterInt);
glassWall(22.1, 9.5, 31, 9.5, [{ c: 26.5, w: 1.2 }]);              // garden court glazed wall to gallery
// living room
wall(31, 3.5, 42, 3.5, EXT, M.plaster);
wall(31, 12.5, 42, 12.5, EXT, M.plaster, [{ c: 36.5, w: 5, type: 'window', sill: 0.45, head: 2.7 }]);
glassWall(42, 3.7, 42, 12.3, [{ c: 6.5, w: 2.0 }], 1.45);           // full glass wall with sliding door
// terrace parapets (low)
wall(42, -2, 50, -2, 0.3, M.stoneWall, [], { h: 0.95 });
wall(50, -2, 50, 18, 0.3, M.stoneWall, [], { h: 0.95 });
wall(42, 18, 50, 18, 0.3, M.stoneWall, [], { h: 0.95 });
// short parapet returns along x=42 outside the living room
wall(42, -2, 42, 3.3, 0.3, M.stoneWall, [], { h: 0.95, noExtend: true });
wall(42, 12.7, 42, 18, 0.3, M.stoneWall, [], { h: 0.95, noExtend: true });

// ---------- roofs (hidden in dollhouse) ----------
roofSlab(-1.6, 5, 4.8, 11.2);                      // foyer + front canopy
roofSlab(4.8, 31.2, -0.2, 6.65);                    // north rooms
roofSlab(4.8, 22.0, 9.35, 16.2);                    // guest + library
roofSlab(4.8, 31.2, 6.65, 6.95); roofSlab(4.8, 31.2, 9.05, 9.35); // skylight curbs
{ // gallery skylight (glass, lets sun in)
  const sk = box(26.4, 0.04, 2.1, 18, H + 0.2, 8, M.glass, { parent: roofGroup, cast: false }); sk.renderOrder = 3;
  for (let x = 6; x <= 30; x += 3) box(0.04, 0.06, 2.1, x, H + 0.16, 8, M.frame, { parent: roofGroup });
}
roofSlab(31, 43.6, 3.3, 12.7);                      // living + terrace canopy
roofSlab(22.0, 31.2, 9.35, 9.7);                    // lintel over glazed court wall
roofSlab(22.0, 31.2, 15.8, 16.2);
roofSlab(30.8, 31.2, 9.35, 16.2); roofSlab(21.8, 22.2, 9.35, 16.2);

// ---------- furniture & landscape ----------
function chair(x, z, rot, mat = M.timber, seat = M.fabric) {
  const g = piece(x, z, rot);
  gbox(g, 0.46, 0.06, 0.46, 0, 0.44, 0, mat);
  gbox(g, 0.42, 0.05, 0.42, 0, 0.5, 0, seat);
  gbox(g, 0.46, 0.45, 0.05, 0, 0.5, 0.2, mat);
  for (const [a, b] of [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]]) gbox(g, 0.04, 0.44, 0.04, a, 0, b, mat);
  return g;
}
function tree(x, z, s = 1, collide = true) {
  cyl(0.09 * s, 0.14 * s, 1.9 * s, x, 0, z, M.bark, { seg: 8 });
  const geo = new THREE.IcosahedronGeometry(1, 1);
  [[0, 2.5, 0, 1.15], [0.55, 2.15, 0.25, .8], [-0.5, 2.25, -0.3, .85], [0.1, 3.05, -0.1, .75]].forEach(([dx, dy, dz, r], i) => {
    const m = new THREE.Mesh(geo, i % 2 ? M.leaf2 : M.leaf); m.position.set(x + dx * s, dy * s, z + dz * s); m.scale.setScalar(r * s); m.castShadow = true; m.receiveShadow = true; world.add(m);
  });
  if (collide) addCol(x - .25, x + .25, z - .25, z + .25);
}
function roundPlanter(x, z, r, h, withTree = 0) {
  cyl(r, r * 0.9, h, x, 0, z, M.planterStone, { collide: true });
  cyl(r * 0.88, r * 0.88, 0.02, x, h - 0.06, z, M.soil);
  if (withTree) tree(x, z, withTree, false);
}
function lamp(x, y, z, intensity = 5, dist = 9) { const l = new THREE.PointLight(0xffd6a3, intensity, dist, 2); l.position.set(x, y, z); world.add(l); return l; }
function pendant(x, z, y = 2.2) { cyl(0.005, 0.005, H - y, x, y, z, M.metal, { seg: 4, cast: false }); const s = cyl(0.18, 0.28, 0.22, x, y - 0.22, z, M.brass, { cast: false }); return s; }
function rug(x0, x1, z0, z1, color) { box(x1 - x0, 0.012, z1 - z0, (x0 + x1) / 2, 0.006, (z0 + z1) / 2, new THREE.MeshStandardMaterial({ color, roughness: 1 }), { cast: false }); }
function art(x, z, facing, w, h, seed) {
  const tex = canvasTex(256, (g, S) => {
    const pal = [['#c36b3c', '#e9d6b4', '#2f4552', '#b9953f'], ['#6d7e5a', '#efe3cf', '#a5502f', '#283238'], ['#d9a066', '#41363a', '#e7dccb', '#7d8b8c']][seed % 3];
    g.fillStyle = pal[1]; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 7; k++) {
      g.fillStyle = pal[(k + seed) % 4]; g.globalAlpha = 0.85;
      if ((k + seed) % 3 === 0) { g.beginPath(); g.arc(rnd() * S, rnd() * S, 20 + rnd() * 70, 0, Math.PI * 2); g.fill(); }
      else g.fillRect(rnd() * S * 0.8, rnd() * S * 0.8, 30 + rnd() * 120, 10 + rnd() * 90);
    }
    g.globalAlpha = 1;
  });
  const g = piece(x, z, facing);
  gbox(g, w + 0.08, h + 0.08, 0.04, 0, 1.55 - h / 2 - 0.04, 0, M.darkTimber);
  const c = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  c.position.set(0, 1.55, 0.021); g.add(c);
  return g;
}

// Entry court
tree(-11, 4.2, 1.25); tree(-3.5, 12.4, 1.1); tree(-12.2, 12.2, 0.9);
roundPlanter(-6, 4.2, 0.7, 0.55, 0.6); roundPlanter(-2, 4.2, 0.55, 0.5, 0.5);
box(2.2, 0.45, 0.5, -8, 0, 12.8, M.timber, { collide: true });                     // bench
box(2.4, 0.08, 0.6, -8, 0.42, 12.8, M.timberLight);
cyl(0.9, 0.95, 0.5, -5.8, 0, 11.3, M.stoneDark, { collide: true }); cyl(0.8, 0.8, 0.02, -5.8, 0.45, 11.3, M.water); // water bowl
// front door leaf (open, swung into foyer)
{ const g = piece(0.2, 7.4, -1.3); gbox(g, 1.15, 2.55, 0.06, 0.58, 0, 0, M.timber); gbox(g, 0.04, 0.5, 0.06, 1.0, 1.0, 0.06, M.brass); }
// Foyer
box(1.6, 0.85, 0.42, 2.5, 0, 5.4, M.timber, { collide: true }); box(0.5, 0.5, 0.05, 2.5, 1.35, 5.22, M.brass); // console + mirror
cyl(0.25, 0.2, 0.6, 4.3, 0, 10.4, M.planterStone); tree(4.3, 10.4, 0.45, true);
pendant(2.5, 8); lamp(2.5, 2.7, 8, 4);
// Dining (x5..12, z0..6.5)
box(3.4, 0.05, 1.1, 8.6, 0.72, 3.2, M.timber); for (const [a, b] of [[-1.5, -.42], [1.5, -.42], [-1.5, .42], [1.5, .42]]) box(0.07, 0.72, 0.07, 8.6 + a, 0, 3.2 + b, M.darkTimber);
addCol(6.9, 10.3, 2.65, 3.75);
for (const dx of [-1.1, 0, 1.1]) { chair(8.6 + dx, 2.3, Math.PI); chair(8.6 + dx, 4.1, 0); }
chair(6.5, 3.2, -Math.PI / 2); chair(10.7, 3.2, Math.PI / 2);
box(0.5, 0.85, 3.0, 5.45, 0, 3.2, M.timber, { collide: true });       // sideboard on west wall
box(0.52, 0.03, 3.02, 5.45, 0.85, 3.2, M.counter);
cyl(0.1, 0.07, 0.35, 5.45, 0.88, 2.4, M.ceramic); cyl(0.08, 0.1, 0.25, 5.45, 0.88, 3.9, M.fabricRust);
pendant(8.0, 3.2); pendant(9.2, 3.2); lamp(8.6, 2.6, 3.2, 6);
rug(6.6, 10.6, 1.8, 4.6, 0x9e8466);
// Kitchen (x12..18)
box(5.4, 0.9, 0.62, 15, 0, 0.51, M.timber, { collide: true });
box(5.44, 0.04, 0.66, 15, 0.9, 0.51, M.counter);
box(0.7, 0.01, 0.5, 16.6, 0.94, 0.5, M.metal);                        // hob
for (const [a, b] of [[-.17, -.12], [.17, -.12], [-.17, .12], [.17, .12]]) cyl(0.08, 0.08, 0.012, 16.6 + a, 0.95, 0.5 + b, new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .3 }), { cast: false });
box(0.9, 0.5, 0.45, 16.6, 1.9, 0.43, M.metal);                        // hood
box(0.6, 0.02, 0.4, 13.7, 0.93, 0.5, M.metal);                         // sink
box(1.8, 0.7, 0.36, 13.9, 1.8, 0.38, M.timberLight); box(1.4, 0.7, 0.36, 15.2 + 2.2, 1.8, 0.38, M.timberLight); // uppers
box(2.4, 0.88, 1.0, 15, 0, 3.2, M.timber, { collide: true }); box(2.6, 0.05, 1.1, 15, 0.88, 3.2, M.counter);
for (const dx of [-0.75, 0, 0.75]) { cyl(0.18, 0.18, 0.05, 15 + dx, 0.68, 4.05, M.fabricRust); cyl(0.03, 0.03, 0.68, 15 + dx, 0, 4.05, M.metal, { seg: 6 }); }
pendant(14.4, 3.2, 2.0); pendant(15.6, 3.2, 2.0); lamp(15, 2.6, 3, 6);
// Primary bedroom (x18..25)
{ const g = piece(21.5, 1.25, 0);
  gbox(g, 1.9, 0.3, 2.1, 0, 0.05, 0, M.timber); gbox(g, 1.8, 0.25, 2.0, 0, 0.35, 0.02, M.linen);
  gbox(g, 1.84, 0.06, 1.3, 0, 0.6, 0.36, M.fabricSage); gbox(g, 2.1, 1.15, 0.1, 0, 0, -1.07, M.timber);
  gbox(g, 0.6, 0.14, 0.35, -0.45, 0.6, -0.8, M.linen); gbox(g, 0.6, 0.14, 0.35, 0.45, 0.6, -0.8, M.linen); }
addCol(20.55, 22.45, 0.2, 2.3);
for (const dx of [-1.35, 1.35]) { box(0.5, 0.5, 0.42, 21.5 + dx, 0, 0.45, M.timber, { collide: true }); cyl(0.12, 0.16, 0.35, 21.5 + dx, 0.5, 0.45, M.ceramic); }
box(0.6, 0.75, 1.4, 18.45, 0, 3.8, M.timberLight, { collide: true }); chair(19.1, 3.8, -Math.PI / 2);   // desk
rug(19.8, 23.2, 2.0, 4.8, 0xb9a58a); lamp(21.5, 2.7, 3.2, 5); lamp(18.6, 1.4, 3.6, 1.2, 3);
// Dressing (x25..28)
box(2.7, 2.4, 0.62, 26.5, 0, 0.5, M.timberLight, { collide: true });
for (const dx of [-0.9, 0, 0.9]) box(0.02, 2.2, 0.02, 26.5 + dx, 0.1, 0.82, M.darkTimber);
box(0.6, 2.4, 2.4, 27.6, 0, 2.6, M.timberLight, { collide: true });
box(1.0, 0.45, 0.6, 26.2, 0, 3.4, M.fabricDark, { collide: true }); lamp(26.5, 2.7, 3, 3);
// Bath (x28..31)
{ box(2.4, 0.56, 0.85, 29.5, 0, 0.64, M.ceramic, { collide: true }); box(2.2, 0.02, 0.65, 29.5, 0.5, 0.64, M.water, { cast: false }); }
box(0.5, 0.82, 1.6, 30.55, 0, 3.0, M.timber, { collide: true }); box(0.54, 0.04, 1.64, 30.55, 0.82, 3.0, M.counter);
cyl(0.18, 0.15, 0.12, 30.55, 0.86, 3.0, M.ceramic); box(0.04, 0.9, 1.0, 30.78, 1.15, 3.0, M.glass, { cast: false });
lamp(29.5, 2.7, 3, 4);
// Gallery corridor: artworks + picture lights
[[7.6, 1.4], [12.7, 1.0], [17.6, 1.6], [24.0, 1.8], [27.6, 1.2]].forEach(([x, w], i) => art(x, 6.58, 0, w, w * 0.7, i));
[[7.0, 1.3], [13.0, 1.6], [19.8, 1.4]].forEach(([x, w], i) => art(x, 9.42, Math.PI, w, w * 0.75, i + 1));
cyl(0.25, 0.25, 0.9, 25.0, 0, 9.0, M.planterStone, { collide: true }); { const s = new THREE.Mesh(new THREE.TorusKnotGeometry(0.18, 0.06, 80, 10), M.brass); s.position.set(25, 1.15, 9.0); s.castShadow = true; world.add(s); }
for (const x of [9, 15, 21, 27]) lamp(x, 2.9, 8, 3.5, 7);
// Guest suite (x5..14, z9.5..16)
{ const g = piece(11.2, 14.7, Math.PI);
  gbox(g, 1.7, 0.3, 2.05, 0, 0.05, 0, M.timberLight); gbox(g, 1.6, 0.25, 1.95, 0, 0.35, 0.02, M.linen);
  gbox(g, 1.64, 0.06, 1.2, 0, 0.6, 0.38, M.fabricRust); gbox(g, 1.9, 1.05, 0.08, 0, 0, -1.05, M.timberLight); }
addCol(10.35, 12.05, 13.6, 15.8);
for (const dx of [-1.2, 1.2]) box(0.45, 0.5, 0.4, 11.2 + dx, 0, 15.5, M.timberLight, { collide: true });
box(0.8, 0.75, 0.8, 6.2, 0, 15.0, M.fabricSage, { collide: true }); box(1.2, 2.2, 0.6, 5.6 + 0.3, 0, 10.2, M.timber, { collide: true });
rug(8.8, 13.4, 11.6, 14.2, 0xd0bfa4); lamp(10, 2.7, 12.8, 5);
// Library (x14..22): bookshelves on west and south walls
box(0.38, 2.6, 6.0, 14.27, 0, 12.75, M.books, { collide: true });
box(4.2, 2.6, 0.38, 16.45, 0, 15.73, M.books, { collide: true });
box(0.38, 2.6, 5.2, 21.73, 0, 12.35 + 0.9, M.books, { collide: true });
for (const [x, z, r] of [[17.6, 12.8, Math.PI * 0.75], [19.4, 14.2, Math.PI * 1.25]]) {
  const g = piece(x, z, r); gbox(g, 0.85, 0.42, 0.85, 0, 0, 0, M.fabricRust); gbox(g, 0.85, 0.45, 0.18, 0, 0.42, 0.34, M.fabricRust); gbox(g, 0.16, 0.25, 0.85, -0.35, 0.42, 0, M.fabricRust); gbox(g, 0.16, 0.25, 0.85, 0.35, 0.42, 0, M.fabricRust);
  addCol(x - .45, x + .45, z - .45, z + .45);
}
cyl(0.35, 0.35, 0.5, 18.7, 0, 13.6, M.timber, { collide: true });
rug(16.2, 20.8, 11.8, 15.2, 0x7d5a45); lamp(18, 2.7, 12.8, 5); lamp(18.7, 1.5, 13.4, 1.5, 4);
// Garden court (open air)
tree(24.6, 13.6, 1.35); tree(29.2, 11.6, 1.15);
roundPlanter(27, 13.6, 1.0, 0.55); cyl(0.9, 0.9, 0.02, 27, 0.5, 13.6, M.soil);
for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), M.leaf2); s.position.set(27 + Math.cos(a) * .55, .62, 13.6 + Math.sin(a) * .55); s.castShadow = true; world.add(s); }
box(1.8, 0.45, 0.45, 26.5, 0, 15.4, M.stoneDark, { collide: true });
for (let i = 0; i < 7; i++) box(0.7, 0.03, 0.45, 26.5 + Math.sin(i) * 0.3, 0, 10.4 + i * 0.7, new THREE.MeshStandardMaterial({ color: 0xbdb19b, roughness: 1 }), { cast: false });
// Living room (x31..42, z3.5..12.5)
rug(34.0, 39.2, 5.8, 9.6, 0xcbb79a);
{ const g = piece(36.6, 10.25, 0); // large sofa facing north
  gbox(g, 3.6, 0.42, 1.0, 0, 0, 0, M.fabric); gbox(g, 3.6, 0.45, 0.25, 0, 0.42, 0.38, M.fabric);
  gbox(g, 0.25, 0.25, 1.0, -1.68, 0.42, 0, M.fabric); gbox(g, 0.25, 0.25, 1.0, 1.68, 0.42, 0, M.fabric);
  for (const dx of [-1.1, 0, 1.1]) gbox(g, 1.05, 0.14, 0.72, dx, 0.42, -0.1, M.linen);
  gbox(g, 0.4, 0.35, 0.12, -1.2, 0.56, 0.2, M.fabricRust); gbox(g, 0.4, 0.35, 0.12, 1.1, 0.56, 0.2, M.fabricSage); }
addCol(34.8, 38.4, 9.75, 10.75);
box(1.5, 0.38, 0.8, 36.6, 0, 7.6, M.timber, { collide: true }); box(1.5, 0.03, 0.8, 36.6, 0.38, 7.6, M.counter);
cyl(0.12, 0.09, 0.22, 36.3, 0.41, 7.5, M.ceramic);
{ const g = piece(39.6, 7.7, Math.PI / 2 + 0.3); // armchair facing west
  gbox(g, 0.9, 0.42, 0.9, 0, 0, 0, M.fabricSage); gbox(g, 0.9, 0.5, 0.2, 0, 0.42, 0.35, M.fabricSage); gbox(g, 0.15, 0.25, 0.9, -0.38, 0.42, 0, M.fabricSage); gbox(g, 0.15, 0.25, 0.9, 0.38, 0.42, 0, M.fabricSage); }
addCol(39.1, 40.1, 7.2, 8.2);
box(7.0, 0.7, 0.45, 36.5, 0, 3.95, M.timber, { collide: true }); box(7.04, 0.04, 0.49, 36.5, 0.7, 3.95, M.counter); // long console
box(1.9, 1.1, 0.06, 36.5, 1.15, 3.78, M.metal); cyl(0.14, 0.1, 0.45, 33.8, 0.74, 3.95, M.ceramic); cyl(0.1, 0.12, 0.3, 39.4, 0.74, 3.95, M.fabricRust);
cyl(0.3, 0.25, 0.55, 32.0, 0, 4.4, M.planterStone); tree(32.0, 4.4, 0.55, true);
lamp(36.5, 2.8, 7.5, 7, 12); lamp(33, 2.8, 8, 3); pendant(36.6, 7.6, 2.3);
// Terrace & pool (x42..50, z-2..18). Pool x43.5..48.5, z4..12
{
  const px0 = 43.5, px1 = 48.5, pz0 = 4, pz1 = 12, depth = 0.28;
  box(px1 - px0, 0.02, pz1 - pz0, (px0 + px1) / 2, -depth, (pz0 + pz1) / 2, M.water.clone(), { cast: false });
  const poolTile = new THREE.MeshStandardMaterial({ map: TEX.pooltile, roughness: .3 });
  box(px1 - px0, 0.01, pz1 - pz0, (px0 + px1) / 2, -depth + 0.001, (pz0 + pz1) / 2, poolTile, { cast: false });
  box(px1 - px0, depth, 0.05, (px0 + px1) / 2, -depth, pz0 + 0.025, poolTile); box(px1 - px0, depth, 0.05, (px0 + px1) / 2, -depth, pz1 - 0.025, poolTile);
  box(0.05, depth, pz1 - pz0, px0 + 0.025, -depth, (pz0 + pz1) / 2, poolTile); box(0.05, depth, pz1 - pz0, px1 - 0.025, -depth, (pz0 + pz1) / 2, poolTile);
  const water = box(px1 - px0 - 0.1, 0.02, pz1 - pz0 - 0.1, (px0 + px1) / 2, -0.1, (pz0 + pz1) / 2, M.water, { cast: false }); water.renderOrder = 1;
  // coping
  const cop = new THREE.MeshStandardMaterial({ color: 0xe3d9c6, roughness: .8 });
  box(px1 - px0 + 0.6, 0.04, 0.3, (px0 + px1) / 2, 0, pz0 - 0.15, cop); box(px1 - px0 + 0.6, 0.04, 0.3, (px0 + px1) / 2, 0, pz1 + 0.15, cop);
  box(0.3, 0.04, pz1 - pz0, px0 - 0.15, 0, (pz0 + pz1) / 2, cop); box(0.3, 0.04, pz1 - pz0, px1 + 0.15, 0, (pz0 + pz1) / 2, cop);
  addCol(px0, px1, pz0, pz1);
}
[1.0, 4.5, 8.0, 11.5, 15.0].forEach(z => roundPlanter(49.35, z, 0.38, 0.6, 0.5));   // row of 5 planters, east edge
tree(48.9, -1.0, 1.3); tree(48.9, 17.0, 1.3);                                        // NE / SE corner trees
function lounger(x, z, rot) {
  const g = piece(x, z, rot);
  gbox(g, 0.7, 0.28, 1.9, 0, 0.0, 0, M.timberLight); gbox(g, 0.62, 0.08, 1.3, 0, 0.28, 0.25, M.linen);
  const back = gbox(g, 0.62, 0.08, 0.7, 0, 0.42, -0.62, M.linen); back.rotation.x = 0.6;
  addCol(x - 0.45, x + 0.45, z - 1.0, z + 1.0);
}
lounger(44.6, 1.4, Math.PI); lounger(46.0, 1.4, Math.PI); lounger(44.6, 14.6, 0); lounger(46.0, 14.6, 0);
cyl(0.25, 0.25, 0.45, 45.3, 0, 1.4, M.planterStone); // side table
{ cyl(0.03, 0.03, 2.4, 47.4, 0, 14.6, M.metal, { seg: 6 }); const u = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.45, 8), M.linen); u.position.set(47.4, 2.45, 14.6); u.castShadow = true; world.add(u); }

// ---------- floating labels ----------
const labels = [];
for (const r of ROOMS) {
  const el = document.createElement('div'); el.className = 'label';
  const area = ((r.x1 - r.x0) * (r.z1 - r.z0)).toFixed(0);
  el.innerHTML = `${r.name}<small>${area} m²</small>`;
  el.addEventListener('pointerdown', e => { e.stopPropagation(); teleport(r.id); });
  const o = new CSS2DObject(el); o.position.set((r.x0 + r.x1) / 2, r.id === 'terrace' ? 1.6 : 3.7, (r.z0 + r.z1) / 2);
  scene.add(o); labels.push(o);
}

// ---------- controls ----------
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(19, 0, 8);
orbit.enableDamping = true; orbit.maxPolarAngle = 1.42; orbit.minDistance = 8; orbit.maxDistance = 140;
const ORBIT_HOME = { pos: new THREE.Vector3(-2, 34, 46), target: new THREE.Vector3(19, 0, 7.5) };
camera.position.copy(ORBIT_HOME.pos); orbit.target.copy(ORBIT_HOME.target); orbit.update();

let mode = 'orbit';
const player = { x: 0, z: 8, yaw: 0, pitch: 0 };
const keys = {};
const joy = { x: 0, y: 0 };
let tour = null;
const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

const helpEl = document.getElementById('help');
function setHelp() {
  if (mode === 'orbit') helpEl.innerHTML = isTouch ? 'Drag to orbit · pinch to zoom · tap a room label to walk in'
    : 'Drag to orbit · right-drag to pan · scroll to zoom · click a room label or the plan to walk in · <kbd>2</kbd> walkthrough';
  else if (tour) helpEl.innerHTML = 'Auto tour playing · press any key or <b>Stop tour</b> to take over';
  else helpEl.innerHTML = isTouch ? 'Left joystick to move · drag on the right to look around'
    : 'Click to look around · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows move · <kbd>Shift</kbd> faster · <kbd>Esc</kbd> release mouse · <kbd>1</kbd> dollhouse';
  helpEl.className = 'glass';
}
const savedOrbit = { pos: ORBIT_HOME.pos.clone(), target: ORBIT_HOME.target.clone() };
function setMode(m) {
  if (m === mode) return;
  if (m === 'walk') {
    savedOrbit.pos.copy(camera.position); savedOrbit.target.copy(orbit.target);
    orbit.enabled = false; camera.fov = 70;
  } else {
    stopTour(); if (document.pointerLockElement) document.exitPointerLock();
    orbit.enabled = true; camera.fov = 45; camera.position.copy(savedOrbit.pos); orbit.target.copy(savedOrbit.target); orbit.update();
  }
  camera.updateProjectionMatrix();
  mode = m;
  roofGroup.visible = m === 'walk';
  labelRenderer.domElement.style.display = m === 'orbit' ? '' : 'none';
  document.body.classList.toggle('walk', m === 'walk');
  document.getElementById('btnOrbit').classList.toggle('on', m === 'orbit');
  document.getElementById('btnWalk').classList.toggle('on', m === 'walk');
  setHelp();
}
const yawTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
function teleport(id) {
  const r = byId[id]; if (!r) return;
  stopTour(); setMode('walk');
  player.x = r.spawn[0]; player.z = r.spawn[1]; player.yaw = yawTo(player.x, player.z, r.look[0], r.look[1]); player.pitch = -0.05;
  toast(r.name);
}
function teleportPoint(x, z) {
  const r = roomAt(x, z);
  if (!blocked(x, z)) { stopTour(); setMode('walk'); player.x = x; player.z = z; if (r) player.yaw = yawTo(x, z, (r.x0 + r.x1) / 2 + 0.01, (r.z0 + r.z1) / 2); toast(r ? r.name : 'Outside'); }
  else if (r) teleport(r.id);
}
function roomAt(x, z) {
  // prefer smaller rooms (foyer before entry etc.)
  return ROOMS.filter(r => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1).sort((a, b) => (a.x1 - a.x0) * (a.z1 - a.z0) - (b.x1 - b.x0) * (b.z1 - b.z0))[0];
}
let toastT;
function toast(t) { const el = document.getElementById('toast'); el.textContent = t; el.className = 'glass show'; clearTimeout(toastT); toastT = setTimeout(() => el.className = 'glass', 1600); }

// collision
function blocked(x, z, r = RADIUS) {
  for (const c of colliders) if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return true;
  return false;
}
function move(dx, dz) {
  const sub = Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.1) || 1;
  for (let i = 0; i < sub; i++) {
    const nx = player.x + dx / sub; if (!blocked(nx, player.z)) player.x = nx;
    const nz = player.z + dz / sub; if (!blocked(player.x, nz)) player.z = nz;
  }
  player.x = THREE.MathUtils.clamp(player.x, -45, 75); player.z = THREE.MathUtils.clamp(player.z, -25, 40);
}

// keyboard
addEventListener('keydown', e => {
  if (tour && !['ShiftLeft', 'ShiftRight'].includes(e.code)) stopTour();
  keys[e.code] = true;
  if (e.code === 'Digit1') setMode('orbit');
  if (e.code === 'Digit2') { if (mode !== 'walk') teleport(roomAt(player.x, player.z) ? roomAt(player.x, player.z).id : 'entry'); }
  if (e.code === 'KeyT') toggleTour();
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// mouse look (pointer lock, with drag fallback)
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
  else if (dragging) { mx = e.clientX - lastX; my = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; }
  else return;
  player.yaw -= mx * 0.0024; player.pitch = THREE.MathUtils.clamp(player.pitch - my * 0.0024, -1.3, 1.3);
});

// touch: joystick + look
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
  for (const t of e.changedTouches) {
    if (t.identifier === joyId) { e.preventDefault(); joyMove(t); }
    else if (t.identifier === lookId && mode === 'walk') {
      player.yaw -= (t.clientX - lookX) * 0.005; player.pitch = THREE.MathUtils.clamp(player.pitch - (t.clientY - lookY) * 0.005, -1.2, 1.2);
      lookX = t.clientX; lookY = t.clientY;
    }
  }
}, { passive: false });
addEventListener('touchend', e => {
  for (const t of e.changedTouches) {
    if (t.identifier === joyId) { joyId = null; joy.x = joy.y = 0; knob.style.transform = ''; }
    if (t.identifier === lookId) lookId = null;
  }
});

// ---------- auto tour ----------
const TOUR_PTS = [[-12.5, 8], [-6, 8], [-1.4, 8], [2.5, 8], [6.5, 8], [13, 8], [20, 8], [27, 8], [30.4, 8], [33, 7.0], [36.5, 5.3], [40.3, 5.6], [42.0, 6.5], [42.8, 4.2], [43.6, 1.8], [45.6, 0.2]];
const tourCurve = new THREE.CatmullRomCurve3(TOUR_PTS.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
const TOUR_LEN = tourCurve.getLength(), TOUR_DUR = TOUR_LEN / 1.55;
const POOL_LOOK = new THREE.Vector3(46.5, 0, 9);
const tourStops = [[0.0, 'Entry Court'], [0.14, 'Foyer'], [0.2, 'Gallery'], [0.53, 'Living Room'], [0.82, 'Terrace & Pool']];
function startTour() {
  setMode('walk'); tour = { t: 0, stop: 0 };
  const p0 = tourCurve.getPointAt(0), p1 = tourCurve.getPointAt(0.02);
  player.x = p0.x; player.z = p0.z; player.yaw = yawTo(p0.x, p0.z, p1.x, p1.z); player.pitch = -0.03;
  document.getElementById('btnTour').textContent = '■ Stop tour'; setHelp();
}
function stopTour() { if (!tour) return; tour = null; document.getElementById('btnTour').textContent = '▶ Auto tour'; setHelp(); }
function toggleTour() { tour ? stopTour() : startTour(); }
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
function angLerp(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }
function updateTour(dt) {
  tour.t += dt / TOUR_DUR;
  const u = ease(Math.min(tour.t, 1));
  const p = tourCurve.getPointAt(u);
  player.x = p.x; player.z = p.z;
  let look;
  if (u > 0.9) look = POOL_LOOK; else look = tourCurve.getPointAt(Math.min(u + 0.035, 1));
  player.yaw = angLerp(player.yaw, yawTo(p.x, p.z, look.x, look.z), Math.min(1, dt * 2.2));
  player.pitch += (-0.04 - player.pitch) * Math.min(1, dt * 2);
  while (tour.stop < tourStops.length && u >= tourStops[tour.stop][0]) { toast(tourStops[tour.stop][1]); tour.stop++; }
  if (tour.t >= 1) { stopTour(); toast('Tour complete — explore freely'); }
}

// ---------- UI wiring ----------
document.getElementById('btnOrbit').onclick = () => setMode('orbit');
document.getElementById('btnWalk').onclick = () => { if (mode !== 'walk') teleport('entry'); };
document.getElementById('btnTour').onclick = toggleTour;
const list = document.getElementById('roomList');
for (const r of ROOMS) {
  const li = document.createElement('li'); li.dataset.id = r.id;
  li.innerHTML = `<i style="background:${r.col}"></i>${r.name}<em>${((r.x1 - r.x0) * (r.z1 - r.z0)).toFixed(0)} m²</em>`;
  li.onclick = () => teleport(r.id); list.appendChild(li);
}

// minimap
const mm = document.getElementById('minimap'), mg = mm.getContext('2d');
const MM = { x0: -15, x1: 51, z0: -3, z1: 19 };
const mmScale = mm.width / (MM.x1 - MM.x0);
const toMM = (x, z) => [(x - MM.x0) * mmScale, (z - MM.z0) * mmScale];
function drawMinimap() {
  mg.clearRect(0, 0, mm.width, mm.height);
  mg.fillStyle = '#e7dfcf'; mg.fillRect(0, 0, mm.width, mm.height);
  const cur = mode === 'walk' ? roomAt(player.x, player.z) : null;
  for (const r of ROOMS) {
    const [a, b] = toMM(r.x0, r.z0), [c, d] = toMM(r.x1, r.z1);
    mg.fillStyle = r.col; mg.globalAlpha = r === cur ? 1 : 0.8; mg.fillRect(a, b, c - a, d - b); mg.globalAlpha = 1;
    mg.strokeStyle = r === cur ? '#3b2f25' : 'rgba(59,47,37,.55)'; mg.lineWidth = r === cur ? 3 : 1.2; mg.strokeRect(a, b, c - a, d - b);
  }
  { const [a, b] = toMM(43.5, 4), [c, d] = toMM(48.5, 12); mg.fillStyle = '#5fb3c4'; mg.fillRect(a, b, c - a, d - b); }
  mg.fillStyle = '#2b241d'; mg.font = '600 12px Inter,system-ui,sans-serif'; mg.textAlign = 'center'; mg.textBaseline = 'middle';
  for (const r of ROOMS) {
    if (r.id === 'dressing' || r.id === 'bath') continue;
    const [x, y] = toMM((r.x0 + r.x1) / 2, r.id === 'terrace' ? 16 : (r.z0 + r.z1) / 2);
    mg.fillText(r.id === 'bedroom' ? 'Bedroom' : r.id === 'terrace' ? 'Terrace' : r.name.replace(' Court', '').replace(' Room', '').replace(' Suite', ''), x, y);
  }
  mg.font = '600 10px Inter,system-ui'; { const [x, y] = toMM(26.5, 3.2); mg.fillText('Dr.', x, y); const [x2, y2] = toMM(29.5, 3.2); mg.fillText('Bath', x2, y2); }
  // north arrow
  mg.fillStyle = '#6e4524'; mg.font = '700 11px Inter,system-ui'; mg.fillText('N ↑', 22, 12);
  if (mode === 'walk') {
    const [x, y] = toMM(player.x, player.z);
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    mg.fillStyle = 'rgba(176,112,60,.3)'; mg.beginPath(); mg.moveTo(x, y);
    const a0 = Math.atan2(fz, fx); mg.arc(x, y, 34, a0 - 0.6, a0 + 0.6); mg.closePath(); mg.fill();
    mg.fillStyle = '#b0703c'; mg.strokeStyle = '#fff'; mg.lineWidth = 2; mg.beginPath(); mg.arc(x, y, 6, 0, Math.PI * 2); mg.fill(); mg.stroke();
  }
}
mm.addEventListener('click', e => {
  const r = mm.getBoundingClientRect();
  const x = MM.x0 + (e.clientX - r.left) / r.width * (MM.x1 - MM.x0), z = MM.z0 + (e.clientY - r.top) / r.height * (MM.z1 - MM.z0);
  teleportPoint(x, z);
});
let lastRoomId = null;
function updateRoomList() {
  const r = mode === 'walk' ? roomAt(player.x, player.z) : null; const id = r ? r.id : null;
  if (id === lastRoomId) return; lastRoomId = id;
  for (const li of list.children) li.classList.toggle('cur', li.dataset.id === id);
}

// ---------- loop ----------
const clock = new THREE.Clock();
const fwd = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === 'orbit') orbit.update();
  else {
    if (tour) updateTour(dt);
    else {
      let f = 0, s = 0;
      if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
      if (keys.KeyD || keys.ArrowRight) s += 1; if (keys.KeyA || keys.ArrowLeft) s -= 1;
      if (keys.KeyQ) player.yaw += dt * 1.8; if (keys.KeyE) player.yaw -= dt * 1.8;
      f -= joy.y; s += joy.x;
      const len = Math.hypot(f, s);
      if (len > 0.05) {
        const sp = (keys.ShiftLeft || keys.ShiftRight ? 4.6 : 2.3) * dt / Math.max(1, len);
        const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
        move((-sy * f + cy * s) * sp, (-cy * f - sy * s) * sp);
      }
    }
    camera.position.set(player.x, EYE, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
  }
  renderer.render(scene, camera);
  if (mode === 'orbit') labelRenderer.render(scene, camera);
  drawMinimap(); updateRoomList();
  requestAnimationFrame(frame);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight);
});

// ---------- boot ----------
setHelp();
roofGroup.visible = false;
const startRoom = params.get('room'); if (startRoom) teleport(startRoom);
if (params.get('mode') === 'walk' && !startRoom) teleport('entry');
if (params.has('tour')) startTour();
requestAnimationFrame(() => { frame(); setTimeout(() => document.getElementById('loader').classList.add('hide'), 150); window.__ready = true; });

// test / embed hooks
window.galleryHouse = { setMode, teleport, startTour, stopTour, player, colliders, rooms: ROOMS, get mode() { return mode; },
  setView(x, z, yaw, pitch = 0) { setMode('walk'); player.x = x; player.z = z; player.yaw = yaw; player.pitch = pitch; },
  lookFrom(x, z, tx, tz, pitch = -0.04) { setMode('walk'); player.x = x; player.z = z; player.yaw = yawTo(x, z, tx, tz); player.pitch = pitch; },
  tourAt(t) { startTour(); tour.t = t; } };
