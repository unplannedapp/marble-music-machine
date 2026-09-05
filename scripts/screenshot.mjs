/**
 * Headless browser check: loads the dev server, waits for the sim, and captures
 * screenshots at a few moments. Usage: node scripts/screenshot.mjs [baseUrl] [outDir]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'shots';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ ...(process.env.SHOT_MOBILE ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', hasTouch: true, isMobile: true } : {}), viewport: { width: Number(process.env.SHOT_W ?? 900), height: Number(process.env.SHOT_H ?? 1400) }, deviceScaleFactor: Number(process.env.SHOT_DPR ?? 1) });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.mmm, null, { timeout: 30000 });
// Pick a machine from the menu (SHOT_PICK index): unlocks audio and starts it.
if (process.env.SHOT_MENU) await page.screenshot({ path: `${out}/menu.png` });
const items = await page.$$('.menu-item');
if (items.length) await items[Math.min(Number(process.env.SHOT_PICK ?? 0), items.length - 1)].click();
else await page.click('#start');
await page.waitForFunction(() => window.mmm.sim.simTime > 0.5, null, { timeout: 30000 });
console.log('audio state after tap:', await page.evaluate(() => window.mmm.audio.ctx.state));
for (const t of (process.env.SHOT_TIMES ?? '1.5,4.5,6.5,9').split(',').map(Number)) {
  await page.waitForFunction((tt) => window.mmm.sim.simTime >= tt, t, { timeout: 60000 });
  const info = await page.evaluate(() => {
    const s = window.mmm.sim; const p = s.marble.body.translation();
    return { t: s.simTime.toFixed(2), pos: [p.x.toFixed(2), p.y.toFixed(2), p.z.toFixed(2)], contacts: s.physics.contactCount, last: s.lastContact?.object.id, notes: window.mmm.notes() };
  });
  console.log(JSON.stringify(info));
  await page.screenshot({ path: `${out}/t${t}.png` });
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
