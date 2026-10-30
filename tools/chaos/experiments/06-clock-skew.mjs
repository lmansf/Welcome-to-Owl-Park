/**
 * Experiment 6 (OP-132): a visitor whose clock runs 10 minutes fast. A scripted page on the right
 * time comes into the hub by address and watches the fleet walk about, as the measure; then a page
 * whose wall clock (Date) is set ahead does the same, its timers and frames running as they do: a
 * device whose clock is wrong, not a page whose time is faked. The pass is the park's to check,
 * not the page's, and a page reckons the others' walks against the room server's clock (the edge
 * transport's offset), so the fast page should come in as any page does and draw the others walking
 * as the right page does, never jumping to where they are going.
 */
const AHEAD_MS = 10 * 60_000;
const WATCH_MS = 8_000;
const POLL_MS = 100;
// An owl walks 260 px a second; faster than half again that between two looks, with 10 px to spare, is a jump.
const WALK_PX_S = 260;
const jumped = (d, dtMs) => d > (WALK_PX_S * 1.5 * dtMs) / 1000 + 10;

/** A page into the hub by address, its clock `aheadMs` ahead: the page, and how long it took to come online (null when it did not). */
async function open(ctx, aheadMs) {
  const context = await ctx.browser.newContext({ viewport: { width: 1280, height: 800 }, extraHTTPHeaders: { 'X-Chaos-Run': ctx.run } });
  ctx.state.contexts.push(context);
  const page = await context.newPage();
  // The page's wall clock ahead (Date, as the device's own clock), its timers left alone.
  if (aheadMs)
    await context.addInitScript((ahead) => {
      const RealDate = Date;
      function AheadDate(...args) {
        if (!new.target) return new RealDate(RealDate.now() + ahead).toString();
        return args.length ? new RealDate(...args) : new RealDate(RealDate.now() + ahead);
      }
      AheadDate.prototype = RealDate.prototype;
      AheadDate.now = () => RealDate.now() + ahead;
      AheadDate.parse = RealDate.parse;
      AheadDate.UTC = RealDate.UTC;
      globalThis.Date = AheadDate;
    }, aheadMs);
  const t0 = Date.now();
  try {
    await page.goto(`${ctx.base}/?transport=edge&room=hub`, { waitUntil: 'commit', timeout: 10_000 });
    await page.waitForFunction(() => window.owlPark?.state()?.room === 'hub' && window.owlPark.state().connected && document.querySelector('[data-dot]')?.getAttribute('data-status') === 'online', null, { timeout: 10_000, polling: 50 });
    return { page, context, came: Date.now() - t0 };
  } catch (e) {
    ctx.note('note', { what: `a page ${aheadMs ? 'ahead' : 'on time'} did not come in`, error: e.message.split('\n')[0] });
    return { page, context, came: null };
  }
}

/** What a page draws of the fleet's walks for a while: its looks at an owl mid-walk, and owls that moved faster than walking between two looks. */
async function watch(ctx, page) {
  let walking = 0;
  let jumps = 0;
  let looks = 0;
  const last = new Map();
  const until = Date.now() + WATCH_MS;
  while (Date.now() < until && !ctx.signal.aborted) {
    const peers = await page.evaluate(() => window.owlPark?.state()?.peers.map((p) => ({ id: p.id, x: p.pos.x, y: p.pos.y, walking: p.walking })) ?? []);
    const at = Date.now();
    looks += 1;
    for (const p of peers) {
      if (p.walking) walking += 1;
      const before = last.get(p.id);
      if (before && jumped(Math.hypot(p.x - before.x, p.y - before.y), at - before.at)) jumps += 1;
      last.set(p.id, { ...p, at });
    }
    await ctx.sleep(POLL_MS);
  }
  return { walking, jumps, looks };
}

export default {
  n: 6,
  id: 'clock-skew',
  name: "A visitor's clock 10 minutes fast",
  hypothesis: 'A page whose clock runs 10 minutes fast comes into the hub with its pass, and draws the other owls walking as a page on the right time does, never jumping to where they are going.',
  blastRadius: 'Two scripted pages in the throwaway park, one after the other: one on the right time, one with its own clock set ahead.',
  rollback: 'The pages close.',
  needsBrowser: true,
  async run(ctx) {
    ctx.state.contexts = [];
    // A page on the right time first, as the measure the fast page is held to.
    const right = await open(ctx, 0);
    const control = right.came === null ? null : await watch(ctx, right.page);
    await right.context.close();
    const fast = await open(ctx, AHEAD_MS);
    const ahead = await fast.page.evaluate(() => Date.now()).then((t) => t - Date.now());
    ctx.observe({
      what: 'a page 10 minutes fast, into the hub by address',
      value: fast.came === null ? 'not online within 10 s' : `online in ${fast.came} ms, its clock ${Math.round(ahead / 1000)} s ahead`,
      ok: fast.came !== null && Math.abs(ahead - AHEAD_MS) < 60_000,
      component: 'page',
      fix: 'take the pass as the park gives it, whatever the page clock says: refresh it by the time left as the park reckoned it',
    });
    if (fast.came === null || control === null) return;
    const seen = await watch(ctx, fast.page);
    ctx.observe({
      what: "the others' walks as the fast page draws them",
      value: `fast page: ${seen.walking} looks at an owl mid-walk, ${seen.jumps} jumps in ${seen.looks} looks; a page on the right time: ${control.walking} and ${control.jumps} in ${control.looks}`,
      ok: seen.walking > 0 && seen.jumps <= control.jumps + 1,
      component: 'page',
      fix: "reckon the others' walks against the room server's clock (the edge transport's offset), never the page's own",
    });
  },
  async rollback(ctx) {
    await Promise.all((ctx.state.contexts ?? []).map((c) => c.close().catch(() => undefined)));
  },
};
