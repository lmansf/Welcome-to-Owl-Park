/**
 * The built page holds no key to any database and no client for one (OP-150, from the 2026-10-30
 * pen-test): every text file the page ships is read, and a Supabase client or address, a string
 * shaped like a JWT (a Supabase anon or service key is one) or a Supabase key of the newer kind
 * fails the check. The park's only Supabase calls are the Worker's, server to server, with a key the
 * page never sees (apps/edge/src/collectLog.ts). Run after the build: `pnpm security:bundle` (CI's
 * build job, the Cloudflare deploy and the Pages deploy, each before anything goes out).
 *
 * A finding names the file and what it looks like, never the text it found: that could be the key.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PATTERNS = [
  { what: 'a Supabase client or address', re: /supabase/i },
  { what: 'a string shaped like a JWT (a Supabase anon or service key is one)', re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { what: 'a Supabase key', re: /\bsb_(?:publishable|secret)_[A-Za-z0-9_-]{10,}/ },
];

/** The files a page ships as text: scripts, pages, styles, source maps, data, vector art. */
const TEXT = /\.(?:m?js|css|html|json|map|txt|svg|webmanifest|xml)$/i;

/** What is wrong in the built page in `dir`, and how many files were read. */
export function check(dir) {
  const found = [];
  let read = 0;
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (TEXT.test(name)) {
        read += 1;
        const text = readFileSync(p, 'utf8');
        for (const { what, re } of PATTERNS) if (re.test(text)) found.push({ file: relative(dir, p), what });
      }
    }
  };
  walk(dir);
  return { found, read };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const dir = resolve(process.argv[2] ?? 'apps/park/dist');
  let result;
  try {
    result = check(dir);
  } catch (e) {
    console.error(`bundle check: cannot read ${dir} (${e.message}); build the page first.`);
    process.exit(2);
  }
  if (result.read === 0) {
    console.error(`bundle check: no page in ${dir} to check; build it first.`);
    process.exit(2);
  }
  for (const f of result.found) console.error(`bundle check: ${f.file} holds ${f.what}.`);
  if (result.found.length) process.exit(1);
  console.log(`bundle check: ${result.read} files, no database client or key.`);
}
