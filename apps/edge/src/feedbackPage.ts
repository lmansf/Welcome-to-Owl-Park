/**
 * The keepers' feedback page (/admin/feedback): reads visitors' feedback with the admin key and marks
 * each note done or dropped. The page holds no feedback itself; it asks /api/admin/feedback with the
 * key the keeper types, which stays in that browser tab only. Visitors' words are only ever set as
 * text, and the page runs nothing but its own script (a fresh nonce on every load).
 */

/** The keepers' pages' look (this page's, and opening night's). */
export const ADMIN_STYLE = `
:root{color-scheme:light dark;--bg:#0C1E36;--card:#132a4a;--ink:#F6F1E3;--dim:#b9c3d3;--gold:#C9A227;--line:rgba(246,241,227,.16)}
@media (prefers-color-scheme:light){:root{--bg:#f6f1e3;--card:#fffdf7;--ink:#0C1E36;--dim:#4c5a70;--line:rgba(12,30,54,.14)}}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:20px 16px 48px}
h1{font-size:22px;margin:0 0 4px}
.lede{margin:0 0 18px;color:var(--dim)}
form,.tabs,.tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
input{font:inherit;padding:10px 12px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);min-width:0;flex:1 1 220px}
button{font:inherit;font-weight:700;cursor:pointer;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:8px 14px;min-height:40px}
button.primary,button[aria-pressed=true]{background:var(--gold);color:#0C1E36;border-color:var(--gold)}
button:disabled{opacity:.5;cursor:default}
.tools{justify-content:space-between;margin:0 0 12px}
#say{color:var(--dim);margin:12px 0}
ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
li{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
li.done,li.dropped{opacity:.72}
.head{display:flex;gap:10px;flex-wrap:wrap;align-items:baseline;font-size:13px;color:var(--dim)}
.kind{font-weight:800;text-transform:uppercase;letter-spacing:.06em;font-size:12px;color:var(--ink)}
.kind.bug{color:#e0685a}.kind.idea{color:#4aa3df}.kind.praise{color:#3fae6a}
.text{white-space:pre-wrap;overflow-wrap:anywhere;margin:6px 0 8px;font-size:15px}
.foot{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.who{flex:1 1 240px;font-size:12px;color:var(--dim);overflow-wrap:anywhere}
`;

const SCRIPT = `
const KEY = 'owl-park:admin-key';
const KINDS = { bug: 'Bug', idea: 'Idea', praise: 'Praise', other: 'Other' };
const $ = (s) => document.querySelector(s);
let status = 'open';
let rows = [];
const keyOf = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };
const saveKey = (k) => { try { if (k) sessionStorage.setItem(KEY, k); else sessionStorage.removeItem(KEY); } catch {} };
const say = (t) => { $('#say').textContent = t; };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const locked = (yes) => { $('#key').hidden = !yes; $('#board').hidden = yes; };

async function call(path, init) {
  const headers = { 'X-Admin-Key': keyOf() };
  if (init && init.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, Object.assign({}, init, { headers, cache: 'no-store' }));
  if (res.status === 403) throw new Error('key');
  if (!res.ok) throw new Error('status ' + res.status);
  return res.json();
}

async function load() {
  if (!keyOf()) return locked(true);
  say('Loading…');
  try {
    rows = (await call('/api/admin/feedback?status=' + status + '&limit=500')).feedback;
    locked(false);
    show();
  } catch (e) {
    if (e.message !== 'key') return say('The park did not answer just now. Try again in a moment.');
    saveKey('');
    locked(true);
    say('That key did not open it.');
  }
}

function show() {
  const list = $('#list');
  list.textContent = '';
  const which = status === 'all' ? '' : status + ' ';
  say(rows.length ? rows.length + ' ' + which + (rows.length === 1 ? 'note' : 'notes') + (rows.length === 500 ? ' (the newest 500)' : '') : 'No ' + which + 'notes.');
  for (const r of rows) {
    const li = el('li', r.status);
    const head = el('div', 'head');
    head.append(el('span', 'kind ' + r.kind, KINDS[r.kind] || r.kind), el('time', '', new Date(r.at).toLocaleString()));
    const where = [r.room, r.screen].filter(Boolean).join(' · ');
    if (where) head.append(el('span', '', where));
    if (r.status !== 'open') head.append(el('span', '', r.status));
    const foot = el('div', 'foot');
    foot.append(el('span', 'who', '#' + r.id + ' · ' + r.cid + (r.ua ? ' · ' + r.ua : '')));
    const moves = r.status === 'open' ? [['done', 'Done'], ['dropped', 'Drop']] : [['open', 'Reopen']];
    for (const [to, label] of moves) {
      const b = el('button', '', label);
      b.addEventListener('click', () => mark(r.id, to, b));
      foot.append(b);
    }
    li.append(head, el('p', 'text', r.text), foot);
    list.append(li);
  }
}

async function mark(id, to, b) {
  b.disabled = true;
  try {
    await call('/api/admin/feedback', { method: 'POST', body: JSON.stringify({ id, status: to }) });
    await load();
  } catch {
    b.disabled = false;
    say('That did not save. Try again.');
  }
}

/** A spreadsheet cell: quoted, and never read as a formula. */
const cell = (v) => { let s = v == null ? '' : String(v); if (/^[=+\\-@\\t\\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };

function download() {
  const head = ['id', 'when', 'kind', 'status', 'room', 'screen', 'text', 'collector', 'browser'];
  const lines = [head.join(',')].concat(rows.map((r) => [r.id, new Date(r.at).toISOString(), r.kind, r.status, r.room, r.screen, r.text, r.cid, r.ua].map(cell).join(',')));
  const a = el('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\\r\\n')], { type: 'text/csv' }));
  a.download = 'owl-park-feedback-' + status + '.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('#key').addEventListener('submit', (e) => {
  e.preventDefault();
  saveKey($('#key input').value.trim());
  $('#key input').value = '';
  load();
});
for (const b of document.querySelectorAll('.tabs button')) {
  b.addEventListener('click', () => {
    status = b.dataset.status;
    for (const o of document.querySelectorAll('.tabs button')) o.setAttribute('aria-pressed', String(o === b));
    load();
  });
}
$('#csv').addEventListener('click', download);
$('#forget').addEventListener('click', () => { saveKey(''); rows = []; $('#list').textContent = ''; say(''); locked(true); });
load();
`;

function html(nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Owl Park feedback</title>
<style nonce="${nonce}">${ADMIN_STYLE}</style>
</head>
<body>
<main>
<h1>Owl Park feedback</h1>
<p class="lede">Notes visitors sent with the Feedback button, newest first.</p>
<form id="key">
<input type="password" name="key" autocomplete="current-password" placeholder="Admin key" aria-label="Admin key" required>
<button class="primary">Open</button>
</form>
<p id="say" role="status" aria-live="polite"></p>
<section id="board" hidden>
<div class="tools">
<div class="tabs" role="group" aria-label="Show">
<button data-status="open" aria-pressed="true">Open</button>
<button data-status="done" aria-pressed="false">Done</button>
<button data-status="dropped" aria-pressed="false">Dropped</button>
<button data-status="all" aria-pressed="false">All</button>
</div>
<div class="tabs">
<button id="csv">Download CSV</button>
<button id="forget">Lock</button>
</div>
</div>
<ol id="list"></ol>
</section>
</main>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
}

/** The page, uncached, kept out of search engines, and running only its own script and style. */
export function feedbackPage(): Response {
  return adminPage(html);
}

/** A keepers' page: uncached, kept out of search engines, and running only its own script and style (a fresh nonce each load). */
export function adminPage(html: (nonce: string) => string): Response {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  return new Response(html(nonce), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    },
  });
}
