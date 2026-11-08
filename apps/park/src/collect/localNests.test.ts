import { afterEach, describe, expect, it } from 'vitest';
import { FURNITURE, STARTER_FURNITURE, isNestId, type NestLook } from '@owl-park/shared';
import { LocalCollections, type KeyValueStorage } from './local';
import type { NestLink, NestSeen } from './service';

class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

/** 2026-10-19 12:00 Eastern, a Monday. */
const at = Date.UTC(2026, 9, 19, 16, 0);
const DAY = 24 * 60 * 60 * 1000;
const amber: NestLook = { body: '#8B5A2B', belly: '#F6F1E3', accent: '#C9A227' };
const slate: NestLook = { body: '#2F3E5C', belly: '#E0D4F0', accent: '#00E5FF' };

/** Pushes run after the answer, as the room server's frames do. */
const tick = () => new Promise((r) => setTimeout(r, 0));

const open: NestLink[] = [];
afterEach(() => {
  for (const l of open.splice(0)) l.close();
});

/** Collectors sharing one browser's storage (the local mode keeps every nest of the browser in it). */
function browser() {
  const storage = new MemoryStorage();
  const clock = { now: at };
  const page = (collector: string) => new LocalCollections(storage, { collector, tz: 'America/New_York', now: () => clock.now, random: () => 0.1 });
  return { storage, clock, page };
}

function link(page: LocalCollections, room: string, look: NestLook = amber) {
  const pushed: { seen: NestSeen[]; closed: string[] } = { seen: [], closed: [] };
  const l = page.nestLink(room, null, { onNest: (s) => pushed.seen.push(s), onNestClosed: (why) => pushed.closed.push(why) }, () => look);
  if (l) open.push(l);
  return { link: l, pushed };
}

describe('nests in the local mode', () => {
  it('has a nest link on the street and in a nest, and none anywhere else', () => {
    const { page } = browser();
    const me = page('c_one');
    expect(link(me, 'homes').link).not.toBeNull();
    expect(link(me, 'nest-abcd1234').link).not.toBeNull();
    for (const room of ['hub', 'lobby', 'grove', 'nest-', 'nest-ABCD1234']) expect(link(me, room).link, room).toBeNull();
  });

  it('makes the visitor’s nest on the street, the same one every time, with nobody else’s doors yet', async () => {
    const { page } = browser();
    const street = link(page('c_one'), 'homes').link!;
    const first = await street.street();
    expect(isNestId(first?.own?.nestId)).toBe(true);
    expect(first?.own?.open).toBe(true);
    expect(first?.doors).toEqual([null, null, null, null, null]);
    // Another page of the same collector in this browser finds the same nest.
    expect((await link(page('c_one'), 'homes').link!.street())?.own?.nestId).toBe(first?.own?.nestId);
  });

  it('shows other collectors’ open nests on the street, with their colours, and never a closed one', async () => {
    const { page } = browser();
    const a = page('c_a');
    const b = page('c_b');
    const aNest = (await link(a, 'homes', amber).link!.street())!.own!.nestId;
    const seen = await link(b, 'homes', slate).link!.street();
    expect(seen?.doors[0]).toEqual({ nestId: aNest, look: amber });
    expect(seen?.doors.slice(1)).toEqual([null, null, null, null]);
    // A closes its nest: it leaves B's street.
    const home = link(a, `nest-${aNest}`).link!;
    expect((await home.setOpen(false)).ok).toBe(true);
    expect((await link(b, 'homes').link!.street())?.doors).toEqual([null, null, null, null, null]);
  });

  it('greets the owner in its nest with what it owns and today’s gift, and lets it arrange the furniture', async () => {
    const { page } = browser();
    const me = page('c_one');
    const nestId = (await link(me, 'homes').link!.street())!.own!.nestId;
    const { link: home, pushed } = link(me, `nest-${nestId}`);
    await tick();
    expect(pushed.closed).toEqual([]);
    const hello = pushed.seen[0]!;
    expect(hello.mine).toBe(true);
    expect([...(hello.owned ?? [])].sort()).toEqual([...STARTER_FURNITURE].sort());
    expect(hello.gift?.taken).toBe(false);
    expect(Object.values(hello.nest.layout).sort()).toEqual([...STARTER_FURNITURE].sort());

    // Move the lamp to another floor spot, then take it away.
    const lampAt = Object.entries(hello.nest.layout).find(([, item]) => item === 'lamp')![0];
    const moved = await home!.place('f8', 'lamp');
    expect(moved.ok && moved.nest.layout.f8).toBe('lamp');
    expect(moved.ok && (moved.nest.layout as Record<string, string | undefined>)[lampAt]).toBeUndefined();
    const gone = await home!.place('f8', null);
    expect(gone.ok && gone.nest.layout.f8).toBeUndefined();
    // A floor piece on the wall, and a piece it does not own, are refused.
    expect(await home!.place('w1', 'lamp')).toEqual({ ok: false, reason: 'wrong-place' });
    expect(await home!.place('f8', 'armchair')).toEqual({ ok: false, reason: 'not-owned' });
    // What it arranged is kept in this browser.
    const again = link(me, `nest-${nestId}`);
    await tick();
    expect(again.pushed.seen[0]?.nest.layout.f8).toBeUndefined();
    expect(Object.values(again.pushed.seen[0]!.nest.layout)).not.toContain('lamp');
  });

  it('lets a visitor look round an open nest but change nothing, and turns it away from a closed or missing one', async () => {
    const { page } = browser();
    const a = page('c_a');
    const b = page('c_b');
    const nestId = (await link(a, 'homes').link!.street())!.own!.nestId;
    const visit = link(b, `nest-${nestId}`);
    await tick();
    expect(visit.pushed.seen[0]?.mine).toBe(false);
    expect(visit.pushed.seen[0]?.owned).toBeUndefined();
    expect(visit.pushed.seen[0]?.gift).toBeUndefined();
    expect(await visit.link!.place('f8', 'rug')).toEqual({ ok: false, reason: 'not-owner' });
    expect(await visit.link!.setOpen(false)).toEqual({ ok: false, reason: 'not-owner' });

    await link(a, `nest-${nestId}`).link!.setOpen(false);
    const turned = link(b, `nest-${nestId}`);
    await tick();
    expect(turned.pushed.closed).toEqual(['closed']);
    expect(turned.pushed.seen).toEqual([]);
    // Its owner still gets in.
    const owner = link(a, `nest-${nestId}`);
    await tick();
    expect(owner.pushed.seen[0]?.mine).toBe(true);

    const missing = link(b, 'nest-zzzz9999');
    await tick();
    expect(missing.pushed.closed).toEqual(['gone']);
  });

  it('gives a furniture gift once a park day: a piece the owl does not own yet', async () => {
    const { page, clock } = browser();
    const me = page('c_one');
    await link(me, 'homes').link!.street();
    const first = await me.claimFurnitureGift();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.item).not.toBeNull();
    expect(STARTER_FURNITURE).not.toContain(first.item);
    expect(first.owned).toContain(first.item);
    expect(first.owned).toHaveLength(STARTER_FURNITURE.length + 1);
    expect(await me.claimFurnitureGift()).toMatchObject({ ok: false, reason: 'taken' });
    clock.now += DAY;
    const next = await me.claimFurnitureGift();
    expect(next.ok && next.owned).toHaveLength(STARTER_FURNITURE.length + 2);
    expect(FURNITURE.length).toBe(16);
  });
});
