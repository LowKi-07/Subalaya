// Subalaya: interactive 3D walkthrough of the two-storey house in plan-reference.png.
// Units: 1 world unit = 1 foot. Layout coordinates are taken directly from the
// reference image (pixels) and converted with X()/Z(), so the geometry stays
// traceable to the drawing. The first-floor plan sits 665px to the right.
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { paintSky } from './sky.js';
import { makeCar } from './cars.js';
import { buildNeighbourhood, tree, streetLight } from './houses.js';
import { mergeGeometries, mergeVertices } from './vendor/BufferGeometryUtils.js';
import { EffectComposer } from './vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from './vendor/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from './vendor/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from './vendor/jsm/postprocessing/SMAAPass.js';
import { GLTFLoader } from './vendor/jsm/loaders/GLTFLoader.js';
import { RGBELoader } from './vendor/jsm/loaders/RGBELoader.js';
import { MeshoptDecoder } from './vendor/jsm/libs/meshopt_decoder.module.js';

const PX = 17.2;            // image pixels per foot (10'2" living hall ≈ 175px)
const FH = 10;              // floor-to-floor height
const SLAB = 0.5;
const WH = FH - SLAB;       // clear wall height
const EYE = 5.3;
const RADIUS = 0.75;
const X = (px, lvl = 0) => ((lvl ? px - 665 : px) - 40) / PX;
const Z = (py) => (py - 45) / PX;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let seed = 11;
const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('c');
const isTouch = matchMedia('(pointer: coarse)').matches;
const LOWQ = new URLSearchParams(location.search).has('lowq');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); }
catch (e) { document.getElementById('loading').textContent = 'WebGL is not available in this browser.'; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
let daySky = paintSky(); const nightSky = paintSky({ night: true });
let skyEnv = pmrem.fromEquirectangular(daySky).texture;          // reflections for cars and glass
const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // soft studio fill for interiors
scene.background = daySky;
scene.environment = roomEnv;
scene.environmentIntensity = 0.7;
scene.backgroundIntensity = 1;
const HORIZON = new THREE.Color(0xd5e4f1), NIGHT_FOG = new THREE.Color(0x1a2233);
scene.fog = new THREE.Fog(HORIZON.clone(), 160, 520);
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1500);
camera.rotation.order = 'YXZ';

// ---------------------------------------------------------------- textures
function makeTex(draw, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
function speckle(g, s, n, color) { g.fillStyle = color; for (let i = 0; i < n; i++) g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2); }
function grid(g, s, n, color, w) { g.strokeStyle = color; g.lineWidth = w; for (let k = 0; k <= n; k++) { const p = (k * s) / n; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.moveTo(0, p); g.lineTo(s, p); g.stroke(); } }
const TEX = {
  oak: makeTex((g, s) => { // light oak planks, 4ft square, 7" boards
    const n = 7, pw = s / n;
    for (let i = 0; i < n; i++) {
      let y = -rnd() * s * 0.7;
      while (y < s) {
        const len = s * (0.45 + rnd() * 0.5);
        g.fillStyle = `hsl(${28 + rnd() * 6},${45 + rnd() * 12}%,${50 + rnd() * 10}%)`;
        g.fillRect(i * pw, y, pw, len);
        for (let k = 0; k < 14; k++) {
          g.strokeStyle = `rgba(140,95,55,${0.05 + rnd() * 0.08})`; g.lineWidth = 0.6 + rnd();
          const xx = i * pw + rnd() * pw; g.beginPath(); g.moveTo(xx, y);
          g.bezierCurveTo(xx + rnd() * 8 - 4, y + len / 3, xx + rnd() * 8 - 4, y + len * 0.66, xx + rnd() * 5 - 2.5, y + len); g.stroke();
        }
        g.fillStyle = 'rgba(110,75,45,0.35)'; g.fillRect(i * pw, y, pw, 1.2);
        y += len;
      }
      g.fillStyle = 'rgba(110,75,45,0.3)'; g.fillRect(i * pw, 0, 1.2, s);
    }
  }),
  marble: makeTex((g, s) => { // 4ft square, 2x2ft light marble-look tiles
    const h = s / 2;
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      const x0 = tx * h, y0 = ty * h;
      g.save(); g.beginPath(); g.rect(x0, y0, h, h); g.clip();
      g.fillStyle = `hsl(42,38%,${86 + rnd() * 3}%)`; g.fillRect(x0, y0, h, h);
      for (let v = 0; v < 5; v++) {
        g.strokeStyle = `rgba(150,138,122,${0.05 + rnd() * 0.09})`; g.lineWidth = 0.5 + rnd() * 1.4;
        g.beginPath(); let px = x0 + rnd() * h, py = y0 - 10; g.moveTo(px, py);
        for (let k = 0; k < 10; k++) { px += (rnd() - 0.5) * 36; py += h / 8; g.lineTo(px, py); }
        g.stroke();
      }
      g.restore();
    }
    grid(g, s, 2, '#d8d1c6', 1.5);
  }),
  ktile: makeTex((g, s) => { // 4ft square, 2x2ft warm grey matte tiles
    const h = s / 2;
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) { g.fillStyle = `hsl(35,8%,${83 + rnd() * 3}%)`; g.fillRect(tx * h, ty * h, h, h); }
    speckle(g, s, 2500, 'rgba(90,80,70,0.06)'); grid(g, s, 2, '#bdb6ac', 1.5);
  }),
  btile: makeTex((g, s) => { // 2ft square, 1x1ft pale stone tiles
    const h = s / 2;
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) { g.fillStyle = `hsl(32,10%,${80 + rnd() * 4}%)`; g.fillRect(tx * h, ty * h, h, h); }
    speckle(g, s, 3000, 'rgba(0,0,0,0.05)'); grid(g, s, 2, '#f2f0ec', 3);
  }),
  paver: makeTex((g, s) => { // 4ft square, 1ft x 1ft light concrete pavers
    g.fillStyle = '#a9a39a'; g.fillRect(0, 0, s, s);
    const b = s / 4;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { g.fillStyle = `hsl(36,6%,${74 + rnd() * 6}%)`; g.fillRect(c * b + 2, r * b + 2, b - 4, b - 4); }
    speckle(g, s, 3000, 'rgba(0,0,0,0.06)');
  }),
  grass: makeTex((g, s) => { g.fillStyle = '#6f8f48'; g.fillRect(0, 0, s, s); speckle(g, s, 9000, 'rgba(40,70,20,0.3)'); speckle(g, s, 6000, 'rgba(160,190,100,0.22)'); }),
  asphalt: makeTex((g, s) => { g.fillStyle = '#3a3c3f'; g.fillRect(0, 0, s, s); speckle(g, s, 9000, 'rgba(255,255,255,0.06)'); speckle(g, s, 9000, 'rgba(0,0,0,0.18)'); }),
  walnut: makeTex((g, s) => { // dark walnut veneer, grain running vertically
    for (let x = 0; x < s; x += 4) { g.fillStyle = `hsl(${20 + rnd() * 6},${38 + rnd() * 10}%,${17 + rnd() * 7}%)`; g.fillRect(x, 0, 4, s); }
    for (let k = 0; k < 90; k++) { g.strokeStyle = `rgba(${rnd() < 0.5 ? '15,8,4' : '120,80,50'},${0.12 + rnd() * 0.15})`; g.lineWidth = 0.6 + rnd() * 1.6; const x = rnd() * s; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + rnd() * 30 - 15, s / 3, x + rnd() * 30 - 15, (2 * s) / 3, x + rnd() * 20 - 10, s); g.stroke(); }
  }),
  weave: makeTex((g, s) => { // grey-scale weave used as a bump map for upholstery
    g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 4) for (let x = 0; x < s; x += 4) { const v = ((x + y) / 4) % 2 ? 150 : 100; g.fillStyle = `rgb(${v + rnd() * 30},${v + rnd() * 30},${v + rnd() * 30})`; g.fillRect(x, y, 4, 4); }
  }, 256),
  boucle: makeTex((g, s) => { g.fillStyle = '#7a7a7a'; g.fillRect(0, 0, s, s); for (let i = 0; i < 3500; i++) { const v = 120 + rnd() * 120; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.arc(rnd() * s, rnd() * s, 1 + rnd() * 2.2, 0, 7); g.fill(); } }, 256),
  fabric: makeTex((g, s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, s, s); for (let i = 0; i < s; i += 2) { g.fillStyle = `rgba(0,0,0,${0.025 + rnd() * 0.02})`; g.fillRect(i, 0, 1, s); g.fillRect(0, i, s, 1); } }, 256),
  quartz: makeTex((g, s) => { g.fillStyle = '#efede9'; g.fillRect(0, 0, s, s); speckle(g, s, 2500, 'rgba(120,110,100,0.12)'); speckle(g, s, 600, 'rgba(255,255,255,0.6)'); }, 256),
  chain: makeTex((g, s) => { g.clearRect(0, 0, s, s); g.strokeStyle = '#9aa0a6'; g.lineWidth = 3; const st = s / 8; for (let i = -8; i < 16; i++) { g.beginPath(); g.moveTo(i * st, 0); g.lineTo(i * st + s, s); g.stroke(); g.beginPath(); g.moveTo(i * st, s); g.lineTo(i * st + s, 0); g.stroke(); } }, 256),
};
TEX.fabric.repeat.set(4, 4);
for (const k of ['weave', 'boucle']) { TEX[k].colorSpace = THREE.NoColorSpace; TEX[k].repeat.set(3, 3); }

// ---------------------------------------------------------------- materials
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const mats = {
  wallIn: M(0xefe9df, { roughness: 0.95 }), wallExt: M(0xefe5d6, { roughness: 0.92 }),
  ceiling: M(0xf8f7f3, { roughness: 1 }), concrete: M(0xd8d2c8, { roughness: 0.95 }),
  charcoal: M(0x2b2d30, { roughness: 0.75 }), soffit: M(0x9a6a3e, { roughness: 0.6 }),
  slat: M(0xb7783e, { roughness: 0.55 }), groove: M(0xcfc4b3, { roughness: 1 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xcfe4ee, roughness: 0.03, transparent: true, opacity: 0.16, envMap: skyEnv, envMapIntensity: 1.2, depthWrite: false }),
  frosted: new THREE.MeshStandardMaterial({ color: 0xeef2f2, roughness: 0.4, transparent: true, opacity: 0.75 }),
  alu: M(0x1c1e21, { metalness: 0.4, roughness: 0.45 }), winWood: new THREE.MeshStandardMaterial({ map: TEX.walnut, color: 0xc8b0a0, roughness: 0.45 }), chrome: M(0xdddddd, { metalness: 1, roughness: 0.15 }),
  brass: M(0xc9a66b, { metalness: 0.9, roughness: 0.3 }),
  doorWood: new THREE.MeshStandardMaterial({ map: TEX.walnut, roughness: 0.45 }), frameWood: new THREE.MeshStandardMaterial({ map: TEX.walnut, color: 0xb8a090, roughness: 0.45 }), walnut: new THREE.MeshStandardMaterial({ map: TEX.walnut, roughness: 0.42 }), teak: M(0x7b4a2a, { roughness: 0.5 }),
  white: M(0xf6f5f2, { roughness: 0.5 }), porcelain: M(0xffffff, { roughness: 0.12 }),
  oakSolid: M(0xd6b48c, { roughness: 0.55 }), oakDark: M(0xb08a62, { roughness: 0.55 }),
  matteWhite: M(0xf1eee8, { roughness: 0.6 }), shadowLine: M(0xbdb6ab, { roughness: 1 }),
  quartz: new THREE.MeshStandardMaterial({ map: TEX.quartz, roughness: 0.25 }),
  steel: M(0xc8ccd0, { metalness: 0.9, roughness: 0.3 }), black: M(0x151515, { roughness: 0.35 }),
  navy: M(0xd8c4a3, { roughness: 0.9 }), // kitchen accent wall (beige)
  polycarb: new THREE.MeshPhysicalMaterial({ color: 0xdfe9ee, roughness: 0.35, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  screen: M(0x07080a, { roughness: 0.12, metalness: 0.3 }), mirror: new THREE.MeshStandardMaterial({ color: 0xe6eef2, metalness: 1, roughness: 0.03, envMap: roomEnv }),
  linen: new THREE.MeshStandardMaterial({ color: 0xf4f1eb, map: TEX.fabric, bumpMap: TEX.weave, bumpScale: 0.35, roughness: 0.95 }),
  linenWarm: new THREE.MeshStandardMaterial({ color: 0xe7dfd2, map: TEX.fabric, bumpMap: TEX.weave, bumpScale: 0.35, roughness: 0.95 }),
  taupe: new THREE.MeshStandardMaterial({ color: 0xc9bca8, map: TEX.fabric, bumpMap: TEX.weave, bumpScale: 0.35, roughness: 0.95 }),
  greige: new THREE.MeshStandardMaterial({ color: 0xa9a196, map: TEX.fabric, bumpMap: TEX.weave, bumpScale: 0.35, roughness: 0.95 }),
  sofa: new THREE.MeshStandardMaterial({ color: 0xece7df, map: TEX.fabric, bumpMap: TEX.weave, bumpScale: 0.6, roughness: 0.95 }),
  sofaGreige: new THREE.MeshStandardMaterial({ color: 0xc9bfb1, map: TEX.fabric, bumpMap: TEX.weave, bumpScale: 0.6, roughness: 0.95 }),
  sofaTaupe: new THREE.MeshStandardMaterial({ color: 0xa89a88, map: TEX.fabric, bumpMap: TEX.weave, bumpScale: 0.6, roughness: 0.95 }),
  boucle: new THREE.MeshStandardMaterial({ color: 0xf2eee6, bumpMap: TEX.boucle, bumpScale: 1.2, roughness: 1 }),
  rust: new THREE.MeshStandardMaterial({ color: 0x9b5a3c, map: TEX.fabric, bumpMap: TEX.weave, bumpScale: 0.5, roughness: 0.95 }),
  olive: new THREE.MeshStandardMaterial({ color: 0x6f6c4a, map: TEX.fabric, bumpMap: TEX.weave, bumpScale: 0.5, roughness: 0.95 }),
  rug: new THREE.MeshStandardMaterial({ color: 0xd2ccc2, map: TEX.fabric, roughness: 1 }),
  rug2: new THREE.MeshStandardMaterial({ color: 0xe2dbcf, map: TEX.fabric, roughness: 1 }),
  curtain: new THREE.MeshStandardMaterial({ color: 0xece5d9, map: TEX.fabric, roughness: 0.95, side: THREE.DoubleSide }),
  lightOn: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1dc, emissiveIntensity: 0.35 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xf3ead8, emissive: 0xffd9a0, emissiveIntensity: 0.18, map: TEX.fabric }),
  facadeLight: new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xffc77a, emissiveIntensity: 0.6 }),
  leaf: M(0x587d45, { roughness: 0.9, flatShading: true }), leaf2: M(0x6c9152, { roughness: 0.9, flatShading: true }),
  pot: M(0xf0ece6, { roughness: 0.7 }), potClay: M(0xb7896a, { roughness: 0.9 }),
  rail: M(0x1c1d1f, { metalness: 0.6, roughness: 0.4 }), compound: M(0xeee6da, { roughness: 1 }),
  chain: new THREE.MeshStandardMaterial({ map: TEX.chain, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5 }),
};
const floorMat = {};
for (const [k, tile] of Object.entries({ oak: 5.58, marble: 4.92, ktile: 4, btile: 2, paver: 4, grass: 16, asphalt: 12 })) {
  floorMat[k] = new THREE.MeshStandardMaterial({ map: TEX[k], bumpMap: k === 'oak' ? TEX[k] : null, bumpScale: 0.4, roughness: k === 'marble' ? 0.3 : k === 'oak' ? 0.5 : 0.85, envMapIntensity: k === 'oak' || k === 'marble' ? 0.8 : 0.4 });
  floorMat[k].userData.tile = tile;
}
floorMat.ktile = floorMat.marble; // kitchens share the limestone tiles
const litMaterials = []; // window glows that switch on at night
const artPalettes = [['#e9e2d6', '#c7b49a', '#8f8273'], ['#efe9e1', '#b9a48a', '#d8cbb8'], ['#ece6dc', '#a7a99a', '#cdb79e'], ['#f1ece4', '#c9a78a', '#7f8a86']];
function artTexture(i) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 320; const g = c.getContext('2d'), p = artPalettes[i % artPalettes.length];
  g.fillStyle = p[0]; g.fillRect(0, 0, 256, 320);
  g.fillStyle = p[1]; g.beginPath(); g.arc(90 + (i * 37) % 80, 140, 70, 0, Math.PI * 2); g.fill();
  g.fillStyle = p[2]; g.globalAlpha = 0.8; g.beginPath(); g.ellipse(170, 210 - (i * 23) % 60, 60, 90, 0.4, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  g.strokeStyle = 'rgba(60,50,40,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(30, 260); g.bezierCurveTo(90, 200, 160, 300, 226, 230); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- scene graph
const groups = [new THREE.Group(), new THREE.Group()];
const roofGroup = new THREE.Group(), siteGroup = new THREE.Group(), labelGroup = new THREE.Group();
scene.add(groups[0], groups[1], roofGroup, siteGroup, labelGroup);
const colliders = [[], [], []];   // per level (ground, first, terrace): [x1, z1, x2, z2]
const mapWalls = [[], [], []];    // for the minimap
const lvlOf = (h) => (h > 15 ? 2 : h > 5 ? 1 : 0);

function addMesh(geo, mat, x, y, z, grp, cast = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; grp.add(m); return m;
}
const B = (w, h, d, mat, x, y, z, grp, cast) => addMesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, grp, cast);

function floorPlane(x1, z1, x2, z2, y, mat, grp) {
  const geo = new THREE.PlaneGeometry(x2 - x1, z2 - z1);
  geo.rotateX(-Math.PI / 2);
  geo.translate((x1 + x2) / 2, y, (z1 + z2) / 2);
  const tile = mat.userData.tile || 4, pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; grp.add(m); return m;
}

// a gently pleated curtain panel hanging from y1 to y0
function curtainPanel(width, height, folds) {
  const geo = new THREE.PlaneGeometry(width, height, folds * 6, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) / width) * folds * Math.PI * 2) * 0.09);
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------- walls, doors, windows
// type: D door, M main double door, O open doorway, W window (with curtains), K kitchen window,
// F front-facade window (large, black frame), V ventilator
const OPEN = { D: [0, 7], M: [0, 7.5], O: [0, 7.2], W: [3, 7], K: [3.5, 7], F: [2.5, 7.6], V: [6, 7.5], P: [3.4, 7.2] };
const T_EXT = 0.75, T_INT = 0.4;

function wallMaterial(dir, ext, accent) {
  if (accent) { // accent paint on one side of an interior wall
    const arr = Array(6).fill(mats.wallIn);
    if (dir === 'h') arr[accent > 0 ? 4 : 5] = mats.navy; else arr[accent > 0 ? 0 : 1] = mats.navy;
    return arr;
  }
  if (!ext) return mats.wallIn;
  const arr = Array(6).fill(mats.wallExt); // box faces: +x -x +y -y +z -z
  if (dir === 'h') arr[ext > 0 ? 4 : 5] = mats.wallIn; else arr[ext > 0 ? 0 : 1] = mats.wallIn;
  return arr;
}

function wall(lvl, dir, c, a, b, t, ops = [], ext = 0, accent = 0) {
  const grp = groups[lvl], base = lvl * FH;
  const along = (v) => (dir === 'h' ? X(v, lvl) : Z(v));
  const cc = dir === 'h' ? Z(c) : X(c, lvl);
  const mat = wallMaterial(dir, ext, accent);
  const put = (s, e, y0, y1, off, thick, m, cast = true) => {
    const L = e - s, mid = (s + e) / 2, h = y1 - y0;
    return dir === 'h' ? B(L, h, thick, m, mid, base + y0 + h / 2, cc + off, grp, cast)
      : B(thick, h, L, m, cc + off, base + y0 + h / 2, mid, grp, cast);
  };
  const seg = (s, e, y0, y1, collide = true) => {
    if (e - s < 0.02 || y1 - y0 < 0.02) return;
    put(s, e, y0, y1, 0, t, mat);
    const r = dir === 'h' ? [s, cc - t / 2, e, cc + t / 2] : [cc - t / 2, s, cc + t / 2, e];
    if (collide) colliders[lvl].push(r);
    if (y0 < 1) mapWalls[lvl].push(r);
  };
  const list = ops.map((o) => ({ s: along(o[0]), e: along(o[1]), type: o[2], hinge: o[3] || 's+' })).sort((p, q) => p.s - q.s);
  let cur = along(a);
  for (const o of list) {
    seg(cur, o.s, 0, WH);
    const [sill, head] = OPEN[o.type];
    seg(o.s, o.e, head, WH, false);
    if (o.type === 'P') { // kitchen serving hatch with a breakfast-bar ledge on the living side
      seg(o.s, o.e, 0, sill, true);
      colliders[lvl].push(dir === 'h' ? [o.s, cc - t / 2, o.e, cc + t / 2] : [cc - t / 2, o.s, cc + t / 2, o.e]);
      put(o.s - 0.25, o.e + 0.25, sill, sill + 0.13, accent * 0.42, t + 0.85, mats.quartz);
      put(o.s, o.e, head - 0.05, head, 0, t + 0.02, mats.white, false);
      cur = o.e; continue;
    }
    if (sill > 0) {
      seg(o.s, o.e, 0, sill, true);
      colliders[lvl].push(dir === 'h' ? [o.s, cc - t / 2, o.e, cc + t / 2] : [cc - t / 2, o.s, cc + t / 2, o.e]);
      mapWalls[lvl].push(dir === 'h' ? [o.s, cc - 0.06, o.e, cc + 0.06] : [cc - 0.06, o.s, cc + 0.06, o.e]);
      const fw = o.type === 'F' ? 0.28 : 0.15, ft = o.type === 'F' ? t + 0.3 : Math.min(t, 0.35);
      const fo = o.type === 'F' ? -ext * 0.15 : 0;
      const fm = o.type === 'F' ? mats.alu : mats.winWood;
      put(o.s, o.e, sill, sill + fw, fo, ft, fm);
      put(o.s, o.e, head - fw, head, fo, ft, fm);
      put(o.s, o.s + fw, sill, head, fo, ft, fm);
      put(o.e - fw, o.e, sill, head, fo, ft, fm);
      put(o.s, o.e, sill - 0.08, sill, ext ? ext * 0.1 : 0, t + 0.25, mats.white); // sill stone
      if (o.type !== 'V') {
        const m = (o.s + o.e) / 2;
        put(m - 0.05, m + 0.05, sill, head, 0, 0.12, fm);
        put(o.s + fw, o.e - fw, sill + fw, head - fw, 0, 0.03, mats.glass, false);
        if (ext && o.type !== 'K') { // curtains on the room side
          const side = ext, wdt = (o.e - o.s) * 0.3 + 0.5, hgt = head + 0.6 - 0.25;
          const off = side * (t / 2 + 0.3);
          for (const [pos, sgn] of [[o.s - 0.25 + wdt / 2, 1], [o.e + 0.25 - wdt / 2, -1]]) {
            const cm = new THREE.Mesh(curtainPanel(wdt, hgt, Math.round(wdt * 1.6)), mats.curtain);
            cm.castShadow = true; cm.receiveShadow = true; void sgn;
            if (dir === 'h') cm.position.set(pos, base + 0.25 + hgt / 2, cc + off);
            else { cm.rotation.y = Math.PI / 2; cm.position.set(cc + off, base + 0.25 + hgt / 2, pos); }
            grp.add(cm);
          }
          put(o.s - 0.6, o.e + 0.6, head + 0.65, head + 0.72, off, 0.07, mats.rail, false); // rod
        }
      } else {
        put(o.s + fw, o.e - fw, sill + fw, head - fw, 0, 0.05, mats.frosted, false);
        for (let y = sill + 0.3; y < head - 0.1; y += 0.3) put(o.s + fw, o.e - fw, y - 0.02, y + 0.02, 0.05, 0.1, mats.alu, false);
      }
    } else {
      const jt = t + 0.1;
      if (o.type !== 'O') { // plain openings have no frame
        put(o.s, o.s + 0.15, 0, head, 0, jt, mats.frameWood);
        put(o.e - 0.15, o.e, 0, head, 0, jt, mats.frameWood);
        put(o.s, o.e, head - 0.15, head, 0, jt, mats.frameWood);
      }
      if (o.type !== 'O') {
        const side = o.hinge[1] === '-' ? -1 : 1;
        const leaves = o.type === 'M' ? [['s', (o.e - o.s - 0.3) / 2], ['e', (o.e - o.s - 0.3) / 2]] : [[o.hinge[0], o.e - o.s - 0.3]];
        for (const [h, W] of leaves) {
          const hx = h === 's' ? o.s + 0.22 : o.e - 0.22;
          const off = side * (t / 2 + W / 2);
          put(hx - 0.07, hx + 0.07, 0.05, head - 0.17, off, W, o.type === 'M' ? mats.teak : mats.doorWood);
          put(hx - 0.1, hx + 0.1, 3.3, 3.38, side * (t / 2 + W - 0.35), 0.45, mats.alu);
          const a1 = off - (W / 2) * side, a2 = off + (W / 2) * side;
          colliders[lvl].push(dir === 'h' ? [hx - 0.07, cc + Math.min(a1, a2), hx + 0.07, cc + Math.max(a1, a2)] : [cc + Math.min(a1, a2), hx - 0.07, cc + Math.max(a1, a2), hx + 0.07]);
        }
      }
    }
    cur = o.e;
  }
  seg(cur, along(b), 0, WH);
}

// ---- Ground floor (left plan)
wall(0, 'h', 51, 40, 512, T_EXT, [[265, 345, 'W']], +1);
wall(0, 'v', 46, 45, 478, T_EXT, [[105, 158, 'K']], +1);
wall(0, 'v', 506, 45, 478, T_EXT, [[155, 205, 'W'], [268, 298, 'V'], [400, 432, 'V']], -1);
wall(0, 'h', 472, 40, 512, T_EXT, [[76, 128, 'D', 's-'], [132, 208, 'W']], -1);
wall(0, 'h', 203, 46, 234, T_INT, [[64, 176, 'P'], [184, 228, 'O']], 0, +1);
wall(0, 'v', 234, 51, 472, T_INT, [[208, 255, 'D', 's+'], [405, 455, 'D', 'e+']]);
wall(0, 'h', 260, 234, 413, T_INT);
wall(0, 'v', 413, 205, 472, T_INT, [[218, 256, 'D', 's+'], [375, 413, 'D', 's+']]);
wall(0, 'h', 205, 413, 506, T_INT);
wall(0, 'h', 363, 413, 506, T_INT);

// ---- First floor (right plan, x offset 665px)
wall(1, 'h', 51, 705, 1177, T_EXT, [[932, 1010, 'W']], +1);
wall(1, 'v', 711, 45, 1035, T_EXT, [[95, 158, 'K'], [490, 598, 'K'], [614, 704, 'K'], [755, 790, 'V'], [925, 1010, 'W']], +1);
wall(1, 'v', 1171, 45, 1035, T_EXT, [[155, 205, 'W'], [297, 333, 'V'], [485, 520, 'V'], [700, 780, 'W'], [975, 1010, 'V']], -1);
wall(1, 'h', 1029, 705, 1177, T_EXT, [[760, 860, 'F'], [920, 995, 'F']], -1);
wall(1, 'h', 203, 711, 899, T_INT, [[729, 841, 'P'], [849, 893, 'O']], 0, +1);
wall(1, 'v', 899, 51, 472, T_INT, [[208, 255, 'D', 's+'], [405, 455, 'D', 'e+']]);
wall(1, 'h', 260, 899, 1171, T_INT, [[1088, 1128, 'D', 's+']]);
wall(1, 'v', 1080, 260, 606, T_INT, [[425, 462, 'D', 's+']]);
wall(1, 'h', 418, 1080, 1171, T_INT);
wall(1, 'h', 544, 1080, 1171, T_INT);
wall(1, 'h', 472, 711, 1080, T_INT, [[735, 790, 'D', 's-'], [795, 875, 'K']]);
wall(1, 'h', 606, 794, 1171, T_INT, [[812, 865, 'K'], [1125, 1163, 'O']]);
wall(1, 'v', 794, 606, 712, T_INT, [[615, 665, 'D', 's+']]);
wall(1, 'h', 712, 711, 800, T_INT);
wall(1, 'v', 800, 712, 840, T_INT);
wall(1, 'h', 840, 711, 899, T_INT, [[760, 795, 'D', 'e-'], [845, 893, 'D', 'e+']]);
wall(1, 'v', 899, 840, 1029, T_INT);
wall(1, 'v', 1003, 606, 880, T_INT, [[818, 868, 'D', 's+']]);
wall(1, 'h', 880, 1003, 1171, T_INT, [[1085, 1120, 'D', 's+']]);
wall(1, 'h', 880, 899, 1003, T_INT, [[905, 948, 'P'], [955, 998, 'O']], 0, -1);
wall(1, 'v', 1077, 880, 1029, T_INT);

// ---------------------------------------------------------------- rooms
const ROOM_DEFS = [
  [0, 'Kitchen', 52, 57, 232, 203, 'ktile'],
  [0, 'Living Hall', 52, 203, 232, 466, 'marble'],
  [0, 'Master Bedroom', 236, 57, 500, 205, 'oak'],
  [0, 'Master Bedroom', 236, 205, 411, 258, 'oak', { nolight: true }],
  [0, 'Bedroom', 236, 262, 411, 466, 'oak'],
  [0, 'Toilet (Master Bedroom)', 415, 207, 500, 361, 'btile'],
  [0, 'Toilet (Bedroom)', 415, 365, 500, 466, 'btile'],
  [0, 'Staircase', 188, 478, 411, 606, null, { lights: [[215, 510], [380, 545]] }],
  [0, 'Parking', 40, 478, 512, 1035, null, { lights: [[120, 640], [400, 640], [120, 900], [270, 900], [420, 900]] }],
  [1, 'Kitchen · Flat A', 717, 57, 897, 203, 'ktile'],
  [1, 'Living Hall · Flat A', 717, 203, 897, 466, 'marble'],
  [1, 'Master Bedroom · Flat A', 901, 57, 1165, 258, 'oak'],
  [1, 'Bedroom · Flat A', 901, 262, 1078, 466, 'oak'],
  [1, 'Toilet (M.Bed) · Flat A', 1082, 262, 1165, 416, 'btile'],
  [1, 'Toilet · Flat A', 1082, 420, 1165, 542, 'btile'],
  [1, 'Study', 1082, 546, 1165, 604, 'oak'],
  [1, 'Lobby', 717, 475, 853, 606, 'marble'],
  [1, 'Passage (4\' wide)', 717, 606, 792, 710, 'marble'],
  [1, 'Living Hall · Flat B', 802, 608, 1001, 838, 'marble'],
  [1, 'Kitchen passage · Flat B', 901, 838, 1001, 880, 'marble', { nolight: true }],
  [1, 'Toilet · Flat B', 717, 714, 798, 838, 'btile'],
  [1, 'Bedroom 3 · Flat B', 717, 842, 897, 1023, 'oak'],
  [1, 'Bedroom 2 · Flat B', 1005, 608, 1165, 878, 'oak'],
  [1, 'Kitchen · Flat B', 901, 882, 1075, 1023, 'ktile'],
  [1, 'Toilet 2 · Flat B', 1079, 882, 1165, 1023, 'btile'],
  [1, 'Staircase', 853, 475, 1078, 606, null, { nolight: true }],
  [2, 'Terrace', 40, 45, 512, 1035, null, { nolight: true }],
];
const ROOMS = ROOM_DEFS.map(([lvl, name, a, b, c, d, floor, extra = {}]) => ({
  lvl, name, floor, extra, x1: X(a, lvl), z1: Z(b), x2: X(c, lvl), z2: Z(d),
  get cx() { return (this.x1 + this.x2) / 2; }, get cz() { return (this.z1 + this.z2) / 2; },
}));

const lightSpots = []; // {x,y,z,lvl,power}
for (const r of ROOMS) {
  const base = r.lvl * FH;
  if (r.floor) {
    floorPlane(r.x1, r.z1, r.x2, r.z2, base + 0.012, floorMat[r.floor], groups[r.lvl]);
  }
  if (r.extra.nolight) continue;
  const spots = r.extra.lights ? r.extra.lights.map(([a, b]) => [X(a, r.lvl), Z(b)]) : [[r.cx, r.cz]];
  const area = (r.x2 - r.x1) * (r.z2 - r.z1);
  for (const [x, z] of spots) {
    if (r.name === 'Staircase') { lightSpots.push({ x, y: 9, z, lvl: 0, power: 0.45 }); lightSpots.push({ x, y: 13, z, lvl: 1, power: 0.45 }); continue; }
    const small = area < 60 || r.name === 'Parking';
    addMesh(new THREE.CylinderGeometry(small ? 0.32 : 0.6, small ? 0.36 : 0.66, 0.1, 28), mats.lightOn, x, base + WH - 0.05, z, groups[r.lvl], false);
    lightSpots.push({ x, y: base + WH - 0.6, z, lvl: r.lvl, power: small ? 0.6 : 1 });
  }
}

// ---------------------------------------------------------------- slabs, roof, structure, facade
{
  const g1 = groups[1];
  const slab = (a, b, c, d, y, grp) => {
    const x1 = X(a), x2 = X(c), z1 = Z(b), z2 = Z(d);
    B(x2 - x1, SLAB, z2 - z1, [mats.wallExt, mats.wallExt, mats.concrete, mats.ceiling, mats.wallExt, mats.wallExt], (x1 + x2) / 2, y - SLAB / 2, (z1 + z2) / 2, grp);
  };
  slab(40, 45, 512, 475, FH, g1); slab(40, 606, 512, 1035, FH, g1);
  slab(40, 475, 189, 606, FH, g1); slab(411, 475, 512, 606, FH, g1);
  slab(40, 45, 512, 475, 2 * FH, roofGroup); slab(40, 606, 512, 1035, 2 * FH, roofGroup);
  slab(40, 475, 189, 606, 2 * FH, roofGroup); slab(411, 475, 512, 606, 2 * FH, roofGroup);
  // roof: parapet on three sides, a black railing on the street side, stair headroom block at the front right
  const px1 = X(40), px2 = X(512), pz1 = Z(45), pz2 = Z(1035), ph = 3, pt = 0.5, py = 2 * FH + ph / 2;
  B(px2 - px1, ph, pt, mats.wallExt, (px1 + px2) / 2, py, pz1 + pt / 2, roofGroup);
  B(pt, ph, pz2 - pz1, mats.wallExt, px1 + pt / 2, py, (pz1 + pz2) / 2, roofGroup);
  B(pt, ph, pz2 - pz1, mats.wallExt, px2 - pt / 2, py, (pz1 + pz2) / 2, roofGroup);
  for (const [a, b, c, d] of [[40, 45, 512, 475], [40, 606, 512, 1035], [40, 475, 182, 606]]) floorPlane(X(a), Z(b), X(c), Z(d), 2 * FH + 0.01, floorMat.btile, roofGroup);
  for (const r of [[px1, pz1, px2, pz1 + pt], [px1, pz1, px1 + pt, pz2], [px2 - pt, pz1, px2, pz2], [px1, pz2 - 0.3, px2, pz2 + 0.3]]) { colliders[2].push(r); mapWalls[2].push(r); }
  // stair room (mumty) over the stairwell, door on the west side onto the terrace
  { const T = 0.5, y0 = 2 * FH, H = 8.5, sx1 = X(182), sx2 = X(417), sz1 = Z(472), sz2 = Z(612);
    const w = (x1, z1, x2, z2, y1 = y0, y2 = y0 + H) => { B(x2 - x1, y2 - y1, z2 - z1, mats.wallExt, (x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2, roofGroup); if (y1 < y0 + 1) { colliders[2].push([x1, z1, x2, z2]); mapWalls[2].push([x1, z1, x2, z2]); } };
    w(sx1, sz1, sx2, sz1 + T); w(sx1, sz2 - T, sx2, sz2); w(sx2 - T, sz1, sx2, sz2);
    w(sx1, sz1, sx1 + T, Z(546)); w(sx1, Z(546), sx1 + T, sz2, y0 + 7, y0 + H);
    B(0.12, 7, Z(600) - Z(546) - 0.6, mats.doorWood, sx1 - 1.2, y0 + 3.5, (Z(546) + Z(600)) / 2, roofGroup); // door, opened outwards
    B(sx2 - sx1 + 0.8, 0.45, sz2 - sz1 + 0.8, mats.wallExt, (sx1 + sx2) / 2, y0 + H + 0.22, (sz1 + sz2) / 2, roofGroup);
    addMesh(new THREE.CylinderGeometry(2.1, 2.1, 4.2, 24), mats.black, sx2 - 3, y0 + H + 2.55, (sz1 + sz2) / 2, roofGroup);
  }
  // clothes-drying shed: steel posts, sloped translucent roof, lines with clothes
  { const y0 = 2 * FH, x1 = X(62), x2 = X(330), z1 = Z(70), z2 = Z(230), steel = mats.rail;
    for (const [x, z, h] of [[x1, z1, 7.6], [x2, z1, 7.6], [x1, z2, 8.4], [x2, z2, 8.4], [(x1 + x2) / 2, z2, 8.4]]) {
      B(0.25, h, 0.25, steel, x, y0 + h / 2, z, roofGroup); colliders[2].push([x - 0.2, z - 0.2, x + 0.2, z + 0.2]);
    }
    const slope = Math.atan2(0.8, z2 - z1), roofLen = Math.hypot(z2 - z1 + 1.2, 0.8);
    B(x2 - x1 + 1.2, 0.06, roofLen, mats.polycarb, (x1 + x2) / 2, y0 + 8.05, (z1 + z2) / 2, roofGroup, false).rotation.x = slope;
    for (let k = 0; k <= 6; k++) B(0.08, 0.12, roofLen, steel, x1 - 0.5 + ((x2 - x1 + 1) * k) / 6, y0 + 7.98, (z1 + z2) / 2, roofGroup).rotation.x = slope;
    const cloth = [0xc0392b, 0xf1f1ec, 0x2e5d9f, 0xe6b84a, 0x7a9a6a, 0xf3d1dc, 0x3c3c44, 0xe07b39];
    for (let li = 0; li < 4; li++) {
      const z = z1 + 1.2 + li * ((z2 - z1 - 2.4) / 3), ly = y0 + 6.2;
      B(x2 - x1, 0.03, 0.03, mats.chrome, (x1 + x2) / 2, ly, z, roofGroup, false);
      let x = x1 + 0.6;
      while (x < x2 - 1.2) {
        const w = 1.2 + rnd() * 1.8, h = 1.6 + rnd() * 2.2, col = cloth[Math.floor(rnd() * cloth.length)];
        const m = new THREE.MeshStandardMaterial({ color: col, map: TEX.fabric, roughness: 1, side: THREE.DoubleSide });
        const c = new THREE.Mesh(curtainPanel(w, h, 2), m);
        c.position.set(x + w / 2, ly - h / 2, z); c.rotation.y = (rnd() - 0.5) * 0.15; c.castShadow = true; roofGroup.add(c);
        x += w + 0.25 + rnd() * 0.6;
      }
    }
  }
  const mx1 = X(250), mx2 = px2, mz1 = Z(840), mz2 = pz2;
  // front right: a low parapet wall, same height as the railing beside it
  B(mx2 - mx1, 4.4, 0.5, mats.wallExt, (mx1 + mx2) / 2, 2 * FH + 2.2, mz2 - 0.25, roofGroup);
  B(mx2 - mx1 + 0.2, 0.15, 0.7, mats.wallExt, (mx1 + mx2) / 2, 2 * FH + 4.47, mz2 - 0.25, roofGroup);
  for (let y = 2 * FH + 1.5; y < 2 * FH + 4.2; y += 1.25) B(mx2 - mx1 + 0.02, 0.05, 0.03, mats.groove, (mx1 + mx2) / 2, y, mz2 + 0.02, roofGroup, false);
  const rz = pz2 + 1.0;
  B(mx1 - px1, 0.12, 0.12, mats.rail, (px1 + mx1) / 2, 2 * FH + 4.4, rz, roofGroup);
  for (let x = px1 + 0.2; x < mx1; x += 0.42) B(0.06, 3.2, 0.06, mats.rail, x, 2 * FH + 2.8, rz, roofGroup, false);
  void mz1;

  // beams and columns of the open parking
  const beam = (a, b, c, d) => { const x1 = X(a), x2 = X(c), z1 = Z(b), z2 = Z(d); B(x2 - x1, 1.25, z2 - z1, mats.wallExt, (x1 + x2) / 2, WH - 0.625, (z1 + z2) / 2, g1); };
  beam(40, 478, 52, 1035); beam(500, 478, 512, 1035); beam(40, 744, 512, 756);
  for (const cx of [46, 188, 352, 506]) for (const cy of [750, 1026]) {
    const x = X(cx), z = Z(cy), s = 1.15;
    B(s, WH, s, mats.white, x, WH / 2, z, groups[0]);
    colliders[0].push([x - s / 2, z - s / 2, x + s / 2, z + s / 2]); mapWalls[0].push([x - s / 2, z - s / 2, x + s / 2, z + s / 2]);
  }

  // ---- front elevation: charcoal box frame around the first floor, wood soffit with downlights,
  // grooved cream panel on the left, charcoal panel with vertical wooden slats on the right.
  const zF = Z(1035), fx1 = X(40) - 0.4, fx2 = X(512) + 0.4, fd = 2.4, fz = zF + fd / 2 - 0.3;
  const fw = fx2 - fx1, fcx = (fx1 + fx2) / 2;
  B(fw, 2.4, fd, mats.charcoal, fcx, 2 * FH + 0.4, fz, roofGroup);          // top band (y 19.2–21.6)
  B(fw, 1.7, fd, mats.charcoal, fcx, FH - 0.55, fz, g1);                    // bottom band (y 8.6–10.3)
  for (const x of [fx1 + 0.55, fx2 - 0.55]) B(1.1, 11.0, fd, mats.charcoal, x, FH + 4.75, fz, g1); // side posts
  const soffitY = 2 * FH - 0.81;
  B(fw - 2.2, 0.06, fd - 0.3, mats.soffit, fcx, soffitY, zF + fd / 2 - 0.15, g1, false);
  for (let i = 0; i < 5; i++) {
    const x = fx1 + 2 + ((fw - 4) * (i + 0.5)) / 5;
    addMesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 20), mats.facadeLight, x, soffitY - 0.04, zF + 1.0, g1, false);
  }
  const split = X(330);
  const winX = [[X(95) - 0.35, X(195) + 0.35], [X(255) - 0.35, X(330) + 0.35]];
  for (let y = FH + 0.9; y < 2 * FH - 1; y += 1.15) {
    const inWin = y > FH + 2.3 && y < FH + 7.8;
    const spans = inWin ? [[fx1 + 1.1, winX[0][0]], [winX[0][1], winX[1][0]]] : [[fx1 + 1.1, split]];
    for (const [a, b] of spans) if (b - a > 0.1) B(b - a, 0.05, 0.04, mats.groove, (a + b) / 2, y, zF + 0.02, g1, false);
  }
  B(fx2 - 1.1 - split, 2 * FH - 0.8 - (FH + 0.3), 0.08, mats.charcoal, (split + fx2 - 1.1) / 2, (FH + 0.3 + 2 * FH - 0.8) / 2, zF + 0.04, g1);
  const sx1 = X(352), sx2 = X(470);
  for (let x = sx1; x < sx2; x += 0.36) B(0.2, 2 * FH - 0.8 - (FH + 0.3) - 0.2, 0.22, mats.slat, x, (FH + 0.3 + 2 * FH - 0.8) / 2, zF + 0.18, g1);
  for (const x of [sx1 + (sx2 - sx1) * 0.28, sx1 + (sx2 - sx1) * 0.72]) {
    B(0.5, 0.6, 0.3, mats.charcoal, x, FH + 5.6, zF + 0.45, g1);
    B(0.4, 0.05, 0.22, mats.facadeLight, x, FH + 5.28, zF + 0.45, g1, false);
  }
  // parking ceiling front soffit trim
  B(fw - 2.2, 0.06, 1.2, mats.soffit, fcx, WH - 1.27, Z(1029), g1, false);
}

// ---------------------------------------------------------------- staircase (open dog-leg, 18 risers, black railing)
const STAIR = { x1: 188, x2: 411, y1: 478, ymid: 542, y2: 606, f1s: 240, land: 350 };
{
  const g = groups[0];
  const tread = new THREE.MeshStandardMaterial({ map: TEX.marble, color: 0xf2eee8, roughness: 0.35 });
  const plaster = [mats.white, mats.white, tread, mats.white, mats.white, mats.white];
  const z1 = Z(STAIR.y1), zm = Z(STAIR.ymid), z2 = Z(STAIR.y2);
  const w1 = (STAIR.land - STAIR.f1s) / 9, w2 = (STAIR.land - STAIR.x1) / 9;
  for (let k = 0; k < 9; k++) {
    const a = X(STAIR.f1s + k * w1), b = X(STAIR.f1s + (k + 1) * w1), top = ((k + 1) * 5) / 9;
    const th = Math.min(top, 1.1); // open underneath: each step is a slab, not a solid block
    B(b - a, th, zm - z1, plaster, (a + b) / 2, top - th / 2, (z1 + zm) / 2, g);
  }
  const la = X(STAIR.land), lb = X(STAIR.x2);
  B(lb - la, 0.6, z2 - z1, plaster, (la + lb) / 2, 5 - 0.3, (z1 + z2) / 2, g);
  // three pillars carry the staircase along its open front edge
  for (const [px, h] of [[STAIR.x1 + 8, 8.9], [STAIR.land + 6, 4.4], [STAIR.x2 - 8, 4.4]]) B(0.85, h, 0.85, mats.white, X(px), h / 2, z2 - 0.45, g);
  for (let j = 0; j < 9; j++) {
    const b = X(STAIR.land - j * w2), a = X(STAIR.land - (j + 1) * w2), top = 5 + ((j + 1) * 5) / 9;
    B(b - a, 1.1, z2 - zm, plaster, (a + b) / 2, top - 0.55, (zm + z2) / 2, g);
  }
  const railLine = (xa, ya, za, xb, yb, zb, grp, posts = true) => {
    const dx = xb - xa, dy = yb - ya, dz = zb - za, L = Math.hypot(dx, dy, dz);
    const m = B(0.1, 0.1, L, mats.rail, (xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2, grp);
    m.lookAt(xb, yb, zb);
    if (!posts) return;
    const n = Math.max(2, Math.round(Math.hypot(dx, dz) / 0.4));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = xa + dx * t, z = za + dz * t, top = ya + dy * t;
      B(0.05, 3, 0.05, mats.rail, x, top - 1.5, z, grp, false);
    }
  };
  // outer (street-side) railing of flight 2 and the landing, and the inner railing between flights
  railLine(X(STAIR.land), 8, z2 - 0.1, X(STAIR.x1 + 3), 13, z2 - 0.1, g);
  railLine(X(STAIR.land), 8, z2 - 0.1, lb - 0.1, 8, z2 - 0.1, g);
  railLine(lb - 0.1, 8, z2 - 0.1, lb - 0.1, 8, z1 + 0.3, g);
  railLine(X(STAIR.land), 8, zm, X(STAIR.x1 + 4), 13, zm, g);
  railLine(X(STAIR.f1s), 3, zm - 0.05, X(STAIR.land), 8, zm - 0.05, g);
  // upper dog-leg: first-floor landing over the stair entry, flight 3 above flight 1, landing at 15ft, flight 4 to the terrace
  const g1 = groups[1], T = 0.7;
  B(X(STAIR.f1s) - X(STAIR.x1), 0.5, zm - z1, plaster, (X(STAIR.x1) + X(STAIR.f1s)) / 2, FH - 0.25, (z1 + zm) / 2, g1);
  floorPlane(X(STAIR.x1), z1, X(STAIR.f1s), zm, FH + 0.012, floorMat.marble, g1);
  for (let k = 0; k < 9; k++) {
    const a = X(STAIR.f1s + k * w1), b = X(STAIR.f1s + (k + 1) * w1), top = FH + ((k + 1) * 5) / 9;
    B(b - a, T, zm - z1, plaster, (a + b) / 2, top - T / 2, (z1 + zm) / 2, g1);
  }
  B(lb - la, 0.6, z2 - z1, plaster, (la + lb) / 2, FH + 5 - 0.3, (z1 + z2) / 2, g1);
  for (let j = 0; j < 9; j++) {
    const b = X(STAIR.land - j * w2), a = X(STAIR.land - (j + 1) * w2), top = FH + 5 + ((j + 1) * 5) / 9;
    B(b - a, T, z2 - zm, plaster, (a + b) / 2, top - T / 2, (zm + z2) / 2, g1);
  }
  railLine(X(STAIR.land), FH + 8, zm, X(STAIR.x1 + 4), FH + 13, zm, g1);
  railLine(X(STAIR.f1s), FH + 3, zm - 0.05, X(STAIR.land), FH + 8, zm - 0.05, g1);
  floorPlane(X(STAIR.x1), z1, X(STAIR.f1s), zm, 0.012, floorMat.marble, g);
}
// Walking surface height. The stairwell holds two stacked dog-leg stairs (0→10ft and 10→20ft);
// pick whichever surface is nearest the current height so you can't drop through.
function stairLow(px, py) {
  if (py < STAIR.ymid) { if (px < STAIR.f1s) return 0; if (px < STAIR.land) return ((px - STAIR.f1s) / (STAIR.land - STAIR.f1s)) * 5; return 5; }
  if (px > STAIR.land) return 5;
  return 5 + Math.min(1, (STAIR.land - px) / (STAIR.land - STAIR.x1)) * 5;
}
function groundAt(x, z, curH) {
  const px = x * PX + 40, py = z * PX + 45;
  if (px >= STAIR.x1 && px <= STAIR.x2 && py >= STAIR.y1 && py <= STAIR.y2) {
    const a = stairLow(px, py), b = a + FH;
    return Math.abs(a - curH) <= Math.abs(b - curH) ? a : b;
  }
  return clamp(Math.round(curH / FH), 0, 2) * FH;
}

// ---------------------------------------------------------------- site and neighbourhood
const roadZ = Z(1041) + 6;
{
  const g = siteGroup;
  floorPlane(-200, -140, 240, 260, -0.04, floorMat.grass, g);
  floorPlane(X(10), Z(10), X(540), Z(1041), 0.0, floorMat.paver, g);
  floorPlane(-200, roadZ, 240, roadZ + 26, -0.01, floorMat.asphalt, g);
  floorPlane(-200, Z(1041), 240, roadZ, -0.005, floorMat.paver, g);
  floorPlane(-200, roadZ + 26, 240, roadZ + 32, -0.005, floorMat.paver, g);
  for (const z of [roadZ - 0.2, roadZ + 26.2]) B(440, 0.45, 0.6, mats.concrete, 20, 0.2, z, g, false);
  for (let x = -190; x < 240; x += 14) B(6, 0.02, 0.4, mats.white, x, 0.0, roadZ + 13, g, false);
  // side boundary: low wall with chain-link fence above; rear wall
  const cw = (a, b, c, d, h = 4.5) => {
    const x1 = X(a), x2 = X(c), z1 = Z(b), z2 = Z(d);
    B(x2 - x1, h, z2 - z1, mats.compound, (x1 + x2) / 2, h / 2, (z1 + z2) / 2, g);
    colliders[0].push([x1, z1, x2, z2]); mapWalls[0].push([x1, z1, x2, z2]);
  };
  cw(7, 7, 16, 1041, 2); cw(534, 7, 543, 1041, 2); cw(7, 7, 543, 16, 6);
  for (const a of [11.5, 538.5]) {
    const x = X(a), z1 = Z(7), z2 = Z(1041);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(z2 - z1, 3.5), mats.chain); f.rotation.y = Math.PI / 2; f.position.set(x, 3.75, (z1 + z2) / 2);
    f.material.map.repeat.set((z2 - z1) / 2, 3.5 / 2); g.add(f);
    for (let z = z1; z <= z2; z += 8) B(0.15, 3.6, 0.15, mats.rail, x, 3.8, z, g);
  }
  // front: corner piers and a full-width black bar gate (centre leaf slid open)
  for (const a of [10, 540]) B(1.4, 6.6, 1.4, mats.white, X(a), 3.3, Z(1041), g);
  colliders[0].push([X(7), Z(1038), X(16), Z(1044)], [X(534), Z(1038), X(543), Z(1044)]);
  const gz = Z(1041), gx1 = X(16), gx2 = X(534), leaf = (gx2 - gx1) / 3;
  const gateLeaf = (x0, z) => {
    const h = 6.2;
    B(leaf, 0.18, 0.18, mats.rail, x0 + leaf / 2, h, z, g);
    B(leaf, 0.18, 0.18, mats.rail, x0 + leaf / 2, 0.35, z, g);
    for (const e of [x0 + 0.09, x0 + leaf - 0.09]) B(0.18, h, 0.18, mats.rail, e, h / 2, z, g);
    for (let x = x0 + 0.35; x < x0 + leaf - 0.2; x += 0.3) B(0.07, h - 0.4, 0.07, mats.rail, x, h / 2, z, g, false);
    colliders[0].push([x0, z - 0.2, x0 + leaf, z + 0.2]);
  };
  gateLeaf(gx1 + leaf, gz); gateLeaf(gx1 + 2 * leaf, gz); gateLeaf(gx1 + leaf + 0.4, gz + 0.45); // left leaf slid open, in line with the main door
  B(gx2 - gx1, 0.12, 0.3, mats.rail, (gx1 + gx2) / 2, 0.06, gz + 0.2, g, false); // track

  // neighbours, trees and street lights
  const hood = buildNeighbourhood({ group: g, colliders: colliders[0], envMap: skyEnv, litMaterials });
  hood.house(-36, -9, -2, 58, 3, 1, 0); // set back so the lobby windows look onto open sky
  hood.house(30.2, 60, -2, 58, 2, 1, 1);
  hood.house(-63, -33.5, -2, 58, 2, 1, 2);
  hood.house(61, 91, -2, 58, 3, 1, 3);
  hood.house(-94, -64.5, -2, 58, 2, 1, 5);
  hood.house(92, 121, -2, 58, 2, 1, 6);
  const az = roadZ + 32;
  [[-94, -64, 2], [-62, -33, 3], [-31, -2, 2], [0, 29, 3], [31, 60, 2], [62, 91, 2], [93, 122, 3]].forEach(([a, b, f], i) => hood.house(a, b, az, az + 56, f, -1, i + 2));
  [[-63, -33], [-31, -2], [0, 29], [31, 60]].forEach(([a, b], i) => hood.house(a, b, -64, -6, 2, -1, i + 4));
  for (const x of [-62, -22, 48, 88]) streetLight(g, x, roadZ - 1.2, 1, litMaterials);
  [[-14, roadZ - 2.5], [44, roadZ - 2.5], [74, roadZ - 2.5], [-46, roadZ - 2.5], [-20, roadZ + 28.5], [16, roadZ + 28.5], [52, roadZ + 28.5], [88, roadZ + 28.5]].forEach(([x, z], i) => tree(g, x, z, 0.9 + (i % 3) * 0.12, i + 3));
}

// ---------------------------------------------------------------- furniture helpers
const R = (lvl, a, b, c, d) => { const x1 = X(a, lvl), x2 = X(c, lvl), z1 = Z(b), z2 = Z(d); return { lvl, x1, z1, x2, z2, cx: (x1 + x2) / 2, cz: (z1 + z2) / 2, w: x2 - x1, d: z2 - z1, y: lvl * FH }; };
const lb = (g, w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
const rb = (g, w, h, d, rad, mat, x, y, z) => {
  const r0 = Math.min(rad, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.max(0.01, r0)), mat); m.position.set(x, y, z); g.add(m); return m;
};
// Upholstery: a finely subdivided rounded box, puffed out in the middle of one axis, smooth-shaded.
const cushionCache = new Map();
function cushionGeo(w, h, d, r, puff = 0, axis = 'y') {
  const key = [w, h, d, r, puff, axis].map((v) => (typeof v === 'number' ? v.toFixed(2) : v)).join();
  if (cushionCache.has(key)) return cushionCache.get(key);
  const n = (v) => Math.min(20, Math.max(6, Math.round(v / 0.2)));
  let g = new THREE.BoxGeometry(w, h, d, n(w), n(h), n(d));
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const p = g.attributes.position, hw = w / 2, hh = h / 2, hd = d / 2;
  r = Math.min(r, hw - 0.005, hh - 0.005, hd - 0.005);
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(clamp(v.x, -hw + r, hw - r), clamp(v.y, -hh + r, hh - r), clamp(v.z, -hd + r, hd - r));
    const dir = v.clone().sub(c); if (dir.lengthSq() > 1e-10) v.copy(c).add(dir.normalize().multiplyScalar(r));
    if (puff) {
      const fx = 1 - (v.x / hw) ** 2, fy = 1 - (v.y / hh) ** 2, fz = 1 - (v.z / hd) ** 2;
      if (axis === 'y') v.y += Math.sign(v.y) * puff * fx * fz;
      else if (axis === 'z') v.z += Math.sign(v.z) * puff * fx * fy;
      else v.x += Math.sign(v.x) * puff * fy * fz;
    }
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + p.getZ(i)) * 0.6; uv[i * 2 + 1] = p.getY(i) * 0.6; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  cushionCache.set(key, g);
  return g;
}
const cu = (g, w, h, d, r, puff, axis, mat, x, y, z) => { const m = new THREE.Mesh(cushionGeo(w, h, d, r, puff, axis), mat); m.position.set(x, y, z); g.add(m); return m; };
const lc = (g, rt, rbot, h, mat, x, y, z, seg = 24) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rbot, h, seg), mat); m.position.set(x, y, z); g.add(m); return m; };
const ROT = { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };
function place(r, back, build, collide = true) {
  const g = new THREE.Group(), ew = back === 'e' || back === 'w';
  build(g, ew ? r.d : r.w, ew ? r.w : r.d);
  g.rotation.y = ROT[back]; g.position.set(r.cx, r.y, r.cz);
  g.traverse((o) => { if (o.isMesh && !o.userData.noShadow && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
  groups[r.lvl].add(g);
  if (collide) colliders[r.lvl].push([r.x1, r.z1, r.x2, r.z2]);
  return g;
}
const leafy = (g, x, y, z, s = 1) => {
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry((0.35 + rnd() * 0.25) * s, 0), i % 2 ? mats.leaf : mats.leaf2);
    m.position.set(x + (rnd() - 0.5) * 0.9 * s, y + rnd() * 1.6 * s, z + (rnd() - 0.5) * 0.9 * s); m.scale.set(1, 0.55, 1.4);
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); g.add(m);
  }
};
let bedI = 0;
const bed = (r, back) => { const accent = [mats.rust, mats.taupe, mats.olive, mats.greige][bedI++ % 4]; place(r, back, (g, W, L) => {
  lb(g, W + 0.1, 0.9, L, mats.walnut, 0, 0.75, 0);                                   // walnut bed frame
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lb(g, 0.25, 0.3, 0.25, mats.walnut, sx * (W / 2 - 0.2), 0.15, sz * (L / 2 - 0.2));
  cu(g, W - 0.15, 0.8, L - 0.3, 0.2, 0.05, 'y', mats.linen, 0, 1.55, 0.05);           // mattress
  cu(g, W + 0.1, 0.3, L * 0.68, 0.14, 0.08, 'y', mats.linen, 0, 2.0, L * 0.15);       // duvet
  cu(g, W + 0.2, 0.18, L * 0.22, 0.08, 0.04, 'y', accent, 0, 2.17, L * 0.34);         // bed runner
  for (const sx of [-1, 1]) {
    const p1 = cu(g, W * 0.42, 0.5, 1.1, 0.22, 0.18, 'z', mats.linen, (sx * W) / 4.3, 2.3, -L / 2 + 0.95); p1.rotation.x = -0.35;
    const p2 = cu(g, W * 0.3, 0.42, 0.95, 0.2, 0.15, 'z', accent, (sx * W) / 5.2, 2.25, -L / 2 + 1.55); p2.rotation.x = -0.5;
  }
  lb(g, W + 0.5, 4.0, 0.3, mats.walnut, 0, 2.0, -L / 2 + 0.12);                     // walnut headboard panel
  cu(g, W - 0.2, 2.0, 0.3, 0.12, 0.06, 'z', mats.linenWarm, 0, 2.9, -L / 2 + 0.36);  // upholstered inset
}); };
const nightstand = (r) => place(r, 'n', (g, W, L) => {
  rb(g, W, 1.7, L, 0.06, mats.white, 0, 1.0, 0);
  lb(g, W - 0.2, 0.02, 0.02, mats.shadowLine, 0, 1.2, L / 2);
  for (const sx of [-1, 1]) lb(g, 0.08, 0.2, 0.08, mats.walnut, sx * (W / 2 - 0.15), 0.1, 0);
  lc(g, 0.2, 0.28, 0.9, mats.pot, 0, 2.3, -0.1); lc(g, 0.38, 0.5, 0.65, mats.lamp, 0, 3.05, -0.1, 28);
});
const wardrobe = (r, back) => place(r, back, (g, W, L) => {
  lb(g, W, 7.6, L, mats.walnut, 0, 3.8, 0);
  const n = Math.max(2, Math.round(W / 1.7));
  for (let i = 1; i < n; i++) lb(g, 0.03, 7.4, 0.04, mats.black, -W / 2 + (W * i) / n, 3.8, L / 2 + 0.01);
  for (let i = 0; i < n; i++) lb(g, 0.05, 1.6, 0.07, mats.brass, -W / 2 + (W * (i + 0.5)) / n + (i % 2 ? -0.3 : 0.3) * Math.min(1, W / n / 1.4), 3.9, L / 2 + 0.04);
  lb(g, W, 0.03, L, mats.black, 0, 0.3, 0.01);
});
const rug = (r, mat = mats.rug) => { const g = groups[r.lvl]; B(r.w, 0.035, r.d, mat, r.cx, r.y + 0.03, r.cz, g, false); B(r.w + 0.3, 0.03, r.d + 0.3, mats.linenWarm, r.cx, r.y + 0.025, r.cz, g, false); };
let sofaI = 0;
// Modern sofa section: slim walnut legs, a padded base, separate puffy seat and back cushions,
// rounded arms and a few throw pillows.
const sofa = (r, back, arms = [1, 1], matIn) => { const mat = matIn || [mats.sofa, mats.sofaGreige, mats.sofa][sofaI++ % 3]; place(r, back, (g, W, L) => {
  const legH = 0.42, baseH = 0.75, top = legH + baseH;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = lc(g, 0.06, 0.04, legH, mats.walnut, sx * (W / 2 - 0.35), legH / 2, sz * (L / 2 - 0.3), 10); l.rotation.z = sx * 0.06; }
  cu(g, W, baseH, L, 0.14, 0.02, 'y', mat, 0, legH + baseH / 2, 0);
  cu(g, W, 1.75, 0.5, 0.2, 0.04, 'z', mat, 0, top + 0.75, -L / 2 + 0.25);                // back frame
  const armW = 0.6, armH = 1.25;
  if (arms[0]) cu(g, armW, armH + baseH, L, 0.26, 0.05, 'x', mat, -W / 2 + armW / 2, legH + (armH + baseH) / 2, 0);
  if (arms[1]) cu(g, armW, armH + baseH, L, 0.26, 0.05, 'x', mat, W / 2 - armW / 2, legH + (armH + baseH) / 2, 0);
  const inner = W - (arms[0] + arms[1]) * armW, n = Math.max(1, Math.round(inner / 2.6)), cw = inner / n;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + arms[0] * armW + cw * (i + 0.5);
    cu(g, cw - 0.04, 0.5, L - 0.55, 0.2, 0.08, 'y', mat, x, top + 0.25, 0.25);           // seat cushion
    const bc = cu(g, cw - 0.06, 1.45, 0.55, 0.25, 0.12, 'z', mat, x, top + 1.05, -L / 2 + 0.75); bc.rotation.x = -0.14; // back cushion
  }
  const pillows = [[mats.boucle, 0.18], [mats.rust, -0.12], [mats.taupe, 0.1], [mats.olive, -0.2]];
  const np = Math.min(pillows.length, Math.max(1, Math.round(inner / 2.2)));
  for (let i = 0; i < np; i++) {
    const [pm, rot] = pillows[(i + sofaI) % pillows.length];
    const x = -W / 2 + arms[0] * armW + (inner * (i + 0.5)) / np;
    const p = cu(g, 1.35, 1.3, 0.42, 0.2, 0.16, 'z', pm, x, top + 1.1, -L / 2 + 1.25); p.rotation.set(-0.25, 0, rot);
  }
}); };
const coffeeTable = (r) => place(r, 'n', (g, W, L) => {
  const rad = Math.min(W, L) / 2;
  lc(g, rad, rad, 0.14, mats.walnut, 0, 1.4, 0, 48);
  lc(g, rad - 0.05, rad - 0.05, 0.02, mats.glass, 0, 1.48, 0, 48);
  lc(g, rad * 0.5, rad * 0.55, 1.3, mats.walnut, 0, 0.67, 0, 32);
  lb(g, 0.9, 0.12, 0.65, mats.rust, -0.45, 1.53, -0.2); lb(g, 0.8, 0.1, 0.6, mats.linen, -0.45, 1.64, -0.2);
  plantQueue.push(['plant_zz', r.lvl, r.cx + 0.4, r.cz + 0.15, { world: true, y: 1.49, h: 1.25, collide: false }]);
});
const tv = (r, back) => place(r, back, (g, W, L) => {
  lb(g, W * 0.95, 2.9, 0.12, mats.walnut, 0, 4.3, -L / 2 + 0.04); // walnut TV wall panel
  lb(g, Math.min(4.4, W * 0.72), 2.5, 0.08, mats.screen, 0, 4.3, -L / 2 + 0.08);
});
const counter = (r, hood = false) => {
  const g = groups[r.lvl];
  B(r.w, 2.75, r.d, mats.walnut, r.cx, r.y + 1.375, r.cz, g);
  B(r.w + 0.06, 0.12, r.d + 0.06, mats.quartz, r.cx, r.y + 2.81, r.cz, g);
  B(r.w - 0.1, 0.3, r.d - 0.1, mats.shadowLine, r.cx, r.y + 0.15, r.cz, g);
  colliders[r.lvl].push([r.x1, r.z1, r.x2, r.z2]);
  void hood;
};
const uppers = (r) => { const g = groups[r.lvl]; B(r.w, 2.3, r.d, mats.matteWhite, r.cx, r.y + 6.1, r.cz, g); B(r.w, 0.04, r.d, mats.lightOn, r.cx, r.y + 4.93, r.cz, g, false); };
const sink = (lvl, px, py) => {
  const x = X(px, lvl), z = Z(py), y = lvl * FH + 2.88, g = groups[lvl];
  B(2.4, 0.03, 1.4, mats.steel, x, y, z, g, false);
  B(1.9, 0.04, 1.1, mats.black, x, y + 0.005, z, g, false);
  const tap = addMesh(new THREE.TorusGeometry(0.35, 0.04, 8, 16, Math.PI), mats.chrome, x, y + 0.6, z - 0.55, g);
  tap.rotation.y = Math.PI / 2;
  addMesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), mats.chrome, x, y + 0.3, z - 0.55 - 0.35, g);
};
const hob = (lvl, px, py, horiz = false) => {
  const x = X(px, lvl), z = Z(py), y = lvl * FH + 2.89, g = groups[lvl];
  B(horiz ? 2.4 : 1.7, 0.03, horiz ? 1.7 : 2.4, mats.screen, x, y, z, g, false);
  for (const [a, b] of [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.45], [0.5, 0.45]]) {
    const [ox, oz] = horiz ? [a, b] : [b, a];
    addMesh(new THREE.TorusGeometry(0.22, 0.015, 6, 24), mats.steel, x + ox, y + 0.02, z + oz, g, false).rotation.x = Math.PI / 2;
  }
};
const chimney = (lvl, px, py, wallX) => { // wall-mounted hood above a hob on an x-wall
  const x = X(px, lvl), z = Z(py), g = groups[lvl], y = lvl * FH;
  const s = Math.sign(x - wallX);
  B(1.8, 0.5, 2.6, mats.matteWhite, wallX + s * 0.95, y + 5.6, z, g);
  B(0.9, 2.6, 1.0, mats.matteWhite, wallX + s * 0.5, y + 7.1, z, g);
};
const dining = (lvl, px, py) => {
  const g = new THREE.Group(), x = X(px, lvl), z = Z(py);
  lc(g, 1.35, 1.35, 0.1, mats.walnut, 0, 2.5, 0, 40); lc(g, 0.08, 0.08, 2.4, mats.black, 0, 1.25, 0, 10); lc(g, 0.6, 0.6, 0.06, mats.black, 0, 0.03, 0, 24);
  for (const a of [0.5, Math.PI + 0.5]) {
    const c = new THREE.Group(); c.position.set(Math.cos(a) * 1.7, 0, Math.sin(a) * 1.7); c.rotation.y = -a + Math.PI / 2;
    rb(c, 1.25, 0.2, 1.2, 0.08, mats.linen, 0, 1.55, 0); rb(c, 1.25, 1.2, 0.15, 0.06, mats.walnut, 0, 2.3, -0.55);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) lc(c, 0.04, 0.04, 1.5, mats.walnut, sx * 0.5, 0.75, sz * 0.48, 8);
    g.add(c);
  }
  lc(g, 0.25, 0.18, 0.6, mats.pot, 0, 2.85, 0, 16); leafy(g, 0, 3.0, 0, 0.4);
  g.position.set(x, lvl * FH, z); g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  groups[lvl].add(g); colliders[lvl].push([x - 1.4, z - 1.4, x + 1.4, z + 1.4]);
};
const wc = (r, back) => place(r, back, (g, W, L) => {
  const bowl = rb(g, 1.25, 1.25, 1.75, 0.5, mats.porcelain, 0, 0.75, 0.3);
  void bowl; rb(g, 1.3, 0.1, 1.8, 0.05, mats.white, 0, 1.42, 0.3);
  rb(g, 1.5, 1.4, 0.55, 0.15, mats.porcelain, 0, 2.1, -L / 2 + 0.3);
  lb(g, 0.3, 0.06, 0.15, mats.chrome, 0, 2.83, -L / 2 + 0.3);
});
const basin = (r, back) => place(r, back, (g, W, L) => {
  rb(g, W, 1.2, L, 0.06, mats.walnut, 0, 2.1, 0);
  rb(g, W * 0.7, 0.35, L * 0.75, 0.15, mats.porcelain, 0, 2.85, 0.05);
  lc(g, 0.04, 0.04, 0.55, mats.chrome, 0, 3.1, -L / 2 + 0.12, 8);
  const mir = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(W, 2.4) / 2, Math.min(W, 2.4) / 2, 0.04, 40), mats.mirror);
  mir.rotation.x = Math.PI / 2; mir.position.set(0, 4.7, -L / 2 + 0.03); g.add(mir);
}, false);
const washer = (r, back) => place(r, back, (g, W, L) => {
  const s = Math.min(W, L, 2.0);
  rb(g, s, 2.8, s, 0.08, mats.white, 0, 1.4, 0);
  const door = lc(g, 0.62, 0.62, 0.06, mats.screen, 0, 1.45, s / 2, 32); door.rotation.x = Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.06, 8, 32), mats.chrome); ring.position.set(0, 1.45, s / 2 + 0.03); g.add(ring);
});
const shower = (lvl, px, py) => {
  const x = X(px, lvl), z = Z(py), g = groups[lvl];
  addMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 24), mats.chrome, x, lvl * FH + 7.1, z, g);
  addMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), mats.chrome, x, lvl * FH + 7.5, z, g);
};
const car = (r, back, type, color, metallic) => place(r, back, (g, W, L) => {
  const c = makeCar({ type, color, envMap: skyEnv, metallic });
  const s = Math.min(W / c.userData.size.W, L / c.userData.size.L) * 1.02;
  c.scale.setScalar(s); g.add(c);
  c.traverse((o) => { if (o.isMesh && o.material.transparent) o.userData.noShadow = true; });
});
const desk = (r, back) => place(r, back, (g, W, L) => {
  rb(g, W, 0.12, L, 0.04, mats.oakSolid, 0, 2.5, 0);
  for (const s of [-1, 1]) lb(g, 0.08, 2.45, L - 0.2, mats.alu, s * (W / 2 - 0.1), 1.22, 0);
  lb(g, 1.7, 1.05, 0.06, mats.screen, 0, 3.25, -L / 2 + 0.25); lb(g, 0.1, 0.6, 0.1, mats.alu, 0, 2.8, -L / 2 + 0.3);
  rb(g, 1.5, 0.18, 1.4, 0.07, mats.linen, 0, 1.6, L / 2 + 0.9); rb(g, 1.5, 1.4, 0.15, 0.07, mats.linen, 0, 2.4, L / 2 + 1.55);
}, true);
// Plants are scanned models; they're queued here and placed once the model loader exists.
const plantQueue = [];
const plant = (lvl, px, py, big = true) => {
  const x = X(px, lvl), z = Z(py);
  plantQueue.push([big ? 'plant_banana' : 'plant_zz', lvl, x, z, { world: true, h: big ? 5.2 : 2.7, collide: false, rot: plantQueue.length * 1.3 }]);
  colliders[lvl].push([x - 0.6, z - 0.6, x + 0.6, z + 0.6]);
};
let artI = 0;
// framed print on a wall: (lvl, centre px, py, side the art faces: n/s/e/w, width ft)
const art = (lvl, px, py, faces, w = 2.4, h = 3, y = 5.2) => {
  const g = new THREE.Group(), tex = artTexture(artI++);
  lb(g, w + 0.22, h + 0.22, 0.08, mats.walnut, 0, 0, 0);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 })); p.position.z = 0.045; g.add(p);
  g.position.set(X(px, lvl), lvl * FH + y, Z(py)); g.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[faces];
  groups[lvl].add(g);
};
const shoeRack = (r, back) => place(r, back, (g, W, L) => { rb(g, W, 3, L, 0.05, mats.oakSolid, 0, 1.5, 0); lb(g, W, 0.02, 0.03, mats.oakDark, 0, 1.5, L / 2); });

// ---------------------------------------------------------------- furnish: ground floor
counter(R(0, 52, 57, 88, 200)); counter(R(0, 88, 57, 232, 93));
uppers(R(0, 92, 57, 232, 77)); sink(0, 150, 76); hob(0, 70, 130, false);
sofa(R(0, 54, 232, 106, 390), 'w', [1, 0], mats.sofaGreige); sofa(R(0, 106, 232, 170, 284), 'n', [0, 1], mats.sofaGreige);
coffeeTable(R(0, 120, 304, 172, 356)); rug(R(0, 96, 222, 212, 382));
tv(R(0, 214, 250, 232, 355), 'e'); plant(0, 212, 445); art(0, 53, 300, 'e', 3.2, 2.4);
bed(R(0, 260, 62, 358, 172), 'n'); nightstand(R(0, 238, 62, 258, 84)); nightstand(R(0, 360, 62, 380, 84));
wardrobe(R(0, 474, 60, 500, 172), 'e'); rug(R(0, 248, 145, 372, 205), mats.rug2); art(0, 238, 120, 'e', 2.4, 3.0, 5.4);
bed(R(0, 262, 268, 350, 372), 'n'); nightstand(R(0, 240, 268, 259, 288)); nightstand(R(0, 353, 268, 372, 288));
wardrobe(R(0, 382, 268, 409, 378), 'e'); rug(R(0, 252, 345, 362, 402), mats.rug2); art(0, 306, 264, 's', 2.2, 2.8, 6.3); plant(0, 395, 445, false);
wc(R(0, 452, 210, 482, 248), 'n'); washer(R(0, 440, 322, 478, 359), 's'); basin(R(0, 480, 300, 500, 330), 'e'); shower(0, 494, 283);
wc(R(0, 444, 430, 474, 468), 's'); basin(R(0, 462, 366, 496, 382), 'n'); shower(0, 494, 416);
// path from the open left gate to the main door: stone walkway, doormat and planters
{ const g = groups[0], stone = new THREE.MeshStandardMaterial({ color: 0x8c857b, roughness: 0.9, bumpMap: TEX.boucle, bumpScale: 0.6 });
  for (let pz = 495; pz < 1030; pz += 34) B(X(130) - X(66), 0.06, 1.4, stone, (X(66) + X(130)) / 2, 0.03, Z(pz), g, false);
  B(X(122) - X(74), 0.04, 1.6, mats.greige, (X(74) + X(122)) / 2, 0.03, Z(486), g, false);
  plant(0, 58, 495, false); plant(0, 142, 495, false); }
car(R(0, 218, 768, 322, 1012), 's', 'sedan', 0x0b0c0e, 0.4);
car(R(0, 376, 768, 484, 1012), 'n', 'suv', 0x0b0c0e, 0.4);

// ---------------------------------------------------------------- furnish: first floor (right-plan coordinates)
counter(R(1, 717, 57, 753, 200)); counter(R(1, 753, 57, 897, 93));
uppers(R(1, 757, 57, 897, 77)); sink(1, 818, 76); hob(1, 735, 130, false);
sofa(R(1, 719, 232, 771, 390), 'w', [1, 0], mats.sofa); sofa(R(1, 771, 232, 835, 284), 'n', [0, 1], mats.sofa);
coffeeTable(R(1, 785, 304, 837, 356)); rug(R(1, 761, 222, 877, 382)); tv(R(1, 879, 250, 897, 355), 'e');
plant(1, 877, 445); art(1, 718, 300, 'e', 3.2, 2.4);
bed(R(1, 930, 62, 1026, 172), 'n'); nightstand(R(1, 906, 62, 926, 84)); nightstand(R(1, 1029, 62, 1049, 84));
wardrobe(R(1, 1139, 60, 1165, 172), 'e'); rug(R(1, 918, 145, 1040, 205), mats.rug2); art(1, 903, 120, 'e', 2.4, 3.0, 5.4);
bed(R(1, 928, 268, 1016, 372), 'n'); nightstand(R(1, 906, 268, 925, 288)); nightstand(R(1, 1019, 268, 1038, 288));
wardrobe(R(1, 1050, 268, 1077, 378), 'e'); art(1, 972, 264, 's', 2.2, 2.8, 6.3);
wc(R(1, 1128, 266, 1158, 304), 'n'); washer(R(1, 1100, 370, 1140, 413), 's'); basin(R(1, 1147, 318, 1165, 348), 'e'); shower(1, 1159, 312);
wc(R(1, 1108, 505, 1138, 541), 's'); basin(R(1, 1128, 422, 1162, 438), 'n'); shower(1, 1159, 500);
desk(R(1, 1088, 548, 1160, 566), 'n');
shoeRack(R(1, 719, 478, 735, 540), 'w'); plant(1, 730, 590, false);
// Flat B
sofa(R(1, 949, 680, 1001, 800), 'e', [1, 0], mats.sofaTaupe); sofa(R(1, 885, 748, 949, 800), 's', [0, 1], mats.sofaTaupe);
coffeeTable(R(1, 874, 682, 926, 734)); rug(R(1, 840, 640, 958, 800)); tv(R(1, 802, 700, 818, 790), 'w'); plant(1, 988, 822);
art(1, 940, 610, 's', 2.6, 1.9);
wc(R(1, 737, 716, 767, 754), 'n'); basin(R(1, 782, 726, 798, 756), 'e'); shower(1, 720, 800);
bed(R(1, 776, 905, 895, 1000), 'e'); nightstand(R(1, 877, 884, 895, 902)); nightstand(R(1, 877, 1003, 895, 1021));
wardrobe(R(1, 713, 848, 741, 918), 'w'); rug(R(1, 758, 920, 840, 990), mats.rug2); art(1, 895, 952, 'w', 2.4, 1.5, 6.7);
bed(R(1, 1033, 688, 1160, 800), 'e'); nightstand(R(1, 1145, 668, 1165, 686)); nightstand(R(1, 1145, 802, 1165, 820));
wardrobe(R(1, 1012, 610, 1120, 636), 'n'); rug(R(1, 1018, 700, 1100, 790), mats.rug2); art(1, 1164, 744, 'w', 2.4, 1.5, 6.7);
counter(R(1, 901, 882, 937, 1027)); counter(R(1, 937, 1000, 1075, 1027));
uppers(R(1, 901, 890, 920, 900)); hob(1, 919, 930, false); chimney(1, 919, 930, X(899, 1) + 0.2); sink(1, 990, 1013);
wc(R(1, 1115, 985, 1145, 1025), 's'); washer(R(1, 1124, 884, 1165, 930), 'e'); basin(R(1, 1079, 946, 1095, 976), 'w'); shower(1, 1159, 960);

// ---------------------------------------------------------------- lighting (kept deliberately soft)
const hemi = new THREE.HemisphereLight(0xdfeaff, 0xb59c80, 0.32);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
const center = new THREE.Vector3(X(276), 0, Z(560));
sun.position.set(center.x - 50, 75, center.z + 60); sun.target.position.copy(center);
sun.castShadow = true;
{ const ms = LOWQ ? 1024 : isTouch ? 2048 : 4096; sun.shadow.mapSize.set(ms, ms); }
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 10, far: 260 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05; sun.shadow.radius = 3;
scene.add(sun, sun.target);
const POOL = 8, pool = [];
for (let i = 0; i < POOL; i++) { const l = new THREE.PointLight(0xffd9b0, 0, 22, 2); scene.add(l); pool.push(l); }
let night = false;
function assignLights(lvlHint) {
  const p = camera.position;
  const sorted = lightSpots.map((s) => ({ s, d: (s.x - p.x) ** 2 + (s.z - p.z) ** 2 + (s.lvl === lvlHint ? 0 : 1600) })).sort((a, b) => a.d - b.d);
  for (let i = 0; i < POOL; i++) {
    const s = sorted[i]?.s; if (!s) { pool[i].intensity = 0; continue; }
    pool[i].position.set(s.x, s.y, s.z);
    pool[i].intensity = s.power * (night ? 34 : 7);
  }
}
function setNight(v) {
  night = v;
  sun.intensity = v ? 0 : 2.6; hemi.intensity = v ? 0.05 : 0.32;
  scene.environmentIntensity = v ? 0.08 : 0.7;
  scene.background = v ? nightSky : daySky;
  scene.fog.color.copy(v ? NIGHT_FOG : HORIZON);
  mats.lightOn.emissiveIntensity = v ? 1.6 : 0.35;
  mats.lamp.emissiveIntensity = v ? 1.0 : 0.18;
  mats.facadeLight.emissiveIntensity = v ? 2.5 : 0.6;
  for (const m of litMaterials) m.emissiveIntensity = v ? 1.4 : 0;
  document.getElementById('bNight').classList.toggle('on', v);
  document.getElementById('bNight').textContent = v ? 'Day' : 'Night';
}

// ---------------------------------------------------------------- scanned assets (Poly Haven, CC0)
// Real-world-scale models, floor textures and a photographed sky. They stream in after the
// house is already walkable, replacing the code-built stand-ins.
const M2FT = 3.28084;
const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const modelCache = {};
const loadModel = (id) => (modelCache[id] ||= gltf.loadAsync(`./models/${id}.glb`).then((g) => {
  g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g.scene;
}));
const FACE = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 }; // model front (+z) turned to face this way
// opts: face, scale (default real size), fit [w, d] in ft to scale down into, y (base height), hang (top at ceiling), collide
function model(id, lvl, px, py, opts = {}) {
  const x = opts.world ? px : X(px, lvl), z = opts.world ? py : Z(py), base = lvl * FH;
  return loadModel(id).then((src) => {
    const m = src.clone();
    let k = M2FT * (opts.scale || 1);
    m.scale.setScalar(k); m.rotation.y = (FACE[opts.face] ?? opts.rot ?? 0);
    if (opts.h) { const b0 = new THREE.Box3().setFromObject(m); m.scale.multiplyScalar(opts.h / (b0.max.y - b0.min.y)); }
    if (opts.w) { const b0 = new THREE.Box3().setFromObject(m); m.scale.multiplyScalar(opts.w / Math.max(b0.max.x - b0.min.x, b0.max.z - b0.min.z)); }
    if (opts.fit) {
      const b = new THREE.Box3().setFromObject(m), sz = b.getSize(new THREE.Vector3());
      const f = Math.min(1, opts.fit[0] / sz.x, opts.fit[1] / sz.z); m.scale.multiplyScalar(f);
    }
    const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new THREE.Vector3());
    const y = opts.hang ? base + WH - b.max.y : base + (opts.y || 0) - b.min.y;
    m.position.set(x - c.x, y, z - c.z);
    groups[lvl].add(m);
    if (opts.collide !== false && !opts.hang) {
      const bb = new THREE.Box3().setFromObject(m);
      colliders[lvl].push([bb.min.x + 0.15, bb.min.z + 0.15, bb.max.x - 0.15, bb.max.z - 0.15]);
    }
    return m;
  }).catch((e) => console.warn('model', id, e));
}
for (const q of plantQueue) model(...q);
// living rooms: accent leather armchair, oak side table, walnut slatted TV sideboard, vases
for (const [lvl, cx, cy, face, sx, sy] of [[0, 186, 420, 'n', 74, 408], [1, 851, 420, 'n', 739, 408], [1, 840, 640, 'e', 984, 664]]) {
  model('side_table_01', lvl, sx, sy, { scale: 0.95 });
  model('potted_plant_04', lvl, sx, sy, { y: 1.5, scale: 1.4, collide: false });
}
for (const [lvl, px, py, face, len] of [[0, 228, 302, 'w', 5.9], [1, 893, 302, 'w', 5.9], [1, 806, 745, 'e', 5.0]]) {
  model('modern_wooden_cabinet', lvl, px, py, { face, fit: [len, len] }).then((m) => {
    if (!m) return;
    const b = new THREE.Box3().setFromObject(m);
    model('ceramic_vase_01', lvl, px, py - 28, { y: b.max.y - lvl * FH, scale: 1.1, collide: false });
    model('ceramic_vase_03', lvl, px, py + 30, { y: b.max.y - lvl * FH, scale: 1.2, collide: false });
  });
}
// ceiling fans in bedrooms and living halls (an Indian-home staple)
for (const [lvl, px, py] of [[0, 142, 330], [0, 310, 150], [0, 324, 368], [1, 807, 330], [1, 975, 150], [1, 990, 368], [1, 900, 700], [1, 808, 960], [1, 1085, 744]]) model('ceiling_fan_crompton', lvl, px, py, { hang: true, w: 4.2 });
// globe pendants over each kitchen serving hatch
for (const [lvl, px, py] of [[0, 95, 214], [0, 145, 214], [1, 760, 214], [1, 810, 214], [1, 926, 869]]) model('modern_ceiling_lamp_01', lvl, px, py, { hang: true, scale: 0.6 });
// lounge chairs in the master bedrooms
model('mid_century_lounge_chair', 0, 448, 182, { rot: Math.PI * 0.8, scale: 0.9 });
model('mid_century_lounge_chair', 1, 1113, 182, { rot: Math.PI * 0.8, scale: 0.9 });
// terrace plants
for (const [px, py] of [[70, 980], [230, 980], [70, 700], [480, 300]]) model('potted_plant_02', 2, px, py, { scale: 1.3 });

// scanned floors: warm oak planks and cream limestone
{
  const tl = new THREE.TextureLoader();
  const pbr = (name, tileFt, mat, rough = 1) => {
    const set = (t, srgb) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
    tl.load(`./textures/${name}_diff.jpg`, (t) => { mat.map = set(t, true); mat.color.set(0xffffff); mat.needsUpdate = true; });
    tl.load(`./textures/${name}_nor.jpg`, (t) => { mat.normalMap = set(t); mat.normalScale.set(0.8, 0.8); mat.bumpMap = null; mat.needsUpdate = true; });
    tl.load(`./textures/${name}_rough.jpg`, (t) => { mat.roughnessMap = set(t); mat.roughness = rough; mat.needsUpdate = true; });
    mat.userData.tile = tileFt;
  };
  pbr('wood_floor', 5.58, floorMat.oak, 0.9);
  pbr('marble_01', 4.92, floorMat.marble, 0.8);
}
// photographed sky (partly cloudy) for the background and for reflections on cars and glass
new RGBELoader().load('./textures/sky_2k.hdr', (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const old = skyEnv, env = pmrem.fromEquirectangular(hdr).texture;
  scene.traverse((o) => { if (!o.isMesh) return; for (const m of [].concat(o.material)) if (m.envMap === old) { m.envMap = env; m.needsUpdate = true; } });
  for (const m of Object.values(mats)) if (m.envMap === old) { m.envMap = env; m.needsUpdate = true; }
  skyEnv = env; daySky = hdr;
  if (!night) scene.background = hdr;
});

// ---------------------------------------------------------------- post-processing
// Ground-truth ambient occlusion gives soft contact shadows in corners and under furniture.
const params = new URLSearchParams(location.search);
const AO_ON = (params.has('ao') || !LOWQ) && !params.has('noao');
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: isTouch ? 0 : 4 }));
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, 1, 1);
gtao.updateGtaoMaterial({ radius: 1.3, distanceExponent: 1.4, thickness: 2, scale: 1.2, distanceFallOff: 1, samples: isTouch ? 10 : 16 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 3, normalPhi: 4, radius: 4, rings: 2, samples: isTouch ? 8 : 16 });
gtao.blendIntensity = 1.0;
{ const set = gtao.setSize.bind(gtao), k = isTouch ? 0.6 : 1; gtao.setSize = (w, h) => set(Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))); }
if (AO_ON) composer.addPass(gtao);
composer.addPass(new OutputPass());
if (isTouch) composer.addPass(new SMAAPass(1, 1));

// ---------------------------------------------------------------- merge static geometry
// Thousands of small meshes become one draw call per material, which keeps phones smooth.
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map(), remove = [];
  const add = (o, mat, g) => {
    const key = mat.uuid + (o.castShadow ? 's' : 'n') + (o.receiveShadow ? 'r' : '') + (o.renderOrder || 0);
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat, cast: o.castShadow, recv: o.receiveShadow, order: o.renderOrder, geos: [] }));
    b.geos.push(g);
  };
  root.traverse((o) => {
    if (!o.isMesh || o.isSprite) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.morphAttributes = {};
    if (Array.isArray(o.material)) { // split multi-material boxes face by face
      for (const grp of g.groups) {
        const part = new THREE.BufferGeometry();
        for (const name of ['position', 'normal', 'uv']) {
          const at = g.attributes[name], n = at.itemSize;
          part.setAttribute(name, new THREE.Float32BufferAttribute(at.array.slice(grp.start * n, (grp.start + grp.count) * n), n));
        }
        add(o, o.material[grp.materialIndex], part);
      }
      g.dispose();
    } else { g.clearGroups(); add(o, o.material, g); }
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    b.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.mat); m.castShadow = b.cast; m.receiveShadow = b.recv; m.renderOrder = b.order; m.frustumCulled = false;
    root.add(m);
  }
}
for (const g of [...groups, roofGroup, siteGroup]) mergeStatic(g);

// ---------------------------------------------------------------- room labels (overview)
const seenLabels = new Set();
for (const r of ROOMS) {
  const key = r.lvl + r.name; if (seenLabels.has(key) || r.name === 'Staircase' && r.lvl === 1) continue; seenLabels.add(key);
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  g.font = '600 44px system-ui, sans-serif'; const tw = Math.min(500, g.measureText(r.name).width + 40);
  g.fillStyle = 'rgba(15,23,32,0.82)'; g.beginPath(); g.roundRect((512 - tw) / 2, 24, tw, 80, 18); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(r.name, 256, 66);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set(14, 3.5, 1); sp.position.set(r.cx, r.lvl * FH + 4, r.cz); sp.userData.lvl = r.lvl; sp.renderOrder = 10;
  labelGroup.add(sp);
}

// ---------------------------------------------------------------- controls
const player = { x: 5, z: 84, h: 0, yaw: -0.2, pitch: 0.12 }; // start across the street, looking at the front elevation
let camH = EYE;
const keys = {};
addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'KeyM') toggleMap(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

let mode = 'walk';
const orbit = new OrbitControls(camera, canvas);
orbit.enabled = false; orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI * 0.49; orbit.minDistance = 15; orbit.maxDistance = 220;
orbit.target.set(X(276), 6, Z(540));

const joy = document.getElementById('joy'), knob = document.getElementById('knob');
const joyV = { x: 0, y: 0 }; let joyId = null;
if (isTouch) joy.style.display = 'block';
joy.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); moveJoy(e); e.preventDefault(); });
joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) moveJoy(e); });
const endJoy = (e) => { if (e.pointerId !== joyId) return; joyId = null; joyV.x = joyV.y = 0; knob.style.transform = ''; };
joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
function moveJoy(e) {
  const r = joy.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy), m = 46; if (d > m) { dx *= m / d; dy *= m / d; }
  joyV.x = dx / m; joyV.y = dy / m; knob.style.transform = `translate(${dx}px, ${dy}px)`;
}
const looks = new Map();
canvas.addEventListener('pointerdown', (e) => { if (mode !== 'walk') return; canvas.setPointerCapture(e.pointerId); looks.set(e.pointerId, { x: e.clientX, y: e.clientY }); canvas.focus(); });
canvas.addEventListener('pointermove', (e) => {
  const l = looks.get(e.pointerId); if (!l || mode !== 'walk') return;
  const k = e.pointerType === 'touch' ? 0.0065 : 0.0045;
  player.yaw -= (e.clientX - l.x) * k; player.pitch = clamp(player.pitch - (e.clientY - l.y) * k, -1.25, 1.25);
  l.x = e.clientX; l.y = e.clientY;
});
const endLook = (e) => looks.delete(e.pointerId);
canvas.addEventListener('pointerup', endLook); canvas.addEventListener('pointercancel', endLook);

function levelsFor(h) { return h < 3 ? [0] : h < 7 ? [0, 1] : h < 13 ? [1] : h < 17 ? [1, 2] : [2]; }
function resolve() {
  for (let it = 0; it < 3; it++) for (const l of levelsFor(player.h)) for (const b of colliders[l]) {
    const cx = clamp(player.x, b[0], b[2]), cz = clamp(player.z, b[1], b[3]);
    const dx = player.x - cx, dz = player.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= RADIUS * RADIUS) continue;
    if (d2 > 1e-9) { const d = Math.sqrt(d2), p = (RADIUS - d) / d; player.x += dx * p; player.z += dz * p; }
    else {
      const pl = [player.x - b[0], b[2] - player.x, player.z - b[1], b[3] - player.z], m = Math.min(...pl);
      if (m === pl[0]) player.x = b[0] - RADIUS; else if (m === pl[1]) player.x = b[2] + RADIUS; else if (m === pl[2]) player.z = b[1] - RADIUS; else player.z = b[3] + RADIUS;
    }
  }
  player.x = clamp(player.x, -60, 90); player.z = clamp(player.z, -40, Z(1038) + 32);
}
function step(dx, dz) {
  for (const [mx, mz] of [[dx, dz], [dx, 0], [0, dz]]) {
    const nx = player.x + mx, nz = player.z + mz, nh = groundAt(nx, nz, player.h);
    if (Math.abs(nh - player.h) <= 1.6) { player.x = nx; player.z = nz; player.h = nh; break; }
  }
  resolve();
  player.h = groundAt(player.x, player.z, player.h);
}

// ---------------------------------------------------------------- UI
const $ = (id) => document.getElementById(id);
let currentView = 'first';
function setMode(m) {
  mode = m; $('bMode').textContent = m === 'walk' ? 'Overview' : 'Walk'; $('bMode').classList.toggle('on', m !== 'walk');
  orbit.enabled = m !== 'walk'; document.body.classList.toggle('overview', m !== 'walk'); $('views').style.display = m === 'walk' ? 'none' : 'flex';
  joy.style.display = isTouch && m === 'walk' ? 'block' : 'none';
  if (m === 'overview') { const k = camera.aspect < 1 ? 0.95 : 0.72; camera.position.set(orbit.target.x + 40 * k, 80 * k, orbit.target.z + 55 * k); setView(currentView); }
  else { setView(null); }
}
function setView(v) {
  if (v) currentView = v;
  const show1 = v !== 'ground', showRoof = !v || v === 'exterior';
  groups[1].visible = show1; roofGroup.visible = showRoof;
  for (const sp of labelGroup.children) sp.visible = !!v && v !== 'exterior' && sp.userData.lvl === (v === 'ground' ? 0 : 1);
  gtao.enabled = !(v && v !== 'exterior'); // the AO normal pass can't draw label sprites
  document.querySelectorAll('#views button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  if (v) lastRoom = '';
}
document.querySelectorAll('#views button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.v)));
$('bMode').addEventListener('click', () => setMode(mode === 'walk' ? 'overview' : 'walk'));
$('bNight').addEventListener('click', () => setNight(!night));
$('bPlan').addEventListener('click', () => { $('plan').style.display = 'flex'; });
$('bPlanClose').addEventListener('click', () => { $('plan').style.display = 'none'; });
$('plan').addEventListener('click', (e) => { if (e.target === $('plan')) $('plan').style.display = 'none'; });
function toggleMap() { const on = $('map').style.display === 'none'; $('map').style.display = on ? '' : 'none'; $('bMap').classList.toggle('on', on); }
$('bMap').addEventListener('click', toggleMap);
$('bRooms').addEventListener('click', () => { const p = $('rooms'); const on = p.style.display !== 'block'; p.style.display = on ? 'block' : 'none'; $('bRooms').classList.toggle('on', on); });

const roomMenu = [];
{
  const seen = new Set(), panel = $('rooms');
  // Flat A is the rear flat (over the ground-floor house); Flat B sits over the parking.
  const groupOf = (r) => (r.lvl === 0 ? 0 : r.lvl === 2 ? 3 : /Flat B|Study|Passage/.test(r.name) ? 2 : 1);
  for (const grp of [0, 1, 2, 3]) {
    const lvl = [0, 1, 1, 2][grp];
    const h = document.createElement('h4'); h.textContent = ['Ground Floor', 'First Floor · Flat A', 'First Floor · Flat B', 'Roof'][grp]; panel.appendChild(h);
    ROOMS.forEach((r) => {
      if (groupOf(r) !== grp || seen.has(lvl + r.name) || r.name.startsWith('Kitchen passage')) return; seen.add(lvl + r.name);
      const b = document.createElement('button'); const ft = (v) => `${Math.floor(v)}'${Math.round((v % 1) * 12)}"`;
      b.innerHTML = `${r.name.replace(/ · Flat [AB]$/, '')} <small>${ft(r.x2 - r.x1)} × ${ft(r.z2 - r.z1)}</small>`;
      b.addEventListener('click', () => { teleport(roomMenu.indexOf(r)); panel.style.display = 'none'; $('bRooms').classList.remove('on'); });
      panel.appendChild(b); roomMenu.push(r);
    });
  }
}
function teleport(i, yaw) {
  const r = roomMenu[i]; if (!r) return;
  setMode('walk');
  if (r.name === 'Staircase') { player.x = X(205); player.z = Z(510); player.h = 0; player.yaw = -Math.PI / 2; player.pitch = 0.05; }
  else {
    // stand near a corner diagonal from the room's furniture-heavy side and look across the room
    const fx = r.x1 + (r.x2 - r.x1) * 0.66, fz = r.z1 + (r.z2 - r.z1) * 0.72;
    player.x = fx; player.z = fz; player.h = r.lvl * FH;
    player.yaw = yaw ?? Math.atan2(fx - r.cx + 1e-3, fz - r.cz);
    player.pitch = -0.08;
  }
  resolve(); camH = player.h + EYE;
}

// minimap
const mapc = $('mapc'), mg = mapc.getContext('2d');
const MAP_S = 4, MAP_OX = 6, MAP_OZ = 6;
function drawMap() {
  const lvl = lvlOf(player.h);
  mg.clearRect(0, 0, mapc.width, mapc.height);
  mg.save(); mg.translate(MAP_OX, MAP_OZ);
  for (const r of ROOMS) if (r.lvl === lvl) { mg.fillStyle = r.floor === 'wood' ? '#6b4e3a' : r.floor === 'btile' ? '#5d7280' : r.floor === 'ktile' ? '#8a7a5e' : r.floor === 'marble' ? '#8d8a84' : '#45505a'; mg.fillRect(r.x1 * MAP_S, r.z1 * MAP_S, (r.x2 - r.x1) * MAP_S, (r.z2 - r.z1) * MAP_S); }
  mg.fillStyle = '#e9e4da';
  for (const w of mapWalls[lvl]) if (w[0] > -1 && w[2] < 29) mg.fillRect(w[0] * MAP_S, w[1] * MAP_S, Math.max(1, (w[2] - w[0]) * MAP_S), Math.max(1, (w[3] - w[1]) * MAP_S));
  mg.translate(player.x * MAP_S, player.z * MAP_S); mg.rotate(-player.yaw);
  mg.fillStyle = '#f2b45a'; mg.beginPath(); mg.moveTo(0, -7); mg.lineTo(5, 5); mg.lineTo(0, 2); mg.lineTo(-5, 5); mg.closePath(); mg.fill();
  mg.restore();
}

// ---------------------------------------------------------------- loop
function resize() {
  const w = innerWidth, h = innerHeight, aspect = w / h;
  renderer.setSize(w, h, false); camera.aspect = aspect;
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  // landscape: 70° vertical. Portrait: hold ~78° horizontal so rooms don't feel like a keyhole.
  const hfov = THREE.MathUtils.degToRad(78);
  camera.fov = aspect >= 1 ? 70 : Math.min(100, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect)));
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); addEventListener('orientationchange', () => setTimeout(resize, 200)); resize();
// stop iOS Safari pinch-zoom / double-tap zoom from scaling the page UI
for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
const clock = new THREE.Clock();
let lightT = 0, lastRoom = '';
function currentRoom() {
  const lvl = lvlOf(player.h);
  const r = ROOMS.find((q) => q.lvl === lvl && player.x >= q.x1 - 0.3 && player.x <= q.x2 + 0.3 && player.z >= q.z1 - 0.3 && player.z <= q.z2 + 0.3);
  if (r) return r.name;
  return lvl === 2 ? 'Terrace' : lvl ? 'First floor' : player.z > Z(1038) ? 'Street' : 'Outside';
}
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (mode === 'walk') {
    let f = 0, s = 0;
    if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
    if (keys.KeyD) s += 1; if (keys.KeyA) s -= 1;
    if (keys.ArrowLeft) player.yaw += 1.8 * dt; if (keys.ArrowRight) player.yaw -= 1.8 * dt;
    f -= joyV.y; s += joyV.x;
    const mag = Math.hypot(f, s);
    if (mag > 0.05) {
      const speed = (keys.ShiftLeft || keys.ShiftRight ? 11 : 5.5) * Math.min(1, mag) / Math.max(1, mag);
      const sinY = Math.sin(player.yaw), cosY = Math.cos(player.yaw);
      const dx = (-sinY * f + cosY * s) * speed * dt, dz = (-cosY * f - sinY * s) * speed * dt;
      const n = Math.ceil(Math.hypot(dx, dz) / 0.25); for (let i = 0; i < n; i++) step(dx / n, dz / n);
    }
    camH += (player.h + EYE - camH) * Math.min(1, dt * 12);
    camera.position.set(player.x, camH, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
    const room = currentRoom();
    if (room !== lastRoom) { lastRoom = room; $('roomName').textContent = room; $('floorName').textContent = [0, FH, 2 * FH].includes(Math.round(player.h * 10) / 10) ? ['Ground floor', 'First floor', 'Roof terrace'][lvlOf(player.h)] : 'Staircase'; }
  } else {
    orbit.update();
    if (lastRoom !== '#') { lastRoom = '#'; $('roomName').textContent = 'Overview'; $('floorName').textContent = { exterior: 'Exterior', first: 'First floor plan', ground: 'Ground floor plan' }[currentView]; }
  }
  lightT -= dt;
  if (lightT <= 0) { lightT = 0.25; assignLights(mode === 'walk' ? Math.min(1, lvlOf(player.h)) : currentView === 'ground' ? 0 : 1); }
  if ($('map').style.display !== 'none') drawMap();
  composer.render();
  requestAnimationFrame(frame);
}
setView(null); resolve();
assignLights(0);
requestAnimationFrame(() => { $('loading').style.display = 'none'; });
frame();

// hooks for automated screenshots / debugging
window.walkthrough = { renderer, scene, step, groundAt, X, Z, teleport, setMode, setView, setNight, player, rooms: roomMenu, camera, orbit,
  look(x, z, h, yaw, pitch) { setMode('walk'); Object.assign(player, { x, z, h, yaw, pitch }); camH = h + EYE; } };
