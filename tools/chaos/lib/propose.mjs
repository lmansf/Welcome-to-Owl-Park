/**
 * The harness proposes tickets; the QA agent reviews and files them (QA never codes, the harness
 * never files: Logan, 2026-10-27). After each run, proposed-tickets.json holds one entry per gap:
 *
 *   PATCH        the hypothesis failed or the park degraded: the experiment, the exact observation
 *                (what, value, when), the component, and the smallest fix the evidence supports.
 *                Type Bug, for Claude Code.
 *   LOGGING GAP  the harness could not tell what happened because the park did not say: the
 *                component, the question it could not answer, and the exact line or metric to add.
 *                Type Finding, flagged Informational, for Claude Code. Never dropped.
 *
 * Each entry starts unfiled; the QA agent de-duplicates against open tickets (the same experiment
 * and component is one ticket, the recurrence noted), files the rest and lists them in run.json's
 * `filed`.
 */

/** The run's proposed tickets, from its observations and the lines the experiment expected the park to log. */
export function propose(log, experiment, park, startedAt) {
  const { run } = log;
  const out = [];
  for (const o of run.observations.filter((o) => !o.ok)) {
    out.push({
      kind: 'PATCH',
      experiment: `${experiment.n}. ${experiment.name}`,
      run: run.run_id,
      component: o.component,
      observation: { what: o.what, value: o.value, ...(o.unit ? { unit: o.unit } : {}), at: o.at ?? null },
      fix: o.fix ?? null,
      type: 'Bug',
      assignee: 'Claude Code',
      filed: false,
    });
  }
  const lines = park ? park.logs.filter((l) => l.at >= startedAt) : [];
  for (const want of experiment.expectLogs ?? []) {
    const seen = lines.filter((l) => l.event === want.event && (!want.withRun || l.run_id === run.run_id));
    if (seen.length >= (want.atLeast ?? 1)) continue;
    out.push({
      kind: 'LOGGING GAP',
      experiment: `${experiment.n}. ${experiment.name}`,
      run: run.run_id,
      component: want.component,
      question: want.question,
      add: want.add,
      seen: seen.length,
      type: 'Finding',
      flags: 'Informational',
      assignee: 'Claude Code',
      filed: false,
    });
  }
  return out;
}
