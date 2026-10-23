/**
 * The keepers' fraud-check page (/admin/holds, C45), read with the admin key like the feedback page.
 * Orders the fraud pipeline sent to review wait here with their score and reason codes, and a
 * Release or a Refund; one left 24 hours is released (fail open). Below them, the latest checks and
 * what became of each. Order numbers, scores and reason codes only: no name or email is ever here.
 */
import { ADMIN_STYLE, adminPage } from './feedbackPage';

const STYLE = `
.state{margin:0 0 12px;color:var(--dim)}
h2{font-size:16px;margin:18px 0 8px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;color:var(--dim);font-weight:700;text-transform:uppercase;letter-spacing:.05em}
td .acts{display:flex;gap:6px;flex-wrap:wrap}
.reasons{font-size:12px;color:var(--dim);overflow-wrap:anywhere}
.wrap{overflow-x:auto}
.end{margin-top:14px}
`;

const SCRIPT = `
const KEY = 'owl-park:admin-key';
const $ = (s) => document.querySelector(s);
const keyOf = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };
const saveKey = (k) => { try { if (k) sessionStorage.setItem(KEY, k); else sessionStorage.removeItem(KEY); } catch {} };
const say = (t) => { $('#say').textContent = t; };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const locked = (yes) => { $('#key').hidden = !yes; $('#board').hidden = yes; };
const when = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
const score = (s) => (s === null || s === undefined ? '–' : Number(s).toFixed(2));
const WORDS = { approved: 'Approved', held: 'Held for review', refunded: 'Refunded', 'switched-off': 'Switched off', 'fail-open': 'Released (no answer in time)', released: 'Released by the owner', 'released-after-24h': 'Released after 24 hours' };

async function call(path, init) {
  const headers = { 'X-Admin-Key': keyOf() };
  if (init && init.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, Object.assign({}, init, { headers, cache: 'no-store' }));
  if (res.status === 403) throw new Error('key');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(body.error || 'status ' + res.status); e.body = body; throw e; }
  return body;
}

async function load() {
  if (!keyOf()) return locked(true);
  say('Loading…');
  try {
    const r = await call('/api/admin/holds?limit=50');
    locked(false);
    show(r);
    say('');
  } catch (e) {
    if (e.message !== 'key') return say('The park did not answer just now. Try again in a moment.');
    saveKey('');
    locked(true);
    say('That key did not open it.');
  }
}

function row(cells) {
  const tr = el('tr');
  for (const c of cells) { const td = el('td'); if (c instanceof Node) td.append(c); else td.textContent = c; tr.append(td); }
  return tr;
}

function show(r) {
  $('#state').textContent = r.on ? 'The fraud check is on: every paid ticket order is scored before its tickets go out.' : 'The fraud check is off: the store\\'s own rating decides until its endpoint, key and salt are set.';
  const held = $('#held');
  held.textContent = '';
  if (!r.held.length) held.append(row(['No order is waiting.', '', '', '', '']));
  for (const c of r.held) {
    const acts = el('div', 'acts');
    for (const [action, label] of [['release', 'Release'], ['refund', 'Refund']]) {
      const b = el('button', action === 'release' ? 'primary' : '', label);
      b.dataset.order = c.order;
      b.dataset.act = action;
      b.addEventListener('click', () => act(c.order, action, b));
      acts.append(b);
    }
    const tr = row([c.name, when(c.receivedAt), score(c.score), el('span', 'reasons', c.reasons.join(', ') || '–'), acts]);
    tr.dataset.held = c.order;
    held.append(tr);
    tr.children[1].textContent += ' · released ' + when(c.holdUntil) + ' if nothing is done';
  }
  const recent = $('#recent');
  recent.textContent = '';
  for (const c of r.recent) {
    const tr = row([c.name, when(c.receivedAt), c.decision === 'fail-open' ? 'none' : c.decision, score(c.score), WORDS[c.outcome] || c.outcome]);
    tr.dataset.check = c.order;
    recent.append(tr);
  }
}

async function act(order, action, b) {
  if (action === 'refund' && !confirm('Refund this order? The store refunds the buyer and its tickets stop working.')) return;
  b.disabled = true;
  try {
    await call('/api/admin/holds', { method: 'POST', body: JSON.stringify({ order, action }) });
    await load();
  } catch (e) {
    b.disabled = false;
    say(e.message === 'key' ? 'That key did not open it.' : 'That did not go through: ' + e.message);
  }
}

$('#key').addEventListener('submit', (e) => {
  e.preventDefault();
  saveKey($('#key input').value.trim());
  $('#key input').value = '';
  load();
});
$('#refresh').addEventListener('click', load);
$('#forget').addEventListener('click', () => { saveKey(''); $('#held').textContent = ''; $('#recent').textContent = ''; say(''); locked(true); });
load();
`;

function html(nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Owl Park fraud check</title>
<style nonce="${nonce}">${ADMIN_STYLE}${STYLE}</style>
</head>
<body>
<main>
<h1>Owl Park fraud check</h1>
<p class="lede">Ticket orders the fraud pipeline sent to review, and the latest checks.</p>
<form id="key">
<input type="password" name="key" autocomplete="current-password" placeholder="Admin key" aria-label="Admin key" required>
<button class="primary">Open</button>
</form>
<p id="say" role="status" aria-live="polite"></p>
<section id="board" hidden>
<p class="state" id="state"></p>
<h2>Held for review</h2>
<div class="wrap"><table><thead><tr><th>Order</th><th>Paid</th><th>Score</th><th>Reasons</th><th></th></tr></thead><tbody id="held"></tbody></table></div>
<h2>Latest checks</h2>
<div class="wrap"><table><thead><tr><th>Order</th><th>Paid</th><th>Verdict</th><th>Score</th><th>Outcome</th></tr></thead><tbody id="recent"></tbody></table></div>
<div class="tabs end">
<button id="refresh">Refresh</button>
<button id="forget">Lock</button>
</div>
</section>
</main>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
}

export function holdsPage(): Response {
  return adminPage(html);
}
