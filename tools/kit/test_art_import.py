"""The art import's own tests (OP-274): python3 -B -m unittest discover -s tools/kit -p "test_*.py" (pnpm kit:check).

A made-up delivery with every slot of the kit drawn to its rules imports, each slot as kit-<realm>-<slot>
at 1x and 2x and on the preview sheet; the same delivery with one file the wrong size, one texture whose
edges don't join and one file missing is refused with those three reasons, and nothing is written.
"""

import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import art_import as ai  # noqa: E402

KIT = ai.slots()


def periodic(w, h, seed, alpha=None):
    """A picture that tiles both ways: waves of whole periods across and down, so every edge joins."""
    rng = np.random.default_rng(seed)
    x = np.arange(w)[None, :] / w
    y = np.arange(h)[:, None] / h
    rgb = np.zeros((h, w, 3))
    for c in range(3):
        for _ in range(4):
            kx, ky = rng.integers(1, 6, 2)
            rgb[..., c] += np.sin(2 * np.pi * (kx * x + ky * y) + rng.uniform(0, 6))
    rgb = (128 + 25 * rgb).clip(0, 255).astype(np.uint8)
    a = np.full((h, w, 1), 255, np.uint8) if alpha is None else alpha[..., None]
    return Image.fromarray(np.concatenate([rgb, a], axis=2), 'RGBA')


def good_art(s):
    """A slot's art drawn to the kit's rules for it."""
    w, h = s.deliver_w, s.deliver_h
    if s.opaque:
        return periodic(w, h, len(s.slot))
    alpha = np.zeros((h, w), np.uint8)
    if s.slot == 'slope':
        # One straight rise from the bottom left to the top right.
        for x in range(w):
            alpha[int((h - 1) * (1 - x / (w - 1)) * 0.8 + h * 0.15) :, x] = 255
    elif s.slot in ai.LEVEL_SLOTS or s.slot == 'perch-mid':
        # A flat top a little under the top edge, a perch end rounded at its left.
        top = h // 10
        alpha[top : h - h // 4, :] = 255
        if s.slot == 'perch-end':
            for x in range(w // 4):
                alpha[: top + (w // 4 - x), x] = 0
    elif s.repeat == 'x':
        # A band across the full width, clear above and below.
        alpha[h // 4 : h - h // 4, :] = 200
    elif s.repeat == 'y':
        alpha[:, w // 4 : w - w // 4] = 160
    else:
        alpha[h // 8 :, w // 6 : w - w // 6] = 255
    return periodic(w, h, len(s.slot), alpha)


def size_of(path):
    with Image.open(path) as im:
        return im.size


def write_delivery(folder):
    folder.mkdir(parents=True, exist_ok=True)
    for s in KIT:
        good_art(s).save(folder / s.file)


class TestArtImport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp())
        cls.good = cls.tmp / 'good'
        write_delivery(cls.good)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp)

    def test_the_kit_has_its_28_slots(self):
        self.assertEqual(len(KIT), 28)
        self.assertEqual(len({s.slot for s in KIT}), 28)

    def test_a_good_delivery_checks_out(self):
        got = ai.check_delivery(self.good)
        self.assertEqual(got.problems, [])
        self.assertEqual(got.warnings, [])
        self.assertEqual(sorted(got.found), sorted(s.slot for s in KIT))

    def test_a_bad_delivery_is_refused_with_its_three_reasons_and_nothing_written(self):
        bad = self.tmp / 'bad'
        shutil.copytree(self.good, bad)
        # One wrong size, one seam that does not join, one file missing.
        Image.open(bad / 'perch-small.png').resize((400, 100)).save(bad / 'perch-small.png')
        ramp = np.tile(np.linspace(0, 255, 512, dtype=np.uint8)[None, :, None], (512, 1, 3))
        Image.fromarray(ramp, 'RGB').save(bad / 'texture-ground.png')
        (bad / 'lost-feather.png').unlink()
        got = ai.check_delivery(bad)
        self.assertEqual(len(got.problems), 3, got.problems)
        joined = '\n'.join(got.problems)
        self.assertIn('perch-small.png: is 400x100; the kit asks for 480x120', joined)
        self.assertRegex(joined, r'texture-ground\.png: its left and right edges do not join a copy of itself')
        self.assertIn('lost-feather.png: is missing', joined)
        # The import itself stops there: the park's art is as it was.
        before = sorted(p.name for p in ai.ART.glob('kit-ink-*'))
        self.assertEqual(ai.main([str(bad), 'ink']), 1)
        self.assertEqual(sorted(p.name for p in ai.ART.glob('kit-ink-*')), before)

    def test_small_seams_warn_and_large_ones_refuse(self):
        s = next(k for k in KIT if k.slot == 'texture-wall')
        base = np.asarray(periodic(s.deliver_w, s.deliver_h, 3)).copy()
        faint = base.copy()
        faint[:, -1, :3] = np.clip(faint[:, -1, :3].astype(int) + 4, 0, 255)
        folder = self.tmp / 'seams'
        folder.mkdir()
        Image.fromarray(faint, 'RGBA').save(folder / s.file)
        problems, warnings = ai.check_file(s, folder / s.file)
        self.assertEqual(problems, [])
        self.assertEqual(len(warnings), 1)
        self.assertIn('faint seam', warnings[0])

    def test_wrong_backgrounds_names_tops_and_slopes_are_refused(self):
        folder = self.tmp / 'rules'
        folder.mkdir()
        by = {s.slot: s for s in KIT}
        # A see-through slot sent solid, and a solid one with a hole.
        Image.new('RGBA', (by['decor'].deliver_w, by['decor'].deliver_h), (90, 90, 90, 255)).save(folder / 'decor.png')
        holed = good_art(by['sky'])
        holed.putpixel((5, 5), (0, 0, 0, 0))
        holed.save(folder / 'sky.png')
        # A perch whose top steps down halfway along, and a slope that bends.
        pm = by['perch-mid']
        a = np.zeros((pm.deliver_h, pm.deliver_w), np.uint8)
        a[20:, : pm.deliver_w // 2] = 255
        a[80:, pm.deliver_w // 2 :] = 255
        periodic(pm.deliver_w, pm.deliver_h, 1, a).save(folder / 'perch-mid.png')
        sl = by['slope']
        a = np.zeros((sl.deliver_h, sl.deliver_w), np.uint8)
        for x in range(sl.deliver_w):
            t = x / (sl.deliver_w - 1)
            a[int(sl.deliver_h * (0.95 - 0.8 * t * t)) :, x] = 255
        periodic(sl.deliver_w, sl.deliver_h, 2, a).save(folder / 'slope.png')
        Image.new('RGBA', (10, 10)).save(folder / 'perch_mid.png')
        Image.new('RGB', (10, 10)).save(folder / 'plant.jpg')
        got = ai.check_delivery(folder, partial=True)
        joined = '\n'.join(got.problems)
        self.assertIn('decor.png: has no see-through background', joined)
        self.assertIn('sky.png: has see-through pixels', joined)
        self.assertIn('perch-mid.png: its top edge, where an owl walks, is not level', joined)
        self.assertIn('slope.png: its top edge is not one straight rise', joined)
        self.assertIn('perch_mid.png: is not a kit slot name (did you mean perch-mid.png?)', joined)
        self.assertIn('plant.jpg: is a .jpg; the kit takes PNG only (plant.png)', joined)
        self.assertNotIn('plant.png: is missing', joined)

    def test_a_good_delivery_publishes_every_slot_at_1x_and_2x_and_fills_the_preview_sheet(self):
        art = self.tmp / 'art'
        got = ai.check_delivery(self.good)
        written = ai.publish(got.found, 'ink', art)
        names = {p.name for p in written}
        for s in KIT:
            key = ai.slot_key('ink', s.slot)
            ext = 'webp' if s.slot == 'start-screen' else 'png'
            self.assertIn(f'{key}.{ext}', names)
            self.assertEqual(size_of(art / f'{key}.{ext}'), (s.w, s.h))
            if (s.deliver_w, s.deliver_h) == (2 * s.w, 2 * s.h):
                self.assertEqual(size_of(art / f'{key}@2x.{ext}'), (s.deliver_w, s.deliver_h))
            else:
                self.assertNotIn(f'{key}@2x.{ext}', names)
        # A texture resized for the game still tiles.
        self.assertLess(max(ai.seam_ratio(Image.open(art / 'kit-ink-texture-ground.png')).values()), ai.SEAM_WARN)
        sheet, drawn = ai.preview_sheet('ink', art, out=self.tmp / 'sheet.png')
        self.assertTrue(sheet.exists())
        self.assertEqual(sorted(drawn), sorted(s.slot for s in KIT))
        # A second import of the same slot replaces it, leaving one file per size.
        ai.publish({'perch-mid': got.found['perch-mid']}, 'ink', art)
        self.assertEqual(sorted(p.name for p in art.glob('kit-ink-perch-mid*')), ['kit-ink-perch-mid.png', 'kit-ink-perch-mid@2x.png'])

    def test_a_partial_delivery_lists_what_is_still_to_come(self):
        part = self.tmp / 'part'
        part.mkdir()
        for name in ('perch-mid.png', 'sky.png'):
            shutil.copy(self.good / name, part / name)
        got = ai.check_delivery(part, partial=True)
        self.assertEqual(got.problems, [])
        self.assertEqual(sorted(got.found), ['perch-mid', 'sky'])
        self.assertEqual(len(got.missing), 26)
        self.assertEqual(len(ai.check_delivery(part).problems), 26)


if __name__ == '__main__':
    unittest.main()
