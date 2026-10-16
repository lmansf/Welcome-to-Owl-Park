#!/usr/bin/env node
// Rasterize an SVG (or an HTML file) to PNG with the bundled Chromium, so art can be
// previewed exactly as the game will load it. Usage:
//   node tools/render-svg.mjs <input.svg|input.html> <output.png> [width] [height]
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { statSync } from 'node:fs';

const [input, output, w = '1600', h = '900'] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: render-svg.mjs <input.svg|input.html> <output.png> [width] [height]');
  process.exit(2);
}
const width = Number(w);
const height = Number(h);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // Navigate straight to the file so same-scheme (file://) resources resolve.
  await page.goto(pathToFileURL(resolve(input)).href, { waitUntil: 'load' });
  if (input.toLowerCase().endsWith('.svg')) {
    // Make the root SVG fill the viewport exactly, like the game's rasterizer does.
    await page.evaluate(([w, h]) => {
      const root = document.documentElement;
      root.setAttribute('width', String(w));
      root.setAttribute('height', String(h));
      root.setAttribute('preserveAspectRatio', 'none');
      root.style.display = 'block';
      root.style.margin = '0';
    }, [width, height]);
  }
  await page.waitForTimeout(100);
  await page.screenshot({ path: resolve(output), omitBackground: true, clip: { x: 0, y: 0, width, height } });
  const bytes = statSync(resolve(output)).size;
  console.log(`wrote ${output} (${width}x${height}, ${bytes} bytes)`);
  if (errors.length) console.log(`page errors: ${errors.join(' | ')}`);
} finally {
  await browser.close();
}
