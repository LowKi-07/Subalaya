// Neighbourhood: procedural Indian-style G+1 / G+2 houses on adjoining plots,
// a row across the street, trees and street lights. Units: feet.
import * as THREE from 'three';

function rng(seed) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const PALETTES = [
  [0xf1e3cf, 0xd9bf9a], [0xf3ece2, 0x9aa7b0], [0xefe0d0, 0xc98f6a], [0xe9ecef, 0x6f7f8c],
  [0xf5e9d6, 0xb59a7a], [0xe8e2d6, 0x8b9a7b], [0xf6efe6, 0xcfa98a],
];

export function buildNeighbourhood({ group, colliders, envMap, litMaterials }) {
  const r = rng(42);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1a2530, metalness: 0.3, roughness: 0.06, envMap, envMapIntensity: 0.9 });
  const lit = new THREE.MeshStandardMaterial({ color: 0x3a3226, emissive: 0xffc879, emissiveIntensity: 0 });
  litMaterials.push(lit);
  const frame = new THREE.MeshStandardMaterial({ color: 0x202326, roughness: 0.5 });
  const rail = new THREE.MeshStandardMaterial({ color: 0x1f2124, metalness: 0.6, roughness: 0.4 });
  const glassRail = new THREE.MeshPhysicalMaterial({ color: 0xcfe3ea, transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false });
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.7 });
  const paver = new THREE.MeshStandardMaterial({ color: 0xb9b2a6, roughness: 0.95 });
  const mats = PALETTES.map(([a, b]) => [new THREE.MeshStandardMaterial({ color: a, roughness: 0.92 }), new THREE.MeshStandardMaterial({ color: b, roughness: 0.85 })]);

  const box = (w, h, d, m, x, y, z, cast = true) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z);
    o.castShadow = cast; o.receiveShadow = true; group.add(o); return o;
  };

  // face: +1 = street at +z, -1 = street at -z
  function house(x1, x2, z1, z2, floors, face, pi) {
    const [wall, accent] = mats[pi % mats.length];
    const w = x2 - x1, cx = (x1 + x2) / 2;
    const fz = face > 0 ? z2 : z1;              // street-side edge of the plot
    const setback = 6;                          // front yard / parking
    const bz1 = face > 0 ? z1 + 2 : z1 + setback, bz2 = face > 0 ? z2 - setback : z2 - 2;
    const d = bz2 - bz1, bcz = (bz1 + bz2) / 2, H = floors * 10;
    const front = face > 0 ? bz2 : bz1;
    box(w - 3, H, d, wall, cx, H / 2, bcz);
    colliders.push([x1 + 1.5, bz1, x2 - 1.5, bz2]);
    // floor bands and parapet
    for (let f = 1; f <= floors; f++) box(w - 2.6, 0.6, 0.6, accent, cx, f * 10 - 0.3, front + face * 0.3);
    box(w - 3, 3, 0.5, wall, cx, H + 1.5, front - face * 0.25);
    box(w - 3, 3, 0.5, wall, cx, H + 1.5, (face > 0 ? bz1 : bz2) + face * 0.25);
    box(0.5, 3, d, wall, x1 + 1.75, H + 1.5, bcz); box(0.5, 3, d, wall, x2 - 1.75, H + 1.5, bcz);
    // stair headroom + water tank on the roof (very common on Indian terraces)
    const mx = r() < 0.5 ? x1 + 7 : x2 - 7;
    box(9, 8, 10, wall, mx, H + 4, bcz - face * (d / 2 - 7));
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 3.6, 18), tankMat);
    tank.position.set(mx, H + 9.8, bcz - face * (d / 2 - 7)); tank.castShadow = true; group.add(tank);
    // street-side windows and balconies
    for (let f = 0; f < floors; f++) {
      const y0 = f * 10;
      const nWin = w > 26 ? 3 : 2;
      for (let i = 0; i < nWin; i++) {
        const wx = x1 + 2 + ((w - 4) * (i + 0.5)) / nWin, ww = Math.min(5.5, (w - 8) / nWin);
        if (f === 0 && i === 0) { // entrance door
          box(3.2, 7, 0.2, new THREE.MeshStandardMaterial({ color: 0x6b4428, roughness: 0.6 }), wx, 3.5, front + face * 0.1);
          continue;
        }
        const m = r() < 0.35 ? lit : glass;
        box(ww, 4.2, 0.15, m, wx, y0 + 5.2, front + face * 0.08, false);
        box(ww + 0.4, 0.25, 0.3, frame, wx, y0 + 7.4, front + face * 0.15);
        box(ww + 0.4, 0.25, 0.3, frame, wx, y0 + 3.0, front + face * 0.15);
        box(0.2, 4.4, 0.3, frame, wx, y0 + 5.2, front + face * 0.15);
        box(ww + 1.2, 0.2, 1.4, accent, wx, y0 + 7.9, front + face * 0.7); // sunshade
      }
      if (f > 0 && r() < 0.6) { // balcony
        const bw = Math.min(12, w * 0.45), bx = r() < 0.5 ? x1 + 2 + bw / 2 : x2 - 2 - bw / 2;
        box(bw, 0.5, 3.5, accent, bx, y0 + 0.25, front + face * 1.75);
        box(bw, 3, 0.06, r() < 0.5 ? glassRail : rail, bx, y0 + 2, front + face * 3.45, false);
        if (r() < 0.5) for (let k = -bw / 2 + 0.4; k < bw / 2; k += 0.5) box(0.06, 3, 0.06, rail, bx + k, y0 + 2, front + face * 3.45, false);
      }
    }
    // side windows (visible from our plot)
    for (let f = 0; f < floors; f++) for (const sx of [x1 + 1.45, x2 - 1.45]) for (let k = 0; k < 2; k++) {
      const z = bz1 + d * (0.3 + k * 0.4), m = r() < 0.3 ? lit : glass;
      box(0.12, 3.6, 4, m, sx + (sx < cx ? -0.04 : 0.04), f * 10 + 5, z, false);
    }
    // front yard paving, compound wall and gate
    floor(x1, Math.min(fz, front), x2, Math.max(fz, front), paver);
    box(w * 0.58, 3.5, 0.5, wall, x1 + w * 0.3, 1.75, fz - face * 0.25);
    const gate = box(w * 0.38, 4, 0.12, rail, x1 + w * 0.79, 2, fz - face * 0.25);
    gate.castShadow = true;
    colliders.push([x1, Math.min(fz, fz - face * 0.5), x2, Math.max(fz, fz - face * 0.5)]);
    // a parked scooter/car silhouette now and then
    if (r() < 0.4) {
      const c = box(5.6, 3.8, 12, new THREE.MeshStandardMaterial({ color: [0x9aa2aa, 0x7a1a1a, 0x1f2a38][Math.floor(r() * 3)], metalness: 0.5, roughness: 0.35, envMap }), cx + w * 0.18, 2.2, (front + fz) / 2 + face * 0.0);
      c.scale.set(1, 1, Math.min(1, (setback - 0.5) / 12));
    }
  }
  function floor(x1, z1, x2, z2, m) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(x2 - x1, z2 - z1), m);
    p.rotation.x = -Math.PI / 2; p.position.set((x1 + x2) / 2, 0.01, (z1 + z2) / 2); p.receiveShadow = true; group.add(p);
  }
  return { house, floor };
}

export function tree(group, x, z, s = 1, seed = 1) {
  const r = rng(seed);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28 * s, 0.45 * s, 7 * s, 8), new THREE.MeshStandardMaterial({ color: 0x6b5442, roughness: 1 }));
  trunk.position.set(x, 3.5 * s, z); trunk.castShadow = true; group.add(trunk);
  const greens = [0x4f7a3a, 0x5d8a43, 0x46703a, 0x6a9450];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.MeshStandardMaterial({ color: greens[i % greens.length], roughness: 0.95, flatShading: true });
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry((2 + r() * 1.6) * s, 1), m);
    b.position.set(x + (r() - 0.5) * 4 * s, (8 + r() * 3.5) * s, z + (r() - 0.5) * 4 * s);
    b.castShadow = true; group.add(b);
  }
}

export function streetLight(group, x, z, face, litMaterials) {
  const pole = new THREE.MeshStandardMaterial({ color: 0x3a3e42, metalness: 0.6, roughness: 0.4 });
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 18, 10), pole); p.position.set(x, 9, z); p.castShadow = true; group.add(p);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 4), pole); arm.position.set(x, 17.8, z + face * 2); group.add(arm);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdedede, emissive: 0xffe2a8, emissiveIntensity: 0 });
  litMaterials.push(headMat);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 1.8), headMat); h.position.set(x, 17.6, z + face * 3.6); group.add(h);
}
