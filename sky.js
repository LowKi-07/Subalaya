// Painted sky: an equirectangular canvas with a blue gradient and soft, wispy clouds,
// used as the scene background and (via PMREM) as the reflection source for cars and glass.
import * as THREE from 'three';

function rng(seed) {
  return () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function paintSky({ night = false, width = 2048 } = {}) {
  const W = width, H = width / 2, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rng(night ? 5 : 3);
  const horizon = H / 2;
  const grad = g.createLinearGradient(0, 0, 0, horizon);
  if (night) {
    grad.addColorStop(0, '#050a18'); grad.addColorStop(0.6, '#0e1a33'); grad.addColorStop(1, '#2a3550');
  } else {
    grad.addColorStop(0, '#1f5fc4'); grad.addColorStop(0.45, '#3f86df'); grad.addColorStop(0.8, '#8dbcec'); grad.addColorStop(1, '#dcebf7');
  }
  g.fillStyle = grad; g.fillRect(0, 0, W, horizon);
  const gg = g.createLinearGradient(0, horizon, 0, H);
  if (night) { gg.addColorStop(0, '#1b2233'); gg.addColorStop(1, '#0a0d14'); }
  else { gg.addColorStop(0, '#b9bfc2'); gg.addColorStop(0.08, '#7d7a72'); gg.addColorStop(1, '#4a4741'); } // ground, seen only in reflections
  g.fillStyle = gg; g.fillRect(0, horizon, W, H - horizon);

  if (night) {
    for (let i = 0; i < 900; i++) { const y = r() * horizon * 0.85; g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.7})`; g.fillRect(r() * W, y, r() < 0.1 ? 2 : 1, r() < 0.1 ? 2 : 1); }
  } else {
    // wispy altocumulus streaks, denser and flatter toward the horizon
    const puff = (x, y, rx, ry, a) => {
      for (const ox of [-W, 0, W]) {
        const rg = g.createRadialGradient(x + ox, y, 0, x + ox, y, rx);
        rg.addColorStop(0, `rgba(255,255,255,${a})`); rg.addColorStop(0.55, `rgba(255,255,255,${a * 0.45})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
        g.save(); g.translate(x + ox, y); g.scale(1, ry / rx); g.translate(-(x + ox), -y);
        g.fillStyle = rg; g.beginPath(); g.arc(x + ox, y, rx, 0, Math.PI * 2); g.fill(); g.restore();
      }
    };
    for (let k = 0; k < 70; k++) {
      const cy = horizon * (0.12 + r() * 0.8), depth = cy / horizon; // 0 top .. 1 horizon
      const cx = r() * W, n = 6 + Math.floor(r() * 10), spread = 60 + r() * 160;
      const tilt = (r() - 0.5) * 0.5;
      for (let i = 0; i < n; i++) {
        const t = (i / n - 0.5) * spread * 2;
        const rx = (18 + r() * 40) * (1.3 - depth * 0.6), ry = rx * (0.35 - depth * 0.22);
        puff(cx + t, cy + t * tilt + (r() - 0.5) * 12, rx, Math.max(3, ry), 0.18 + r() * 0.3);
      }
    }
    // haze at the horizon
    const hz = g.createLinearGradient(0, horizon - 60, 0, horizon);
    hz.addColorStop(0, 'rgba(235,242,248,0)'); hz.addColorStop(1, 'rgba(235,242,248,0.85)');
    g.fillStyle = hz; g.fillRect(0, horizon - 60, W, 60);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
