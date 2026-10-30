/**
 * The park's steady state (OP-132), defined before any experiment and checked before and during each:
 * the harness refuses to start an experiment while it does not hold.
 *
 *   health    GET /api/health answers 200
 *   latency   10 scripted visitors walking in the hub: the room echoes 95% of their moves within 300 ms
 *   errors    under 1% of their moves and joins go unanswered or fail
 *   checkout  a store order's webhook gives out its ticket and the claim link within 5 s
 *   journey   a scripted page comes straight into the hub and walks into the grove (in legs around
 *             what stands in the way, lib/route.mjs): each room opens, the room server welcomes it
 *             and the owl can move within 10 s
 *
 * The journey stands in for the ticket's "enter the nest, walk the gate, join a realm and pick up a
 * find in under 10 s" until the harness's page learns the gate and the finds (noted in OP-132).
 */
import { legsTo } from './route.mjs';
import { ROOMS } from './shared.mjs';
import { deliverPaid, orderNumber, putOrder, sentFor } from './store.mjs';
import { hop, Visitor } from './visitor.mjs';

export const STEADY = { latencyP95Ms: 300, errorRate: 0.01, checkoutMs: 5_000, stepMs: 10_000, fleet: 10, tapEveryMs: 2_000 };

const p95 = (values) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(0.95 * s.length))];
};

/** GET /api/health within 5 s. */
export async function checkHealth(base, run) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${base}/api/health`, { headers: { 'X-Chaos-Run': run }, signal: AbortSignal.timeout(5_000) });
    return { name: 'health', ok: r.status === 200, value: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { name: 'health', ok: false, value: String(e.cause?.code ?? e.name), ms: Date.now() - t0 };
  }
}

/**
 * Scripted visitors walking about the hub, a tap every couple of seconds each, as the steady state's
 * measure of the room server: every move's echo time, the moves never echoed, and joins that failed.
 */
export class Fleet {
  constructor({ base, run, size = STEADY.fleet, firstN = 0, room = 'hub', events }) {
    Object.assign(this, { base, run, size, firstN, room, events });
    this.visitors = [];
    this.moves = []; // { at, ms } with ms null when never echoed
    this.failures = []; // { at, what }
    this.timers = [];
  }

  async start() {
    for (let i = 0; i < this.size; i++) {
      const v = new Visitor({ base: this.base, run: this.run, n: this.firstN + i, events: this.events });
      this.visitors.push(v);
      try {
        await v.join(this.room);
      } catch (e) {
        this.failures.push({ at: Date.now(), what: `join: ${e.message}` });
      }
      const tap = async () => {
        if (this.stopped) return;
        const to = v.open ? hop(this.room, v.pos) : null;
        if (to) {
          // Kept when its outcome is known: an echo, or none after 5 s; and in the run's visitors log.
          const ms = await v.walk(to);
          this.moves.push({ at: Date.now(), ms });
          this.events?.({ at: Date.now(), visitor: v.n, kind: 'move', to, ms });
        }
        this.timers.push(setTimeout(tap, STEADY.tapEveryMs * (0.75 + Math.random() * 0.5)));
      };
      this.timers.push(setTimeout(tap, Math.random() * STEADY.tapEveryMs));
    }
  }

  /** The last `ms` of moves: p95 echo time, and the share unanswered or failed. */
  window(ms) {
    const since = Date.now() - ms;
    const moves = this.moves.filter((m) => m.at >= since);
    const answered = moves.filter((m) => m.ms !== null).map((m) => m.ms);
    const failed = moves.length - answered.length + this.failures.filter((f) => f.at >= since).length;
    const attempts = moves.length + this.failures.filter((f) => f.at >= since).length;
    return { p95: p95(answered), moves: moves.length, failed, rate: attempts ? failed / attempts : 0 };
  }

  async stop() {
    this.stopped = true;
    for (const t of this.timers) clearTimeout(t);
    await Promise.all(this.visitors.map((v) => v.leave()));
  }
}

/** The fleet's last `ms` as two checks: latency and errors. */
export function fleetChecks(fleet, ms) {
  const w = fleet.window(ms);
  return [
    { name: 'latency', ok: w.p95 !== null && w.p95 <= STEADY.latencyP95Ms, value: w.p95, n: w.moves },
    { name: 'errors', ok: w.moves > 0 && w.rate < STEADY.errorRate, value: Math.round(w.rate * 1000) / 10, n: w.moves + w.failed },
  ];
}

/**
 * A day ticket bought in the stand-in store, its paid webhook signed as the store signs it: the
 * ticket given out and its claim link sent, timed.
 */
export async function checkCheckout(park, run) {
  const id = orderNumber();
  const t0 = Date.now();
  try {
    await putOrder(park, id);
    const answer = await deliverPaid(park, run, id);
    const sent = await sentFor(park, id);
    const ms = Date.now() - t0;
    return { name: 'checkout', ok: answer.status === 200 && answer.body.tickets === 1 && !!sent.link && ms <= STEADY.checkoutMs, value: ms, detail: answer.status === 200 ? answer.body : { status: answer.status ?? 'no answer' } };
  } catch (e) {
    return { name: 'checkout', ok: false, value: Date.now() - t0, detail: e.message };
  }
}

/**
 * A scripted page: straight into the hub by address, then through the grove's doorway. Each step's
 * time from asking to the owl able to move with the room server's welcome.
 */
export async function checkJourney(browser, base, run, shots) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'X-Chaos-Run': run } });
  const page = await context.newPage();
  const online = (room) =>
    page.waitForFunction((r) => window.owlPark?.state()?.room === r && window.owlPark.state().connected && document.querySelector('[data-dot]')?.getAttribute('data-status') === 'online', room, { timeout: STEADY.stepMs, polling: 50 });
  const steps = [];
  try {
    let t0 = Date.now();
    await page.goto(`${base}/?transport=edge&room=hub`, { waitUntil: 'commit', timeout: STEADY.stepMs });
    await online('hub');
    steps.push({ step: 'hub', ms: Date.now() - t0 });
    // The way to the grove's doorway in legs, from wherever the room put the owl (lib/route.mjs). An
    // owl that stops short in the hub (the way not as the page walks it) goes again from where it
    // stopped, three times at most; where each try stopped goes in the check's detail.
    const rect = ROOMS.hub.doors.find((d) => d.to?.room === 'grove').rect;
    const stops = [];
    t0 = Date.now();
    let at = 0;
    for (let attempt = 1; ; attempt++) {
      const from = await page.evaluate(() => window.owlPark.state().pos);
      const legs = legsTo('hub', from, rect);
      if (!legs) throw new Error(`no way to the grove's doorway from ${Math.round(from.x)},${Math.round(from.y)}`);
      for (const [i, leg] of legs.entries()) {
        await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), leg);
        if (i < legs.length - 1)
          await page.waitForFunction(({ x, y }) => {
            const s = window.owlPark?.state();
            return !!s && !s.walking && Math.hypot(s.pos.x - x, s.pos.y - y) < 4;
          }, leg, { timeout: STEADY.stepMs, polling: 50 });
      }
      // Into the grove, or stopped in the hub: the walk is the owl's own (260 px a second).
      await page.waitForFunction(() => {
        const s = window.owlPark?.state();
        return !s || s.room !== 'hub' || !s.walking;
      }, null, { timeout: 60_000, polling: 50 });
      const ended = Date.now();
      // Standing in the doorway the page goes through, the hub fading out first (still the hub meanwhile).
      const through = await page
        .waitForFunction(() => window.owlPark?.state()?.room !== 'hub', null, { timeout: 3_000, polling: 50 })
        .then(() => true, () => false);
      if (through) {
        at = ended;
        break;
      }
      const now = await page.evaluate(() => window.owlPark.state());
      stops.push({ attempt, from: { x: Math.round(from.x), y: Math.round(from.y) }, legs: legs.length, stopped: { x: Math.round(now.pos.x), y: Math.round(now.pos.y) } });
      if (attempt === 3) {
        await page.screenshot({ path: `${shots}/journey-${new Date().toISOString().slice(11, 19).replaceAll(':', '')}.png` }).catch(() => undefined);
        throw new Error(`the owl stopped short of the grove's doorway three times: ${JSON.stringify(stops)}`);
      }
    }
    await online('grove');
    steps.push({ step: 'grove', ms: Date.now() - at, walkMs: at - t0, ...(stops.length ? { stops } : {}) });
    return { name: 'journey', ok: steps.every((s) => s.ms <= STEADY.stepMs), value: Math.max(...steps.map((s) => s.ms)), detail: steps };
  } catch (e) {
    return { name: 'journey', ok: false, value: null, detail: { steps, error: e.message.split('\n')[0] } };
  } finally {
    await context.close();
  }
}
