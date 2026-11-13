"""The screen check's own tests (OP-252): python3 -B -m unittest discover -s tools/kit -p "test_*.py" (pnpm kit:check).

The palette's tolerance against the approved targets and against made-up screens, and the band and
order rules of ``preview.check_screen`` on a made-up room drawn from made-up art. The last test holds
the real kit rooms to the check, as CI does.
"""

import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / 'art'))

import preview  # noqa: E402
from artlib import palette  # noqa: E402

TARGETS = HERE.parent / 'art' / 'targets'


def flat(hex_colour, size=(400, 225), alpha=255):
    rgb = tuple(int(hex_colour[i:i + 2], 16) for i in (1, 3, 5))
    return Image.new('RGBA', size, rgb + (alpha,))


def textured(hex_colour, size, amp, alpha=255, seed=0):
    """A colour with value noise in 8 px cells (deterministic), so a layer has local contrast."""
    rng = np.random.default_rng(seed)
    w, h = size
    cells = rng.uniform(-amp, amp, (h // 8 + 1, w // 8 + 1))
    noise = np.kron(cells, np.ones((8, 8)))[:h, :w]
    base = np.array([int(hex_colour[i:i + 2], 16) for i in (1, 3, 5)], float)
    rgb = np.clip(base[None, None, :] * (1 + noise[..., None]), 0, 255).astype(np.uint8)
    a = np.full((h, w, 1), alpha, np.uint8)
    return Image.fromarray(np.concatenate([rgb, a], axis=2), 'RGBA')


class TestPalette(unittest.TestCase):
    def test_the_approved_targets_are_inside_the_palette(self):
        for f in sorted(TARGETS.glob('target-*.png')):
            m = palette.measure(Image.open(f))
            self.assertEqual(palette.problems(m), [], f.name)

    def test_a_colour_the_palette_lacks_is_off_it(self):
        m = palette.measure(flat('#E040C0'))
        self.assertEqual(m['off'], 1.0)
        self.assertTrue(any('off the palette' in p for p in palette.problems(m)))

    def test_a_family_that_leans_one_way_drifts(self):
        # Moss pushed toward teal: still nearest moss, every pixel leaning the same way.
        m = palette.measure(flat('#2E6A5A'))
        self.assertIn('moss', m['families'])
        self.assertTrue(any(p.startswith('moss drifts') for p in palette.problems(m)), m)

    def test_the_palette_itself_holds(self):
        for name, hexes in palette.FAMILIES.items():
            for h in hexes:
                m = palette.measure(flat(h))
                self.assertEqual(palette.problems(m), [], (name, h))
                self.assertEqual(m['families'][name]['drift'], 0.0, (name, h))

    def test_only_opaque_pixels_count(self):
        im = flat('#E040C0', alpha=0)
        im.paste(flat('#4A3322', (100, 225)), (0, 0))
        m = palette.measure(im)
        self.assertEqual(list(m['families']), ['bark'])


class TestCheckScreen(unittest.TestCase):
    """A one-screen room: a sky plate, a far layer and a floor strip with a bench on it."""

    def setUp(self):
        self._cache = dict(preview._cache)
        self.addCleanup(self.restore)

    def restore(self):
        preview._cache.clear()
        preview._cache.update(self._cache)

    def room(self, sky='#0C1E36', far='#1B1A30', floor='#8F8068', far_amp=0.05, floor_amp=0.35):
        preview._cache.update({
            'kit-test-sky-a': textured(sky, (1600, 900), 0.05, seed=1),
            'kit-test-far-a': textured(far, (1600, 900), far_amp, alpha=255, seed=2),
            'kit-test-floor': textured(floor, (1600, 200), floor_amp, seed=3),
            'kit-test-bench': textured('#5C4632', (200, 100), floor_amp, seed=4),
        })
        cell = lambda layer, key, x, y, w, h: {'layer': layer, 'key': key, 'x': x, 'y': y, 'w': w, 'h': h, 'crop': {'x': 0, 'y': 0, 'w': w, 'h': h}, 'tile': None, 'flip': False, 'alpha': 1}
        return {
            'id': 'test', 'size': {'w': 1600, 'h': 900}, 'ground': 770, 'owlScale': 1, 'problems': [],
            'backgrounds': [{'key': 'kit-test-sky-a', 'x': 0, 'rate': 1}, {'key': 'kit-test-far-a', 'x': 0, 'rate': 1}],
            'foregrounds': [], 'perches': [], 'doors': [], 'spawns': {},
            'images': [cell('play', 'kit-test-floor', 0, 700, 1600, 200), cell('piece', 'kit-test-bench', 600, 600, 200, 100)],
        }

    def test_a_screen_painted_to_the_rules_passes(self):
        probs, nums = preview.check_screen(self.room(), 0, 0.5)
        self.assertEqual(probs, [], nums)

    def test_a_backdrop_that_competes_with_the_walkway_fails(self):
        probs, _ = preview.check_screen(self.room(far='#8F8068', far_amp=0.35, floor='#5C4632'), 0, 0.5)
        self.assertTrue(any('competes with the walkway' in p for p in probs), probs)
        self.assertTrue(any(p.startswith('backdrop:') for p in probs), probs)

    def test_a_walkway_too_dark_or_too_flat_fails(self):
        probs, _ = preview.check_screen(self.room(floor='#2B1C12', floor_amp=0.02), 0, 0.5)
        self.assertTrue(any('walkable layer: L mean' in p for p in probs), probs)
        self.assertTrue(any('walkable layer: contrast' in p for p in probs), probs)

    def test_a_backdrop_that_is_not_a_kit_layer_has_no_band(self):
        p = self.room()
        preview._cache['hub'] = preview._cache['kit-test-far-a']
        p['backgrounds'][1]['key'] = 'hub'
        probs, _ = preview.check_screen(p, 0, 0.5)
        self.assertTrue(any('no value band' in m for m in probs), probs)


class TestKitRooms(unittest.TestCase):
    def test_every_kit_room_passes_the_check(self):
        self.assertEqual(preview.check(None), 0)


if __name__ == '__main__':
    unittest.main()
