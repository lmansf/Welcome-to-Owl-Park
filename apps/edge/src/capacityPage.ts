/**
 * The keepers' capacity page (/admin/capacity, OP-075): the busy-night controls, read and changed
 * with the admin key like the other keepers' pages, no deploy. The line (off, on by itself past a
 * number of owls, or on), the busy ribbon and its words, and every room's owls copy by copy, with
 * opening, draining and closing a copy of a room (one object per room only). docs/CAPACITY.md says
 * when to use which.
 */
import { ADMIN_STYLE, adminPage } from './feedbackPage';

const STYLE = `
section.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin:0 0 14px}
section.card h2{font-size:17px;margin:0 0 6px}
section.card p{margin:0 0 10px;color:var(--dim)}
section.card strong{color:var(--ink)}
label{display:flex;gap:8px;align-items:center;color:var(--dim)}
label input{flex:0 1 110px}
#words{flex:1 1 280px}
table{width:100%;border-collapse:collapse;margin:0 0 6px}
th,td{text-align:left;padding:6px 4px;border-bottom:1px solid var(--line);vertical-align:middle}
td .tabs{gap:6px}
td button{min-height:34px;padding:4px 10px}
`;

const SCRIPT = `
const KEY = 'owl-park:admin-key';
const $ = (s) => document.querySelector(s);
const keyOf = () => { try { return sessionStorage.getItem(KEY) || ''; } catch { return ''; } };
const saveKey = (k) => { try { if (k) sessionStorage.setItem(KEY, k); else sessionStorage.removeItem(KEY); } catch {} };
const say = (t) => { $('#say').textContent = t; };
const locked = (yes) => { $('#key').hidden = !yes; $('#board').hidden = yes; };
const COPY_MAX = 9;
let now = null;

async function call(method, body) {
  const res = await fetch('/api/admin/capacity', { method, headers: { 'X-Admin-Key': keyOf(), 'Content-Type': 'application/json' }, cache: 'no-store', ...(body ? { body: JSON.stringify(body) } : {}) });
  if (res.status === 403) throw new Error('key');
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || ('status ' + res.status));
  return out;
}

function lineText(s) {
  const l = s.line;
  const inLine = s.waiting === 1 ? '1 owl is waiting' : s.waiting + ' owls are waiting';
  const counted = s.count === null ? '' : ' Owls in the park when last counted: ' + s.count + '.';
  if (l.mode === 'off') return 'No line: every owl walks in.' + counted;
  const pace = s.rate > 0 ? ' Letting in about ' + Math.round(s.rate * 10) / 10 + ' a minute.' : '';
  if (l.mode === 'auto') return (s.active ? 'The line is in front of the park: ' + inLine + '.' : 'A line starts by itself once the park holds ' + l.threshold + ' owls.') + pace + counted;
  return 'Every new owl goes through the line, which lets owls in while the park holds fewer than ' + l.threshold + '. ' + inLine + '.' + pace + counted;
}

function show(s) {
  now = s;
  $('#line-state').textContent = lineText(s);
  for (const b of document.querySelectorAll('[data-line]')) b.setAttribute('aria-pressed', String(b.dataset.line === s.line.mode));
  if (document.activeElement !== $('#threshold')) $('#threshold').value = s.line.threshold;
  if (document.activeElement !== $('#hold')) $('#hold').value = s.line.holdMin;
  const words = s.ribbon.words || $('#words').placeholder;
  $('#ribbon-state').textContent = s.ribbon.on ? 'On for everyone: "' + words + '"' : (s.active ? 'On by itself while the line is: "' + words + '"' : 'Off.');
  for (const b of document.querySelectorAll('[data-ribbon]')) b.setAttribute('aria-pressed', String((b.dataset.ribbon === 'on') === s.ribbon.on));
  if (document.activeElement !== $('#words')) $('#words').value = s.ribbon.words || '';
  const room = s.sharding === 'room';
  $('#copies-note').textContent = room
    ? 'One object per room: a room can open copies. New owls go to the copy with the most free places; a draining copy takes none, and closes once empty.'
    : 'The whole park runs in one object (ROOM_SHARDING=single), so copies would add no room. Switching to one object per room is a setting and a deploy: see docs/CAPACITY.md.';
  const rows = s.rooms.map((r) => {
    const cells = r.copies.map((c) => {
      const label = c.n === 1 ? 'the room' : 'copy ' + c.n + (c.state === 'draining' ? ' (draining)' : '');
      const tools = !room || c.n === 1 ? '' :
        (c.state === 'open' ? '<button data-copy="draining" data-room="' + r.room + '" data-n="' + c.n + '">Drain</button>' : '<button data-copy="open" data-room="' + r.room + '" data-n="' + c.n + '">Reopen</button>') +
        '<button data-copy="closed" data-room="' + r.room + '" data-n="' + c.n + '">Close</button>';
      return '<div class="tabs"><span>' + label + ': <strong>' + c.count + '</strong> of ' + r.cap + '</span>' + tools + '</div>';
    }).join('');
    const used = new Set(r.copies.map((c) => c.n));
    let next = 0;
    for (let n = 2; n <= COPY_MAX; n++) if (!used.has(n)) { next = n; break; }
    const open = room && next ? '<button data-copy="open" data-room="' + r.room + '" data-n="' + next + '">Open copy ' + next + '</button>' : '';
    return '<tr><th scope="row">' + r.room + '</th><td>' + cells + '</td><td>' + open + '</td></tr>';
  }).join('');
  $('#rooms').innerHTML = rows;
  for (const b of document.querySelectorAll('[data-copy]')) b.addEventListener('click', () => copy(b.dataset.room, Number(b.dataset.n), b.dataset.copy));
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

async function change(body, done) {
  say('Saving…');
  try {
    show(await call('POST', body));
    say(done);
  } catch (e) {
    say(e.message === 'key' ? 'That key did not open it.' : 'That did not take: ' + e.message + '.');
  }
}

const ASK = {
  off: 'Turn the line off? Everyone waiting walks in on their next look, and new owls walk straight in.',
  auto: 'Start a line by itself whenever the park reaches the number of owls below?',
  on: 'Put every new owl through the line now? Owls already inside stay in.',
};

function copy(room, n, state) {
  const c = now && now.rooms.find((r) => r.room === room);
  const cur = c && c.copies.find((x) => x.n === n);
  if (state === 'closed' && cur && cur.count > 0 && !confirm('Copy ' + n + ' of ' + room + ' still has ' + cur.count + ' owls. Close it anyway? They stay until they leave, but none can come back to it.')) return;
  if (state === 'open' && !cur && !confirm('Open copy ' + n + ' of ' + room + '? New owls start going to it at once.')) return;
  change({ copy: { room, n, state } }, state === 'open' ? 'Copy ' + n + ' of ' + room + ' takes owls now.' : state === 'draining' ? 'Copy ' + n + ' of ' + room + ' takes no new owls now; close it once it is empty.' : 'Copy ' + n + ' of ' + room + ' is closed.');
}

$('#key').addEventListener('submit', (e) => {
  e.preventDefault();
  saveKey($('#key input').value.trim());
  $('#key input').value = '';
  load();
});
for (const b of document.querySelectorAll('[data-line]')) b.addEventListener('click', () => {
  const mode = b.dataset.line;
  if (!confirm(ASK[mode])) return;
  change({ line: { mode, threshold: Number($('#threshold').value), holdMin: Number($('#hold').value) } }, 'Done. Every new owl sees it within half a minute.');
});
$('#line-save').addEventListener('click', () => change({ line: { threshold: Number($('#threshold').value), holdMin: Number($('#hold').value) } }, 'Saved.'));
for (const b of document.querySelectorAll('[data-ribbon]')) b.addEventListener('click', () => change({ ribbon: { on: b.dataset.ribbon === 'on' } }, 'Done. Owls in the rooms see it at once, and the home screen within a minute.'));
$('#words-save').addEventListener('click', () => change({ ribbon: { words: $('#words').value } }, 'Saved.'));
$('#refresh').addEventListener('click', load);
$('#forget').addEventListener('click', () => { saveKey(''); say(''); locked(true); });
load();
`;

function html(nonce: string, ribbonWords: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Owl Park capacity</title>
<style nonce="${nonce}">${ADMIN_STYLE}${STYLE}</style>
</head>
<body>
<main>
<h1>Owl Park capacity</h1>
<p class="lede">Busy nights: the line, the busy ribbon and copies of rooms. No deploy needed. When to use which: docs/CAPACITY.md.</p>
<form id="key">
<input type="password" name="key" autocomplete="current-password" placeholder="Admin key" aria-label="Admin key" required>
<button class="primary">Open</button>
</form>
<p id="say" role="status" aria-live="polite"></p>
<div id="board" hidden>
<section class="card" aria-labelledby="line-h">
<h2 id="line-h">The line</h2>
<p id="line-state"></p>
<div class="tabs"><button data-line="off">Off</button><button data-line="auto">On by itself</button><button data-line="on">On</button></div>
<p></p>
<div class="tabs">
<label>Owls in the park <input id="threshold" type="number" min="0" max="5000" step="1" inputmode="numeric"></label>
<label>Hold a called place (minutes) <input id="hold" type="number" min="1" max="15" step="1" inputmode="numeric"></label>
<button id="line-save">Save</button>
</div>
</section>
<section class="card" aria-labelledby="ribbon-h">
<h2 id="ribbon-h">The busy ribbon</h2>
<p id="ribbon-state"></p>
<div class="tabs"><button data-ribbon="on">On</button><button data-ribbon="off">Off</button></div>
<p></p>
<div class="tabs">
<input id="words" maxlength="90" placeholder="${ribbonWords.replace(/"/g, '&quot;')}" aria-label="The ribbon's words (empty: the ribbon's own)">
<button id="words-save">Save words</button>
</div>
</section>
<section class="card" aria-labelledby="copies-h">
<h2 id="copies-h">Rooms and copies</h2>
<p id="copies-note"></p>
<table><thead><tr><th>Room</th><th>Owls, copy by copy</th><th></th></tr></thead><tbody id="rooms"></tbody></table>
</section>
<div class="tabs">
<button id="refresh">Refresh</button>
<button id="forget">Lock</button>
</div>
</div>
</main>
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
}

export function capacityPage(ribbonWords: string): Response {
  return adminPage((nonce) => html(nonce, ribbonWords));
}
