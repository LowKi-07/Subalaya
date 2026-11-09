// Procedural cars: an extruded, bevelled side profile with wheel arches, a glass greenhouse,
// clearcoat paint, alloy wheels, lights, grille, mirrors and a soft contact shadow.
// Local frame: front faces +z, ground at y = 0, centred on the origin. Units: feet.
import * as THREE from 'three';

const PROFILES = {
  suv: {
    L: 15, W: 6.3, wheelR: 1.38, wheelX: 4.65, arch: 1.62, clear: 1.05,
    body: [[-7.5, 3.3], [-7.38, 3.8], [-7.05, 5.15], [-6.6, 5.5], [1.0, 5.55], [3.9, 3.95], [6.8, 3.6], [7.35, 3.15], [7.5, 2.2], [7.45, 1.05]],
    glass: [[-6.82, 3.92], [-6.42, 5.12], [0.85, 5.18], [3.5, 3.98]],
    shield: [[1.0, 5.55], [3.9, 3.95]], rear: [[-6.6, 5.5], [-7.38, 3.8]],
    pillars: [-1.6, -4.4],
  },
  sedan: {
    L: 15.4, W: 6.0, wheelR: 1.25, wheelX: 4.75, arch: 1.47, clear: 1.0,
    body: [[-7.7, 3.0], [-7.55, 3.45], [-5.7, 3.62], [-4.1, 4.75], [0.6, 4.85], [3.3, 3.55], [7.15, 3.2], [7.65, 2.55], [7.7, 1.0]],
    glass: [[-5.45, 3.72], [-3.98, 4.57], [0.45, 4.62], [3.0, 3.62]],
    shield: [[0.6, 4.85], [3.3, 3.55]], rear: [[-4.1, 4.75], [-5.7, 3.62]],
    pillars: [-1.5],
  },
};

let shadowTex = null;
function contactShadow() {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 128, 10, 64, 128, 128);
  rg.addColorStop(0, 'rgba(0,0,0,0.75)'); rg.addColorStop(0.55, 'rgba(0,0,0,0.45)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.scale(1, 1); g.fillStyle = rg; g.fillRect(0, 0, 128, 256); g.restore();
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

function extrude(points, depth, bevel, curveSeg = 24) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  return { s, done: () => {
    const geo = new THREE.ExtrudeGeometry(s, { depth, curveSegments: curveSeg, bevelEnabled: !!bevel, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 5 });
    geo.translate(0, 0, -depth / 2); geo.rotateY(-Math.PI / 2); geo.computeVertexNormals();
    return geo;
  } };
}

export function makeCar({ type = 'suv', color = 0xf2f2f0, envMap = null, metallic = 0.15 } = {}) {
  const P = PROFILES[type], g = new THREE.Group();
  const dark = new THREE.Color(color).getHSL({}).l < 0.2;
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: metallic, roughness: dark ? 0.32 : 0.28, clearcoat: 1, clearcoatRoughness: 0.06, envMap, envMapIntensity: dark ? 0.55 : 1.0 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x050709, metalness: 0.0, roughness: 0.12, envMap, envMapIntensity: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.1 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.55 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 1, roughness: 0.12, envMap });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.92 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 0.9, roughness: 0.28, envMap });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xf4f7fb, emissive: 0xe6f0ff, emissiveIntensity: 0.35, metalness: 0.3, roughness: 0.1 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x8a0d12, emissive: 0x5a0508, emissiveIntensity: 0.6, roughness: 0.2 });

  const { L, W, wheelR, wheelX, arch, clear } = P;
  const bev = 0.32, depth = W - 2 * bev;
  // body outline: profile points, then the underside with two wheel arches
  const shape = extrude(P.body, depth, bev);
  const s = shape.s, wy = wheelR;
  s.lineTo(wheelX + arch, clear); s.lineTo(wheelX + arch, wy);
  s.absarc(wheelX, wy, arch, 0, Math.PI, false);
  s.lineTo(wheelX - arch, clear); s.lineTo(-wheelX + arch, clear); s.lineTo(-wheelX + arch, wy);
  s.absarc(-wheelX, wy, arch, 0, Math.PI, false);
  s.lineTo(-wheelX - arch, clear); s.lineTo(P.body[0][0], clear); s.closePath();
  const body = new THREE.Mesh(shape.done(), paint); g.add(body);

  // side glass, slightly proud of the body sides
  const gl = extrude(P.glass, W + 0.02, 0, 4); gl.s.closePath();
  g.add(new THREE.Mesh(gl.done(), glass));
  // windscreen and rear window as panels lying on the profile
  const panel = ([a, b], width, out) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len, sgn = Math.sign(ny) || 1;
    const m = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, len * 0.94), glass);
    m.position.set(0, (a[1] + b[1]) / 2 + ny * sgn * out, (a[0] + b[0]) / 2 + nx * sgn * out);
    m.rotation.x = -Math.atan2(dy, dx);
    g.add(m);
  };
  panel(P.shield, W - 0.75, 0.27); panel(P.rear, W - 1.0, 0.22);
  // body-coloured pillars over the side glass
  for (const z of P.pillars) for (const sx of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.4, 0.32), paint);
    p.position.set(sx * (W / 2 + 0.02), (P.glass[0][1] + P.glass[1][1]) / 2 + 0.05, z); g.add(p);
  }
  // door shut lines and handles
  for (const sx of [-1, 1]) {
    for (const z of [P.pillars[0] + 0.15, P.glass[3][0] - 0.2, ...(type === 'suv' ? [P.pillars[1] + 0.1] : [])]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.03, 2.2, 0.035), trim); l.position.set(sx * (W / 2 + 0.005), 2.75, z); g.add(l);
    }
    for (const z of [P.pillars[0] + 0.9, P.pillars[0] - 1.9]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.55), chrome); h.position.set(sx * (W / 2 + 0.03), 3.45, z); g.add(h);
    }
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.38, 0.5), paint);
    mirror.position.set(sx * (W / 2 + 0.25), P.glass[0][1] + 0.15, P.glass[3][0] - 0.25); g.add(mirror);
  }
  // lower cladding and bumpers
  const clad = type === 'suv' ? trim : paint;
  for (const sx of [-1, 1]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, (wheelX - arch) * 2), clad); sk.position.set(sx * (W / 2 - 0.02), clear + 0.25, 0); g.add(sk); }
  const fb = new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, 0.55, 0.3), trim); fb.position.set(0, clear + 0.3, L / 2 - 0.05); g.add(fb);
  const rb = new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, 0.5, 0.3), trim); rb.position.set(0, clear + 0.3, -L / 2 + 0.05); g.add(rb);
  // grille, lights, plates
  const front = P.body[P.body.length - 2][0];
  const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.42, type === 'suv' ? 0.85 : 0.55, 0.12), trim); grille.position.set(0, type === 'suv' ? 2.45 : 2.05, front + 0.22); g.add(grille);
  const gTrim = new THREE.Mesh(new THREE.BoxGeometry(W * 0.44, 0.07, 0.14), chrome); gTrim.position.set(0, grille.position.y + (type === 'suv' ? 0.45 : 0.3), front + 0.22); g.add(gTrim);
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.32, 0.12), lamp); hl.position.set(sx * (W / 2 - 0.85), grille.position.y + 0.35, front + 0.14); hl.rotation.y = sx * -0.25; g.add(hl);
    const fog = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.08), lamp); fog.position.set(sx * (W / 2 - 0.8), clear + 0.3, L / 2 + 0.12); g.add(fog);
  }
  const tl = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.2, 0.08), tail); tl.position.set(0, type === 'suv' ? 3.45 : 3.12, -L / 2 + (type === 'suv' ? 0.12 : 0.05)); g.add(tl);
  for (const sx of [-1, 1]) { const t2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.42, 0.1), tail); t2.position.set(sx * (W / 2 - 0.65), tl.position.y - 0.12, tl.position.z); g.add(t2); }
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.4 });
  for (const [z, y] of [[L / 2 + 0.2, clear + 0.75], [-L / 2 - 0.15, clear + 1.25]]) {
    const pl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.42, 0.04), plateMat); pl.position.set(0, y, z); g.add(pl);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.05), new THREE.MeshStandardMaterial({ color: 0x1d4fb8 })); st.position.set(-0.74, y, z); g.add(st);
  }
  if (type === 'suv') for (const sx of [-1, 1]) { const rr = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 6.2), trim); rr.position.set(sx * (W / 2 - 0.55), 5.62, -2.7); g.add(rr); }
  // wheels: tyre, alloy face with spokes, hub
  const tyreGeo = new THREE.CylinderGeometry(wheelR, wheelR, 0.82, 36); tyreGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(wheelR * 0.66, wheelR * 0.66, 0.84, 28); rimGeo.rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) for (const z of [wheelX, -wheelX]) {
    const x = sx * (W / 2 - 0.42);
    const t = new THREE.Mesh(tyreGeo, rubber); t.position.set(x, wheelR, z); g.add(t);
    const rim = new THREE.Mesh(rimGeo, trim); rim.position.set(x, wheelR, z); g.add(rim);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.06, wheelR * 1.25, 0.2), alloy);
      sp.position.set(x + sx * 0.42, wheelR, z); sp.rotation.x = (i / 5) * Math.PI; g.add(sp);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(wheelR * 0.64, 0.06, 8, 32), alloy); ring.rotation.y = Math.PI / 2; ring.position.set(x + sx * 0.43, wheelR, z); g.add(ring);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16), chrome); hub.rotation.z = Math.PI / 2; hub.position.set(x + sx * 0.44, wheelR, z); g.add(hub);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  // soft contact shadow
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(W + 1.6, L + 1.8), new THREE.MeshBasicMaterial({ map: contactShadow(), transparent: true, depthWrite: false }));
  sh.rotation.x = -Math.PI / 2; sh.position.y = 0.03; sh.renderOrder = 1; g.add(sh);
  g.userData.size = { W: W + 0.6, L };
  return g;
}
