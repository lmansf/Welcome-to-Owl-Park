import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SettingsStore, TEXT_SIZES, parseSettings } from './settings';
import { TEXT_CSS, TEXT_KEEPS, textZoom, viewportZoom } from './textSize';

/** The park's own code (tests left out), as text, file by file. */
function parkFiles(dir = fileURLToPath(new URL('.', import.meta.url))): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...parkFiles(p));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push([p, readFileSync(p, 'utf8')]);
  }
  return out;
}

describe('text size (OP-386, D8)', () => {
  it('offers as made, half again and twice, as made by default', () => {
    expect([...TEXT_SIZES]).toEqual([100, 150, 200]);
    expect(parseSettings(null, false).text).toBe(100);
    expect(textZoom(100)).toBe(1);
    expect(textZoom(200)).toBe(2);
  });

  it('keeps a size the visitor chose, and drops one it does not offer', () => {
    expect(parseSettings('{"text":200}', false).text).toBe(200);
    expect(parseSettings('{"text":150,"calm":true}', false)).toMatchObject({ text: 150, calm: true });
    for (const bad of ['{"text":300}', '{"text":"200"}', '{"text":true}', '{"text":0}']) expect(parseSettings(bad, false).text, bad).toBe(100);
  });

  it('is stored with the other settings and heard by whoever listens', () => {
    const data = new Map<string, string>();
    const store = new SettingsStore({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }, false);
    const heard: number[] = [];
    store.onChange((s) => heard.push(s.text));
    store.set({ text: 200 });
    store.set({ text: 200 }); // the same again is no change
    store.set({ text: 7 as never });
    expect(heard).toEqual([200]);
    expect(JSON.parse(data.get('owl-park:settings')!).text).toBe(200);
  });

  it('a browser that zooms screen units inside the HUD gets them divided back, one that does not is left alone', () => {
    expect(viewportZoom(824, 412, 2)).toBe(2);
    expect(viewportZoom(412, 412, 2)).toBe(1);
    expect(viewportZoom(600, 412, 1.5)).toBe(1.5);
    expect(viewportZoom(398, 412, 2)).toBe(1); // a scrollbar's worth narrower is still unzoomed
    expect(viewportZoom(0, 412, 2)).toBe(1);
    expect(viewportZoom(412, 412, 1)).toBe(1);
  });

  it('every size by the screen in the park’s styles is divided by the HUD’s zoom, so a panel still fits at 200%', () => {
    const bare = /(?<![\w.-])\d+(?:\.\d+)?(?:d|s|l)?v[wh]\b(?!\/var\(--vz)/g;
    const found: string[] = [];
    for (const [file, text] of parkFiles()) {
      if (file.endsWith('textSize.ts')) continue; // its probe measures the screen itself
      for (const m of text.matchAll(bare)) found.push(`${file.split('/src/')[1]}: ${m[0]}`);
    }
    expect(found).toEqual([]);
  });

  it('the thumbstick, the controller pad and the doorway hints keep their own size', () => {
    for (const k of TEXT_KEEPS) expect(TEXT_CSS).toContain(`#hud ${k}`);
    expect(TEXT_CSS).toContain('zoom:var(--unzoom,1)');
  });
});
