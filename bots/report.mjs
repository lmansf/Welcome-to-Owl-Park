/**
 * The playtest's summary (pnpm --filter @owl-park/bots report): the sim's verdict (out/sim.json) and the
 * browser walk's records (out/browser) put together, written as Markdown to out/summary.md and to the
 * run's summary when GITHUB_STEP_SUMMARY is set. Exits 1 on any blocker the baseline (baseline.json)
 * doesn't list: from the sim, a stuck spot, a doorway or course piece no route reaches, a spawn on
 * nothing, a course hop under the kid bar; from the browser, a room that won't open or a doorway that a
 * walk to it doesn't go through.
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'out');
const pct = (n) => `${Math.round(n * 100)}%`;
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));

const baseline = new Set(read(join(ROOT, 'baseline.json')).known.map((k) => k.key));
const sim = existsSync(join(OUT, 'sim.json')) ? read(join(OUT, 'sim.json')) : null;

// The browser walk's records, by project.
const browser = new Map();
const browserDir = join(OUT, 'browser');
if (existsSync(browserDir)) {
  for (const project of readdirSync(browserDir)) {
    const recs = readdirSync(join(browserDir, project))
      .filter((f) => f.endsWith('.json'))
      .map((f) => read(join(browserDir, project, f)));
    browser.set(project, recs);
  }
}

const browserFindings = [];
const browserNotes = [];
const failsBy = new Map();
const errorsBy = new Map();
const note = (key, what) => {
  const by = failsBy.get(key) ?? { what, projects: [] };
  failsBy.set(key, by);
  return by;
};
for (const [project, recs] of browser) {
  for (const r of recs) {
    if (r.kind === 'entry') {
      if (!r.opened) note(`open:${r.room}:${r.spawn}`, `${r.room}: the room didn't open at spawn ${r.spawn}`).projects.push(project);
      if (r.opened && r.onScreen === false) browserNotes.push(`${project}, ${r.room} at ${r.spawn}: the owl came in off the screen`);
      if (r.opened && r.onFloor === false) browserNotes.push(`${project}, ${r.room} at ${r.spawn}: the owl came in on no floor (${Math.round(r.pos.x)}, ${Math.round(r.pos.y)})`);
      for (const c of r.covered) browserNotes.push(`${project}, ${r.room}: doorway ${c.door} sits under ${c.by}`);
    } else if (r.to && !r.shut) {
      if (r.wentTo === null) {
        const at = r.stoppedAt ? `, the owl stopped at x ${r.stoppedAt.x}` : '';
        note(`walk:${r.room}:${r.door}`, `${r.room}: a walk to doorway ${r.door} from ${r.spawn} didn't go through${at}`).projects.push(project);
      } else if (r.wentTo !== r.to) browserNotes.push(`${project}, ${r.room}: doorway ${r.door} led to ${r.wentTo}, not ${r.to}`);
      if (r.offFloor.length > 0) browserNotes.push(`${project}, ${r.room}: on the walk to ${r.door} the owl stood on no floor at ${r.offFloor.map((p) => `(${p.x}, ${p.y})`).join(' ')}`);
    }
    for (const e of new Set(r.errors ?? [])) {
      const by = errorsBy.get(e) ?? new Set();
      errorsBy.set(e, by.add(`${project} ${r.room}`));
    }
  }
}
// Each error the page threw or logged, once, with how many rooms it came up in.
for (const [e, where] of errorsBy) {
  const [kind, ...rest] = e.split(': ');
  const at = [...where].slice(0, 3).join(', ');
  browserNotes.unshift(`the page ${kind === 'thrown' ? 'threw' : 'logged'} "${rest.join(': ').slice(0, 160)}" in ${where.size} room${where.size === 1 ? '' : 's'} (${at}${where.size > 3 ? ', …' : ''})`);
}
for (const [key, f] of failsBy) browserFindings.push({ key, what: `${f.what} (${f.projects.join(', ')})` });

const blockers = [...(sim?.blockers ?? []), ...browserFindings.filter((f) => !baseline.has(f.key))];
const known = [...(sim?.known ?? []), ...browserFindings.filter((f) => baseline.has(f.key))];
const found = new Set([...(sim ? [...sim.blockers, ...sim.known] : []), ...browserFindings].map((f) => f.key));
// A baseline line is fixed only when the part that finds it ran.
const ran = (k) => (k.startsWith('open:') || k.startsWith('walk:') ? browser.size > 0 : sim !== null);
const fixed = [...baseline].filter((k) => ran(k) && !found.has(k));

const lines = [];
lines.push(`## Playtest bots: ${blockers.length === 0 ? 'no blockers' : `${blockers.length} blocker${blockers.length === 1 ? '' : 's'}`}`);
lines.push('');
if (sim) {
  lines.push(`The kid bar: every hop a course needs lands at least ${pct(sim.kidBar)} of a kid's tries, so three tries clear it seven times in eight.`);
  lines.push('');
  lines.push('| Course | Hops | Weakest hop | Falls on a clear | Clean run | Under the bar |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const c of sim.courses) {
    const w = c.weakest ? `${pct(c.weakest.rate)} (${c.weakest.room}, ${c.weakest.from} to ${c.weakest.to})` : 'none';
    lines.push(`| ${c.course}${c.keeper ? ' (keepers)' : ''} | ${c.hops.length} | ${w} | ${c.falls.toFixed(1)} | ${pct(c.cleanRun)} | ${c.underBar.length + c.unreachable.length === 0 ? 'none' : `${c.underBar.length} hops, ${c.unreachable.length} unreachable`} |`);
  }
  lines.push('');
  lines.push('<details><summary>Every room the sim played</summary>');
  lines.push('');
  lines.push('| Room | Reached | Stuck spots | Hardest needed hop | Fewest tries to the way on |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const r of sim.rooms) {
    const reached = r.targets.filter((t) => t.reachable).length;
    const need = r.targets.filter((t) => t.required && t.weakest);
    const hard = need.length ? need.reduce((a, b) => (b.weakest.rate < a.weakest.rate ? b : a)) : null;
    const on = r.targets.filter((t) => t.required && t.kind === 'door' && t.tries !== null);
    const tries = on.length ? Math.min(...on.map((t) => t.tries)).toFixed(1) : '';
    lines.push(`| ${r.room} | ${reached} of ${r.targets.length} | ${r.stuck.length || ''} | ${hard ? `${pct(hard.weakest.rate)} (${hard.weakest.from} to ${hard.weakest.to})` : ''} | ${tries} |`);
  }
  lines.push('');
  lines.push('</details>');
  lines.push('');
} else lines.push('The sim did not run (no out/sim.json).', '');

if (browser.size > 0) {
  lines.push('| Browser | Rooms opened | Doorways walked through | Shut to visitors | Errors |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const [project, recs] of [...browser].sort()) {
    const entries = recs.filter((r) => r.kind === 'entry');
    const doors = recs.filter((r) => r.kind === 'door' && r.to && !r.shut);
    const shut = recs.filter((r) => r.kind === 'door' && r.shut).length;
    const rooms = new Set(entries.map((r) => r.room));
    const opened = new Set(entries.filter((r) => r.opened).map((r) => r.room));
    const errs = recs.reduce((n, r) => n + (r.errors?.length ?? 0), 0);
    lines.push(`| ${project} | ${opened.size} of ${rooms.size} | ${doors.filter((r) => r.wentTo).length} of ${doors.length} | ${shut} | ${errs} |`);
  }
  lines.push('');
} else lines.push('The browser walk did not run.', '');

const list = (title, items, cap = 40) => {
  if (items.length === 0) return;
  lines.push(`**${title}**`, '');
  for (const i of items.slice(0, cap)) lines.push(`- ${i}`);
  if (items.length > cap) lines.push(`- and ${items.length - cap} more (out/summary.json)`);
  lines.push('');
};
list('Blockers (these fail the check)', blockers.map((b) => b.what));
list('Known (in baseline.json, not failed on)', known.map((b) => b.what));
list('Fixed (take these out of baseline.json)', fixed);
list('Worth a look (fails nothing)', [...(sim?.notes ?? []), ...new Set(browserNotes)]);

const md = lines.join('\n');
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'summary.md'), md);
writeFileSync(join(OUT, 'summary.json'), JSON.stringify({ blockers, known, fixed, notes: [...(sim?.notes ?? []), ...new Set(browserNotes)] }, null, 1));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
console.log(md);
process.exit(blockers.length > 0 ? 1 : 0);
