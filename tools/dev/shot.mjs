// Screenshot the running dev server: node tools/dev/shot.mjs "<query>" out.png [w] [h] [dpr]
import { chromium } from '@playwright/test';
const [query = '', out = 'shot.png', w = '1280', h = '800', dpr = '1'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr });
await page.goto(`http://localhost:5173/?transport=local&${query}`);
await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: out });
console.log('wrote', out);
await browser.close();
