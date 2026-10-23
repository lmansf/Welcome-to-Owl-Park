/**
 * The park's health (OP-068): whether each of its objects answers within a few seconds. Anyone may
 * ask (`/api/health`, from a phone or an uptime monitor): the answer names no setting and no secret,
 * only which part answered.
 */

/** How long a part may take to answer before it counts as down. */
export const HEALTH_WAIT_MS = 3_000;

export interface Health {
  ok: boolean;
  /** Each part by name: true when it answered in time. */
  parts: Record<string, boolean>;
  /** How long the slowest part took (ms), up to the wait. */
  ms: number;
}

/** Asks every part at once; a part that throws, or takes longer than `waitMs`, is down. */
export async function health(parts: Record<string, () => Promise<unknown>>, waitMs = HEALTH_WAIT_MS, clock: () => number = Date.now): Promise<Health> {
  const t0 = clock();
  const answers = await Promise.all(
    Object.entries(parts).map(async ([name, ask]) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<boolean>((r) => {
        timer = setTimeout(() => r(false), waitMs);
      });
      const answered = Promise.resolve()
        .then(ask)
        .then(
          () => true,
          () => false,
        );
      const up = await Promise.race([answered, late]);
      if (timer !== undefined) clearTimeout(timer);
      return [name, up] as const;
    }),
  );
  const out = Object.fromEntries(answers);
  return { ok: answers.every(([, up]) => up), parts: out, ms: clock() - t0 };
}
