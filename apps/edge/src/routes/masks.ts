/** The ledge painter's drafts (OP-156): a keeper saves one, anyone reads it back. */
import { MASK_ID, type SavedMasks, checkMasks } from '@owl-park/shared';
import { keepMasks, masksKept } from '../overflowState';
import { paintableRoom } from '../rooms';
import { CORS, MASKS_BODY_MAX, json, keeperOf, readJson } from './http';
import { overflow } from './park';
import type { RouteCtx } from './router';

// ---- The ledge painter (OP-156): a tree room's ledges, walls, hazards, fronts and placed spots as a keeper painted them ----
export async function adminMasks(c: RouteCtx): Promise<Response> {
  const { request, env, url, log } = c;
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const by = request.method === 'POST' ? await keeperOf(request, env, log) : null;
  if (!by) return json({ error: 'forbidden' }, 403);
  const roomId = url.pathname.slice('/api/admin/masks/'.length);
  const refused = (reason: string, status: number, where: { list?: string; index?: number } = {}) => {
    log.warn('worker.admin', 'masks_refused', 'A ledge draft was refused: nothing was kept.', { ...(MASK_ID.test(roomId) ? { room: roomId } : {}), reason, ...where, by });
    return json({ error: status === 413 ? 'too large' : 'bad request', reason, ...where }, status);
  };
  const room = paintableRoom(roomId);
  if (!room) return refused('room', 400);
  if (Number(request.headers.get('Content-Length') ?? 0) > MASKS_BODY_MAX) return refused('too-large', 413);
  const checked = checkMasks(await readJson(request), room.size);
  if (!checked.ok) return refused(checked.reason, 400, { ...(checked.list ? { list: checked.list } : {}), ...(checked.index !== undefined ? { index: checked.index } : {}) });
  const r = await overflow(env).fetch(`https://park/masks/${roomId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(checked.draft) });
  if (!r.ok) {
    log.error('overflow', 'write_failed', 'A tree room’s ledge draft was not kept: the overflow object refused it.', { room: roomId, status: r.status });
    return json({ error: 'the draft was not kept' }, 502);
  }
  const saved = (await r.json()) as SavedMasks;
  keepMasks(roomId, saved);
  const { savedAt } = saved;
  const { ledges, walls, hazards, fronts, spots } = checked.draft;
  log.info('worker.admin', 'masks_saved', 'A keeper saved a tree room’s ledge draft.', { room: roomId, by, ledges: ledges.length, walls: walls.length, hazards: hazards.length, fronts: fronts.length, spots: spots.length });
  return json({ ok: true, room: roomId, savedAt });
}

export async function masks(c: RouteCtx): Promise<Response> {
  const { request, env, url, log } = c;
  // Anyone may read a draft back (the painter on opening, `pnpm masks:pull`): level geometry, nothing personal.
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'GET') return json({ error: 'not found' }, 404);
  const roomId = url.pathname.slice('/api/masks/'.length);
  if (!paintableRoom(roomId)) return json({ error: 'not found' }, 404);
  // Kept a few seconds (overflowState.ts): the object that keeps the drafts also runs the line.
  let saved = masksKept(roomId);
  if (saved === undefined) {
    const r = await overflow(env).fetch(`https://park/masks/${roomId}`);
    if (r.status !== 404 && !r.ok) {
      log.error('overflow', 'read_failed', 'The overflow object did not give a tree room’s ledge draft: the page is asked to try later.', { room: roomId, status: r.status });
      return json({ error: 'try-later' }, 503);
    }
    saved = r.status === 404 ? null : ((await r.json()) as SavedMasks);
    keepMasks(roomId, saved);
  }
  return saved ? json(saved) : json({ error: 'not found' }, 404);
}
