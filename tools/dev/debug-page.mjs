// Dump console output, page errors and a screenshot of the running dev server: node tools/dev/debug-page.mjs [out.png]
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 400)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0,4).join(' | ')));
page.on('requestfailed', (r) => console.log('[reqfail]', r.url(), r.failure()?.errorText));
await page.goto('http://localhost:5173/?transport=local');
await page.waitForTimeout(4000);
console.log('state:', JSON.stringify(await page.evaluate(() => window.owlPark ? window.owlPark.state() : 'no owlPark')));
console.log('scenes:', JSON.stringify(await page.evaluate(() => window.owlPark?.game.scene.getScenes(true).map(s => s.scene.key))));
const out = process.argv[2] ?? 'debug.png';
await page.screenshot({ path: out });
console.log('wrote', out);
await browser.close();
