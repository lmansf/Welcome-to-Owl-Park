#!/usr/bin/env node
/**
 * throwaway-config.mjs: writes apps/edge/wrangler.load.jsonc, the park Worker's config for the
 * throwaway copy that the load test (OP-068, .github/workflows/load-test.yml) fills with bots and
 * then deletes. The copy has its own name and only its workers.dev address: no domain, so the park's
 * domain can never move to it, and no cron. It trusts X-Forwarded-For, so each bot counts as its own
 * visitor, and its room caps are raised to the most the server takes (120) and its per-address cap
 * well past the bots' needs. Never deploy the park with this file.
 *
 *   node tools/load/throwaway-config.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

export const LOAD_NAME = 'owl-park-load';
const SRC = new URL('../../apps/edge/wrangler.jsonc', import.meta.url);
const OUT = new URL('../../apps/edge/wrangler.load.jsonc', import.meta.url);

/** JSON with comments to plain JSON: drops `//` and block comments outside strings. */
function stripComments(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) throw new Error('wrangler.jsonc: a comment is never closed');
      i = end + 1;
    } else out += c;
  }
  return out;
}

const config = JSON.parse(stripComments(readFileSync(SRC, 'utf8')));
config.name = LOAD_NAME;
delete config.routes;
delete config.route;
config.workers_dev = true;
config.triggers = { crons: [] };
config.vars = {
  ...config.vars,
  TRUST_FORWARDED_FOR: 'true',
  MAX_SOCKETS_PER_IP: '64',
  // The most the server takes for a room (apps/edge/src/rooms.ts); above it the defaults apply.
  ROOM_CAPS: JSON.stringify({ lobby: 120, hub: 120, grove: 120, market: 120 }),
};
if (config.name !== LOAD_NAME || 'routes' in config || 'route' in config || config.env) {
  throw new Error('the throwaway copy must have its own name, no domain and no environments');
}
writeFileSync(OUT, `${JSON.stringify(config, null, 2)}\n`);
console.log(`wrote apps/edge/wrangler.load.jsonc: ${LOAD_NAME}, its workers.dev address only, no cron`);
