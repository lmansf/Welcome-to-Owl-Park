import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The park's engine (phaser.cjs) leaves out the parts of Phaser the park does not use (OP-129), but
// the park's code is typed against the whole of Phaser, so the type checker cannot tell. These read
// the park's code for what it asks of the engine, and the engine's entry for what it has: a part
// left out fails here rather than on a visitor's screen.

const ENTRY = readFileSync(resolve(import.meta.dirname, 'phaser.cjs'), 'utf8');
const APP = resolve(import.meta.dirname, '../..');
const PHASER = resolve(APP, 'node_modules/phaser');

/** The park's own code (not its tests), file by file. */
function parkCode(dir = resolve(import.meta.dirname, '..'), out: Array<{ file: string; code: string }> = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) parkCode(path, out);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push({ file: relative(APP, path), code: readFileSync(path, 'utf8') });
  }
  return out;
}
const CODE = parkCode();

/** Every match of `re` in the park's code: the first group, and where. */
function asked(re: RegExp): Map<string, string> {
  const found = new Map<string, string>();
  for (const { file, code } of CODE) for (const m of code.matchAll(re)) if (!found.has(m[1]!)) found.set(m[1]!, file);
  return found;
}

/** The names the entry's game-object factories (`add`) or creators (`make`) register as they load. */
function registered(kind: 'Factory' | 'Creator'): Set<string> {
  const names = new Set<string>();
  for (const m of ENTRY.matchAll(new RegExp(`require\\('phaser/(src/gameobjects/[\\w/]+${kind})'\\)`, 'g'))) {
    const source = readFileSync(resolve(PHASER, `${m[1]}.js`), 'utf8');
    for (const r of source.matchAll(new RegExp(`GameObject${kind}\\.register\\('(\\w+)'`, 'g'))) names.add(r[1]!);
  }
  return names;
}

/** The keys of an object literal in the entry (`var Phaser = {` or `var GameObjects = {`), one level deep. */
function keysOf(name: string): Set<string> {
  const start = ENTRY.indexOf(`var ${name} = {`);
  const body = ENTRY.slice(start, ENTRY.indexOf('\n};', start));
  return new Set([...body.matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]!));
}

describe("the park's engine", () => {
  it('has a factory for each kind of game object the park adds', () => {
    const have = registered('Factory');
    expect(have.size).toBeGreaterThan(5);
    for (const [kind, file] of asked(/\badd\s*\.\s*(\w+)\s*\(/g)) if (kind !== 'existing') expect(have.has(kind), `${file} adds a '${kind}': its factory goes in phaser.cjs`).toBe(true);
  });

  it('has a creator for each kind the park makes', () => {
    const have = registered('Creator');
    for (const [kind, file] of asked(/\bmake\s*\.\s*(\w+)\s*\(/g)) expect(have.has(kind), `${file} makes a '${kind}': its creator goes in phaser.cjs`).toBe(true);
  });

  it("has each part of Phaser the park's code names", () => {
    const parts = keysOf('Phaser');
    const consts = readFileSync(resolve(PHASER, 'src/const.js'), 'utf8');
    for (const [part, file] of asked(/\bPhaser\.([A-Z]\w*)/g)) {
      if (part === 'Types') continue; // types only, never in the script
      expect(parts.has(part) || new RegExp(`^ {4}${part}:`, 'm').test(consts), `${file} uses Phaser.${part}: add it to phaser.cjs`).toBe(true);
    }
    const objects = keysOf('GameObjects');
    for (const [kind, file] of asked(/\bPhaser\.GameObjects\.(\w+)/g)) expect(objects.has(kind), `${file} uses Phaser.GameObjects.${kind}: add it to phaser.cjs`).toBe(true);
  });

  it('is not asked for the scene systems it leaves out', () => {
    for (const [system, file] of asked(/\b(?:this|scene|sys|game)\s*\.\s*(load|sound|physics|matter|impact|lights)\s*\./g)) expect.fail(`${file} uses a scene's ${system}, which the park's engine leaves out (phaser.cjs)`);
  });
});
