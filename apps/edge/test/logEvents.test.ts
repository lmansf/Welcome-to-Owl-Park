import { describe, expect, it } from 'vitest';
import { LOGGER_EVENTS, LOG_EVENTS, RESERVED_LOG_EVENTS } from '@owl-park/shared';

// The files as text, through the test runner's own loader (the Worker's types have no file system).
declare global {
  interface ImportMeta {
    glob(pattern: string | string[], options: { query: '?raw'; import: 'default'; eager: true }): Record<string, string>;
  }
}
const tests = import.meta.glob('./*.test.ts', { query: '?raw', import: 'default', eager: true });
// The keepers' pages are the browser's own scripts, served as text: not the Worker's code.
const sources = import.meta.glob(['../src/*.ts', '!../src/*Page.ts'], { query: '?raw', import: 'default', eager: true });

describe('the log’s events (OP-134)', () => {
  it('each fires in a test: every event in the list is looked for with logged() in these tests, the shared logger’s own in its tests', () => {
    const looked = new Set([...Object.values(tests).join('\n').matchAll(/logged\([^,]+,\s*'([a-z_0-9]+)'/g)].map((m) => m[1]!));
    expect(Object.keys(tests).length).toBeGreaterThan(10);
    // The privacy refusal is the shared logger's own: packages/shared/src/log.test.ts fires it. (Read from
    // here, that file is outside the package, and a mutation run's copy of the package has none of it.)
    expect(LOG_EVENTS.filter((e) => !RESERVED_LOG_EVENTS.includes(e) && !LOGGER_EVENTS.includes(e) && !looked.has(e))).toEqual([]);
  });

  it('leaves the Worker and the room server no catch that swallows an error unseen, and no log line past the shared logger', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    const found: string[] = [];
    for (const [f, text] of Object.entries(sources)) {
      // A catch block with nothing in it but comments, and a promise's catch that turns its error into nothing.
      for (const m of text.matchAll(/catch\s*(?:\([^)]*\))?\s*\{(?:\s|\/\/[^\n]*|\/\*[\s\S]*?\*\/)*\}/g)) found.push(`${f}: ${m[0].replace(/\s+/g, ' ')}`);
      for (const m of text.matchAll(/\.catch\(\(\)\s*=>\s*(?:undefined|void 0|\{\s*\})\)/g)) found.push(`${f}: ${m[0]}`);
      // A body that does not parse is answered as a bad request, never lost: only that may turn into null.
      for (const m of text.matchAll(/(?<!\.json\(\))\.catch\(\(\)\s*=>\s*null\)/g)) found.push(`${f}: ${m[0]}`);
      if (/\bconsole\.(log|info|warn|error|debug)\(/.test(text)) found.push(`${f}: console`);
    }
    expect(found).toEqual([]);
  });
});
