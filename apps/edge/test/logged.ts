/**
 * The log in tests (OP-134): `logged(lines, event, fields)` finds the line a test expects, and fails it
 * when none was logged. logEvents.test.ts checks that every event in the list is looked for this way
 * somewhere in the tests, so each one is seen to fire.
 */
import { expect } from 'vitest';
import type { LogEvent, LogLine } from '@owl-park/shared';

/** The line of `event` with these fields among `lines`; the test fails when there is none. */
export function logged(lines: readonly LogLine[], event: LogEvent, fields: Record<string, unknown> = {}): LogLine {
  expect(lines).toContainEqual(expect.objectContaining({ event, ...fields }));
  return lines.find((l) => l.event === event && Object.entries(fields).every(([k, v]) => expect.objectContaining({ [k]: v }).asymmetricMatch(l)))!;
}

/** The events logged, in order (for a test that wants none of one kind). */
export const eventsOf = (lines: readonly LogLine[]) => lines.map((l) => l.event);
