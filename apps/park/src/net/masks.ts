/**
 * The ledge painter's drafts on the park's server (OP-156): read back with GET /api/masks/<room>,
 * which anyone may, and saved with POST /api/admin/masks/<room> and this tab's keeper's token
 * (`?keeper=1`, net/keeper.ts) in X-Keeper-Token. What comes back is checked as the server checks
 * what it keeps (checkMasks), so the painter never starts from something it cannot edit.
 */
import { checkMasks, type MaskDraft, type SavedMasks } from '@owl-park/shared';

/** The room a draft is for: its id and its size. */
export interface MaskRoom {
  id: string;
  size: { w: number; h: number };
}

/** A draft read back: the one saved, none yet, or no answer the painter can use (and why, in words). */
export type MasksRead = { kind: 'saved'; masks: SavedMasks } | { kind: 'none' } | { kind: 'failed'; why: string };

/** A save: when the park kept it, or why it did not, in words for the painter's panel. */
export type MasksSave = { ok: true; savedAt: number } | { ok: false; why: string };

const api = (base: string, path: string) => `${base.replace(/\/$/, '')}${path}`;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The draft saved for `room`, if there is one. */
export async function loadMasks(base: string, room: MaskRoom, fetchImpl: typeof fetch = fetch): Promise<MasksRead> {
  let res: Response;
  try {
    res = await fetchImpl(api(base, `/api/masks/${encodeURIComponent(room.id)}`), { cache: 'no-store' });
  } catch {
    return { kind: 'failed', why: 'no answer from the park' };
  }
  if (res.status === 404) return { kind: 'none' };
  if (!res.ok) return { kind: 'failed', why: `the park answered ${res.status}` };
  const body: unknown = await res.json().catch(() => null);
  const savedAt = isRecord(body) ? body['savedAt'] : undefined;
  if (!isRecord(body) || body['room'] !== room.id || typeof savedAt !== 'number') return { kind: 'failed', why: 'the saved draft does not read' };
  const checked = checkMasks({ ledges: body['ledges'], walls: body['walls'], hazards: body['hazards'], fronts: body['fronts'] }, room.size);
  if (!checked.ok) return { kind: 'failed', why: 'the saved draft does not read' };
  return { kind: 'saved', masks: { room: room.id, ...checked.draft, savedAt } };
}

/** The words for a refusal the park gave (its reason, the list and the item), each checked to be what it should be. */
function refusalWords(body: unknown): string {
  if (!isRecord(body) || typeof body['reason'] !== 'string' || !/^[a-z-]{1,20}$/.test(body['reason'])) return 'the park refused it';
  const list = typeof body['list'] === 'string' && /^[a-z]{1,10}$/.test(body['list']) ? ` in ${body['list']}` : '';
  const index = typeof body['index'] === 'number' && Number.isInteger(body['index']) ? ` (item ${body['index'] + 1})` : '';
  return `the park refused it: ${body['reason']}${list}${index}`;
}

/** Save `draft` (sent as `json`, its JSON) as `room`'s, with this tab's keeper's token. */
export async function saveMasks(base: string, room: string, token: string, json: string, fetchImpl: typeof fetch = fetch): Promise<MasksSave> {
  let res: Response;
  try {
    res = await fetchImpl(api(base, `/api/admin/masks/${encodeURIComponent(room)}`), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Keeper-Token': token }, body: json, cache: 'no-store' });
  } catch {
    return { ok: false, why: 'no answer from the park' };
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok && isRecord(body) && typeof body['savedAt'] === 'number') return { ok: true, savedAt: body['savedAt'] };
  if (res.status === 403) return { ok: false, why: 'the park did not take this tab’s keeper’s token: open the park with ?keeper=1 again' };
  if (res.status === 429) return { ok: false, why: 'too many calls just now: try again in a minute' };
  if (res.status === 400 || res.status === 413) return { ok: false, why: refusalWords(body) };
  return { ok: false, why: `the park answered ${res.status}` };
}

/** A draft as the painter sends it. */
export const draftJson = (draft: MaskDraft): string => JSON.stringify({ ledges: draft.ledges, walls: draft.walls, hazards: draft.hazards, fronts: draft.fronts });
