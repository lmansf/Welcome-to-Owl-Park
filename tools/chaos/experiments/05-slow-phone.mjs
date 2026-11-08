/**
 * Experiment 5 (OP-132): one phone on a 3G network. A scripted phone page (a Pixel 7's screen and
 * touch, its processor slowed 4 times, as OP-129's load-time measurements had it) loads the park
 * over DevTools' Fast 3G (1.44 Mbps down, 675 kbps up, 563 ms round trips) and comes into the hub by
 * address while the fleet walks about. The load screen is read as it goes: its bar is the share of
 * the art's bytes that have come (apps/park/src/ui/loader.ts).
 */
import { hop } from '../lib/visitor.mjs';

const FAST_3G = { latency: 562.5, downloadThroughput: (1.6e6 / 8) * 0.9, uploadThroughput: (750e3 / 8) * 0.9 };
const CPU_SLOWER = 4;
const ONLINE_WITHIN_MS = 60_000;
const LOOK_EVERY_MS = 250;

/** The bar's readings while the screen was up: its steps, any step back (a new load starts it at 0 again), and how long it was up. */
function readBar(looks) {
  const up = looks.filter((l) => l.up);
  let back = 0;
  for (let i = 1; i < up.length; i++) if (up[i].p < up[i - 1].p && up[i].p !== 0) back += 1;
  const between = new Set(up.map((l) => l.p).filter((p) => p > 0 && p < 100));
  return { steps: between.size, back, highest: Math.max(0, ...up.map((l) => l.p)), upMs: up.length ? up.at(-1).at - up[0].at : 0 };
}

export default {
  n: 5,
  id: 'slow-phone',
  name: 'One phone on a 3G network',
  hypothesis: "A phone on 3G comes into the hub and can play (its owl walks, the others are there), and the load screen's bar shows the bytes as they come: it only grows, in steps, while the park loads (OP-129).",
  blastRadius: 'One scripted phone page in the throwaway park, its network and processor slowed.',
  rollback: 'The page closes.',
  needsBrowser: true,
  pauseChecks: { names: ['journey'], why: "the journey's page would share the browser with the slowed phone" },
  async run(ctx) {
    const { devices } = await import('@playwright/test');
    const context = await ctx.browser.newContext({ ...devices['Pixel 7'], extraHTTPHeaders: { 'X-Chaos-Run': ctx.run } });
    ctx.state.context = context;
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...FAST_3G });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWER });

    // The load screen as the page draws it, every 250 ms from the address on.
    const looks = [];
    let looking = true;
    const t0 = Date.now();
    const watch = (async () => {
      while (looking) {
        const seen = await page
          .evaluate(() => {
            const l = document.getElementById('loader');
            const bar = l?.querySelector('[role="progressbar"]');
            return l ? { up: !l.hidden && !l.classList.contains('out'), p: Number(bar?.getAttribute('aria-valuenow') ?? 0) } : null;
          })
          .catch(() => null); // between documents
        if (seen) looks.push({ at: Date.now() - t0, ...seen });
        await new Promise((r) => setTimeout(r, LOOK_EVERY_MS));
      }
    })();
    let online = null;
    try {
      await page.goto(`${ctx.base}/?transport=edge&room=hub`, { waitUntil: 'commit', timeout: ONLINE_WITHIN_MS });
      await page.waitForFunction(() => window.owlPark?.state()?.room === 'hub' && window.owlPark.state().connected && document.querySelector('[data-dot]')?.getAttribute('data-status') === 'online', null, {
        timeout: ONLINE_WITHIN_MS,
        polling: 250,
      });
      online = Date.now() - t0;
    } catch (e) {
      ctx.note('note', { what: 'the phone did not come in', error: e.message.split('\n')[0] });
    } finally {
      looking = false;
      await watch;
    }
    ctx.note('action', { what: 'the phone loaded', online_ms: online, looks: looks.length });
    ctx.observe({
      what: 'a phone on 3G into the hub by address',
      value: online === null ? `not online within ${ONLINE_WITHIN_MS / 1000} s` : `online in ${(online / 1000).toFixed(1)} s`,
      ok: online !== null,
      component: 'page',
      fix: 'load less before the room opens on a slow network (OP-129: the art the first frame needs, the rest after)',
    });
    const bar = readBar(looks);
    ctx.observe({
      what: "the load screen's bar while the phone loaded",
      value: `${bar.steps} steps between empty and full, ${bar.back} back, up to ${bar.highest}%, up ${(bar.upMs / 1000).toFixed(1)} s`,
      ok: bar.back === 0 && bar.steps >= 3,
      component: 'page',
      fix: "move the bar by the bytes as they come (loadArt's onProgress), never by a timer, and never back within a load",
    });
    if (online === null) return;

    // Playable: the phone's owl walks where it is told, and the fleet is there with it.
    const from = await page.evaluate(() => window.owlPark.state().pos);
    const to = hop('hub', from);
    const walked = to
      ? await page
          .evaluate(({ x, y }) => window.owlPark.walkTo(x, y), to)
          .then(() => page.waitForFunction(({ x, y }) => { const s = window.owlPark?.state(); return !!s && !s.walking && Math.hypot(s.pos.x - x, s.pos.y - y) < 4; }, to, { timeout: 10_000, polling: 100 }))
          .then(() => true, () => false)
      : false;
    const peers = await page.evaluate(() => window.owlPark.state().peers.length);
    ctx.observe({
      what: 'the phone on 3G at play',
      value: `its owl ${walked ? 'walked where it was told' : 'did not get where it was told'}, ${peers} other owls in view of the room`,
      ok: walked && peers >= ctx.fleet.visitors.filter((v) => v.open).length,
      component: 'page',
      fix: 'keep the slow phone in step: its walks and the others it is told about',
    });
  },
  async rollback(ctx) {
    await ctx.state.context?.close();
  },
};
