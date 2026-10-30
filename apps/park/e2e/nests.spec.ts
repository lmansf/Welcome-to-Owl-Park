import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGround, openPark, settleCamera, state, tapRoomPoint, toScreen, waitForArrival, walkAndStop, walkToDoor, type ParkState } from './helpers';

/** The nest this page's owl is in, once the nest has said how it stands. */
async function nestOf(page: Page): Promise<NonNullable<ParkState['nest']>> {
  await expect.poll(async () => (await state(page)).nest?.id ?? null, { timeout: 20_000 }).not.toBeNull();
  return (await state(page)).nest!;
}

/** The street's answer: the nest behind door 0 (this visitor's own) and who lives behind the rest. */
async function streetOf(page: Page): Promise<NonNullable<ParkState['street']>> {
  await expect.poll(async () => {
    const s = await state(page);
    const own = s.street?.[0];
    return own?.kind === 'own' ? own.nestId : null;
  }, { timeout: 20_000 }).not.toBeNull();
  return (await state(page)).street!;
}

async function inRoom(page: Page, room: string | RegExp): Promise<void> {
  await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toMatch(room instanceof RegExp ? room : new RegExp(`^${room}$`));
}

const sheet = (page: Page) => page.locator('section.decorate');

// Each test chains several room changes, two of them with a second owl's page drawing too: on a
// four-core runner they take 35 to 50 s, so they get the room server suite's budget.
test.describe.configure({ timeout: 90_000 });

test.describe('the nests (this device)', () => {
  test('from the lobby down the lane to the street, into the owl’s own nest, decorating it, and back out', async ({ page }) => {
    await openPark(page, { room: 'lobby', collector: 'e2e-nest-own', tz: 'UTC' });
    await walkToDoor(page, 'to-homes');
    await inRoom(page, 'homes');
    const street = await streetOf(page);
    expect(street).toHaveLength(6);
    expect(street.slice(1).every((d) => d.kind === 'empty')).toBe(true);
    const own = street[0]!.kind === 'own' ? street[0]!.nestId! : '';

    // Door 0 is the owl's own nest: in it, the four starter pieces stand in their spots.
    await walkToDoor(page, 'nest-door-0');
    await inRoom(page, `nest-${own}`);
    const nest = await nestOf(page);
    expect(nest.mine).toBe(true);
    expect(nest.open).toBe(true);
    expect(Object.values(nest.layout).sort()).toEqual(['lamp', 'potted-fern', 'rug', 'stump-table']);
    // Their pictures load as the nest puts them out, not before the room opens (OP-129); then each is drawn.
    await expect.poll(async () => (await state(page)).nest?.drawn).toEqual(nest.layout);
    expect(nest.gift).toEqual({ taken: false });
    await expect(page.locator('[data-action="decorate"]')).toBeVisible();

    // Decorate: the sheet opens on spot 1, where the lamp stands.
    await page.locator('[data-action="decorate"]').click();
    await expect(sheet(page)).toBeVisible();
    await expect.poll(async () => (await state(page)).nest?.decorating).toBe(true);
    await expect(sheet(page).locator('[data-where]')).toHaveText('1 / 12 · On the floor');
    await expect(sheet(page).locator('[data-piece="lamp"]')).toHaveAttribute('aria-pressed', 'true');
    // The owl's own pieces have their pictures on the sheet.
    await expect(sheet(page).locator('[data-piece] img')).toHaveCount(await sheet(page).locator('[data-piece]').count());
    // The bottom bar gives way to the sheet and the room.
    await expect(page.locator('[data-menu-btn]')).toBeHidden();

    // Spot 2: the rug moves there from its own spot; then Take away puts it back with the owl.
    await sheet(page).getByRole('button', { name: 'Next spot' }).click();
    await expect(sheet(page).locator('[data-where]')).toHaveText('2 / 12 · On the floor');
    await sheet(page).locator('[data-piece="rug"]').click();
    await expect.poll(async () => (await state(page)).nest?.layout['f2']).toBe('rug');
    expect(Object.values((await state(page)).nest!.layout).filter((v) => v === 'rug')).toHaveLength(1);
    await sheet(page).getByRole('button', { name: 'Take away' }).click();
    await expect.poll(async () => (await state(page)).nest?.layout['f2'] ?? null).toBeNull();

    // A tap on a spot's ring in the room chooses it, and never walks the owl.
    const before = (await state(page)).pos;
    await settleCamera(page); // the camera pans to the chosen spot
    await tapRoomPoint(page, 820, 794);
    await expect(sheet(page).locator('[data-where]')).toHaveText('6 / 12 · On the floor');
    expect((await state(page)).nest?.spot).toBe('f6');
    expect((await state(page)).pos).toEqual(before);

    // The arrow keys step through the spots. The wall spots want wall pieces, which the starter set has none of.
    await page.keyboard.press('ArrowLeft');
    await expect(sheet(page).locator('[data-where]')).toHaveText('5 / 12 · On the floor');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await expect(sheet(page).locator('[data-where]')).toHaveText('9 / 12 · On the wall');
    await expect(sheet(page).locator('.empty')).toBeVisible();

    // Today's furniture gift: a new piece, and the button says when the next one comes.
    await sheet(page).locator('[data-gift]').click();
    const gift = page.locator('.toast').filter({ hasText: 'New for your nest:' });
    await expect(gift).toBeVisible();
    // The message shows above the sheet, not over it.
    const [giftBox, sheetBox] = await Promise.all([gift.boundingBox(), sheet(page).boundingBox()]);
    expect(giftBox!.y + giftBox!.height).toBeLessThanOrEqual(sheetBox!.y);
    await expect(sheet(page).locator('[data-gift]')).toHaveText('Next gift tomorrow');
    await expect(sheet(page).locator('[data-gift]')).toBeDisabled();
    expect((await state(page)).nest?.owned).toHaveLength(5);
    // The new piece's picture loads for the sheet too: its spot shows it.
    await expect(sheet(page).locator('[data-piece]')).not.toHaveCount(0);
    await expect(sheet(page).locator('[data-piece] img')).toHaveCount(await sheet(page).locator('[data-piece]').count());

    // Closed to visitors, then Done: the sheet goes and the bottom bar comes back.
    await sheet(page).locator('[data-open]').click();
    await expect(sheet(page).locator('[data-open]')).toHaveText('Closed to visitors');
    await expect.poll(async () => (await state(page)).nest?.open).toBe(false);
    await sheet(page).getByRole('button', { name: 'Done' }).click();
    await expect(sheet(page)).toBeHidden();
    await expect(page.locator('[data-menu-btn]')).toBeVisible();
    expect((await state(page)).nest?.decorating).toBe(false);

    // Out of the nest the owl comes back to the street in front of its own door.
    await walkToDoor(page, 'to-street');
    await inRoom(page, 'homes');
    const back = (await state(page)).pos;
    expect(Math.abs(back.x - 2872)).toBeLessThan(80);

    // What it arranged stays: back inside, the gift is still there and the nest still closed.
    await walkToDoor(page, 'nest-door-0');
    await inRoom(page, `nest-${own}`);
    await expect.poll(async () => (await state(page)).nest?.owned.length).toBe(5);
    expect((await state(page)).nest?.open).toBe(false);
  });

  test('from the street’s west end, the owl’s own door: a walk round the mounds where the two screens join, and in (OP-148)', async ({ page }) => {
    await openPark(page, { room: 'homes', spawn: 'from-nest-5', collector: 'e2e-nest-way', tz: 'UTC' });
    const own = (await streetOf(page))[0]!;
    // From the lane's west end a straight walk to door 0 stops at the mounds; the walk there goes round them.
    await walkAndStop(page, 470, 870);
    // The door is far off screen: its chip at the screen's edge sends the owl there, as a tap on it would.
    await page.locator('[data-hint="nest-door-0"]').click();
    await inRoom(page, `nest-${own.kind === 'own' ? own.nestId : ''}`);
  });

  test('stopped at the mounds, a tap past them walks round them, where it did nothing (OP-148)', async ({ page }) => {
    await openPark(page, { room: 'homes', spawn: 'from-nest-5', collector: 'e2e-nest-mound', tz: 'UTC' });
    // Where a straight walk east along the lane's bottom edge stops, against the mounds.
    const at = await walkAndStop(page, 1431, 805);
    await settleCamera(page);
    // A point on the lane past the mounds: from here the straight line to it leaves the floor at once.
    const past = await openGround(page, [
      { x: 1650, y: 730 },
      { x: 1620, y: 720 },
      { x: 1700, y: 740 },
    ]);
    await tapRoomPoint(page, past.x, past.y);
    await waitForArrival(page, past.x, past.y, 8);
    expect(Math.hypot(at.x - 1431, at.y - 805)).toBeLessThan(8);
  });

  test('two owls of one browser visit each other’s nests, and a nest that closes sends its visitor out', async ({ page, context }) => {
    // The host and its nest.
    await openPark(page, { room: 'homes', collector: 'e2e-nest-host', id: 'host', tz: 'UTC' });
    const hostNest = (await streetOf(page))[0]!;
    const hostId = hostNest.kind === 'own' ? hostNest.nestId! : '';
    await walkToDoor(page, 'nest-door-0');
    await inRoom(page, `nest-${hostId}`);
    await nestOf(page);

    // The guest finds it behind door 1, with a flag in the host's colours.
    const guest = await context.newPage();
    await openPark(guest, { room: 'homes', collector: 'e2e-nest-guest', id: 'guest', tz: 'UTC' });
    const doors = await streetOf(guest);
    expect(doors[1]).toMatchObject({ kind: 'nest', nestId: hostId });
    await walkToDoor(guest, 'nest-door-1');
    await inRoom(guest, `nest-${hostId}`);
    const seen = await nestOf(guest);
    expect(seen.mine).toBe(false);
    expect((await state(guest)).actions).not.toContain('decorate');
    // They see each other.
    await expect.poll(async () => (await state(page)).peers.map((p) => p.id)).toContain('guest');

    // The host moves the lamp: the guest sees it move.
    await page.locator('[data-action="decorate"]').click();
    await sheet(page).getByRole('button', { name: 'Next spot' }).click();
    await sheet(page).locator('[data-piece="lamp"]').click();
    await expect.poll(async () => (await state(guest)).nest?.layout['f2']).toBe('lamp');

    // The host closes its nest: the guest is shown the way out, by the door it came in by.
    await sheet(page).locator('[data-open]').click();
    await expect(guest.locator('.toast').filter({ hasText: 'Closed for now' })).toBeVisible();
    await inRoom(guest, 'homes');
    expect(Math.abs((await state(guest)).pos.x - 2399)).toBeLessThan(80);
    // And the closed nest is not on the guest's street any more.
    await expect.poll(async () => (await state(guest)).street?.slice(1).every((d) => d.kind === 'empty')).toBe(true);
  });
});

test.describe('decorating on a phone', () => {
  test('the chosen spot stays in view above the Decorate sheet', async ({ page }) => {
    await openPark(page, { room: 'homes', collector: 'e2e-nest-phone', tz: 'UTC' });
    const own = (await streetOf(page))[0]!;
    await walkToDoor(page, 'nest-door-0');
    await inRoom(page, `nest-${own.kind === 'own' ? own.nestId : ''}`);
    await nestOf(page);
    await page.locator('[data-action="decorate"]').click();
    await expect(sheet(page)).toBeVisible();
    for (const [n, x, y] of [
      [1, 480, 694],
      [4, 1150, 694],
      [8, 1290, 806],
      [12, 1300, 323],
    ] as const) {
      while (!(await sheet(page).locator('[data-where]').textContent())?.startsWith(`${n} /`)) await sheet(page).getByRole('button', { name: 'Next spot' }).click();
      // Let the camera pan to the spot, then check it is on screen and above the sheet.
      await settleCamera(page);
      const top = await sheet(page).evaluate((el) => el.getBoundingClientRect().top);
      const p = await toScreen(page, x, y);
      const width = page.viewportSize()!.width;
      expect(p.x, `spot ${n} across`).toBeGreaterThan(0);
      expect(p.x, `spot ${n} across`).toBeLessThan(width);
      expect(p.y, `spot ${n} above the sheet`).toBeLessThan(top);
      expect(p.y, `spot ${n} below the top`).toBeGreaterThan(0);
    }
  });
});
