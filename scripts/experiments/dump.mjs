import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });
await page.goto('http://localhost:5199', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.mmm, null, { timeout: 30000 });
const items = await page.$$('.menu-item');
if (items.length) await items[0].click();
await page.waitForFunction(() => window.mmm.sim.simTime >= 7, null, { timeout: 200000 });
const info = await page.evaluate(() => {
  const out = [];
  const o = window.mmm.sim.objects.find((o) => o.id === 'lamb_8');
  o.root.traverse((m) => { if (m.isMesh) { out.push(`${m.geometry.type} scale=${m.scale.x.toFixed(2)},${m.scale.y.toFixed(2)},${m.scale.z.toFixed(2)} mat=${m.material.type} color=#${m.material.color.getHexString()}`); } });
  return { type: o.type, ctor: o.constructor.name, meshes: out.slice(0, 12), n: out.length };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
