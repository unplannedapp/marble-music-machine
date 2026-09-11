import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 500, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
await page.goto('http://localhost:8765/', { waitUntil: 'load' });
await page.waitForFunction(() => !!window.mmm, null, { timeout: 30000 });
const items = await page.$$('.menu-item');
console.log('menu items', await Promise.all(items.map((i) => i.textContent())));
await items[Number(process.argv[2] ?? 1)].click();
for (const t of [0.5, 2, 3.5, 6, 10]) {
  await page.waitForFunction((tt) => window.mmm.sim.simTime >= tt, t, { timeout: 60000 });
  console.log(await page.evaluate(() => `t ${window.mmm.sim.simTime.toFixed(2)} ctx ${window.mmm.audio.ctx.state} clip ${window.mmm.audio.clipStatus} playing ${window.mmm.audio.clipPlaying} notes ${window.mmm.notes()} line "${document.querySelector('.recording-line')?.textContent}"`));
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
