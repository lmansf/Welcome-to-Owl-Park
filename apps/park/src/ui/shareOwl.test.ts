import { describe, expect, it } from 'vitest';
import { NATURES, OWL_SHARE_WORDS, natureOfSharePath } from '@owl-park/shared';
import { FLAGS, flagOn } from '../flags';
import { owlShareUrl, shareOwl, type ShareDevice } from './shareOwl';

const ORIGIN = 'https://exploreowlpark.com';
const barn = NATURES.find((d) => d.id === 'gentle')!;

describe('Share my owl (OP-392)', () => {
  it('stays behind its flag', () => {
    expect(FLAGS.share.param).toBe('share');
    expect(flagOn('share', '')).toBe(false);
    expect(flagOn('share', '?share=1')).toBe(true);
  });

  it('shares an address that opens that owl’s page, for each of the five owls', () => {
    for (const def of NATURES) {
      const url = new URL(owlShareUrl(def, ORIGIN));
      expect(url.origin).toBe(ORIGIN);
      expect(natureOfSharePath(url.pathname)?.id).toBe(def.id);
      expect(url.search).toBe('');
    }
    expect(owlShareUrl(barn, `${ORIGIN}/`)).toBe(`${ORIGIN}/owl/gentle`);
  });

  it('uses the share sheet when there is one', async () => {
    const sent: unknown[] = [];
    const device: ShareDevice = {
      share: async (d) => void sent.push(d),
      clipboard: {
        writeText: async () => {
          throw new Error('not used');
        },
      },
    };
    expect(await shareOwl(barn, ORIGIN, device)).toBe('shared');
    expect(sent).toEqual([{ title: OWL_SHARE_WORDS.pageTitle(barn), text: OWL_SHARE_WORDS.text(barn), url: `${ORIGIN}/owl/gentle` }]);
  });

  it('copies the link when there is no share sheet, or the sheet fails', async () => {
    let copied = '';
    const clipboard = { writeText: async (t: string) => void (copied = t) };
    expect(await shareOwl(barn, ORIGIN, { clipboard })).toBe('copied');
    expect(copied).toBe(`${OWL_SHARE_WORDS.text(barn)} ${ORIGIN}/owl/gentle`);
    copied = '';
    expect(
      await shareOwl(barn, ORIGIN, {
        share: async () => {
          throw new TypeError('blocked');
        },
        clipboard,
      }),
    ).toBe('copied');
    expect(copied).toContain('/owl/gentle');
  });

  it('does nothing more when the player closes the sheet, and says so when nothing works', async () => {
    let copied = false;
    const abort = Object.assign(new Error('closed'), { name: 'AbortError' });
    const clipboard = { writeText: async () => void (copied = true) };
    expect(
      await shareOwl(barn, ORIGIN, {
        share: async () => {
          throw abort;
        },
        clipboard,
      }),
    ).toBe('cancelled');
    expect(copied).toBe(false);
    expect(await shareOwl(barn, ORIGIN, {})).toBe('failed');
    expect(
      await shareOwl(barn, ORIGIN, {
        clipboard: {
          writeText: async () => {
            throw new Error('denied');
          },
        },
      }),
    ).toBe('failed');
  });

  it('words it for a kid, true of whoever opens the link', () => {
    expect(OWL_SHARE_WORDS.text(barn)).toBe("I'm a barn owl in Owl Park! Which owl are you?");
    const brave = NATURES.find((d) => d.id === 'brave')!;
    expect(OWL_SHARE_WORDS.text(brave)).toBe("I'm an owl of the tree in Owl Park! Which owl are you?");
    for (const def of NATURES) expect(OWL_SHARE_WORDS.text(def)).not.toMatch(/grown|adult/i);
  });
});
