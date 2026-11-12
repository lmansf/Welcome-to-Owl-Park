/** The park's objects as the routes reach them, and the work the routes hand them after answering. */
import { type Logger, hashForLog, referralEmailKey } from '@owl-park/shared';
import type { OverflowState } from '../Overflow';
import { accountsOn, emailKeys, keyed, mailSender, offerOrderProtect, orderEmail } from '../accounts';
import { type PurchaseData, logConfig } from '../collectLog';
import { copyObjectName } from '../copies';
import type { Env } from '../env';
import { type GateRead, type GateSet, gateNow } from '../gateSwitch';
import { overflowNow } from '../overflowState';
import { signingSecret } from '../pass';
import { checkoutHash, referralCode, referralRewardCode } from '../referrals';
import { type TicketMirror, storeConfig } from '../storeApi';
import { type Desk, type HookDeps, claimLink, mirrorTickets } from '../storeHooks';

export function votes(env: Env): DurableObjectStub {
  return env.VOTES.get(env.VOTES.idFromName('park'));
}

export function collections(env: Env) {
  return env.COLLECTIONS.getByName('park');
}

/** The overflow object (OP-075): the line, the busy ribbon and copies of rooms. */
export function overflow(env: Env): DurableObjectStub {
  return env.OVERFLOW.get(env.OVERFLOW.idFromName('park'));
}

export async function readOverflow(env: Env): Promise<OverflowState> {
  const r = await overflow(env).fetch('https://park/state');
  if (!r.ok) throw new Error(`the overflow object answered ${r.status}`);
  return (await r.json()) as OverflowState;
}

/** The busy-night settings as the Worker serves them: read at most every few seconds. */
export const overflowOf = (env: Env) => overflowNow(() => readOverflow(env));

/**
 * A ticket's order email, as its tickets land on an owl (a claim, or the booth's checkout), is offered a
 * one-tap link that protects that owl (OP-186, with ACCOUNTS on): the store says whose order it was,
 * after the page has its answer, and the park keeps nothing about the address unless the link is opened.
 * A ticket the park gave away has no order in the store, and an owl whose email the store will not tell
 * stays as it was.
 */
export async function offerProtectByOrder(env: Env, log: Logger, origin: string, cid: string, order: string): Promise<void> {
  const keys = accountsOn(env) ? emailKeys(env) : null;
  const mail = mailSender(env);
  const store = storeConfig(env);
  if (!keys || !mail || !store || order.startsWith('comp-')) return;
  // No signing key off this machine (OP-209): no link is made (signingSecret has said so).
  const secret = signingSecret(env, new URL(origin));
  if (secret === null) return;
  const deps = { rpc: collections(env), secret, keys, mail, origin, log };
  await orderEmail(store, order)
    .then((email) => offerOrderProtect(deps, cid, order, email))
    .catch((e: unknown) =>
      log.error('worker.accounts', 'write_failed', 'A ticket’s buyer could not be offered a link to protect their owl: it stays as it was.', { collector_hash: hashForLog(cid), order_hash: hashForLog(order), error: e }),
    );
}

/**
 * A ticket event for the park's log (OP-192): handed to the collections object's outbox after the
 * answer, which hashes the order, the owl and the ticket on their way out. Nothing while the log is off.
 */
export function logPurchase(ctx: ExecutionContext, env: Env, log: Logger, d: PurchaseData): void {
  if (!logConfig(env)) return;
  ctx.waitUntil(
    collections(env)
      .purchase(d)
      .catch((e: unknown) => log.warn('worker.tickets', 'write_failed', 'A ticket event did not reach the park’s log.', { reason: d.event, ...(d.order ? { order_hash: hashForLog(d.order) } : {}), error: e })),
  );
}

/** The opening switch as the vote ledger keeps it (OP-067), and when the park last restarted (OP-181). */
export async function readGate(env: Env): Promise<GateRead> {
  const r = await votes(env).fetch('https://park/gate');
  if (!r.ok) throw new Error(`the vote ledger answered ${r.status}`);
  const body = (await r.json()) as { gate: GateSet; restartAt?: unknown };
  return { set: body.gate, restartAt: typeof body.restartAt === 'number' ? body.restartAt : null };
}

/** The front gate now: the opening switch, or GATE where the switch was never set. */
export const gateOf = (env: Env) => gateNow(() => readGate(env), env.GATE);

/** The ticket book's internal routes in the vote ledger's object (`ticketDesk.ts`). */
export function deskOf(env: Env): Desk {
  const stub = votes(env);
  return async (path, body) => {
    const r = await stub.fetch(`https://park${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: (await r.json()) as Record<string, unknown> };
  };
}

/** What the store webhooks need, once the store is set up; null until then. */
export function storeDeps(env: Env, origin: string): HookDeps | null {
  const store = storeConfig(env);
  if (!store) return null;
  // Bring a friend (OP-056): the free Day Ticket's codes, and the offers their checkouts spend. A friend's
  // ticket is tied to its order's email, read so one inbox is one friend (referralEmailKey: no +tags, no
  // Gmail dots) and kept only as a keyed hash (null when the store will not say).
  const code = referralCode(env);
  const rewardCode = referralRewardCode(env);
  const emailHashOf = async (order: string): Promise<string | null> => {
    const keys = emailKeys(env);
    const email = keys ? referralEmailKey(await orderEmail(store, order)) : null;
    return keys && email ? keyed(await keys, 'e', `referral:${email}`) : null;
  };
  const referral = code
    ? {
        referralCode: code,
        ...(rewardCode ? { referralRewardCode: rewardCode } : {}),
        referralSpend: async (token: string, order: string) => collections(env).referralSpend(await checkoutHash(token), order, await emailHashOf(order)),
      }
    : {};
  return { store, desk: deskOf(env), claimUrl: (secret) => claimLink(origin, secret), ...(env.OPENING_PASS_CODE ? { openingCode: env.OPENING_PASS_CODE } : {}), ...referral };
}

/** Brings the store's copy of a ticket (or of an order's tickets) up to date after answering. */
export function mirrorLater(ctx: ExecutionContext, env: Env, log: Logger, origin: string, which: { id: string } | { order: string }): void {
  const deps = storeDeps(env, origin);
  if (!deps) return;
  ctx.waitUntil(
    (async () => {
      const r = await deps.desk('/tickets/mirror', which);
      if (r.status === 200) await mirrorTickets(deps, r.body['tickets'] as TicketMirror[], 'order' in which);
    })().catch((e: unknown) =>
      log.error('worker.store', 'store_unreachable', 'The store’s copy of tickets was not brought up to date.', { ...('order' in which ? { order_hash: hashForLog(which.order) } : { ticket_hash: hashForLog(which.id) }), error: e }),
    ),
  );
}

/** The room object for a room (or one of its copies, OP-075): one object for the park, or one per room and copy. */
export function objectName(env: Env, roomId: string, copy = 1): string {
  return env.ROOM_SHARDING === 'room' ? copyObjectName(roomId, copy) : 'park';
}

export function objectFor(env: Env, roomId: string, copy = 1): DurableObjectStub {
  return env.ROOMS.get(env.ROOMS.idFromName(objectName(env, roomId, copy)));
}
