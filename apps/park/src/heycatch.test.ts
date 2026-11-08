import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// HeyCatch analytics (heycatch.ai/agents.md) has to start on every page the site serves, or that page's
// visits go uncounted. The park's own page starts it in src/main.ts; each plain page under public/
// loads it itself. A new plain page without it fails here.
const KEY = 'hck_pk_um42q9Cyv2nIM-aHBobpaoE1rupLU1dm';
const PUBLIC = join(__dirname, '../public');

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return pages(p);
    return name.endsWith('.html') ? [p] : [];
  });
}

describe('HeyCatch analytics on every page', () => {
  it('starts once in the park page’s entry, with the project key, as the landing site', () => {
    const main = readFileSync(join(__dirname, 'main.ts'), 'utf8');
    expect(main).toContain("import { analytics } from '@heycatch/sdk';");
    expect(main.match(/analytics\.init\(/g)).toHaveLength(1);
    expect(main).toContain(`projectKey: '${KEY}'`);
    expect(main).toContain("site: 'landing'");
  });

  it('loads on each plain page, pinned, with the same key, sending each visit at once', () => {
    const found = pages(PUBLIC);
    expect(found.length).toBeGreaterThan(0);
    for (const p of found) {
      const html = readFileSync(p, 'utf8');
      const where = relative(PUBLIC, p);
      expect(html, where).toMatch(/import \{ analytics \} from 'https:\/\/esm\.sh\/@heycatch\/sdk@\d+\.\d+\.\d+';/);
      expect(html, where).toContain(`projectKey: '${KEY}'`);
      expect(html, where).toContain("site: 'landing'");
      expect(html, where).toContain('requestBatching: false');
    }
  });
});
