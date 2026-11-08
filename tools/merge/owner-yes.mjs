// What auto-merge never merges on its own (.github/workflows/automerge.yml, the Owl Park merge gate):
// a change to payments, the store (Shopify), accounts or data deletion needs the owner's separate yes,
// and so does a change to the workflows or the auto-merge rules themselves. Given a pull request's files (as GitHub's
// "list pull request files" gives them: filename, previous_filename, patch), returns the reasons it
// has to wait, or an empty list.

/** Files whose change needs the owner's yes, each with the reason a person reads. */
export const OWNER_YES_PATHS = [
  [/^apps\/edge\/src\/(TicketBook|ticketDesk|tickets|sqlTicketStore|pass|gate|gateSwitch|gatePage|opening|openingPage|line)\.ts$/, 'tickets, passes and the gate (payments)'],
  [/^apps\/edge\/src\/(shopify|storeApi|storeHooks|buyerLog)\.ts$/, 'the store (Shopify)'],
  [/^apps\/edge\/src\/(accounts|accountBook)\.ts$/, 'accounts'],
  [/^apps\/edge\/src\/routes\/(account|store|tickets|line)\.ts$/, 'the store, tickets and accounts routes'],
  [/^apps\/edge\/wrangler\.jsonc$/, 'the Worker’s storage and its migrations (data can be deleted there)'],
  [/^apps\/park-log\//, 'the collection log keeps and deletes data'],
  [/\.sql$/, 'database changes'],
  [/^apps\/park\/src\/(ui\/(checkout|checkoutReturn|gateSale|gatePrompt|shop|storeCard|tickets|account)|net\/(accountLinks|ticketLinks))\.ts$/, 'what a visitor buys and their account'],
  [/^\.github\/|^tools\/(merge|flags)\//, 'the workflows and auto-merge rules themselves (they decide what every check means)'],
];

/** Added lines that mean deleting data or touching the store, wherever they are. */
export const OWNER_YES_LINES = [
  [/\b(DELETE\s+FROM|DROP\s+(TABLE|SCHEMA|VIEW|FUNCTION)|TRUNCATE)\b/i, 'deletes data (SQL)'],
  [/\b(deleteAll|deleteAlarm)\s*\(|\bstorage\.delete\s*\(|\bdeleted_classes\b/, 'deletes stored data'],
  [/shopify/i, 'the store (Shopify)'],
];

export function ownerYesReasons(files) {
  const reasons = new Set();
  for (const f of files) {
    for (const name of [f.filename, f.previous_filename].filter(Boolean)) {
      for (const [re, why] of OWNER_YES_PATHS) if (re.test(name)) reasons.add(`${name}: ${why}`);
    }
    // Tests may name these things freely; what runs is what counts.
    if (/(\.test\.|\/test\/|\/e2e\/)/.test(f.filename)) continue;
    const added = (f.patch ?? '').split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
    for (const [re, why] of OWNER_YES_LINES) if (added.some((l) => re.test(l))) reasons.add(`${f.filename}: ${why}`);
    if (f.patch === undefined && f.changes > 0 && !/\.(png|webp|jpg|jpeg|gif|svg|mp3|ogg|wav|woff2?)$/i.test(f.filename)) {
      reasons.add(`${f.filename}: too big for GitHub to show its changes, so they cannot be checked`);
    }
  }
  return [...reasons];
}
