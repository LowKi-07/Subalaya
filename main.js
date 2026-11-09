// Interactive 3D walkthrough of the two-storey house in plan-reference.png.
// Units: 1 world unit = 1 foot. Layout coordinates are taken directly from the
// reference image (pixels) and converted with X()/Z(), so the geometry stays
// traceable to the drawing. The first-floor plan sits 665px to the right.
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

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
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true }); }
catch (e) { document.getElementById('loading').textContent = 'WebGL is not available in this browser.'; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const DAY_SKY = new THREE.Color(0xb9d3ea), NIGHT_SKY = new THREE.Color(0x0b1424);
scene.background = DAY_SKY.clone();
scene.fog = new THREE.Fog(0xb9d3ea, 140, 420);
const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 1200);
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
const TEX = {
  wood: makeTex((g, s) => { // 4ft square, 6" planks
    const pw = s / 8;
    for (let i = 0; i < 8; i++) {
      let y = -rnd() * s * 0.6;
      while (y < s) {
        const len = s * (0.35 + rnd() * 0.45);
        g.fillStyle = `hsl(${26 + rnd() * 6},${40 + rnd() * 12}%,${34 + rnd() * 12}%)`;
        g.fillRect(i * pw, y, pw, len);
        g.strokeStyle = 'rgba(50,25,8,0.16)';
        for (let k = 0; k < 7; k++) { const xx = i * pw + rnd() * pw; g.beginPath(); g.moveTo(xx, y); g.bezierCurveTo(xx + rnd() * 6 - 3, y + len / 3, xx + rnd() * 6 - 3, y + len * 0.66, xx + rnd() * 4 - 2, y + len); g.stroke(); }
        g.fillStyle = 'rgba(35,18,5,0.6)'; g.fillRect(i * pw, y, pw, 1.5);
        y += len;
      }
      g.fillStyle = 'rgba(35,18,5,0.55)'; g.fillRect(i * pw, 0, 1.5, s);
    }
  }),
  marble: makeTex((g, s) => { // 4ft square, 2x2ft vitrified tiles
    const h = s / 2;
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
      const x0 = tx * h, y0 = ty * h;
      g.save(); g.beginPath(); g.rect(x0, y0, h, h); g.clip();
      g.fillStyle = `hsl(40,18%,${88 + rnd() * 4}%)`; g.fillRect(x0, y0, h, h);
      for (let v = 0; v < 6; v++) {
        g.strokeStyle = `rgba(125,112,98,${0.07 + rnd() * 0.12})`; g.lineWidth = 0.5 + rnd() * 1.6;
        g.beginPath(); let px = x0 + rnd() * h, py = y0 - 10; g.moveTo(px, py);
        for (let k = 0; k < 10; k++) { px += (rnd() - 0.5) * 36; py += h / 8; g.lineTo(px, py); }
        g.stroke();
      }
      g.restore();
    }
    g.strokeStyle = '#c4bcae'; g.lineWidth = 2;
    for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * h, 0); g.lineTo(k * h, s); g.moveTo(0, k * h); g.lineTo(s, k * h); g.stroke(); }
  }),
  ktile: makeTex((g, s) => { // 4ft square, 2x2ft beige tiles
    const h = s / 2;
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) { g.fillStyle = `hsl(35,28%,${74 + rnd() * 5}%)`; g.fillRect(tx * h, ty * h, h, h); }
    speckle(g, s, 2500, 'rgba(90,70,50,0.12)');
    g.strokeStyle = '#8f8270'; g.lineWidth = 2;
    for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * h, 0); g.lineTo(k * h, s); g.moveTo(0, k * h); g.lineTo(s, k * h); g.stroke(); }
  }),
  btile: makeTex((g, s) => { // 2ft square, 1x1ft anti-skid tiles
    const h = s / 2;
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) { g.fillStyle = `hsl(205,10%,${58 + rnd() * 6}%)`; g.fillRect(tx * h, ty * h, h, h); }
    speckle(g, s, 4000, 'rgba(255,255,255,0.12)'); speckle(g, s, 3000, 'rgba(0,0,0,0.12)');
    g.strokeStyle = '#e6e6e0'; g.lineWidth = 3;
    for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * h, 0); g.lineTo(k * h, s); g.moveTo(0, k * h); g.lineTo(s, k * h); g.stroke(); }
  }),
  wtile: makeTex((g, s) => { // bathroom wall dado tiles, 2ft square, 1x1.5ft
    for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 2; tx++) { g.fillStyle = `hsl(195,18%,${86 + rnd() * 4}%)`; g.fillRect(tx * s / 2, ty * s / 4, s / 2, s / 4); }
    g.strokeStyle = '#b9c2c4'; g.lineWidth = 2;
    for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(0, k * s / 4); g.lineTo(s, k * s / 4); g.stroke(); }
    for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * s / 2, 0); g.lineTo(k * s / 2, s); g.stroke(); }
  }),
  paver: makeTex((g, s) => { // 4ft square, 8"x4" pavers
    g.fillStyle = '#6d6a66'; g.fillRect(0, 0, s, s);
    const bw = s / 6, bh = s / 12;
    for (let r = 0; r < 12; r++) for (let c = -1; c < 7; c++) {
      const x = c * bw + (r % 2 ? bw / 2 : 0);
      g.fillStyle = `hsl(${rnd() < 0.15 ? 12 : 30},${rnd() < 0.15 ? 25 : 5}%,${48 + rnd() * 10}%)`;
      g.fillRect(x + 1.5, r * bh + 1.5, bw - 3, bh - 3);
    }
    speckle(g, s, 3000, 'rgba(0,0,0,0.12)');
  }),
  grass: makeTex((g, s) => { g.fillStyle = '#5f7f3e'; g.fillRect(0, 0, s, s); speckle(g, s, 9000, 'rgba(30,60,15,0.35)'); speckle(g, s, 6000, 'rgba(150,180,90,0.25)'); }),
  asphalt: makeTex((g, s) => { g.fillStyle = '#3e4043'; g.fillRect(0, 0, s, s); speckle(g, s, 9000, 'rgba(255,255,255,0.08)'); speckle(g, s, 9000, 'rgba(0,0,0,0.2)'); }),
  granite: makeTex((g, s) => { g.fillStyle = '#26221f'; g.fillRect(0, 0, s, s); speckle(g, s, 9000, 'rgba(200,190,170,0.18)'); speckle(g, s, 3000, 'rgba(120,80,60,0.3)'); }, 256),
  fabric: makeTex((g, s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, s, s); for (let i = 0; i < s; i += 4) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(i, 0, 2, s); g.fillRect(0, i, s, 2); } }, 128),
};

TEX.fabric.repeat.set(6, 6);
// ---------------------------------------------------------------- materials
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const mats = {
  wallIn: M(0xf2ede4, { roughness: 0.95 }), wallExt: M(0xe7d3b3, { roughness: 0.95 }),
  ceiling: M(0xf8f6f1, { roughness: 1 }), concrete: M(0xbdb8ae, { roughness: 0.95 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xbfe0ee, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false }),
  frosted: new THREE.MeshStandardMaterial({ color: 0xe8f0f2, roughness: 0.4, transparent: true, opacity: 0.7 }),
  alu: M(0x55595e, { metalness: 0.6, roughness: 0.4 }), chrome: M(0xdddddd, { metalness: 1, roughness: 0.15 }),
  doorWood: M(0x7a4a2a, { roughness: 0.6 }), frameWood: M(0x5a3520, { roughness: 0.6 }), teak: M(0x8a5530, { roughness: 0.55 }),
  white: M(0xf7f7f5, { roughness: 0.35 }), porcelain: M(0xffffff, { roughness: 0.15 }),
  laminate: M(0xcdb69a, { roughness: 0.6 }), laminateDark: M(0x6b4e3a, { roughness: 0.6 }),
  granite: new THREE.MeshStandardMaterial({ map: TEX.granite, roughness: 0.25 }),
  steel: M(0xc8ccd0, { metalness: 0.9, roughness: 0.3 }), black: M(0x151515, { roughness: 0.3 }),
  screen: M(0x050608, { roughness: 0.15, metalness: 0.2 }), mirror: M(0xdde6ea, { metalness: 1, roughness: 0.02 }),
  mattress: M(0xf5f2ea), pillow: M(0xfbfaf6),
  sofa: new THREE.MeshStandardMaterial({ color: 0xc9a46a, map: TEX.fabric, roughness: 0.95 }),
  sofaCush: new THREE.MeshStandardMaterial({ color: 0xd8b67e, map: TEX.fabric, roughness: 0.95 }),
  navy: M(0x2f4f8f, { roughness: 0.5 }), rug: new THREE.MeshStandardMaterial({ color: 0xd9d0c0, map: TEX.fabric, roughness: 1 }),
  rug2: new THREE.MeshStandardMaterial({ color: 0x9a8f86, map: TEX.fabric, roughness: 1 }),
  lightOn: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d6, emissiveIntensity: 0.6 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xf3e6cf, emissive: 0xffd9a0, emissiveIntensity: 0.6 }),
  tyre: M(0x1b1b1b, { roughness: 0.9 }), rim: M(0xb0b4b8, { metalness: 0.8, roughness: 0.3 }),
  carGlass: M(0x1a2630, { roughness: 0.05, metalness: 0.4 }), headlight: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 0.4 }),
  tail: new THREE.MeshStandardMaterial({ color: 0xaa1010, emissive: 0x550000 }),
  plant: M(0x3f6e33, { roughness: 0.9 }), pot: M(0x9c5a3c, { roughness: 0.9 }),
  rail: M(0x2a2a2a, { metalness: 0.7, roughness: 0.35 }), compound: M(0xcfc3ad, { roughness: 1 }), gate: M(0x2b2f33, { metalness: 0.6, roughness: 0.5 }),
};
const floorMat = {};
for (const [k, tile] of Object.entries({ wood: 4, marble: 4, ktile: 4, btile: 2, paver: 4, grass: 16, asphalt: 12 })) {
  floorMat[k] = new THREE.MeshStandardMaterial({ map: TEX[k], roughness: k === 'marble' ? 0.25 : k === 'wood' ? 0.55 : 0.9 });
  floorMat[k].userData.tile = tile;
}
const bedColors = [0x5d7fa3, 0xa35d5d, 0x6f8f6a, 0x8a6fa3, 0xb08a4a, 0x4f7f84];

// ---------------------------------------------------------------- scene graph
const groups = [new THREE.Group(), new THREE.Group()];
const roofGroup = new THREE.Group(), siteGroup = new THREE.Group(), labelGroup = new THREE.Group();
scene.add(groups[0], groups[1], roofGroup, siteGroup, labelGroup);
const colliders = [[], []];   // per level: [x1, z1, x2, z2]
const mapWalls = [[], []];    // for the minimap

function addMesh(geo, mat, x, y, z, grp, cast = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; grp.add(m); return m;
}
const B = (w, h, d, mat, x, y, z, grp, cast) => addMesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, grp, cast);

function floorPlane(x1, z1, x2, z2, y, mat, grp, flip = false) {
  const geo = new THREE.PlaneGeometry(x2 - x1, z2 - z1);
  geo.rotateX(flip ? Math.PI / 2 : -Math.PI / 2);
  geo.translate((x1 + x2) / 2, y, (z1 + z2) / 2);
  const tile = mat.userData.tile || 4, pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; grp.add(m); return m;
}

// ---------------------------------------------------------------- walls, doors, windows
const OPEN = { D: [0, 7], M: [0, 7.5], O: [0, 7], W: [3, 7], V: [6, 7.5] };
const T_EXT = 0.75, T_INT = 0.4;

function wallMaterial(dir, ext) {
  if (!ext) return mats.wallIn;
  const arr = Array(6).fill(mats.wallExt); // box faces: +x -x +y -y +z -z
  if (dir === 'h') arr[ext > 0 ? 4 : 5] = mats.wallIn; else arr[ext > 0 ? 0 : 1] = mats.wallIn;
  return arr;
}

// dir 'h': wall along x at image-y = c, from image-x a to b.  dir 'v': along z at image-x = c.
// ops: [from, to, type, hinge]  type D door, M main double door, O open doorway, W window, V ventilator.
// ext: which side (+1 / -1 along the wall normal) is the inside, for exterior walls.
function wall(lvl, dir, c, a, b, t, ops = [], ext = 0) {
  const grp = groups[lvl], base = lvl * FH;
  const along = (v) => (dir === 'h' ? X(v, lvl) : Z(v));
  const cc = dir === 'h' ? Z(c) : X(c, lvl);
  const mat = wallMaterial(dir, ext);
  // place a box in wall-local coordinates
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
    if (sill > 0) {
      seg(o.s, o.e, 0, sill, true);
      colliders[lvl].push(dir === 'h' ? [o.s, cc - t / 2, o.e, cc + t / 2] : [cc - t / 2, o.s, cc + t / 2, o.e]);
      mapWalls[lvl].push(dir === 'h' ? [o.s, cc - 0.06, o.e, cc + 0.06] : [cc - 0.06, o.s, cc + 0.06, o.e]);
      // frame + glass
      const fw = 0.16, ft = Math.min(t, 0.35);
      put(o.s, o.e, sill, sill + fw, 0, ft, mats.alu);
      put(o.s, o.e, head - fw, head, 0, ft, mats.alu);
      put(o.s, o.s + fw, sill, head, 0, ft, mats.alu);
      put(o.e - fw, o.e, sill, head, 0, ft, mats.alu);
      if (o.type === 'W') {
        const n = o.e - o.s > 3.5 ? 2 : 1;
        for (let i = 1; i <= n; i++) { const m = o.s + ((o.e - o.s) * i) / (n + 1); put(m - 0.06, m + 0.06, sill, head, 0, ft, mats.alu); }
        put(o.s + fw, o.e - fw, sill + fw, head - fw, 0, 0.04, mats.glass, false);
        // safety grill bars, typical of Indian homes
        for (let y = sill + 0.6; y < head - 0.2; y += 0.6) put(o.s + fw, o.e - fw, y - 0.02, y + 0.02, ext ? -ext * (t / 2 - 0.05) : 0.12, 0.04, mats.rail, false);
        if (ext) put(o.s - 0.5, o.e + 0.5, head + 0.05, head + 0.3, -ext * (t / 2 + 0.75), 1.5, mats.concrete); // sunshade (chajja)
      } else {
        put(o.s + fw, o.e - fw, sill + fw, head - fw, 0, 0.05, mats.frosted, false);
        for (let y = sill + 0.3; y < head - 0.1; y += 0.3) put(o.s + fw, o.e - fw, y - 0.03, y + 0.03, 0.05, 0.12, mats.alu, false);
      }
    } else {
      // door frame
      const jt = t + 0.08;
      put(o.s, o.s + 0.15, 0, head, 0, jt, mats.frameWood);
      put(o.e - 0.15, o.e, 0, head, 0, jt, mats.frameWood);
      put(o.s, o.e, head - 0.15, head, 0, jt, mats.frameWood);
      if (o.type !== 'O') {
        const side = o.hinge[1] === '-' ? -1 : 1;
        const leaves = o.type === 'M' ? [['s', (o.e - o.s - 0.3) / 2], ['e', (o.e - o.s - 0.3) / 2]] : [[o.hinge[0], o.e - o.s - 0.3]];
        for (const [h, W] of leaves) {
          const hx = h === 's' ? o.s + 0.22 : o.e - 0.22;
          const off = side * (t / 2 + W / 2);
          const leaf = put(hx - 0.07, hx + 0.07, 0.05, head - 0.17, off, W, o.type === 'M' ? mats.teak : mats.doorWood);
          // handle
          const hOff = side * (t / 2 + W - 0.3);
          put(hx - 0.14, hx + 0.14, 3.3, 3.42, hOff, 0.35, mats.chrome);
          void leaf;
          const lr = dir === 'h' ? [hx - 0.07, cc + Math.min(off - W / 2 * side, off + W / 2 * side), hx + 0.07, cc + Math.max(off - W / 2 * side, off + W / 2 * side)]
            : [cc + Math.min(off - W / 2 * side, off + W / 2 * side), hx - 0.07, cc + Math.max(off - W / 2 * side, off + W / 2 * side), hx + 0.07];
          colliders[lvl].push(lr);
        }
      }
    }
    cur = o.e;
  }
  seg(cur, along(b), 0, WH);
}

// ---- Ground floor (left plan)
wall(0, 'h', 51, 40, 512, T_EXT, [[265, 345, 'W']], +1);
wall(0, 'v', 46, 45, 478, T_EXT, [[105, 158, 'W']], +1);
wall(0, 'v', 506, 45, 478, T_EXT, [[155, 205, 'W'], [268, 298, 'V'], [400, 432, 'V']], -1);
wall(0, 'h', 472, 40, 512, T_EXT, [[68, 128, 'M', 's-'], [132, 208, 'W']], -1);
wall(0, 'h', 203, 46, 88, T_INT);
wall(0, 'v', 234, 51, 472, T_INT, [[208, 255, 'D', 's+'], [405, 455, 'D', 'e+']]);
wall(0, 'h', 260, 234, 413, T_INT);
wall(0, 'v', 413, 205, 472, T_INT, [[218, 256, 'D', 's+'], [375, 413, 'D', 's+']]);
wall(0, 'h', 205, 413, 506, T_INT);
wall(0, 'h', 363, 413, 506, T_INT);
wall(0, 'h', 606, 188, 417, T_EXT, [], -1);   // staircase enclosure
wall(0, 'v', 411, 472, 612, T_EXT, [], -1);

// ---- First floor (right plan, x offset 665px)
wall(1, 'h', 51, 705, 1177, T_EXT, [[932, 1010, 'W']], +1);
wall(1, 'v', 711, 45, 1035, T_EXT, [[95, 158, 'W'], [755, 790, 'V'], [925, 1010, 'W']], +1);
wall(1, 'v', 1171, 45, 1035, T_EXT, [[155, 205, 'W'], [297, 333, 'V'], [485, 520, 'V'], [700, 780, 'W'], [975, 1010, 'V']], -1);
wall(1, 'h', 1029, 705, 1177, T_EXT, [[790, 840, 'W'], [925, 980, 'W']], -1);
wall(1, 'h', 203, 711, 753, T_INT);
wall(1, 'v', 899, 51, 472, T_INT, [[208, 255, 'D', 's+'], [405, 455, 'D', 'e+']]);
wall(1, 'h', 260, 899, 1171, T_INT, [[1088, 1128, 'D', 's+']]);
wall(1, 'v', 1080, 260, 606, T_INT, [[425, 462, 'D', 's+']]);
wall(1, 'h', 418, 1080, 1171, T_INT);
wall(1, 'h', 544, 1080, 1171, T_INT);
wall(1, 'h', 472, 711, 1080, T_INT, [[735, 790, 'D', 's-'], [795, 875, 'W']]);
wall(1, 'h', 606, 794, 1171, T_INT, [[812, 865, 'W'], [1125, 1163, 'O']]);
wall(1, 'v', 794, 606, 712, T_INT, [[615, 665, 'D', 's+']]);
wall(1, 'h', 712, 711, 800, T_INT);
wall(1, 'v', 800, 712, 840, T_INT);
wall(1, 'h', 840, 711, 899, T_INT, [[760, 795, 'D', 'e-'], [845, 893, 'D', 'e+']]);
wall(1, 'v', 899, 840, 1029, T_INT);
wall(1, 'v', 1003, 606, 880, T_INT, [[818, 868, 'D', 's+']]);
wall(1, 'h', 880, 1003, 1171, T_INT, [[1085, 1120, 'D', 's+']]);
wall(1, 'v', 1077, 880, 1029, T_INT);

// ---------------------------------------------------------------- rooms
// [level, name, x1, y1, x2, y2 (image px), floor finish, extra]
const ROOM_DEFS = [
  [0, 'Kitchen', 52, 57, 232, 203, 'ktile'],
  [0, 'Living Hall', 52, 203, 232, 466, 'marble'],
  [0, 'Master Bedroom', 236, 57, 500, 205, 'wood'],
  [0, 'Master Bedroom', 236, 205, 411, 258, 'wood', { nolight: true }],
  [0, 'Bedroom', 236, 262, 411, 466, 'wood'],
  [0, 'Toilet (Master Bedroom)', 415, 207, 500, 361, 'btile'],
  [0, 'Toilet (Bedroom)', 415, 365, 500, 466, 'btile'],
  [0, 'Staircase', 188, 478, 411, 606, null, { lights: [[215, 510], [380, 545]] }],
  [0, 'Parking', 40, 478, 512, 1035, null, { lights: [[110, 700], [400, 700], [270, 880]] }],
  [1, 'Kitchen · Flat A', 717, 57, 897, 203, 'ktile'],
  [1, 'Living Hall · Flat A', 717, 203, 897, 466, 'marble'],
  [1, 'Master Bedroom · Flat A', 901, 57, 1165, 258, 'wood'],
  [1, 'Bedroom · Flat A', 901, 262, 1078, 466, 'wood'],
  [1, 'Toilet (M.Bed) · Flat A', 1082, 262, 1165, 416, 'btile'],
  [1, 'Toilet · Flat A', 1082, 420, 1165, 542, 'btile'],
  [1, 'Study', 1082, 546, 1165, 604, 'wood'],
  [1, 'Lobby', 717, 475, 853, 606, 'marble'],
  [1, 'Passage (4\' wide)', 717, 606, 792, 710, 'marble'],
  [1, 'Living Hall · Flat B', 802, 608, 1001, 838, 'marble'],
  [1, 'Kitchen passage · Flat B', 901, 838, 1001, 880, 'marble', { nolight: true }],
  [1, 'Toilet · Flat B', 717, 714, 798, 838, 'btile'],
  [1, 'Bedroom 3 · Flat B', 717, 842, 897, 1023, 'wood'],
  [1, 'Bedroom 2 · Flat B', 1005, 608, 1165, 878, 'wood'],
  [1, 'Kitchen · Flat B', 901, 882, 1075, 1023, 'ktile'],
  [1, 'Toilet 2 · Flat B', 1079, 882, 1165, 1023, 'btile'],
  [1, 'Staircase', 853, 475, 1078, 606, null, { nolight: true }],
];
const ROOMS = ROOM_DEFS.map(([lvl, name, a, b, c, d, floor, extra = {}]) => ({
  lvl, name, floor, extra, x1: X(a, lvl), z1: Z(b), x2: X(c, lvl), z2: Z(d),
  get cx() { return (this.x1 + this.x2) / 2; }, get cz() { return (this.z1 + this.z2) / 2; },
}));

const lightSpots = []; // {x,y,z,lvl,power}
for (const r of ROOMS) {
  const base = r.lvl * FH;
  if (r.floor) floorPlane(r.x1, r.z1, r.x2, r.z2, base + 0.012, floorMat[r.floor], groups[r.lvl]);
  if (r.extra.nolight) continue;
  const spots = r.extra.lights ? r.extra.lights.map(([a, b]) => [X(a, r.lvl), Z(b)]) : [[r.cx, r.cz]];
  const area = (r.x2 - r.x1) * (r.z2 - r.z1);
  for (const [x, z] of spots) {
    const small = area < 60;
    if (r.name === 'Staircase') { lightSpots.push({ x, y: 9, z, lvl: 0, power: 0.45 }); lightSpots.push({ x, y: 13, z, lvl: 1, power: 0.45 }); continue; }
    addMesh(new THREE.CylinderGeometry(small ? 0.45 : 0.75, small ? 0.45 : 0.75, 0.08, 24), mats.lightOn, x, base + WH - 0.05, z, groups[r.lvl], false);
    lightSpots.push({ x, y: base + WH - 0.6, z, lvl: r.lvl, power: small ? 0.6 : 1 });
  }
}
// ---------------------------------------------------------------- slabs, roof, structure
{
  const g1 = groups[1];
  const slab = (a, b, c, d, y, grp, mat = mats.ceiling) => {
    const x1 = X(a), x2 = X(c), z1 = Z(b), z2 = Z(d);
    B(x2 - x1, SLAB, z2 - z1, [mats.concrete, mats.concrete, mats.concrete, mat, mats.concrete, mats.concrete], (x1 + x2) / 2, y - SLAB / 2, (z1 + z2) / 2, grp);
  };
  // first-floor slab with the staircase opening (188..411 x 475..606)
  slab(40, 45, 512, 475, FH, g1); slab(40, 606, 512, 1035, FH, g1);
  slab(40, 475, 189, 606, FH, g1); slab(411, 475, 512, 606, FH, g1);
  // roof slab + parapet
  slab(40, 45, 512, 1035, 2 * FH, roofGroup);
  const px1 = X(40), px2 = X(512), pz1 = Z(45), pz2 = Z(1035), ph = 3, pt = 0.5, py = 2 * FH + ph / 2;
  B(px2 - px1, ph, pt, mats.wallExt, (px1 + px2) / 2, py, pz1 + pt / 2, roofGroup);
  B(px2 - px1, ph, pt, mats.wallExt, (px1 + px2) / 2, py, pz2 - pt / 2, roofGroup);
  B(pt, ph, pz2 - pz1, mats.wallExt, px1 + pt / 2, py, (pz1 + pz2) / 2, roofGroup);
  B(pt, ph, pz2 - pz1, mats.wallExt, px2 - pt / 2, py, (pz1 + pz2) / 2, roofGroup);
  floorPlane(px1, pz1, px2, pz2, 2 * FH + 0.01, floorMat.btile, roofGroup);
  // beams around the open parking, under the first floor
  const beam = (a, b, c, d) => { const x1 = X(a), x2 = X(c), z1 = Z(b), z2 = Z(d); B(x2 - x1, 1.25, z2 - z1, mats.wallExt, (x1 + x2) / 2, WH - 0.625, (z1 + z2) / 2, g1); };
  beam(40, 478, 52, 1035); beam(500, 478, 512, 1035); beam(40, 1023, 512, 1035); beam(40, 744, 512, 756);
  // columns
  for (const cx of [46, 188, 352, 506]) for (const cy of [750, 1029]) {
    const x = X(cx), z = Z(cy), s = 0.9;
    B(s, WH, s, mats.wallExt, x, WH / 2, z, groups[0]);
    colliders[0].push([x - s / 2, z - s / 2, x + s / 2, z + s / 2]); mapWalls[0].push([x - s / 2, z - s / 2, x + s / 2, z + s / 2]);
  }
}

// ---------------------------------------------------------------- staircase (dog-leg, 18 risers)
const STAIR = { x1: 188, x2: 411, y1: 478, ymid: 542, y2: 606, f1s: 240, land: 350 };
{
  const g = groups[0], tread = new THREE.MeshStandardMaterial({ map: TEX.marble, color: 0xd8cfc2, roughness: 0.35 });
  const z1 = Z(STAIR.y1), zm = Z(STAIR.ymid), z2 = Z(STAIR.y2);
  const w1 = (STAIR.land - STAIR.f1s) / 9, w2 = (STAIR.land - STAIR.x1) / 9;
  for (let k = 0; k < 9; k++) { // flight 1 (upper row), rising to the right
    const a = X(STAIR.f1s + k * w1), b = X(STAIR.f1s + (k + 1) * w1), top = ((k + 1) * 5) / 9;
    B(b - a, top, zm - z1, tread, (a + b) / 2, top / 2, (z1 + zm) / 2, g);
  }
  const la = X(STAIR.land), lb = X(STAIR.x2);
  B(lb - la, 5, z2 - z1, tread, (la + lb) / 2, 2.5, (z1 + z2) / 2, g); // mid landing
  for (let j = 0; j < 9; j++) { // flight 2 (lower row), rising to the left
    const b = X(STAIR.land - j * w2), a = X(STAIR.land - (j + 1) * w2), top = 5 + ((j + 1) * 5) / 9;
    B(b - a, top, z2 - zm, tread, (a + b) / 2, top / 2, (zm + z2) / 2, g);
  }
  // railing between flights following flight 2, plus a guard rail on the first floor
  const rail = (xa, ya, xb, yb, z, grp) => {
    const dx = xb - xa, dy = yb - ya, L = Math.hypot(dx, dy);
    const m = B(L, 0.12, 0.12, mats.teak, (xa + xb) / 2, (ya + yb) / 2, z, grp); m.rotation.z = Math.atan2(dy, dx);
  };
  const xA = X(STAIR.land), xB = X(STAIR.x1 + 4), zr = zm;
  rail(xA, 8, xB, 13, zr, g);
  for (let i = 0; i <= 9; i++) {
    const x = xA + ((xB - xA) * i) / 9, top = 8 + (5 * i) / 9, bottom = 5 + (5 * i) / 9;
    B(0.06, top - bottom, 0.06, mats.rail, x, (top + bottom) / 2, zr, g);
  }
  const xr = X(STAIR.x1 + 2);
  B(0.12, 0.12, zm - z1, mats.teak, xr, FH + 3, (z1 + zm) / 2, groups[1]);
  for (let z = z1 + 0.3; z < zm; z += 0.4) B(0.06, 3, 0.06, mats.rail, xr, FH + 1.5, z, groups[1]);
  B(0.12, 0.12, zm - Z(STAIR.y1), mats.teak, xr, FH + 3, (z1 + zm) / 2, groups[1]);
  floorPlane(X(STAIR.x1), z1, X(STAIR.f1s), zm, 0.012, new THREE.MeshStandardMaterial({ map: TEX.granite, color: 0x9a8f86, roughness: 0.4 }), g);
}
// Height of the walking surface at (x, z) given the current height.
function groundAt(x, z, curH) {
  const px = x * PX + 40, py = z * PX + 45;
  if (px >= STAIR.x1 && px <= STAIR.x2 && py >= STAIR.y1 && py <= STAIR.y2) {
    if (py < STAIR.ymid) { if (px < STAIR.f1s) return 0; if (px < STAIR.land) return ((px - STAIR.f1s) / (STAIR.land - STAIR.f1s)) * 5; return 5; }
    if (px > STAIR.land) return 5;
    return 5 + Math.min(1, (STAIR.land - px) / (STAIR.land - STAIR.x1)) * 5;
  }
  return curH > 5 ? FH : 0;
}

// ---------------------------------------------------------------- site
{
  const g = siteGroup;
  floorPlane(-120, -80, 150, 170, -0.03, floorMat.grass, g);
  floorPlane(X(10), Z(10), X(540), Z(1038), 0.0, floorMat.paver, g);
  const roadZ = Z(1038) + 6;
  floorPlane(-120, roadZ, 150, roadZ + 26, -0.01, floorMat.asphalt, g);
  floorPlane(-120, Z(1038), 150, roadZ, -0.005, floorMat.paver, g);
  for (let x = -110; x < 150; x += 12) B(5, 0.02, 0.35, mats.white, x, 0.0, roadZ + 13, g, false);
  // compound wall with two gates (plot boundary = pink dashed line)
  const cw = (a, b, c, d) => {
    const x1 = X(a), x2 = X(c), z1 = Z(b), z2 = Z(d), h = 4.5;
    B(x2 - x1, h, z2 - z1, mats.compound, (x1 + x2) / 2, h / 2, (z1 + z2) / 2, g);
    colliders[0].push([x1, z1, x2, z2]); mapWalls[0].push([x1, z1, x2, z2]);
  };
  cw(7, 7, 16, 1041); cw(534, 7, 543, 1041); cw(7, 7, 543, 16);
  cw(7, 1035, 65, 1041); cw(237, 1035, 280, 1041); cw(452, 1035, 543, 1041);
  // gates swung open onto the road
  for (const [a, b] of [[65, 237], [280, 452]]) {
    const x1 = X(a), x2 = X(b), w = (x2 - x1) / 2, z = Z(1041);
    for (const [hx, s] of [[x1, 1], [x2, -1]]) {
      B(0.12, 4.2, w, mats.gate, hx + s * 0.2, 2.2, z + w / 2, g);
      for (let i = 0; i < 3; i++) B(0.1, 0.1, w, mats.gate, hx + s * 0.2, 0.6 + i * 1.6, z + w / 2, g);
    }
  }
  // a couple of trees
  for (const [x, z] of [[-6, Z(1038) + 3], [34, Z(1038) + 3]]) {
    addMesh(new THREE.CylinderGeometry(0.35, 0.5, 9, 8), mats.pot, x, 4.5, z, g);
    addMesh(new THREE.SphereGeometry(4, 12, 10), mats.plant, x, 11, z, g);
  }
}

// ---------------------------------------------------------------- furniture helpers
const R = (lvl, a, b, c, d) => { const x1 = X(a, lvl), x2 = X(c, lvl), z1 = Z(b), z2 = Z(d); return { lvl, x1, z1, x2, z2, cx: (x1 + x2) / 2, cz: (z1 + z2) / 2, w: x2 - x1, d: z2 - z1, y: lvl * FH }; };
const lb = (g, w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
const lc = (g, rt, rb, h, mat, x, y, z, seg = 20) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); g.add(m); return m; };
const ROT = { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };
// Build furniture in a local frame where -z is the "back" (headboard / backrest / wall side).
function place(r, back, build, collide = true) {
  const g = new THREE.Group(), ew = back === 'e' || back === 'w';
  build(g, ew ? r.d : r.w, ew ? r.w : r.d);
  g.rotation.y = ROT[back]; g.position.set(r.cx, r.y, r.cz);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  groups[r.lvl].add(g);
  if (collide) colliders[r.lvl].push([r.x1, r.z1, r.x2, r.z2]);
  return g;
}
let bedI = 0;
const bed = (r, back) => { const col = M(bedColors[bedI++ % bedColors.length], { map: TEX.fabric, roughness: 0.95 }); place(r, back, (g, W, L) => {
  lb(g, W, 1.0, L, mats.laminateDark, 0, 0.5, 0);
  lb(g, W - 0.2, 0.7, L - 0.3, mats.mattress, 0, 1.35, 0.05);
  lb(g, W - 0.05, 0.28, L * 0.62, col, 0, 1.78, L * 0.17);
  lb(g, W + 0.02, 0.9, 0.08, col, 0, 1.3, L / 2 - 0.02 + 0.03);
  for (const s of [-1, 1]) lb(g, W * 0.4, 0.35, 1.0, mats.pillow, (s * W) / 4.4, 1.85, -L / 2 + 0.95);
  lb(g, W + 0.2, 3.8, 0.3, mats.laminateDark, 0, 1.9, -L / 2 + 0.15);
  lb(g, W - 0.3, 2.2, 0.08, col, 0, 2.6, -L / 2 + 0.33);
}); };
const nightstand = (r) => place(r, 'n', (g, W, L) => {
  lb(g, W, 1.9, L, mats.laminate, 0, 0.95, 0);
  lc(g, 0.15, 0.2, 0.9, mats.white, 0, 2.35, 0); lc(g, 0.35, 0.5, 0.6, mats.lamp, 0, 3.0, 0);
});
const wardrobe = (r, back) => place(r, back, (g, W, L) => {
  lb(g, W, 7.2, L, mats.laminate, 0, 3.6, 0);
  const n = Math.max(2, Math.round(W / 1.6));
  for (let i = 1; i < n; i++) lb(g, 0.03, 7.0, 0.04, mats.laminateDark, -W / 2 + (W * i) / n, 3.6, L / 2 + 0.01);
  for (let i = 0; i < n; i++) lb(g, 0.06, 1.0, 0.08, mats.chrome, -W / 2 + (W * (i + 0.5)) / n + (i % 2 ? -0.3 : 0.3), 3.8, L / 2 + 0.04);
  lb(g, W, 0.04, 0.04, mats.laminateDark, 0, 5.8, L / 2 + 0.01);
});
const rug = (r, mat = mats.rug) => { const m = B(r.w, 0.03, r.d, mat, r.cx, r.y + 0.03, r.cz, groups[r.lvl], false); m.castShadow = false; };
const sofa = (r, back, arms = [1, 1]) => place(r, back, (g, W, L) => {
  lb(g, W, 1.25, L, mats.sofa, 0, 0.62, 0);
  lb(g, W - 0.9, 0.35, L - 0.8, mats.sofaCush, 0, 1.42, 0.25);
  lb(g, W, 1.7, 0.65, mats.sofa, 0, 2.05, -L / 2 + 0.33);
  if (arms[0]) lb(g, 0.45, 2.0, L, mats.sofa, -W / 2 + 0.22, 1.0, 0);
  if (arms[1]) lb(g, 0.45, 2.0, L, mats.sofa, W / 2 - 0.22, 1.0, 0);
  const n = Math.max(1, Math.round(W / 2.2));
  for (let i = 0; i < n; i++) lb(g, W / n - 0.3, 1.2, 0.35, mats.sofaCush, -W / 2 + (W * (i + 0.5)) / n, 2.05, -L / 2 + 0.8);
});
const table = (r, mat = mats.navy) => place(r, 'n', (g, W, L) => {
  lb(g, W, 0.12, L, mat, 0, 1.45, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lb(g, 0.12, 1.4, 0.12, mats.laminateDark, sx * (W / 2 - 0.15), 0.7, sz * (L / 2 - 0.15));
  lb(g, W - 0.3, 0.06, L - 0.3, mats.laminateDark, 0, 0.4, 0);
});
const tv = (r, back) => place(r, back, (g, W, L) => {
  lb(g, W, 1.4, L * 0.9, mats.laminateDark, 0, 0.7, -L * 0.05);
  lb(g, Math.min(4.4, W * 0.75), 2.5, 0.12, mats.screen, 0, 4.4, -L / 2 + 0.1);
  lb(g, Math.min(4.6, W * 0.78), 2.65, 0.06, mats.black, 0, 4.4, -L / 2 + 0.05);
  lb(g, 1.6, 0.4, 0.8, mats.black, -W * 0.25, 1.6, 0); // set-top box / speaker
  lc(g, 0.45, 0.35, 0.9, mats.pot, W / 2 - 0.5, 1.85, 0, 12); lc(g, 0.9, 0.5, 1.6, mats.plant, W / 2 - 0.5, 3.0, 0, 10);
});
const counter = (r) => {
  const g = groups[r.lvl];
  B(r.w, 2.7, r.d, mats.laminate, r.cx, r.y + 1.35, r.cz, g);
  B(r.w + 0.05, 0.12, r.d + 0.05, mats.granite, r.cx, r.y + 2.76, r.cz, g);
  B(r.w, 0.35, r.d - 0.1, mats.black, r.cx, r.y + 0.17, r.cz - 0.02, g); // plinth shadow
  colliders[r.lvl].push([r.x1, r.z1, r.x2, r.z2]);
};
const uppers = (r) => { const g = groups[r.lvl]; B(r.w, 2.2, r.d, mats.laminateDark, r.cx, r.y + 6.0, r.cz, g); };
const sink = (lvl, px, py, horiz = true) => {
  const x = X(px, lvl), z = Z(py), y = lvl * FH + 2.83, g = groups[lvl];
  B(horiz ? 2.6 : 1.5, 0.04, horiz ? 1.5 : 2.6, mats.steel, x, y, z, g, false);
  B(horiz ? 1.1 : 1.1, 0.05, horiz ? 1.1 : 1.1, mats.black, x - (horiz ? 0.55 : 0), y + 0.01, z - (horiz ? 0 : 0.55), g, false);
  addMesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8), mats.chrome, x + (horiz ? 0.5 : 0), y + 0.5, z + (horiz ? -0.55 : 0), g);
};
const hob = (lvl, px, py, horiz = false) => {
  const x = X(px, lvl), z = Z(py), y = lvl * FH + 2.84, g = groups[lvl];
  B(horiz ? 2.4 : 1.7, 0.04, horiz ? 1.7 : 2.4, mats.black, x, y, z, g, false);
  for (const [a, b] of [[-0.5, -0.4], [0.5, -0.4], [-0.5, 0.45], [0.5, 0.45]]) {
    const [ox, oz] = horiz ? [a, b] : [b, a];
    addMesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 20), mats.steel, x + ox, y + 0.03, z + oz, g, false);
  }
};
const wc = (r, back) => place(r, back, (g, W, L) => {
  lc(g, 0.62, 0.48, 1.3, mats.porcelain, 0, 0.65, 0.25, 24);
  lc(g, 0.66, 0.66, 0.08, mats.white, 0, 1.34, 0.25, 24);
  lb(g, 1.4, 1.3, 0.55, mats.porcelain, 0, 1.75, -L / 2 + 0.3);
});
const basin = (r, back) => place(r, back, (g, W, L) => {
  lb(g, W, 0.45, L, mats.porcelain, 0, 2.55, 0);
  lb(g, W * 0.7, 0.05, L * 0.6, mats.white, 0, 2.79, 0.05);
  lc(g, 0.04, 0.04, 0.45, mats.chrome, 0, 2.95, -L / 2 + 0.12, 8);
  lb(g, W, 2.0, 0.04, mats.mirror, 0, 4.4, -L / 2 + 0.02);
}, false);
const washer = (r, back) => place(r, back, (g, W, L) => {
  const s = Math.min(W, L, 2.0);
  lb(g, s, 2.8, s, mats.white, 0, 1.4, 0);
  const door = lc(g, 0.6, 0.6, 0.06, mats.carGlass, 0, 1.5, s / 2, 24); door.rotation.x = Math.PI / 2;
  lb(g, s * 0.6, 0.15, 0.05, mats.black, -s * 0.1, 2.55, s / 2);
});
const shower = (lvl, px, py, wallDir) => {
  const x = X(px, lvl), z = Z(py), g = groups[lvl];
  const h = addMesh(new THREE.CylinderGeometry(0.3, 0.25, 0.08, 16), mats.chrome, x, lvl * FH + 6.8, z, g);
  void wallDir; void h;
  addMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), mats.chrome, x, lvl * FH + 7.2, z, g);
};
const car = (r, back, color) => place(r, back, (g, W, L) => {
  const body = M(color, { metalness: 0.6, roughness: 0.3 });
  lb(g, W, 1.5, L, body, 0, 1.35, 0);
  lb(g, W - 0.1, 0.5, L * 0.32, body, 0, 2.2, -L * 0.3);  // boot
  lb(g, W - 0.1, 0.4, L * 0.25, body, 0, 2.15, L * 0.36);  // bonnet
  lb(g, W * 0.86, 1.3, L * 0.46, mats.carGlass, 0, 2.7, L * 0.02);
  lb(g, W * 0.84, 0.1, L * 0.4, body, 0, 3.38, L * 0.0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const t = lc(g, 1.05, 1.05, 0.7, mats.tyre, sx * (W / 2 - 0.3), 1.05, sz * L * 0.31, 20); t.rotation.z = Math.PI / 2;
    const rm = lc(g, 0.6, 0.6, 0.72, mats.rim, sx * (W / 2 - 0.3), 1.05, sz * L * 0.31, 12); rm.rotation.z = Math.PI / 2;
  }
  for (const sx of [-1, 1]) { lb(g, 0.9, 0.35, 0.05, mats.headlight, sx * W * 0.3, 1.75, L / 2 + 0.01); lb(g, 0.9, 0.3, 0.05, mats.tail, sx * W * 0.3, 1.85, -L / 2 - 0.01); }
  lb(g, W * 0.4, 0.4, 0.06, mats.black, 0, 1.2, L / 2 + 0.02);
});
const desk = (r, back) => place(r, back, (g, W, L) => {
  lb(g, W, 0.1, L, mats.teak, 0, 2.5, 0);
  for (const s of [-1, 1]) lb(g, 0.1, 2.45, L, mats.laminateDark, s * (W / 2 - 0.05), 1.22, 0);
  lb(g, 1.6, 1.0, 0.08, mats.screen, 0, 3.2, -L / 2 + 0.25);
  lb(g, 1.5, 0.12, 1.4, mats.black, 0, 1.55, L / 2 + 0.9); // chair seat
  lb(g, 1.5, 1.6, 0.12, mats.black, 0, 2.35, L / 2 + 1.55);
}, true);
const plant = (lvl, px, py) => { const x = X(px, lvl), z = Z(py), y = lvl * FH, g = groups[lvl]; addMesh(new THREE.CylinderGeometry(0.6, 0.45, 1.4, 14), mats.pot, x, y + 0.7, z, g); addMesh(new THREE.SphereGeometry(1.0, 10, 8), mats.plant, x, y + 2.3, z, g); colliders[lvl].push([x - 0.6, z - 0.6, x + 0.6, z + 0.6]); };
const shoeRack = (r, back) => place(r, back, (g, W, L) => { lb(g, W, 3, L, mats.laminate, 0, 1.5, 0); lb(g, W, 0.04, 0.03, mats.laminateDark, 0, 1.5, L / 2); });

// ---------------------------------------------------------------- furnish: ground floor
// Kitchen: L-shaped counter (left wall + top wall), sink under-top, hob below the window
counter(R(0, 52, 57, 88, 200)); counter(R(0, 88, 57, 232, 93));
uppers(R(0, 92, 57, 232, 77)); sink(0, 150, 76, true); hob(0, 70, 130, false);
// Living hall: L sofa on the left wall, coffee table, wall TV on the bedroom wall
sofa(R(0, 54, 300, 82, 420), 'w', [0, 1]); sofa(R(0, 54, 270, 120, 300), 'n', [1, 1]);
table(R(0, 96, 318, 128, 372)); rug(R(0, 88, 300, 190, 400));
tv(R(0, 214, 285, 232, 390), 'e'); plant(0, 210, 440);
// Master bedroom
bed(R(0, 263, 62, 355, 172), 'n'); nightstand(R(0, 240, 62, 260, 84)); nightstand(R(0, 358, 62, 378, 84));
wardrobe(R(0, 474, 60, 500, 172), 'e'); rug(R(0, 252, 140, 368, 200), mats.rug2);
// Bedroom
bed(R(0, 262, 268, 350, 372), 'n'); nightstand(R(0, 240, 268, 259, 288)); nightstand(R(0, 353, 268, 372, 288));
wardrobe(R(0, 382, 268, 409, 378), 'e'); rug(R(0, 252, 340, 362, 398), mats.rug2);
// Toilets
wc(R(0, 452, 210, 482, 248), 'n'); washer(R(0, 440, 322, 478, 359), 's'); basin(R(0, 486, 300, 500, 326), 'e'); shower(0, 494, 283);
wc(R(0, 444, 430, 474, 468), 's'); basin(R(0, 466, 366, 494, 380), 'n'); shower(0, 494, 416);
// Parking: three cars facing the gates
car(R(0, 58, 770, 152, 1000), 'n', 0xf1f1ee); car(R(0, 222, 770, 316, 1000), 'n', 0x9ea3a8); car(R(0, 386, 770, 480, 1000), 'n', 0x9b1d22);

// ---------------------------------------------------------------- furnish: first floor (right-plan coordinates)
counter(R(1, 717, 57, 753, 200)); counter(R(1, 753, 57, 897, 93));
uppers(R(1, 757, 57, 897, 77)); sink(1, 818, 76, true); hob(1, 735, 130, false);
sofa(R(1, 719, 300, 747, 420), 'w', [0, 1]); sofa(R(1, 719, 270, 785, 300), 'n', [1, 1]);
table(R(1, 761, 320, 793, 375)); rug(R(1, 753, 300, 855, 400)); tv(R(1, 879, 285, 897, 390), 'e');
bed(R(1, 932, 62, 1022, 172), 'n'); nightstand(R(1, 908, 62, 928, 84)); nightstand(R(1, 1025, 62, 1045, 84));
wardrobe(R(1, 1139, 60, 1165, 172), 'e'); rug(R(1, 920, 140, 1035, 200), mats.rug2);
bed(R(1, 928, 268, 1016, 372), 'n'); nightstand(R(1, 906, 268, 925, 288)); nightstand(R(1, 1019, 268, 1038, 288));
wardrobe(R(1, 1050, 268, 1077, 378), 'e');
wc(R(1, 1128, 266, 1158, 304), 'n'); washer(R(1, 1100, 370, 1140, 413), 's'); basin(R(1, 1151, 320, 1165, 346), 'e'); shower(1, 1159, 312);
wc(R(1, 1108, 505, 1138, 541), 's'); basin(R(1, 1132, 422, 1160, 436), 'n'); shower(1, 1159, 500);
desk(R(1, 1088, 548, 1160, 566), 'n');
shoeRack(R(1, 719, 478, 735, 540), 'w');
// Flat B
sofa(R(1, 975, 640, 1001, 760), 'e', [1, 0]); sofa(R(1, 935, 610, 1001, 640), 'n', [1, 1]);
table(R(1, 928, 675, 962, 735)); rug(R(1, 905, 650, 975, 770)); tv(R(1, 802, 700, 818, 790), 'w'); plant(1, 990, 825);
wc(R(1, 737, 716, 767, 754), 'n'); basin(R(1, 784, 728, 798, 754), 'e'); shower(1, 720, 800);
bed(R(1, 778, 905, 895, 1000), 'e'); nightstand(R(1, 877, 884, 895, 902)); nightstand(R(1, 877, 1003, 895, 1021));
wardrobe(R(1, 713, 848, 741, 918), 'w'); rug(R(1, 760, 920, 840, 990), mats.rug2);
bed(R(1, 1035, 688, 1160, 800), 'e'); nightstand(R(1, 1145, 668, 1165, 686)); nightstand(R(1, 1145, 802, 1165, 820));
wardrobe(R(1, 1012, 610, 1120, 636), 'n'); rug(R(1, 1020, 700, 1100, 790), mats.rug2);
counter(R(1, 901, 882, 937, 1027)); counter(R(1, 937, 1000, 1075, 1027));
uppers(R(1, 901, 890, 920, 990)); hob(1, 919, 930, false); sink(1, 990, 1013, true);
wc(R(1, 1115, 985, 1145, 1025), 's'); washer(R(1, 1124, 884, 1165, 930), 'e'); basin(R(1, 1079, 948, 1093, 974), 'w'); shower(1, 1159, 960);

// ---------------------------------------------------------------- lighting
const hemi = new THREE.HemisphereLight(0xdfeaff, 0x8a7a66, 1.0);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
const center = new THREE.Vector3(X(276), 0, Z(540));
sun.position.set(center.x - 45, 70, center.z + 50); sun.target.position.copy(center);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1536 : 2048, isTouch ? 1536 : 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 220 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
// A fixed pool of point lights is re-assigned to the ceiling fixtures nearest the camera,
// so the shader light count stays constant (important for phones).
const POOL = 8, pool = [];
for (let i = 0; i < POOL; i++) { const l = new THREE.PointLight(0xffe4c4, 0, 30, 2); scene.add(l); pool.push(l); }
let night = false;
function assignLights(lvlHint) {
  const p = camera.position;
  const sorted = lightSpots.map((s) => ({ s, d: (s.x - p.x) ** 2 + (s.z - p.z) ** 2 + (s.lvl === lvlHint ? 0 : 1600) })).sort((a, b) => a.d - b.d);
  for (let i = 0; i < POOL; i++) {
    const s = sorted[i]?.s; if (!s) { pool[i].intensity = 0; continue; }
    pool[i].position.set(s.x, s.y, s.z);
    pool[i].intensity = s.power * (night ? 75 : 38);
  }
}
function setNight(v) {
  night = v;
  sun.intensity = v ? 0.0 : 3.0; hemi.intensity = v ? 0.05 : 1.0;
  scene.background.copy(v ? NIGHT_SKY : DAY_SKY); scene.fog.color.copy(v ? NIGHT_SKY : DAY_SKY);
  mats.lightOn.emissiveIntensity = v ? 2.5 : 0.6;
  document.getElementById('bNight').classList.toggle('on', v);
  document.getElementById('bNight').textContent = v ? 'Day' : 'Night';
}

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
const player = { x: X(150), z: Z(1150), h: 0, yaw: 0, pitch: 0.12 };
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

function levelsFor(h) { return h < 3 ? [0] : h > 7 ? [1] : [0, 1]; }
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
  for (const lvl of [0, 1]) {
    const h = document.createElement('h4'); h.textContent = lvl ? 'First floor (2 flats)' : 'Ground floor'; panel.appendChild(h);
    ROOMS.forEach((r) => {
      if (r.lvl !== lvl || seen.has(lvl + r.name) || r.name.startsWith('Kitchen passage')) return; seen.add(lvl + r.name);
      const b = document.createElement('button'); const ft = (v) => `${Math.floor(v)}'${Math.round((v % 1) * 12)}"`;
      b.innerHTML = `${r.name} <small>${ft(r.x2 - r.x1)} × ${ft(r.z2 - r.z1)}</small>`;
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
  const lvl = player.h > 5 ? 1 : 0;
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
  const lvl = player.h > 5 ? 1 : 0;
  const r = ROOMS.find((q) => q.lvl === lvl && player.x >= q.x1 - 0.3 && player.x <= q.x2 + 0.3 && player.z >= q.z1 - 0.3 && player.z <= q.z2 + 0.3);
  if (r) return r.name;
  return lvl ? 'First floor' : player.z > Z(1038) ? 'Street' : 'Outside';
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
    if (room !== lastRoom) { lastRoom = room; $('roomName').textContent = room; $('floorName').textContent = player.h > 5 ? 'First floor' : player.h > 0.2 ? 'Staircase' : 'Ground floor'; }
  } else {
    orbit.update();
    if (lastRoom !== '#') { lastRoom = '#'; $('roomName').textContent = 'Overview'; $('floorName').textContent = { exterior: 'Exterior', first: 'First floor plan', ground: 'Ground floor plan' }[currentView]; }
  }
  lightT -= dt;
  if (lightT <= 0) { lightT = 0.25; assignLights(mode === 'walk' ? (player.h > 5 ? 1 : 0) : currentView === 'ground' ? 0 : 1); }
  if ($('map').style.display !== 'none') drawMap();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
setView(null); resolve();
assignLights(0);
requestAnimationFrame(() => { $('loading').style.display = 'none'; });
frame();

// hooks for automated screenshots / debugging
window.walkthrough = { step, groundAt, X, Z, teleport, setMode, setView, setNight, player, rooms: roomMenu, camera, orbit,
  look(x, z, h, yaw, pitch) { setMode('walk'); Object.assign(player, { x, z, h, yaw, pitch }); camH = h + EYE; } };
