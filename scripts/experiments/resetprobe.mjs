import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
await page.goto('http://localhost:8765/', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.mmm, null, { timeout: 30000 });
const items = await page.$$('.menu-item');
await items[Number(process.argv[2] ?? 1)].click();
await page.evaluate(() => {
  window.__log = [];
  const bus = window.mmm.sim.bus;
  for (const ev of ['marble:reset', 'marble:respawn', 'music:note', 'checkpoint']) bus.on(ev, (e) => window.__log.push(`${ev} ${JSON.stringify(e && (e.reason ?? e.object?.id ?? e.id ?? ''))} t=${window.mmm.sim.simTime.toFixed(2)} playing=${window.mmm.audio.clipPlaying}`));
});
await page.waitForFunction(() => window.mmm.sim.simTime >= 14, null, { timeout: 90000 });
console.log((await page.evaluate(() => window.__log)).join('\n'));
await browser.close();
