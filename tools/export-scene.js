// Export the live walkthrough scene to GLB for Blender. Usage: node tools/export-scene.js out.glb
// Needs the site served on http://localhost:8766 and Playwright installed.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 320, height: 240 } });
  p.on('pageerror', (e) => console.log('ERR', e.message));
  await p.goto('http://localhost:8766/index.html?lowq&noao&nobake');
  await p.waitForFunction(() => window.walkthrough, null, { timeout: 120000 });
  await p.evaluate(() => walkthrough.modelsReady()); await p.waitForTimeout(6000);
  const b64 = await p.evaluate(async () => {
    const { GLTFExporter } = await import('/tools/GLTFExporter.js');
    const w = walkthrough, root = new w.THREE.Group();
    const parts = [...w.groups, w.roofGroup, w.siteGroup];
    parts.forEach((g, i) => { g.visible = true; g.name = ['L0', 'L1', 'ROOF', 'SITE'][i]; });
    const buf = await new GLTFExporter().parseAsync(parts, { binary: true, onlyVisible: false });
    void root;
    let s = ''; const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  });
  fs.writeFileSync(process.argv[2], Buffer.from(b64, 'base64'));
  console.log('wrote', process.argv[2], fs.statSync(process.argv[2]).size);
  await b.close();
})();
