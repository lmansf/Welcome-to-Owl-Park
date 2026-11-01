import { describe, expect, it, vi } from 'vitest';
import { emptyMasks, type MaskDraft } from '@owl-park/shared';
import { draftJson, loadMasks, saveMasks } from './masks';

// The ledge painter's drafts on the park's server (OP-156): read back by anyone, saved with a keeper's token.

const ROOM = { id: 'l1', size: { w: 6400, h: 900 } };
const DRAFT: MaskDraft = { ...emptyMasks(), ledges: [{ id: 'ledge-1', x0: 2370, x1: 2480, top: 100 }] };
const answer = (status: number, body: unknown) => vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('reading a draft back (OP-156)', () => {
  it('gives the saved draft, none before one is saved, and says why when the answer will not do', async () => {
    const f = answer(200, { room: 'l1', ...DRAFT, savedAt: 1_700_000_000_000 });
    expect(await loadMasks('https://park.example/', ROOM, f)).toEqual({ kind: 'saved', masks: { room: 'l1', ...DRAFT, savedAt: 1_700_000_000_000 } });
    expect(f).toHaveBeenCalledWith('https://park.example/api/masks/l1', { cache: 'no-store' });
    expect(await loadMasks('', ROOM, answer(404, { error: 'not found' }))).toEqual({ kind: 'none' });
    expect(await loadMasks('', ROOM, answer(503, { error: 'try-later' }))).toEqual({ kind: 'failed', why: 'the park answered 503' });
    // A page in the server's place (the dev server's own), another room's draft, a draft that breaks the rules.
    for (const body of ['<!doctype html>', { room: 'hub', ...DRAFT, savedAt: 1 }, { room: 'l1', ...DRAFT, ledges: [{ id: 'x', x0: 5, x1: 1, top: 2 }], savedAt: 1 }, { room: 'l1', ...DRAFT }]) {
      expect(await loadMasks('', ROOM, answer(200, body))).toEqual({ kind: 'failed', why: 'the saved draft does not read' });
    }
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await loadMasks('', ROOM, down)).toEqual({ kind: 'failed', why: 'no answer from the park' });
  });
});

describe('saving a draft (OP-156)', () => {
  it('sends the draft with the keeper’s token, and gives when it was kept', async () => {
    const f = answer(200, { ok: true, room: 'l1', savedAt: 1_700_000_000_000 });
    expect(await saveMasks('https://park.example', 'l1', 'tok.en', draftJson(DRAFT), f)).toEqual({ ok: true, savedAt: 1_700_000_000_000 });
    expect(f).toHaveBeenCalledWith('https://park.example/api/admin/masks/l1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Keeper-Token': 'tok.en' },
      body: JSON.stringify({ ledges: DRAFT.ledges, walls: [], hazards: [], fronts: [] }),
      cache: 'no-store',
    });
  });

  it('says in words why the park did not keep it', async () => {
    const save = (f: typeof fetch) => saveMasks('', 'l1', 'tok.en', draftJson(DRAFT), f);
    expect(await save(answer(400, { error: 'bad request', reason: 'top', list: 'ledges', index: 2 }))).toEqual({ ok: false, why: 'the park refused it: top in ledges (item 3)' });
    expect(await save(answer(400, { error: 'bad request', reason: 'room' }))).toEqual({ ok: false, why: 'the park refused it: room' });
    // Words the park would never send are not shown.
    expect(await save(answer(400, { reason: '<img src=x onerror=alert(1)>' }))).toEqual({ ok: false, why: 'the park refused it' });
    expect(await save(answer(403, { error: 'forbidden' }))).toEqual({ ok: false, why: 'the park did not take this tab’s keeper’s token: open the park with ?keeper=1 again' });
    expect(await save(answer(429, { error: 'too-many' }))).toEqual({ ok: false, why: 'too many calls just now: try again in a minute' });
    expect(await save(answer(502, { error: 'the draft was not kept' }))).toEqual({ ok: false, why: 'the park answered 502' });
    expect(await save(answer(200, '<!doctype html>'))).toEqual({ ok: false, why: 'the park answered 200' });
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await save(down)).toEqual({ ok: false, why: 'no answer from the park' });
  });
});
