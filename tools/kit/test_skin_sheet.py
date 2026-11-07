"""The skin sheet cutter's own tests: python3 -B -m unittest discover -s tools/kit -p "test_*.py" (pnpm kit:check).

A made-up sheet in the template's layout, each cell a block of its own colour, is cut into the slot
files at their delivered sizes, each from its own cell; a sheet that is not 2:1 is refused; blank
cells keep our default; the updraft cell's separate bits come out one to a frame.
"""

import sys
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import skin_sheet as ss  # noqa: E402

COLOURS = {c: (20 * i + 30, 200 - 15 * i, 60 + 17 * i, 255) for i, c in enumerate(ss.CELLS)}


def sheet(k=2, skip=()):
    im = Image.new('RGBA', (ss.SHEET_W * k, ss.SHEET_H * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for c, (x, y, w, h) in ss.CELLS.items():
        if c in skip:
            continue
        if c == 'C6':
            # Three bits apart from one another.
            for i in range(3):
                d.ellipse([(x + 20 + 70 * i) * k, (y + 80) * k, (x + 70 + 70 * i) * k, (y + 130) * k], fill=COLOURS[c])
            continue
        d.rectangle([x * k, y * k, (x + w) * k - 1, (y + h) * k - 1], fill=COLOURS[c])
    return im


def middle(img):
    return img.convert('RGBA').getpixel((img.width // 2, img.height // 2))


class SkinSheetTest(unittest.TestCase):
    def test_cuts_each_cell_into_its_slot_at_the_delivered_size(self):
        files, _ = ss.cut(sheet())
        sizes = ss.slot_sizes()
        want = {'texture-ground': 'C1', 'texture-wall': 'C2', 'perch-end': 'C3', 'perch-mid': 'C3', 'slope': 'C4', 'roost': 'C5', 'wind-current': 'C7', 'hazard': 'C8', 'hazard-2': 'C9', 'hazard-3': 'C10'}
        for slot, c in want.items():
            self.assertEqual(middle(files[slot]), COLOURS[c], slot)
            if slot in sizes:
                self.assertEqual(files[slot].size, sizes[slot][2:], slot)
        self.assertNotIn('perch-small', files)

    def test_a_game_size_sheet_is_cut_the_same(self):
        big, _ = ss.cut(sheet(2))
        small, notes = ss.cut(sheet(1))
        self.assertEqual(big.keys(), small.keys())
        self.assertTrue(any('not the 3520x1760' in n for n in notes))

    def test_refuses_a_sheet_that_is_not_two_to_one(self):
        with self.assertRaises(SystemExit):
            ss.cut(Image.new('RGBA', (1760, 1000)))

    def test_a_blank_cell_keeps_our_default(self):
        files, notes = ss.cut(sheet(skip=('C5', 'C9')))
        self.assertNotIn('roost', files)
        self.assertNotIn('hazard-2', files)
        self.assertTrue(any(n.startswith('roost:') for n in notes))

    def test_the_updraft_bits_come_out_one_to_a_frame(self):
        files, notes = ss.cut(sheet())
        strip = files['updraft-bits']
        self.assertEqual(strip.size, (3 * ss.BIT_FRAME, ss.BIT_FRAME))
        for i in range(3):
            self.assertEqual(strip.getpixel((i * ss.BIT_FRAME + ss.BIT_FRAME // 2, ss.BIT_FRAME // 2)), COLOURS['C6'])
        self.assertTrue(any('3 separate bits' in n for n in notes))

    def test_a_small_perch_is_made_from_the_perch_only_when_asked(self):
        files, notes = ss.cut(sheet(), derive_small=True)
        self.assertEqual(files['perch-small'].size, ss.slot_sizes()['perch-small'][2:])
        self.assertTrue(any(n.startswith('perch-small:') for n in notes))


if __name__ == '__main__':
    unittest.main()
