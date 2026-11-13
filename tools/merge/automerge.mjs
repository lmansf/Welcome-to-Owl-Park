// Auto-merge (.github/workflows/automerge.yml). The owner's rule, Nov 7 2026: "Auto-merge is approved
// for all things Owl Park related unless told otherwise." A pull request merges itself (squash) when:
//   - it is open, not a draft, into main, from this repository, and labelled `automerge` (the opener
//     ticked the merge gate, owl-park merge-gate.md) or `flag-hidden` (merge gate class 3);
//   - every workflow run and every check on its head commit finished green, the full browser suite
//     ("Browser suite report") and the build among them, and "Flag-hidden feature check" too for a
//     flag-hidden one; anything still running means "not yet", and a later run tries again;
//   - it touches nothing that needs the owner's separate yes (tools/merge/owner-yes.mjs): payments,
//     the store, accounts, data deletion, or these rules. Such a pull request gets one comment saying
//     why it waits, and is left for the owner.
// Changes to the workflows themselves (.github/) always wait for the owner too, since they decide what
// "every check" means. A merge made with the workflow's token starts no push workflows, so after merging this starts the
// live deploy and main's CI by hand (workflow_dispatch). The repository variable AUTOMERGE=off stops it.
import { appendFileSync } from 'node:fs';
import { ownerYesReasons } from './owner-yes.mjs';

export const LABELS = ['automerge', 'flag-hidden'];
export const REQUIRED_CHECKS = ['Build', 'Browser suite report'];
export const FLAG_CHECK = 'Flag-hidden feature check';
export const WAIT_MARK = '<!-- owl-park-automerge-waits -->';
const GREEN = new Set(['success', 'skipped', 'neutral']);

/** The latest check run of each name (a rerun replaces the run before it). */
export function latestByName(runs) {
  const by = new Map();
  for (const r of runs) {
    const had = by.get(r.name);
    if (!had || r.id > had.id) by.set(r.name, r);
  }
  return by;
}

/**
 * Whether a pull request's head is green: { state: 'green' | 'pending' | 'red', why }.
 * `runs`: workflow runs on the head commit; `checks`: check runs on it; `statuses`: the combined status.
 */
export function headState({ runs, checks, statuses, flagHidden }) {
  // A rerun of a workflow replaces the run before it, so take each workflow's latest run.
  const latestRuns = new Map();
  for (const r of runs) {
    const had = latestRuns.get(r.workflow_id);
    if (!had || r.id > had.id) latestRuns.set(r.workflow_id, r);
  }
  for (const r of latestRuns.values()) {
    if (r.status !== 'completed') return { state: 'pending', why: `${r.name} is still running` };
    if (!GREEN.has(r.conclusion)) return { state: 'red', why: `${r.name} ended ${r.conclusion}` };
  }
  const latest = latestByName(checks);
  for (const c of latest.values()) {
    if (c.status !== 'completed') return { state: 'pending', why: `${c.name} is still running` };
    if (!GREEN.has(c.conclusion)) return { state: 'red', why: `${c.name} ended ${c.conclusion}` };
  }
  for (const name of [...REQUIRED_CHECKS, ...(flagHidden ? [FLAG_CHECK] : [])]) {
    const c = latest.get(name);
    if (!c) return { state: 'pending', why: `${name} has not run yet` };
    if (c.conclusion !== 'success') return { state: 'red', why: `${name} did not pass (${c.conclusion})` };
  }
  if (statuses && statuses.total_count > 0 && statuses.state !== 'success') {
    return { state: statuses.state === 'pending' ? 'pending' : 'red', why: `commit status is ${statuses.state}` };
  }
  return { state: 'green', why: 'every check passed' };
}

/** What to do with one pull request: { action: 'merge' | 'wait' | 'hold' | 'skip', why, reasons? }. */
export function decide({ pr, repo, head, files }) {
  const labels = (pr.labels ?? []).map((l) => l.name);
  if (pr.state !== 'open') return { action: 'skip', why: 'not open' };
  if (pr.draft) return { action: 'skip', why: 'a draft' };
  if (pr.base.ref !== 'main') return { action: 'skip', why: `into ${pr.base.ref}, not main` };
  if (pr.head.repo?.full_name !== repo) return { action: 'skip', why: 'from another repository' };
  if (!labels.some((l) => LABELS.includes(l))) return { action: 'skip', why: `no ${LABELS.join(' or ')} label` };
  const reasons = ownerYesReasons(files);
  if (reasons.length) return { action: 'hold', why: 'needs the owner’s yes', reasons };
  if (head.state === 'pending') return { action: 'wait', why: head.why };
  if (head.state === 'red') return { action: 'skip', why: head.why };
  if (pr.mergeable === false) return { action: 'skip', why: 'has conflicts with main' };
  return { action: 'merge', why: head.why };
}

async function main() {
  const { GITHUB_TOKEN, GITHUB_REPOSITORY: repo, GITHUB_API_URL = 'https://api.github.com', PRS = '', HEAD_SHA = '' } = process.env;
  const api = async (path, init = {}) => {
    const res = await fetch(`${GITHUB_API_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };
  const all = async (path, key) => {
    const out = [];
    for (let page = 1; page < 20; page++) {
      const body = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      const items = key ? body[key] : body;
      out.push(...items);
      if (items.length < 100) break;
    }
    return out;
  };
  const summary = (line) => {
    console.log(line);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
  };

  let numbers = PRS.split(/[\s,]+/).filter(Boolean).map(Number);
  if (!numbers.length && HEAD_SHA) numbers = (await api(`/repos/${repo}/commits/${HEAD_SHA}/pulls`)).map((p) => p.number);
  // The hourly sweep: every open pull request that carries one of the labels.
  if (!numbers.length && !HEAD_SHA) {
    const open = await all(`/repos/${repo}/pulls?state=open&base=main`);
    numbers = open.filter((p) => p.labels.some((l) => LABELS.includes(l.name))).map((p) => p.number);
    if (!numbers.length) summary('No open pull request carries an auto-merge label.');
  }
  for (const n of numbers) {
    const pr = await api(`/repos/${repo}/pulls/${n}`);
    if (HEAD_SHA && pr.head.sha !== HEAD_SHA) {
      summary(`#${n}: a newer commit is on it; its own run decides.`);
      continue;
    }
    const sha = pr.head.sha;
    const [runs, checks, statuses, files] = await Promise.all([
      all(`/repos/${repo}/actions/runs?head_sha=${sha}&event=pull_request`, 'workflow_runs'),
      all(`/repos/${repo}/commits/${sha}/check-runs`, 'check_runs'),
      api(`/repos/${repo}/commits/${sha}/status`),
      all(`/repos/${repo}/pulls/${n}/files`),
    ]);
    const flagHidden = pr.labels.some((l) => l.name === 'flag-hidden');
    const head = headState({ runs, checks, statuses, flagHidden });
    const d = decide({ pr, repo, head, files });
    summary(`#${n} (${sha.slice(0, 7)}): ${d.action}, ${d.why}.`);
    if (d.action === 'hold') {
      const comments = await all(`/repos/${repo}/issues/${n}/comments`);
      if (!comments.some((c) => c.body?.startsWith(WAIT_MARK))) {
        const body = `${WAIT_MARK}\nAuto-merge is holding this one for the owner's yes, because it touches:\n${d.reasons.map((r) => `- ${r}`).join('\n')}\n\nEverything else about the merge gate still applies.`;
        await api(`/repos/${repo}/issues/${n}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
      }
      for (const r of d.reasons) summary(`  - ${r}`);
    }
    if (d.action !== 'merge') continue;
    await api(`/repos/${repo}/pulls/${n}/merge`, { method: 'PUT', body: JSON.stringify({ merge_method: 'squash', sha, commit_title: `${pr.title} (#${n})` }) });
    summary(`#${n} merged.`);
    for (const wf of ['deploy-worker.yml', 'ci.yml']) {
      await api(`/repos/${repo}/actions/workflows/${wf}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }) });
      summary(`Started ${wf} on main.`);
    }
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
