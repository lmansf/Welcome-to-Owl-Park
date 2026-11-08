import { ToolError } from './errors';

/** Instagram's caption limits: 2,200 characters and 30 hashtags. */
export const CAPTION_MAX = 2200;
export const HASHTAG_MAX = 30;
export const URL_MAX = 2048;
/** Metric, period and breakdown names: lower-case letters and underscores, nothing else. */
export const NAME_RE = /^[a-z_]+$/;
export const METRICS_MAX = 20;

export type Args = Record<string, unknown>;

/** The tool's arguments as an object, refusing any it does not take. */
export function argsOf(value: unknown, allowed: readonly string[]): Args {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new ToolError('Arguments must be an object.');
  const extra = Object.keys(value).filter((k) => !allowed.includes(k));
  if (extra.length) throw new ToolError(`Unknown argument(s): ${extra.join(', ')}. This tool takes: ${allowed.join(', ') || 'none'}.`);
  return value as Args;
}

/** A public https URL Instagram can fetch: no other scheme, no user name or password in it. */
export function httpsUrl(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new ToolError(`${field} is required and must be an https URL.`);
  const text = value.trim();
  if (text.length > URL_MAX) throw new ToolError(`${field} is longer than ${URL_MAX} characters.`);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new ToolError(`${field} is not a valid URL.`);
  }
  if (url.protocol !== 'https:') throw new ToolError(`${field} must start with https:// (Instagram fetches it from the public internet).`);
  if (url.username || url.password) throw new ToolError(`${field} must not carry a user name or password.`);
  if (!url.hostname.includes('.')) throw new ToolError(`${field} must name a public host.`);
  return text;
}

/** Hashtags as Instagram counts them: # followed by letters, digits or underscores. */
export function hashtagCount(caption: string): number {
  return [...caption.matchAll(/#[\p{L}\p{N}_]+/gu)].length;
}

/** Characters as people count them (an emoji is one), not UTF-16 units. */
export function charCount(text: string): number {
  return [...text].length;
}

export function caption(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new ToolError('caption is required and must be non-empty text.');
  const n = charCount(value);
  if (n > CAPTION_MAX) throw new ToolError(`caption is ${n} characters; Instagram allows ${CAPTION_MAX}.`);
  const tags = hashtagCount(value);
  if (tags > HASHTAG_MAX) throw new ToolError(`caption has ${tags} hashtags; Instagram allows ${HASHTAG_MAX}.`);
  return value;
}

/** An Instagram media or container id: digits only. */
export function digitsId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{1,30}$/.test(value)) throw new ToolError(`${field} must be a string of digits (an Instagram id).`);
  return value;
}

/** A list of metric names (array or comma-separated text), each matching NAME_RE; defaults when absent. */
export function metrics(value: unknown, defaults: readonly string[]): string[] {
  if (value === undefined || value === null) return [...defaults];
  const list = typeof value === 'string' ? value.split(',').map((s) => s.trim()).filter(Boolean) : value;
  if (!Array.isArray(list) || list.length === 0) throw new ToolError('metrics must be a non-empty list of metric names.');
  if (list.length > METRICS_MAX) throw new ToolError(`At most ${METRICS_MAX} metrics at a time.`);
  for (const m of list) if (typeof m !== 'string' || !NAME_RE.test(m)) throw new ToolError(`Metric names are lower-case letters and underscores only; refused: ${JSON.stringify(m)}.`);
  return [...new Set(list as string[])];
}

export function intIn(value: unknown, field: string, min: number, max: number, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new ToolError(`${field} must be a whole number from ${min} to ${max}.`);
  return value;
}

export function oneOf<T extends string>(value: unknown, field: string, options: readonly T[], fallback: T): T {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || !(options as readonly string[]).includes(value)) throw new ToolError(`${field} must be one of: ${options.join(', ')}.`);
  return value as T;
}

/** Unix seconds (from 2010 to 2100), or undefined. */
export function unixSeconds(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1_262_304_000 || value > 4_102_444_800) {
    throw new ToolError(`${field} must be a time in unix seconds (a whole number, e.g. 1767225600).`);
  }
  return value;
}

export function optionalName(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !NAME_RE.test(value)) throw new ToolError(`${field} must be lower-case letters and underscores only.`);
  return value;
}
