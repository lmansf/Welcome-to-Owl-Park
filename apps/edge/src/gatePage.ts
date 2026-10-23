/**
 * The keepers' front gate page (/admin/gate, OP-067): the opening switch, read and flipped with the
 * admin key like the other keepers' pages. It shows whether the turnstiles let everyone through or
 * take tickets, since when, and flips it after a confirm. A flip reaches every visitor within ten
 * seconds; owls already inside stay in.
 */
import { ADMIN_STYLE, adminPage } from './feedbackPage';

const STYLE = `
.state{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:0 0 14px}
.state strong{display:block;font-size:20px;margin-bottom:4px}
.state p{margin:0;color:var(--dim)}
.flip{margin:0 0 14px}
`;

const SCRIPT = `
const KEY = 'owl-park:admin-key';
const $ = (s) => document.querySelector(s);
const keyOf = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };
const saveKey = (k) => { try { if (k) sessionStorage.setItem(KEY, k); else sessionStorage.removeItem(KEY); } catch {} };
const say = (t) => { $('#say').textContent = t; };
const locked = (yes) => { $('#key').hidden = !yes; $('#board').hidden = yes; };
const eastern = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';
const ASK = {
  ticket: 'Take tickets now? Owls without a ticket stop at the turnstiles and the booth sells tickets. Owls already inside stay in.',
  open: 'Open the gate to everyone? The turnstiles let every owl through and the booth stops selling.',
  deployed: 'Hand the gate back to the deployed setting (GATE in wrangler.jsonc)?',
};

async function call(method, body) {
  const res = await fetch('/api/admin/gate', { method, headers: { 'X-Admin-Key': keyOf(), 'Content-Type': 'application/json' }, cache: 'no-store', ...(body ? { body: JSON.stringify(body) } : {}) });
  if (res.status === 403) throw new Error('key');
  if (!res.ok) throw new Error('status ' + res.status);
  return res.json();
}

function show(g) {
  $('#mode').textContent = g.mode === 'ticket' ? 'The gate takes tickets' : 'The gate is open to everyone';
  $('#what').textContent = g.mode === 'ticket'
    ? 'Only owls with a ticket go through the turnstiles, and the booth sells tickets.'
    : 'The turnstiles let every owl through, and the booth says tickets are coming soon.';
  $('#since').textContent = g.set ? 'Set by this switch on ' + eastern(g.set.at) + '.' : 'As deployed (GATE in wrangler.jsonc: ' + g.deployed + ').';
  for (const b of document.querySelectorAll('[data-mode]')) {
    const m = b.dataset.mode;
    b.disabled = m === 'deployed' ? !g.set : !!g.set && g.set.mode === m;
  }
}

async function load() {
  if (!keyOf()) return locked(true);
  say('Loading…');
  try {
    show(await call('GET'));
    locked(false);
    say('');
  } catch (e) {
    if (e.message !== 'key') return say('The park did not answer just now. Try again in a moment.');
    saveKey('');
    locked(true);
    say('That key did not open it.');
  }
}

async function flip(mode) {
  if (!confirm(ASK[mode])) return;
  say('Flipping…');
  try {
    show(await call('POST', { mode }));
    say('Done. Every visitor sees it within ten seconds.');
  } catch {
    say('The switch did not flip. Try again in a moment.');
  }
}

$('#key').addEventListener('submit', (e) => {
  e.preventDefault();
  saveKey($('#key input').value.trim());
  $('#key input').value = '';
  load();
});
for (const b of document.querySelectorAll('[data-mode]')) b.addEventListener('click', () => flip(b.dataset.mode));
$('#refresh').addEventListener('click', load);
$('#forget').addEventListener('click', () => { saveKey(''); say(''); locked(true); });
load();
`;

function html(nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Owl Park front gate</title>
<style nonce="${nonce}">${ADMIN_STYLE}${STYLE}</style>
</head>
<body>
<main>
<h1>Owl Park front gate</h1>
<p class="lede">The opening switch: the turnstiles open to everyone, or taking tickets. No deploy needed.</p>
<form id="key">
<input type="password" name="key" autocomplete="current-password" placeholder="Admin key" aria-label="Admin key" required>
<button class="primary">Open</button>
</form>
<p id="say" role="status" aria-live="polite"></p>
<section id="board" hidden>
<div class="state" id="state"><strong id="mode"></strong><p id="what"></p><p id="since"></p></div>
<div class="tabs flip">
<button class="primary" data-mode="ticket">Take tickets now</button>
<button data-mode="open">Open to everyone</button>
<button data-mode="deployed">As deployed</button>
</div>
<div class="tabs">
<button id="refresh">Refresh</button>
<button id="forget">Lock</button>
</div>
</section>
</main>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
}

export function gatePage(): Response {
  return adminPage(html);
}
