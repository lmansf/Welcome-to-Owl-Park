import { expect, test, type Page } from '@playwright/test';
import { frames, openPark, state } from './helpers';

/**
 * Skin trials (`?skin=<name>`, game/skinTrial.ts): a realm artist's skin sheet, cut into the kit's
 * slots by tools/kit/skin_sheet.py, drawn in Updraft Canopy in place of the clearing's slots. Only
 * the look changes, and only on a page that names the trial: a visitor's page asks for none of its
 * files. The shots (e2e-screenshots/<project>-skin-*.png) are how the sheet is judged.
 */

const SKINS = ['dusk', 'forest'] as const;
const SPOTS = [
  { room: 'canopy-1', spawn: 'default' },
  { room: 'canopy-1', spawn: 'from-roots' },
  { room: 'canopy-3', spawn: 'on-c2' },
  { room: 'canopy-3', spawn: 'on-c12' },
] as const;

/** The trial files a page asks for while `run` goes. */
async function trialRequests(page: Page, run: () => Promise<void>): Promise<string[]> {
  const asked: string[] = [];
  const hear = (r: { url(): string }) => {
    const m = /\/art\/(trial-[^?]+)/.exec(decodeURIComponent(r.url()));
    if (m) asked.push(m[1]!);
  };
  page.on('request', hear);
  try {
    await run();
  } finally {
    page.off('request', hear);
  }
  return asked;
}

const shot = async (page: Page, name: string) => {
  await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-skin-${name}.png` });
  // TEMPORARY (reverted before merge): the shots into the log, where they can be read without the artifacts.
  if (/^(none|forest)-canopy-(1-default|3-on-c2)$/.test(name)) {
    const b = await page.screenshot({ type: 'jpeg', quality: 55 });
    process.stdout.write(`SKINSHOT ${test.info().project.name}-${name} ${b.toString('base64')}\n`);
  }
};

test.describe('skin trials in Updraft Canopy', () => {
  test('a visitor’s page draws the course as it is and asks for no trial file', async ({ page, isMobile }) => {
    test.slow(); // four rooms opened and shot, on a slow phone runner too
    // A phone on its side, as the course plays: held upright it shows only the turn-your-phone card.
    if (isMobile) await page.setViewportSize({ width: 844, height: 390 });
    for (const { room, spawn } of SPOTS) {
      const asked = await trialRequests(page, () => openPark(page, { room, spawn, kit: '1' }));
      expect(asked).toEqual([]);
      await frames(page, 30);
      await shot(page, `none-${room}-${spawn}`);
    }
  });

  for (const skin of SKINS) {
    test(`?skin=${skin} draws the cut sheet in the clearing’s slots, and the course plays as it does`, async ({ page, isMobile }) => {
      test.slow(); // four rooms opened twice each, on a slow phone runner too
      // A phone on its side, as the course plays: held upright it shows only the turn-your-phone card.
      if (isMobile) await page.setViewportSize({ width: 844, height: 390 });
      for (const { room, spawn } of SPOTS) {
        await openPark(page, { room, spawn, kit: '1', skin: '0' });
        const plain = await state(page);
        const asked = await trialRequests(page, () => openPark(page, { room, spawn, kit: '1', skin }));
        const skinned = await state(page);
        // The sheet's ground, perch and hazard cells at least, and only this trial's.
        expect(asked.length, `${room} asked for no ${skin} file`).toBeGreaterThan(0);
        for (const f of asked) expect(f).toMatch(new RegExp(`^trial-${skin}-kit-clearing-`));
        // The same course to play: where the owl comes in, its doors and what is there to do.
        expect(skinned.room).toBe(room);
        expect(skinned.pos).toEqual(plain.pos);
        expect(skinned.doors).toEqual(plain.doors);
        expect(skinned.objects.map((o) => o.id)).toEqual(plain.objects.map((o) => o.id));
        await frames(page, 30);
        await shot(page, `${skin}-${room}-${spawn}`);
      }
      // Kept for the tab until ?skin=0.
      const kept = await trialRequests(page, () => openPark(page, { room: 'canopy-1', kit: '1' }));
      expect(kept.length).toBeGreaterThan(0);
      const off = await trialRequests(page, () => openPark(page, { room: 'canopy-1', kit: '1', skin: '0' }));
      expect(off).toEqual([]);
    });
  }
});
