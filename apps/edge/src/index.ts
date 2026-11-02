/**
 * The Worker: serves the built client as static assets, mints guest passes and collector
 * tokens, answers the collection, shop, furniture gift, ticket and (with ACCOUNTS on) account API, keeps visitors' feedback for
 * the keepers' page, takes the store's webhooks, and upgrades /ws/<room> to a WebSocket held by the
 * park's Durable Object (where quests, NPC owls, leaf piles and the nests live). Each route's handler
 * is in `routes/` (OP-201): `routes/table.ts` lists them all; this file is the front door, the rate
 * limits, the lookup and the crons.
 */
import { hashForLog } from '@owl-park/shared';
import { finished, frontDoor, guardedPage, tooMany } from './guard';
import { limitsOn, overLimit } from './limits';
import { loggerFor } from './logs';
import { jobOf } from './crons';
import { isPage, uncachedPage } from './page';
import { restartPark } from './routes/admin';
import { clientIp, passOf } from './routes/http';
import { votes } from './routes/park';
import { router } from './routes/router';
import { ROUTES } from './routes/table';
import type { Env } from './env';

export { RoomObject } from './RoomObject';
export { VoteLedger } from './VoteLedger';
export { Collections } from './Collections';
export { Overflow } from './Overflow';

/** The handler for a path (routes/table.ts), or null for a static asset. */
const routeOf = router(ROUTES);

const park = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // One logger per request (OP-134): the deployment's level, and the chaos run's id when the request names one.
    const log = loggerFor(env, request);

    // The front door (OP-140, OP-141): only https off this machine, and sockets and API calls only from the park's own pages.
    const door = frontDoor(request, url, env.PARK_ORIGINS, log);
    if (door) return door;
    // The rate limits (OP-142): by address, by owl, and tightly for the calls that move tickets or send mail.
    const socket = url.pathname.startsWith('/ws/');
    if ((socket || url.pathname.startsWith('/api/')) && url.pathname !== '/api/store/webhook' && limitsOn(env)) {
      const pass = await passOf(request, env);
      const over = overLimit({ ip: clientIp(request, env), visitor: pass ? (pass.cid ?? pass.id) : null, path: url.pathname }, Date.now());
      if (over) {
        if (over.first) log.warn('worker.guard', 'rate_limited', 'Calls came too fast: refused until the minute is out.', { route: url.pathname, limit: over.limit, retry_after_s: over.wait, ...(over.limit !== 'address' && pass?.cid ? { collector_hash: hashForLog(pass.cid) } : {}) });
        return tooMany(socket, over.wait);
      }
    }

    const handle = routeOf(url.pathname);
    if (handle) return handle({ request, env, ctx, url, log });

    const asset = await env.ASSETS.fetch(request);
    // The page with its policy (OP-140): only its own scripts, and only its own host to talk to.
    return isPage(url.pathname) ? guardedPage(uncachedPage(asset), url) : asset;
  },

  /** Each cron its own job (crons.ts): month-end decides the previous park month's Realm Vote; every night the park restarts (OP-181). */
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const job = jobOf(controller.cron);
    if (job === 'vote-close') await votes(env).fetch('https://park/close', { method: 'POST' });
    else if (job === 'restart') await restartPark(env, loggerFor(env), 'cron');
    else throw new Error(`the park has no job for the cron ${controller.cron}`);
  },
} satisfies ExportedHandler<Env>;

/**
 * The Worker as the platform calls it: every answer leaves with nosniff, HSTS and the park's CORS
 * (OP-140, OP-144); an error no route handled is logged as one line (OP-134), then thrown on as
 * before, so what the visitor gets does not change.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return finished(request, new URL(request.url), await park.fetch(request, env, ctx), env.PARK_ORIGINS);
    } catch (e) {
      loggerFor(env, request).error('worker', 'unhandled_error', 'A request failed with an error no route handled.', { route: new URL(request.url).pathname, error: e });
      throw e;
    }
  },
  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    try {
      await park.scheduled(controller, env);
    } catch (e) {
      const job = jobOf(controller.cron);
      const msg = job === 'vote-close' ? 'The month-end close of the Realm Vote failed.' : job === 'restart' ? 'The nightly restart failed.' : 'A cron ran that the park has no job for.';
      loggerFor(env).error('worker', 'unhandled_error', msg, { job: job ?? 'none', cron: controller.cron, error: e });
      throw e;
    }
  },
} satisfies ExportedHandler<Env>;
