/**
 * Opening night in the Worker (C42). The store sells the Opening Night Ticket (its window is a field
 * on the product, so a moved date is a store edit) and takes half off the annual pass with a code
 * it never advertises (`OPENING_PASS_CODE`, a Worker secret; the pass was free until OP-062). Once
 * an owl's Opening Night Ticket has gone through the gate, the park gives it a cart link with the
 * pass, the code and the ticket's ID (`from_ticket`); the pass order comes back through the usual
 * webhook and the ticket book keeps the link and what the pass sold for (storeHooks.ts,
 * TicketBook.ts). While the night runs, an owl that buys a Day Ticket at the gate is offered the
 * same pass (OP-180).
 *
 * The store's ticket products are asked for at most every few minutes and kept in this isolate.
 */
import { moduleLog } from './logs';
import { adminQuery, storeConfig } from './storeApi';
import { CATALOGUE_QUERY, catalogueOf, type AdminCatalogue, type Catalogue } from './shopify';

type OpeningEnv = Parameters<typeof storeConfig>[0] & { OPENING_PASS_CODE?: string };

/** How long the store's answer is kept, and a failed ask before asking again. */
const KEEP_MS = 2 * 60_000;
const RETRY_MS = 20_000;

let kept: { shop: string; until: number; value: Catalogue | null } | null = null;

/** The ticket products on sale (the annual pass and opening night's window); null without a store. */
export async function storeCatalogue(env: OpeningEnv, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<Catalogue | null> {
  const store = storeConfig(env);
  if (!store) return null;
  // A stand-in store (browser tests) is asked every time, so a test can change what is on sale.
  if (kept && kept.shop === store.shop && now < kept.until && !store.origin) return kept.value;
  try {
    const value = catalogueOf(await adminQuery<AdminCatalogue>(store, CATALOGUE_QUERY, {}, fetchFn));
    kept = { shop: store.shop, until: now + KEEP_MS, value };
    return value;
  } catch (e) {
    // The last answer stands until the store answers again.
    moduleLog.error('worker.store', 'store_unreachable', 'The store did not list its ticket products: the last list stands.', { error: e });
    const value = kept?.shop === store.shop ? kept.value : null;
    kept = { shop: store.shop, until: now + RETRY_MS, value };
    return value;
  }
}

/** Forget the kept answer (tests). */
export function forgetCatalogue(): void {
  kept = null;
}

/** Whether opening night is on: inside the window of the Opening Night Ticket on sale. */
export function openingOn(catalogue: Catalogue | null, now: number): boolean {
  const w = catalogue?.opening;
  return !!w && now >= w.from && now < w.until;
}

/** What the pass link needs, for the keepers' page: the code, and the annual pass on sale. */
export function passLinkReady(env: OpeningEnv, catalogue: Catalogue | null): { code: boolean; pass: boolean } {
  return { code: !!env.OPENING_PASS_CODE?.trim(), pass: !!catalogue?.passVariant };
}
