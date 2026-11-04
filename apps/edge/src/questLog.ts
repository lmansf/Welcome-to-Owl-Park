/**
 * Quest progress for the collection log (OP-266): each step of each quest an owl takes, from when it
 * began until it ended and how, so the owner's `game.quest_progress` holds an open row for every
 * owl's current step (its room is a strong sign of where the owl goes next). The collections object's
 * quest store reports every change to a quest row (sqlStore.ts `OnQuest`), and `questProgressEvents`
 * turns the row before and after into step events for the outbox (collectLog.ts):
 *
 * - accepting a quest begins its first step (a first step that asks to visit the room the owl
 *   already stands in is done at once, so it begins and ends together);
 * - each step done ends it and begins the next; the step after the last is handing the quest in, at
 *   its giver, which ends when it is handed in;
 * - giving a quest up ends its step as `abandoned`; a daily, weekly or monthly quest whose period is
 *   over ends as `expired`, at the moment its period ended (the quest book forgets it only the next
 *   time the owl's quests are read); a quest no longer in the catalogue ends as `retired`.
 *
 * A run is one acceptance (its `accepted` time), so a quest given up and taken again is a new run.
 * Counts within a step (2 of 3 leaf piles) send nothing. Nothing of a puzzle's run is ever here:
 * its codes, keys and guesses stay in the park. Pure, so Node tests it.
 */
import { getQuest, nextParkDayAt, nextParkMonthAt, nextParkWeekAt, questPeriod, type QuestDef } from '@owl-park/shared';
import type { QuestOutcome, QuestProgressData } from './collectLog';

/** What of a quest row the log looks at. */
export interface QuestState {
  cid: string;
  quest: string;
  period: string;
  step: number;
  acceptedAt: number;
  doneAt: number | null;
}

/** Where the change happened: the visit and the room the owl was in, when known. */
export interface QuestPlace {
  pass: string | null;
  room: string | null;
}

/** When a quest's period ends, for a run accepted at `accepted`: null for a story quest, which never expires. */
export function questExpiry(q: Pick<QuestDef, 'cadence'>, accepted: number): number | null {
  switch (q.cadence) {
    case 'story':
      return null;
    case 'daily':
      return nextParkDayAt(accepted);
    case 'weekly':
      return nextParkWeekAt(accepted);
    case 'monthly':
      return nextParkMonthAt(accepted);
  }
}

/** The step a row is on, or null once it is handed in. Equal to the step count: ready to hand in. */
const openStep = (r: QuestState): number | null => (r.doneAt === null ? r.step : null);

/**
 * The step events between a quest row before a change and after it (null: no row). `now` is when it
 * changed; `place` the visit and room it happened in.
 */
export function questProgressEvents(before: QuestState | null, after: QuestState | null, now: number, place: QuestPlace): QuestProgressData[] {
  const out: QuestProgressData[] = [];
  const run = (r: QuestState) => ({ cid: r.cid, quest: r.quest, period: r.period, accepted: r.acceptedAt, pass: place.pass, room: place.room });
  const start = (r: QuestState, step: number) => {
    const q = getQuest(r.quest);
    out.push({ event: 'start', ...run(r), step, at: now, expires: q ? questExpiry(q, r.acceptedAt) : null });
  };
  const end = (r: QuestState, step: number, outcome: QuestOutcome, at = now) => out.push({ event: 'end', ...run(r), step, at, outcome });

  // A row gone, or a different run in its place: the run before it ends where it stood.
  if (before && (!after || after.acceptedAt !== before.acceptedAt)) {
    const step = openStep(before);
    if (step !== null) {
      const q = getQuest(before.quest);
      if (!q) end(before, step, 'retired');
      else if (before.period !== questPeriod(q, now)) {
        // Its day, week or month is over: it ended then, not when the book noticed.
        const ended = questExpiry(q, before.acceptedAt) ?? now;
        end(before, step, 'expired', Math.min(ended, now));
      } else end(before, step, 'abandoned');
    }
    before = null;
  }
  if (!after) return out;

  if (!before) {
    // A new run: its first step begins, and any it is already past (a visit to the room the owl stands in) end at once.
    for (let s = 0; s < after.step; s++) {
      start(after, s);
      end(after, s, 'done');
    }
    if (after.doneAt === null) start(after, after.step);
    else {
      start(after, after.step);
      end(after, after.step, 'done');
    }
    return out;
  }

  // The same run moved on: each step it passed ends done, and the one it is on now begins.
  const from = openStep(before);
  if (from === null) return out;
  for (let s = from; s < after.step; s++) {
    if (s > from) start(after, s);
    end(after, s, 'done');
  }
  if (after.doneAt !== null) {
    // Handed in: the hand-in step ends (begun just now if it was not begun before).
    if (after.step > from) start(after, after.step);
    end(after, after.step, 'done', after.doneAt);
  } else if (after.step > from) start(after, after.step);
  return out;
}
