/**
 * The park's scheduled jobs (wrangler.jsonc `triggers.crons`): the Worker's `scheduled` runs each
 * one only on its own cron, so a new cron never runs an old job (OP-181).
 */

/** Month close for the Realm Vote: 05:05 UTC on the 1st (just after midnight in the park's time zone). */
export const VOTE_CLOSE_CRON = '5 5 1 * *';
/** The nightly restart (OP-181): 09:00 UTC every day, 4:00 AM Eastern in winter and 5:00 AM in summer. */
export const RESTART_CRON = '0 9 * * *';

export type CronJob = 'vote-close' | 'restart';

/** The job a cron runs; null for a cron the park has no job for. */
export function jobOf(cron: string): CronJob | null {
  if (cron === VOTE_CLOSE_CRON) return 'vote-close';
  if (cron === RESTART_CRON) return 'restart';
  return null;
}
