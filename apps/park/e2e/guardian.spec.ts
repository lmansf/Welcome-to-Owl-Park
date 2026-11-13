import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { HELD_FRAME_MS, heldPass as pass, heldUntil as until, holdTheClock, openHeld, openPark, state, stateNow as now } from './helpers';

/**
 * The guardian alive at the heart of the Great Hollow (OP-359), which is behind `?guardian=1`
 * (src/flags.ts): a plain address has none of it, and with the flag the great horned owl sits at the
 * heart of the hall, asleep until an owl comes in, then awake to it. It opens its eyes, hoots once to
 * an owl that came in by the knothole, answers a hoot with its own, goes see-through while the
 * visitor's own owl is behind it, and beats while that owl rides the rising air at the heart. Its
 * rules, to the millisecond, are in src/game/guardian.test.ts; here it is in the room, on a held
 * clock (helpers.ts), so a slow machine sees what a quick one sees.
 */

/** The Great Hollow opened on the held clock with the guardian's flag, the owl in by the knothole: back as soon as the room is built. */
const openHallWithGuardian = (page: Page) => openHeld(page, { room: 'm3-hall', newmap: '1', spawn: 'from-lobby', guardian: '1' });

const inside = (p: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

test.describe('the guardian at the heart of the Great Hollow (OP-359, behind ?guardian=1)', () => {
  test('a plain address has no guardian: the hall is as it was', async ({ page }) => {
    await openPark(page, { room: 'm3-hall', newmap: '1' });
    expect((await state(page)).guardian).toBeNull();
    // Nor does any value but 1.
    await openPark(page, { room: 'm3-hall', newmap: '1', guardian: 'yes' });
    expect((await state(page)).guardian).toBeNull();
  });

  test('it sleeps until an owl comes in by the knothole, opens its eyes, hoots once, and answers a hoot with its own; the trail goes round it', async ({ page }) => {
    // About 170 frames, each drawn when the test moves the clock: 23 s on a quick machine, and past the
    // usual 45 s on a slow runner, where it timed out twice running. The slow allowance, as the next test has.
    test.slow();
    await holdTheClock(page);
    await openHallWithGuardian(page);
    let s = await now(page);
    expect(s.room).toBe('m3-hall');
    const g = s.guardian!;
    expect(g).not.toBeNull();
    // It is drawn in parts (a head that turns), on the hall's middle line, about nine owls tall.
    expect(g.parts).toBe(true);
    const up = s.doors.find((d) => d.id === 'up')!;
    expect(g.at.x).toBe(up.x);
    const top = Math.min(...g.boxes.map((b) => b.y));
    expect((g.at.y - top) / 88).toBeGreaterThanOrEqual(8);
    // Asleep as the owl comes in, and solid: the owl stands clear over its head.
    expect(g).toMatchObject({ lids: 'closed', dozing: true, hoots: 0, alpha: 1 });
    expect(s.pos.y).toBeLessThan(top - 100);

    // Its eyes open, and it attends to the owl.
    await until(page, 'its eyes opening', async () => (await now(page)).guardian!.lids === 'open');
    s = await now(page);
    expect(s.guardian).toMatchObject({ dozing: false, hoots: 0 });
    expect(s.guardian!.attending).not.toBeNull();
    // One hoot for an owl in by the knothole, its head lifted toward it: the owl is above its face on the screen.
    await until(page, 'its hoot', async () => (await now(page)).guardian!.hoots === 1);
    await pass(page, 4_000);
    s = await now(page);
    expect(s.guardian!.hoots).toBe(1);
    expect(s.guardian!.head.dy).toBeLessThan(-3);
    // It never hid the owl that came in.
    expect(s.seeThrough).toEqual([]);

    // The feather trail is out, and no feather lies behind it.
    await until(page, 'the feather trail', async () => ((await now(page)).trail?.feathers.length ?? 0) >= 4);
    s = await now(page);
    for (const f of s.trail!.feathers) for (const b of s.guardian!.boxes) expect(inside(f, b), `a feather at ${f.x},${f.y}`).toBe(false);

    // A hoot is answered with its own, once.
    expect(await page.evaluate(() => window.owlPark.emote('hoot'))).toBe(true);
    await until(page, 'its answer', async () => (await now(page)).guardian!.hoots === 2);
    await pass(page, 3_000);
    expect((await now(page)).guardian!.hoots).toBe(2);
  });

  test('it goes see-through while the visitor’s own owl is behind it, beats while that owl rides the rising air, and stands solid again once the owl is out in front', async ({ page }) => {
    test.slow(); // a walk to the heart, a rise to the top, and the way down
    await holdTheClock(page);
    await openHallWithGuardian(page);
    await until(page, 'its eyes opening', async () => (await now(page)).guardian!.lids === 'open');
    let s = await now(page);
    const beam = s.objects.find((o) => o.id === 'm3-hall-moonbeam-heart')!;
    const g = s.guardian!;
    // The heart's light and rising air are at its chest: behind it, by where its foot stands.
    expect(beam.y).toBeLessThan(g.at.y);
    expect(g.boxes.some((b) => inside({ x: beam.x, y: beam.y - 44 }, b))).toBe(true);

    await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), { x: beam.x, y: beam.y });
    await until(page, 'the owl standing at the heart', async () => {
      const at = await now(page);
      return !at.walking && Math.hypot(at.pos.x - beam.x, at.pos.y - beam.y) < 30;
    });
    // Behind it: it fades, as one picture, so the owl shows.
    await until(page, 'the guardian going see-through', async () => {
      const at = await now(page);
      return at.seeThrough.includes('guardian:whole') && at.guardian!.alpha < 0.5;
    });
    expect((await now(page)).guardian!.beat).toBeLessThan(0.7);

    // Jump held in the rising air: the owl is carried up, and the guardian beats.
    expect(await page.evaluate(() => window.owlPark.jump(9_000))).toBe(true);
    await until(page, 'the owl lifted', async () => (await now(page)).air.s === 3);
    await until(page, 'its beat', async () => (await now(page)).guardian!.beat > 0.9);
    // Up over its head the owl is in plain sight again, and the guardian solid, its head lifted to watch.
    await until(page, 'the owl over its head', async () => {
      const at = await now(page);
      return at.air.z > 700 && at.seeThrough.length === 0 && at.guardian!.alpha === 1;
    });
    s = await now(page);
    expect(s.guardian!.attending).not.toBeNull();
    expect(s.guardian!.head.dy).toBeLessThan(-3);

    // Down again and out in front of it: solid, and the beat has died away.
    await until(page, 'the owl down', async () => (await now(page)).air.s === 0);
    await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), { x: g.at.x - 120, y: g.at.y + 200 });
    await until(page, 'the owl out in front', async () => {
      const at = await now(page);
      return !at.walking && at.pos.y > g.at.y + 150;
    });
    await until(page, 'the guardian solid', async () => {
      const at = await now(page);
      return at.seeThrough.length === 0 && at.guardian!.alpha === 1 && at.guardian!.beat < 0.3;
    });

    // Out in front of it the camera keeps its face in view: its head and the owl are both on the screen,
    // here and a good way further back, where the owl's own camera would have its head off the top.
    const headTop = Math.min(...g.boxes.map((b) => b.y));
    const bothInView = async () => {
      const cam = await page.evaluate(() => window.owlPark.camera()!);
      const at = await now(page);
      return !at.walking && cam.viewY <= headTop && cam.viewY + cam.viewH >= at.pos.y;
    };
    await until(page, 'its head and the owl both in view', bothInView);
    await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), { x: g.at.x, y: g.at.y + 620 });
    await until(page, 'the owl further back', async () => {
      const at = await now(page);
      return !at.walking && at.pos.y > g.at.y + 560;
    });
    await until(page, 'its head and the owl both in view from further back', bothInView);

    // Well away to one side the camera is the owl's own again, and it comes to rest once: handed back,
    // it does not jump and come back (OP-396).
    await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), { x: g.at.x + 1080, y: g.at.y + 200 });
    await until(page, 'the owl well away to one side', async () => {
      const at = await now(page);
      return !at.walking && at.pos.x > g.at.x + 1040;
    });
    const tops: number[] = [];
    for (let i = 0; i < 70; i++) {
      await page.clock.fastForward(HELD_FRAME_MS);
      tops.push((await page.evaluate(() => window.owlPark.camera()!)).viewY);
    }
    const rest = tops.at(-1)!;
    const near = tops.findIndex((top) => Math.abs(top - rest) <= 3);
    expect(Math.max(...tops.slice(near).map((top) => Math.abs(top - rest)))).toBeLessThanOrEqual(3);
  });
});
