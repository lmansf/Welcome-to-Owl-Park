/**
 * The keepers' opening-night page (/admin/opening, C42): the night's count, read with the admin key
 * like the feedback page. Tickets issued and scanned, passes claimed through the park's link and
 * passes without one, the conversion rate, and a CSV of the night's tickets: order numbers and ticket
 * IDs only, never a name or an email. It also shows the night's window as the store has it and
 * whether the free-pass link is ready, so a wrong date or a missing code shows before the night.
 */
import { ADMIN_STYLE, adminPage } from './feedbackPage';

const STYLE = `
dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:0 0 14px}
dl div{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
dt{font-size:13px;color:var(--dim)}
dd{margin:4px 0 0;font-size:26px;font-weight:800}
.note{margin:0 0 8px;color:var(--dim)}
.note strong{color:var(--ink)}
`;

const SCRIPT = `
const KEY = 'owl-park:admin-key';
const $ = (s) => document.querySelector(s);
const keyOf = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };
const saveKey = (k) => { try { if (k) sessionStorage.setItem(KEY, k); else sessionStorage.removeItem(KEY); } catch {} };
const say = (t) => { $('#say').textContent = t; };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const locked = (yes) => { $('#key').hidden = !yes; $('#board').hidden = yes; };
const eastern = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET';

async function call(path) {
  const res = await fetch(path, { headers: { 'X-Admin-Key': keyOf() }, cache: 'no-store' });
  if (res.status === 403) throw new Error('key');
  if (!res.ok) throw new Error('status ' + res.status);
  return res;
}

async function load() {
  if (!keyOf()) return locked(true);
  say('Loading…');
  try {
    const r = await (await call('/api/admin/opening')).json();
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

function show(r) {
  const c = r.counts;
  const rate = c.conversion === null ? '–' : Math.round(c.conversion * 1000) / 10 + '%';
  const stats = $('#stats');
  stats.textContent = '';
  for (const [name, value, id] of [
    ['Tickets issued', c.issued, 'issued'],
    ['Tickets scanned', c.scanned, 'scanned'],
    ['Passes claimed through the link', c.linkedPasses, 'linked'],
    ['Passes without a link', c.unlinkedPasses, 'unlinked'],
    ['Conversion rate', rate, 'conversion'],
    ['Switched off', c.revoked, 'revoked'],
  ]) {
    const d = el('div');
    d.dataset.stat = id;
    d.append(el('dt', '', name), el('dd', '', String(value)));
    stats.append(d);
  }
  $('#converted').textContent = c.scanned ? c.converted + ' of ' + c.scanned + ' scanned tickets turned into a pass.' : 'No ticket has gone through the gate yet.';
  const w = r.window;
  $('#window').textContent = w ? 'Opening night, as the store has it: ' + eastern(w.from) + ' to ' + eastern(w.until) + '.' : 'No Opening Night Ticket is on sale with a start time.';
  const missing = [];
  if (!r.link.code) missing.push('the pass code (OPENING_PASS_CODE)');
  if (!r.link.pass) missing.push('an annual pass on sale');
  $('#link').textContent = missing.length ? 'The free-pass link is not ready: it needs ' + missing.join(' and ') + '.' : 'The free-pass link is ready.';
}

async function download() {
  try {
    const blob = await (await call('/api/admin/opening?csv')).blob();
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'owl-park-opening-night.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch {
    say('The CSV did not download. Try again.');
  }
}

$('#key').addEventListener('submit', (e) => {
  e.preventDefault();
  saveKey($('#key input').value.trim());
  $('#key input').value = '';
  load();
});
$('#refresh').addEventListener('click', load);
$('#csv').addEventListener('click', download);
$('#forget').addEventListener('click', () => { saveKey(''); $('#stats').textContent = ''; say(''); locked(true); });
load();
`;

function html(nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Owl Park opening night</title>
<style nonce="${nonce}">${ADMIN_STYLE}${STYLE}</style>
</head>
<body>
<main>
<h1>Owl Park opening night</h1>
<p class="lede">The night's count: Opening Night Tickets, and the passes they turned into.</p>
<form id="key">
<input type="password" name="key" autocomplete="current-password" placeholder="Admin key" aria-label="Admin key" required>
<button class="primary">Open</button>
</form>
<p id="say" role="status" aria-live="polite"></p>
<section id="board" hidden>
<dl id="stats"></dl>
<p class="note" id="converted"></p>
<p class="note" id="window"></p>
<p class="note" id="link"></p>
<div class="tabs">
<button id="refresh">Refresh</button>
<button id="csv">Download CSV</button>
<button id="forget">Lock</button>
</div>
</section>
</main>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
}

export function openingPage(): Response {
  return adminPage(html);
}
