/**
 * Experiment 3 (OP-132): the store's paid-order webhook fails at the Worker, twice over. Order A:
 * the store's own answer about the order fails (the stand-in store answers the Worker's query with
 * HTTP 500), so the Worker answers the webhook 500; the store sends it again, and then once more.
 * Order B: that answer is held back past the 5 s the store waits for a webhook, so the store gives
 * up on the first delivery and sends it again while the first is still at work. Each order must get
 * its one ticket and one claim-link email, never two.
 */
import { deliverPaid, orderNumber, putOrder, sentFor, storeFault } from '../lib/store.mjs';

// The store gives up on a webhook not answered within 5 s, and sends it again later.
const STORE_WAITS_MS = 5_000;
const HELD_MS = STORE_WAITS_MS + 3_000;

const answered = (d) => (d.timedOut ? `no answer within ${STORE_WAITS_MS / 1000} s` : `HTTP ${d.status} ${typeof d.body === 'string' ? d.body : JSON.stringify(d.body)} in ${d.ms} ms`);
const oneTicket = (d) => d.status === 200 && d.body.tickets === 1;

export default {
  n: 3,
  id: 'webhook-dropped',
  name: "The store's webhook answered 500, then too late",
  hypothesis: 'A paid-order webhook the Worker fails (a 500, or no answer in the 5 s the store waits) is sent again by the store, and the order gets its one ticket and one claim-link email, never two.',
  blastRadius: "Two orders in the stand-in store, and the throwaway park's answers about them; nothing else the store answers is touched.",
  rollback: "The stand-in store's faults are taken away.",
  expectLogs: [
    {
      component: 'worker',
      event: 'webhook_failed',
      withRun: true,
      question: 'Did the Worker say why the webhook failed, for which order?',
      add: 'webhook_failed with the order and the error (index.ts)',
    },
    {
      component: 'worker',
      event: 'webhook_duplicate',
      withRun: true,
      question: 'Did the Worker see the third delivery as work already done?',
      add: 'webhook_duplicate when a delivery repeats work an earlier one did (index.ts)',
    },
  ],
  async run(ctx) {
    // Order A: the store's answer fails once.
    const a = orderNumber();
    await putOrder(ctx.park, a);
    await storeFault(ctx.park, { op: 'OwlParkOrder', order: a, mode: 'error' });
    ctx.state.faulted = true;
    const a1 = await deliverPaid(ctx.park, ctx.run, a, { timeoutMs: STORE_WAITS_MS });
    ctx.note('action', { what: 'order A: its webhook, the store failing', answer: answered(a1) });
    await ctx.sleep(1_000);
    const a2 = await deliverPaid(ctx.park, ctx.run, a, { timeoutMs: STORE_WAITS_MS });
    const a3 = await deliverPaid(ctx.park, ctx.run, a, { timeoutMs: STORE_WAITS_MS });
    ctx.note('action', { what: 'order A: sent again, then once more', answers: [answered(a2), answered(a3)] });
    const sentA = await sentFor(ctx.park, a);
    ctx.observe({
      what: "order A's first delivery, the store failing",
      value: answered(a1),
      ok: a1.status >= 500,
      component: 'worker',
      fix: 'answer a webhook whose work failed with a 5xx, so the store sends it again (a 2xx without the ticket loses the order)',
    });
    ctx.observe({
      what: 'order A sent again, then once more',
      value: `${answered(a2)}; ${answered(a3)}; emails ${sentA.times ?? 0}`,
      ok: oneTicket(a2) && oneTicket(a3) && sentA.times === 1,
      component: 'worker',
      fix: "make each step of a paid order safe to repeat: the desk's tickets once per order, the claim-link email once (storeHooks.ts)",
    });

    // Order B: the store's answer held back past the store's wait; the store sends it again meanwhile.
    const b = orderNumber();
    await putOrder(ctx.park, b);
    await storeFault(ctx.park, { op: 'OwlParkOrder', order: b, mode: 'hang', ms: HELD_MS });
    const b1 = await deliverPaid(ctx.park, ctx.run, b, { timeoutMs: STORE_WAITS_MS });
    const b2 = await deliverPaid(ctx.park, ctx.run, b, { timeoutMs: STORE_WAITS_MS });
    ctx.note('action', { what: 'order B: its webhook held past the store\'s wait, then sent again', answers: [answered(b1), answered(b2)] });
    await ctx.sleep(HELD_MS); // the first delivery, still at work in the Worker, finishes
    const b3 = await deliverPaid(ctx.park, ctx.run, b, { timeoutMs: STORE_WAITS_MS });
    const sentB = await sentFor(ctx.park, b);
    ctx.observe({
      what: "order B's first delivery, the store's answer held back",
      value: answered(b1),
      ok: true, // the store's own give-up, as set up: shown for the record
      component: 'worker',
    });
    ctx.observe({
      what: 'order B sent again while the first delivery was still at work, then once more',
      value: `${answered(b2)}; ${answered(b3)}; emails ${sentB.times ?? 0}`,
      ok: oneTicket(b2) && oneTicket(b3) && sentB.times === 1,
      component: 'worker',
      fix: 'two deliveries of one order at once must not both email the claim link: hold the order while one delivery works on it (storeHooks.ts)',
    });
  },
  async rollback(ctx) {
    if (ctx.state.faulted) await storeFault(ctx.park, { clear: true });
  },
};
