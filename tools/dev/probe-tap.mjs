// Tap the floor in phone emulation and sample the owl state: node tools/dev/probe-tap.mjs
import { chromium, devices } from '@playwright/test';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?transport=local&id=probe');
await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20000 });
await page.waitForTimeout(700);
const cam = await page.evaluate(() => window.owlPark.camera());
const s0 = await page.evaluate(() => window.owlPark.state());
const target = { x: s0.pos.x + Math.min(220, cam.viewW * 0.3), y: s0.pos.y + 40 };
const sx = ((target.x - cam.viewX) * cam.zoom) / cam.dpr, sy = ((target.y - cam.viewY) * cam.zoom) / cam.dpr;
console.log('pos', s0.pos, 'target', target, 'screen', { sx: sx.toFixed(1), sy: sy.toFixed(1) }, 'cam', cam);
await page.evaluate(() => { window.__ev = []; const c = document.querySelector('canvas'); for (const t of ['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','click']) c.addEventListener(t, (e) => window.__ev.push(t + ':' + (e.target === c ? 'canvas' : e.target.tagName))); });
await page.mouse.click(sx, sy);
for (let i = 0; i < 12; i++) { await page.waitForTimeout(80); const s = await page.evaluate(() => window.owlPark.state()); console.log((i * 80) + 'ms', 'walking', s.walking, 'pos', Math.round(s.pos.x), Math.round(s.pos.y)); }
console.log('events', await page.evaluate(() => window.__ev));
await browser.close();
