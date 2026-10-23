/**
 * Opening night in the Worker (C42). The store sells the Opening Night Ticket (its window is a field
 * on the product, so a moved date is a store edit) and makes the annual pass free with a code it
 * never advertises (`OPENING_PASS_CODE`, a Worker secret). Once an owl's Opening Night Ticket has
 * gone through the gate, the park gives it a cart link with the pass, the code and the ticket's ID
 * (`from_ticket`); the pass order comes back through the usual webhook and the ticket book keeps the
 * link (storeHooks.ts, TicketBook.ts). The booth says passes are free while the night runs.
 *
 * The store's ticket products are asked for at most every few minutes and kept in this isolate.
 */
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
    console.error('[owl-park] the store did not list its tickets:', e instanceof Error ? e.message : e);
    // The last answer stands until the store answers again.
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

/** What the free-pass link needs, for the keepers' page: the code, and the annual pass on sale. */
export function passLinkReady(env: OpeningEnv, catalogue: Catalogue | null): { code: boolean; pass: boolean } {
  return { code: !!env.OPENING_PASS_CODE?.trim(), pass: !!catalogue?.passVariant };
}
