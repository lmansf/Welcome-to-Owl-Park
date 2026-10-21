/**
 * Feedback from visitors: the HUD's Feedback button sends a few words and what kind they are; the
 * room server keeps them for the park's keepers (apps/edge feedbackBox.ts), who read them on the
 * admin page. Shared so the page and the server agree on the limits.
 */

export const FEEDBACK_KINDS = ['bug', 'idea', 'praise', 'other'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** The words: at least a few characters, at most this many. */
export const FEEDBACK_MIN_CHARS = 3;
export const FEEDBACK_MAX_CHARS = 1000;
/** One message per visitor this often, and this many a day; and this many a day for the whole park. */
export const FEEDBACK_EVERY_MS = 30_000;
export const FEEDBACK_PER_DAY = 10;
export const FEEDBACK_PARK_PER_DAY = 1000;

/** What a visitor sends. */
export interface FeedbackDraft {
  kind: FeedbackKind;
  text: string;
  /** The room the owl was in, and the screen's size ("390x844"), when the page knows them. */
  room: string | null;
  screen: string | null;
}

const ROOM_RE = /^[a-z][a-z0-9-]{0,31}$/;
const SCREEN_RE = /^\d{2,5}x\d{2,5}$/;

/** Visitors' words, tidied: control characters out (newlines kept), runs of blank lines shortened, ends trimmed. */
export function cleanFeedbackText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A feedback request body, checked; null for anything that does not fit. */
export function parseFeedback(v: unknown): FeedbackDraft | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const kind = o['kind'];
  if (typeof kind !== 'string' || !(FEEDBACK_KINDS as readonly string[]).includes(kind)) return null;
  if (typeof o['text'] !== 'string') return null;
  const text = cleanFeedbackText(o['text']);
  if (text.length < FEEDBACK_MIN_CHARS || text.length > FEEDBACK_MAX_CHARS) return null;
  const room = typeof o['room'] === 'string' && ROOM_RE.test(o['room']) ? o['room'] : null;
  const screen = typeof o['screen'] === 'string' && SCREEN_RE.test(o['screen']) ? o['screen'] : null;
  return { kind: kind as FeedbackKind, text, room, screen };
}
