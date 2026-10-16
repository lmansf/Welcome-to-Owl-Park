// Walk through a doorway on the dev server and report what happens: node tools/dev/probe-door.mjs [to-grove]
import { chromium } from '@playwright/test';
const door = process.argv[2] ?? 'to-grove';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, (e.stack || '').split('\n').slice(1, 3).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning' || m.type() === 'info') console.log('[console]', m.type(), m.text().slice(0, 200)); });
await page.goto('http://localhost:5173/?transport=local&id=probe');
await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20000 });
const s0 = await page.evaluate(() => window.owlPark.state());
const d = s0.doors.find((x) => x.id === door);
console.log('start', s0.room, 'door', d);
await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), d);
for (let i = 0; i < 16; i++) {
  await page.waitForTimeout(500);
  const s = await page.evaluate(() => window.owlPark.state());
  const scenes = await page.evaluate(() => window.owlPark.game.scene.getScenes(true).map((sc) => sc.scene.key + ':' + sc.scene.settings.status));
  console.log((i * 0.5).toFixed(1) + 's', s ? `${s.room} pos=${Math.round(s.pos.x)},${Math.round(s.pos.y)} walking=${s.walking} connected=${s.connected}` : 'state=null', 'scenes', scenes.join(','));
}
await browser.close();
