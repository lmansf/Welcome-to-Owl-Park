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

/**
 * The stand-ins for the personal details a note may carry (the safety review, OP-236). Children type
 * their own contact details into a box like this even when asked not to, so the Worker takes them out
 * before a note is kept or copied anywhere: the keepers read what went wrong, never how to reach who
 * wrote it. Names cannot be told from other words reliably, so they stay the form's own warning's to
 * prevent. Scores, levels and times stay: a number is only taken out when it is shaped like a phone
 * number (ten or more digits, or seven written 555-1234) or is longer still.
 */
export const FEEDBACK_REDACTIONS = {
  email: '[email]',
  link: '[link]',
  phone: '[phone]',
  handle: '[handle]',
  address: '[address]',
  /** Sixteen digits or more: a card or account number, never a score. */
  number: '[number]',
} as const;

/** Endings common enough to take a bare name on them for a web address; short ones that end words (co, me, us) are left out. */
const TLDS = 'com|net|org|edu|gov|io|gg|tv|app|dev|xyz|info|biz|online|site|club';
/** Endings a spelt-out email is taken on. */
const SPELT_TLDS = 'com|net|org|edu';
/** An email, written plainly or spelt out ("sam at gmail dot com"). */
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}\b/gi;
const SPELT_EMAIL_RE = new RegExp(`\\b[a-z0-9._%+-]+\\s*(?:\\(at\\)|\\[at\\]|\\sat\\s)\\s*[a-z0-9-]+\\s*(?:\\(dot\\)|\\[dot\\]|\\sdot\\s|\\.)\\s*(?:${SPELT_TLDS})\\b`, 'gi');
/** A web address: with its scheme or www, or a bare name on a common ending (example.com/page). */
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const DOMAIN_RE = new RegExp(`\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${TLDS})\\b(?:\\/\\S*)?`, 'gi');
/** A phone number (or a longer number): ten or more digits with spaces, dots, dashes and brackets between them, or seven written 555-1234. */
const LONG_PHONE_RE = /(?:\+\s?)?(?:\(?\d[\d\s().-]{8,}\d)/g;
const SHORT_PHONE_RE = /\b\d{3}[-.]\d{4}\b/g;
/** A handle on a social app: @ and a name (an email is gone by now). */
const HANDLE_RE = /(^|[^\w@])@[a-z0-9_.]{2,30}/gi;
/** An email written with spaces round its @ or dots ("sam @ gmail.com", OP-247): a plain one is gone by now. */
const SPACED_EMAIL_RE = /[a-z0-9._%+-]+\s*@\s*[a-z0-9-]+(?:\s*\.\s*[a-z0-9-]+)*\s*\.\s*[a-z]{2,24}\b/gi;
/** A gamer tag with its number, as Discord and others write it (owl_kid#1234, OP-247). */
const TAG_RE = /\b[a-z0-9_.]{2,32}#\d{4}\b/gi;
/**
 * Handles named with no @ (OP-247): next to the app they are on. Only the name goes; the app stays,
 * so the keepers still read where a child is being asked to meet. Names are taken where the words
 * around them say they are one ("roblox username is", "roblox:", "my roblox is", "add sam on roblox")
 * or where they look like one (a letter and a digit or underscore: "sam_99 on roblox"). An ordinary
 * word in those spots ("my roblox is laggy") goes too: a note loses a word rather than keep a name.
 */
const APPS = 'roblox|discord|instagram|insta|tiktok|snapchat|snap|twitter|youtube|twitch|minecraft|fortnite|xbox|psn|playstation|steam|telegram|whatsapp|kik|reddit|facebook|threads|bluesky|github';
const NAME = '(?=[a-z0-9_.]*[a-z])[a-z0-9_.]{3,30}';
/** A name that looks like a handle on its own: a letter, and a digit or underscore. */
const ODD_NAME = '(?=[a-z0-9_.]*[0-9_])' + NAME;
/** Words that sit where a name would and are never one. */
const NOT_NAME = '(?!(?:me|us|them|him|her|it|you|there|here|now|this|that|online|always)\\b)';
const APP_HANDLE_RES: readonly RegExp[] = [
  new RegExp(`\\b((?:${APPS})\\s+(?:username|user name|user|name|handle|id|tag|account|acc|gamertag)\\s*(?:is\\s+|[:=-]\\s*|\\s))${NAME}\\b`, 'gi'),
  new RegExp(`\\b((?:${APPS})\\s*[:=]\\s*)${NAME}\\b`, 'gi'),
  new RegExp(`\\b((?:my|his|her|their|our)\\s+(?:${APPS})\\s+(?:is|=)\\s+)${NOT_NAME}${NAME}\\b`, 'gi'),
  new RegExp(`\\b((?:i'?m|i am|add|friend|follow|find|message|dm)\\s+)${NOT_NAME}${NAME}(?=\\s+on\\s+(?:${APPS})\\b)`, 'gi'),
  // Not part of an @handle or an email: those have their own stand-ins.
  new RegExp(`(?<![\\w@.#])()${ODD_NAME}(?=\\s+on\\s+(?:${APPS})\\b)`, 'gi'),
];

/** A street address: a house number of two digits or more, one to three words, and a street word. */
const ADDRESS_RE =
  /\b\d{2,6}\s+(?:[a-z0-9.'-]+\s+){1,3}(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|place|pl|terrace|ter|parkway|pkwy|highway|hwy)\b\.?/gi;

/** What a run the phone pattern found stands for: a phone number (ten to fifteen digits), a longer number, or a few numbers as they were. */
const longNumber = (run: string): string => {
  const digits = run.replace(/\D/g, '').length;
  if (digits < 10) return run;
  return digits <= 15 ? FEEDBACK_REDACTIONS.phone : FEEDBACK_REDACTIONS.number;
};

/** A handle next to its app: the words before it kept, the name replaced. */
const appHandle = (_: string, before: string): string => `${before}${FEEDBACK_REDACTIONS.handle}`;

/** A note with its personal details replaced by their stand-ins, cut back to the most a note may be. */
export function redactFeedbackText(text: string): string {
  return text
    .replace(EMAIL_RE, FEEDBACK_REDACTIONS.email)
    .replace(SPELT_EMAIL_RE, FEEDBACK_REDACTIONS.email)
    .replace(SPACED_EMAIL_RE, FEEDBACK_REDACTIONS.email)
    .replace(URL_RE, FEEDBACK_REDACTIONS.link)
    .replace(DOMAIN_RE, FEEDBACK_REDACTIONS.link)
    .replace(TAG_RE, FEEDBACK_REDACTIONS.handle)
    .replace(APP_HANDLE_RES[0]!, appHandle)
    .replace(APP_HANDLE_RES[1]!, appHandle)
    .replace(APP_HANDLE_RES[2]!, appHandle)
    .replace(APP_HANDLE_RES[3]!, appHandle)
    .replace(APP_HANDLE_RES[4]!, appHandle)
    .replace(LONG_PHONE_RE, longNumber)
    .replace(SHORT_PHONE_RE, FEEDBACK_REDACTIONS.phone)
    .replace(HANDLE_RE, (_, before: string) => `${before}${FEEDBACK_REDACTIONS.handle}`)
    .replace(ADDRESS_RE, FEEDBACK_REDACTIONS.address)
    .slice(0, FEEDBACK_MAX_CHARS);
}

/** A feedback request body, checked; null for anything that does not fit. The words come back with personal details taken out. */
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
  return { kind: kind as FeedbackKind, text: redactFeedbackText(text), room, screen };
}
