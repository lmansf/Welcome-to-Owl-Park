#!/usr/bin/env node
/**
 * throwaway-config.mjs: writes apps/edge/wrangler.load.jsonc, the park Worker's config for the
 * throwaway copy that the load test (OP-068, .github/workflows/load-test.yml) fills with bots and
 * then deletes. The copy has its own name and only its workers.dev address: no domain, so the park's
 * domain can never move to it, and no cron. It trusts X-Forwarded-For, so each bot counts as its own
 * visitor, and its room caps are raised to the most the server takes (120) and its per-address cap
 * well past the bots' needs; the API's rate limits are off. Never deploy the park with this file.
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
// LOAD_MODE=capacity is the busy-night rehearsal (OP-075, tools/load/capacity-dry-run.mjs): a small
// hub, so a few dozen bots fill a copy of it, and the admin key the rehearsal changes settings with.
const capacity = process.env.LOAD_MODE === 'capacity';
config.vars = {
  ...config.vars,
  // LOAD_SHARDING=room tries each room on its own object (ROOM_SHARDING); otherwise as the park has it.
  ...(process.env.LOAD_SHARDING === 'room' ? { ROOM_SHARDING: 'room' } : {}),
  TRUST_FORWARDED_FOR: 'true',
  // Every bot comes from this one runner: the API's rate limits (OP-142) would stop the swarm, not measure the park.
  RATE_LIMITS: 'off',
  MAX_SOCKETS_PER_IP: '64',
  // The most the server takes for a room (apps/edge/src/rooms.ts); above it the defaults apply.
  ROOM_CAPS: JSON.stringify(capacity ? { lobby: 120, hub: 30, grove: 120, market: 120 } : { lobby: 120, hub: 120, grove: 120, market: 120 }),
  // A throwaway key made for this one run (the workflow masks it); the copy is deleted after.
  ...(capacity && process.env.LOAD_ADMIN_KEY ? { ADMIN_KEY: process.env.LOAD_ADMIN_KEY } : {}),
};
if (config.name !== LOAD_NAME || 'routes' in config || 'route' in config || config.env) {
  throw new Error('the throwaway copy must have its own name, no domain and no environments');
}
writeFileSync(OUT, `${JSON.stringify(config, null, 2)}\n`);
console.log(`wrote apps/edge/wrangler.load.jsonc: ${LOAD_NAME}, its workers.dev address only, no cron, ROOM_SHARDING ${config.vars.ROOM_SHARDING}${capacity ? ', the busy-night rehearsal' : ''}`);
