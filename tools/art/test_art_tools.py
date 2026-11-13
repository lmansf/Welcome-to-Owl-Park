"""Offline tests for the art post-processing tools (python3 -B -m unittest discover -s tools/art -p "test_*.py").

Every input is synthetic (artlib.synth): a keyed disc with an anti-aliased edge, spill, specks and
a hole; a three-key-colour owl master with a ground-truth label map; gradient rooms; frame-only and
deliberately bad overlays; a geometry fixture. No network, no git, no files outside a temp dir.
"""

from __future__ import annotations

import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import numpy as np  # noqa: E402
from PIL import Image, ImageDraw, ImageOps, PngImagePlugin  # noqa: E402

from artlib import (ALLOWED_CHUNKS, BUDGET_BYTES, FLIGHT_LAYERS, OWL_SPECIES, ArtError, flight_layers, flight_master, load_assets,  # noqa: E402
                    owl_layer_base, owl_master_of, parse_hex, species_layers)
from artlib import bands, forbidden, level, pngmeta, prov, webpmeta  # noqa: E402
from artlib.budget import BudgetError, encode_under_budget  # noqa: E402
from artlib.chroma import ChromaError, ChromaParams, clear_glow, key_out, solidify  # noqa: E402
from artlib import fields  # noqa: E402
from artlib.grade import grade, load_palette  # noqa: E402
from artlib.guide import render_guide, review_composite, room_of, tile_view  # noqa: E402
from artlib.labels import erode, fill_holes, label_components, remove_specks  # noqa: E402
from artlib.split import split as split_layer  # noqa: E402
from artlib.match import match_colours, solid_mask  # noqa: E402
from artlib.overlaycheck import check_overlay, clear_key_haze, clear_sign_boards, sign_board_rect  # noqa: E402
from artlib.resize import fit_contain, resize_exact  # noqa: E402
from artlib.synth import (TRUTH_ACCENT, TRUTH_BEAK, TRUTH_BELLY, TRUTH_BODY, TRUTH_EYES, fixture_geometry, synth_keyed_subject,  # noqa: E402
                          synth_overlay, synth_owl_master, synth_room)
from artlib import patch, sprites, wings  # noqa: E402
import owl_layers  # noqa: E402
import postprocess  # noqa: E402
import wing_layers  # noqa: E402


def dist_to_edge(truth: np.ndarray) -> np.ndarray:
    """Chebyshev distance of each pixel to the disc's soft edge, via repeated erosion (small images only)."""
    inside = truth >= 0.999
    outside = truth <= 0.001
    d = np.zeros(truth.shape, np.int32)
    cur_in, cur_out = inside.copy(), outside.copy()
    for i in range(1, 8):
        cur_in = erode(cur_in, 1)
        cur_out = erode(cur_out, 1)
        d[cur_in | cur_out] = i
    return d


class TestChroma(unittest.TestCase):
    def test_disc_matte_edge_and_cleanup(self):
        img, truth = synth_keyed_subject(300, 300, "#00FF00", colour=(200, 170, 140), specks=4, hole=True)
        out, info = key_out(img, ChromaParams(key="#00FF00"))
        a = np.asarray(out)
        alpha = a[..., 3] / 255.0
        deep = dist_to_edge(truth) >= 4
        self.assertTrue(np.all(alpha[(truth >= 0.999) & deep] == 1.0), "interior is fully opaque")
        self.assertTrue(np.all(alpha[(truth <= 0.001) & deep] == 0.0), "exterior is fully transparent (specks removed)")
        self.assertGreaterEqual(info["specks_removed"], 1)
        self.assertGreater(info["holes_filled_px"], 0)
        self.assertEqual(alpha[150, 151], 1.0, "the tiny hole is filled")
        ray = alpha[150, 150:]
        self.assertTrue(np.all(np.diff(ray) <= 0), "alpha falls monotonically along a ray through the edge")
        soft = (alpha > 0.2) & (alpha < 1.0)
        self.assertGreater(soft.sum(), 50)
        err = np.abs(a[..., :3][soft].astype(int) - np.array([200, 170, 140])).max(axis=1)
        self.assertLessEqual(err.max(), 24, "un-mixed edge colour is close to the subject colour")
        inner = (truth >= 0.999) & deep
        self.assertLessEqual(np.abs(a[..., :3][inner].astype(int) - np.array([200, 170, 140])).max(), 8)
        self.assertTrue(np.all(a[alpha == 0, :3] == 0), "transparent pixels have zeroed RGB")

    def test_despill_removes_spill_but_never_the_subjects_own_chroma(self):
        F = np.array([150, 200, 150])
        clean, truth = synth_keyed_subject(240, 240, "#00FF00", colour=tuple(int(v) for v in F), spill=0.0)
        out, _ = key_out(clean, ChromaParams(key="#00FF00", despill_band=8))
        a = np.asarray(out)
        band = (truth >= 0.999) & (dist_to_edge(truth) <= 2)
        inner = (truth >= 0.999) & (dist_to_edge(truth) >= 7)
        self.assertLessEqual(np.abs(a[..., :3][inner].astype(int) - F).max(), 2, "interior greens are untouched")
        self.assertLessEqual(np.abs(a[..., :3][band].astype(int) - F).max(), 3, "a greenish subject keeps its own green in the band when there is no spill")
        # Real spill (5 % of the key mixed into the outer 6 px of the rim) is removed down to the
        # subject's own chroma; the band must reach past the spill so the reference colour is clean.
        spilled, truth2 = synth_keyed_subject(240, 240, "#00FF00", colour=tuple(int(v) for v in F), spill=0.05)
        raw = np.asarray(spilled).astype(int)
        raw_excess = (raw[..., 1] - raw[..., 0])[band].mean()
        out2, info = key_out(spilled, ChromaParams(key="#00FF00", despill_band=8))
        a2 = np.asarray(out2).astype(int)
        g_excess = (a2[..., 1] - a2[..., 0])[band].mean()
        self.assertGreater(raw_excess, 55)
        self.assertLess(g_excess, raw_excess - 5, "the spill is reduced")
        self.assertAlmostEqual(g_excess, 50.0, delta=3.0, msg="...to the subject's own green excess, not below it")
        self.assertGreater(info["despilled_px"], 0)
        # The owl master's pure red body and pure blue accents on the magenta backdrop are left alone.
        for colour in ((255, 0, 0), (0, 0, 255)):
            img, truth3 = synth_keyed_subject(240, 240, "#FF00FF", colour=colour, spill=0.0)
            out3, _ = key_out(img, ChromaParams(key="#FF00FF", despill_band=6))
            a3 = np.asarray(out3)
            band3 = (truth3 >= 0.999) & (dist_to_edge(truth3) <= 2)
            self.assertTrue(np.all(a3[..., :3][band3] == np.array(colour)), f"pure {colour} on magenta is not dulled by the despill")

    def test_backdrop_estimation_tolerance(self):
        ok, _ = synth_keyed_subject(200, 200, "#00FF00", backdrop_shift=(30, -30, 20))
        _, info = key_out(ok, ChromaParams(key="#00FF00"))
        self.assertLess(info["backdrop_distance"], 60)
        # A uniform border of another shade of the key (the model painted its own green): keyed on as it is, with a warning.
        shade, truth = synth_keyed_subject(200, 200, "#00FF00", backdrop_shift=(80, -80, 80))
        with mock.patch("sys.stderr", new=io.StringIO()) as err:
            out, info2 = key_out(shade, ChromaParams(key="#00FF00"))
        self.assertEqual(info2["backdrop_override"], "#00FF00")
        self.assertEqual(info2["backdrop"], "#50AF50")
        self.assertIn("uniform other shade", err.getvalue())
        a = np.asarray(out)[..., 3]
        self.assertEqual(a[5, 5], 0, "the other-shade backdrop is keyed out")
        self.assertEqual(a[100, 100], 255)
        # A flat border that is not a shade of the key (the subject covers it) is refused with the right advice.
        brown = Image.new("RGB", (200, 200), (120, 80, 40))
        with self.assertRaises(ChromaError) as cm:
            key_out(brown, ChromaParams(key="#00FF00"))
        self.assertIn("--key-colour auto", str(cm.exception))
        self.assertIn("--trust-key only when the subject covers the border", str(cm.exception))
        # A varied border (gradient) is refused too; --trust-key then keys on the requested colour.
        g = np.zeros((200, 200, 3), np.uint8)
        g[..., 0] = np.linspace(0, 255, 200).astype(np.uint8)[None, :]
        g[..., 1] = 40
        g[..., 2] = np.linspace(0, 255, 200).astype(np.uint8)[:, None]
        varied = Image.fromarray(g, "RGB")
        with self.assertRaises(ChromaError):
            key_out(varied, ChromaParams(key="#00FF00"))
        _, info3 = key_out(varied, ChromaParams(key="#00FF00", trust_key=True))
        self.assertEqual(info3["backdrop"], "#00FF00")
        self.assertEqual(info3["backdrop_override"], "trust-key")

    def test_soft_patch_far_from_the_subject_is_never_forced_opaque(self):
        # A desaturated cast shadow on the magenta backdrop, well away from a red subject: the rim
        # refinement has no subject colour to project onto there and must leave the distance matte.
        img, truth = synth_keyed_subject(300, 300, "#FF00FF", colour=(255, 0, 0), radius_frac=0.25, spill=0.0)
        arr = np.asarray(img).copy()
        arr[250:290, 20:120] = (200, 60, 200)
        out, info = key_out(Image.fromarray(arr, "RGB"), ChromaParams(key="#FF00FF"))
        a = np.asarray(out)[..., 3]
        self.assertLess(int(a[252:288, 22:118].max()), 250, "the shadow patch stays soft")
        self.assertGreater(info.get("rim_unreached_px", 0), 0)
        self.assertEqual(a[150, 150], 255)
        self.assertTrue(np.all(a[(truth <= 0.001) & (dist_to_edge(truth) >= 4)][:0] == 0))

    def test_frame_elements_are_never_specks_and_dropped_detail_is_reported(self):
        img = synth_overlay(800, 450, "#00FF00", good=True)
        d = ImageDraw.Draw(img)
        d.rectangle((400, 0, 402, 60), fill=(92, 64, 40))  # a thin strand hanging from the top edge (183 px)
        d.rectangle((200, 300, 201, 301), fill=(92, 64, 40))  # an isolated 2x2 speck
        with mock.patch("sys.stderr", new=io.StringIO()):
            out, info = key_out(img, ChromaParams(key="#00FF00"))
        a = np.asarray(out)[..., 3]
        self.assertEqual(a[30, 401], 255, "a strand hanging from the frame edge is a frame element, never a speck")
        self.assertEqual(a[300, 200], 0, "an isolated 2x2 speck is still removed")
        self.assertGreaterEqual(info["specks_removed"], 1)
        # The threshold scales with the subject: with --min-area 0.02 of a 34 k px disc, a 400 px blob is a
        # speck, and because it is 200 px or more its area is listed in a warning.
        disc, _ = synth_keyed_subject(300, 300, "#00FF00")
        arr = np.asarray(disc).copy()
        arr[10:30, 10:30] = (200, 170, 140)
        with mock.patch("sys.stderr", new=io.StringIO()) as err:
            out2, info2 = key_out(Image.fromarray(arr, "RGB"), ChromaParams(key="#00FF00", min_area=0.02))
        self.assertEqual(np.asarray(out2)[20, 20, 3], 0)
        self.assertEqual(info2["specks_removed_large_px"], [400])
        self.assertIn("pass a smaller --min-area", err.getvalue())
        out3, info3 = key_out(Image.fromarray(arr, "RGB"), ChromaParams(key="#00FF00"))
        self.assertEqual(np.asarray(out3)[20, 20, 3], 255, "at the default threshold (0.2 % of the disc) a 400 px blob is detail")

    def test_a_solid_board_keeps_no_holes_and_no_see_through_paint(self):
        # A sign: a dark board with a chrome rim painted close to the green backdrop and a green
        # lamp on it. The matte holes the lamp and leaves the rim see-through; solidify fills both.
        img = Image.new("RGB", (200, 120), (0, 255, 0))
        d = ImageDraw.Draw(img)
        d.rounded_rectangle((20, 20, 180, 100), radius=18, fill=(55, 215, 75))
        d.rounded_rectangle((30, 30, 170, 90), radius=12, fill=(20, 20, 40))
        d.ellipse((140, 45, 160, 65), fill=(0, 255, 0))
        rgba, _ = key_out(img, ChromaParams(key="#00FF00"))
        a = np.asarray(rgba)[..., 3]
        self.assertLess(a[55, 150], 255, "the matte holes the green lamp")
        self.assertLess(a[25, 100], 255, "and leaves the green-tinted rim see-through")
        solid, info = solidify(rgba, img, 4)
        b = np.asarray(solid)
        self.assertEqual(b[55, 150, 3], 255)
        self.assertEqual(tuple(b[55, 150, :3]), (0, 255, 0), "the lamp keeps its painted colour")
        self.assertEqual(b[25, 100, 3], 255)
        self.assertEqual(tuple(b[25, 100, :3]), (55, 215, 75), "the rim keeps its painted colour")
        self.assertEqual(b[5, 5, 3], 0, "the backdrop stays clear")
        self.assertGreater(info["solid_px"], 0)
        self.assertTrue(((b[..., 3] > 0) & (b[..., 3] < 255)).sum() <= ((a > 0) & (a < 255)).sum())

    def test_subject_touching_the_frame_keeps_the_key(self):
        img = synth_overlay(640, 360, "#FF00FF", good=True)
        out, info = key_out(img, ChromaParams(key="#FF00FF"))
        self.assertEqual(info["backdrop"], "#FF00FF")
        a = np.asarray(out)[..., 3]
        self.assertEqual(a[180, 320], 0, "the open centre is transparent")
        self.assertEqual(a[300, 2], 255, "the post at the frame edge is opaque")


class TestLabels(unittest.TestCase):
    def test_components_specks_and_holes(self):
        m = np.zeros((60, 80), bool)
        m[10:40, 10:50] = True
        m[20:23, 20:23] = False  # a 9 px hole
        m[50:52, 70:72] = True  # a 4 px speck
        labels, n = label_components(m)
        self.assertEqual(n, 2)
        cleaned, dropped = remove_specks(m, 20)
        self.assertEqual(dropped, 1)
        filled, holes = fill_holes(cleaned, 64)
        self.assertEqual(int(holes.sum()), 9)
        self.assertTrue(filled[21, 21])


class TestWingSplit(unittest.TestCase):
    """Flight (OP-084): the owls' wing, split into its two tintable layers with its root at ROOT."""

    @classmethod
    def setUpClass(cls):
        # A right wing on magenta: red coverts from the root out to the right, blue flight feathers along their lower edge.
        im = Image.new("RGB", (1200, 800), (255, 0, 255))
        d = ImageDraw.Draw(im)
        for i in range(5):
            d.ellipse((500 + i * 100, 420 + i * 20, 1100, 520 + i * 20), fill=(0, 0, 255))
        d.ellipse((100, 250, 900, 550), fill=(255, 0, 0))
        cls.res = wing_layers.split_wing(im)

    def test_two_tintable_layers_at_1x_and_2x_the_root_on_root_and_the_tip_span_away(self):
        for tag, k in (("1x", 1), ("2x", 2)):
            for name in wing_layers.LAYER_NAMES:
                im = getattr(self.res, f"layers_{tag}")[name]
                self.assertEqual(im.mode, "LA", f"{name} {tag}")
                self.assertEqual(im.size, (wing_layers.WING_W * k, wing_layers.WING_H * k))
        body = np.asarray(self.res.layers_1x["owl-wing-body"].getchannel("A"))
        accent = np.asarray(self.res.layers_1x["owl-wing-accent"].getchannel("A"))
        rx, ry = wing_layers.ROOT
        self.assertGreater(int(body[ry, rx + 2]), 128, "the root is on the wing")
        self.assertGreater(int(accent.sum()), 0)
        self.assertTrue(((accent > 8) <= (body > 0)).all(), "the flight feathers lie on the wing, never past it")
        cols = np.nonzero((body >= 128).any(0))[0]
        self.assertAlmostEqual(int(cols.max()), rx + wing_layers.SPAN, delta=3)
        self.assertFalse((body[:, -1] > 0).any() or (body[0, :] > 0).any() or (body[-1, :] > 0).any(), "nothing on the canvas edge")

    def test_a_wing_that_cannot_fit_the_canvas_is_refused(self):
        im = Image.new("RGB", (800, 1200), (255, 0, 255))
        d = ImageDraw.Draw(im)
        d.ellipse((100, 100, 700, 1100), fill=(255, 0, 0))
        d.ellipse((400, 500, 700, 1100), fill=(0, 0, 255))
        with self.assertRaises(ArtError):
            wing_layers.split_wing(im)


class TestOwlSplit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.master, cls.truth = synth_owl_master(800, 960)
        cls.keys = owl_layers.load_keys()
        cls.res = owl_layers.split(cls.master, cls.keys)

    def labels(self):
        lm = np.asarray(self.res.label_map)
        lab = np.zeros(lm.shape[:2], np.int8)
        for l, c in owl_layers.LABEL_COLOURS.items():
            lab[(lm == c).all(-1)] = l
        return lab

    def test_regions_match_ground_truth(self):
        lab = self.labels()
        for l, truths in ((1, (TRUTH_BODY,)), (2, (TRUTH_BELLY,)), (3, (TRUTH_ACCENT,)), (4, (TRUTH_EYES, TRUTH_BEAK))):
            want = np.isin(self.truth, truths)
            got = lab == l
            self.assertLess(abs(got.sum() - want.sum()) / want.sum(), 0.03, f"label {l} pixel count within 3 %")
            self.assertGreater((got & want).sum() / want.sum(), 0.97, f"label {l} overlaps the truth")

    def test_face_holds_eyes_and_beak_only_and_pupils_stay_in_face(self):
        lab = self.labels()
        face = lab == 4
        truth_face = np.isin(self.truth, (TRUTH_EYES, TRUTH_BEAK))
        self.assertGreater((face & truth_face).sum() / truth_face.sum(), 0.98)
        self.assertLess((face & ~truth_face).sum() / face.sum(), 0.02, "face does not leak into the body")
        src = np.asarray(self.master)
        pupils = (src == 0).all(-1) & (self.truth == TRUTH_EYES)
        self.assertTrue(pupils.any())
        self.assertTrue(np.all(face[pupils]), "black pupils are face pixels (island rule)")

    def test_layers_luminance_modes_and_sizes(self):
        floor = int(round(self.keys["luminance_floor"] * 255))
        for layers, size in ((self.res.layers_1x, (200, 240)), (self.res.layers_2x, (400, 480))):
            for name in ("owl-body", "owl-belly", "owl-accent"):
                im = layers[name]
                self.assertEqual(im.mode, "LA")
                self.assertEqual(im.size, size)
                la = np.asarray(im)
                lit = la[..., 0][la[..., 1] == 255]
                self.assertEqual(lit.max(), 255, f"{name}: the lit base is white")
                self.assertGreaterEqual(lit.min(), floor - 1, f"{name}: shading never drops below the floor")
            for name in ("owl-face", "owl-blink"):
                self.assertEqual(layers[name].mode, "RGBA")
                self.assertEqual(layers[name].size, size)
        body = np.asarray(self.res.layers_1x["owl-body"])
        self.assertLess(body[..., 0][body[..., 1] == 255].min(), 200, "the darker lower third reads as shadow")

    def test_feet_registration(self):
        for layers, w, h in ((self.res.layers_1x, 200, 240), (self.res.layers_2x, 400, 480)):
            a = np.asarray(layers["owl-body"])[..., 1]
            self.assertTrue((a[h - 1] >= 128).any(), "the bottom opaque row is the last row")
            rows = np.nonzero((a >= 128).any(1))[0]
            feet = a[int(h - 0.06 * (rows[-1] - rows[0])):, :] >= 128
            xs = np.nonzero(feet)[1]
            self.assertAlmostEqual(xs.mean(), w / 2, delta=1.5, msg="feet centroid at the horizontal centre")
            self.assertGreaterEqual(rows[0], 0.05 * h, "head room above the owl")

    def test_blink_clears_eyes_and_keeps_beak(self):
        face = np.asarray(self.res.layers_1x["owl-face"])
        blink = np.asarray(self.res.layers_1x["owl-blink"])
        self.assertEqual(self.res.info["eyes_found"], 2)
        cream = (np.abs(face[..., :3].astype(int) - np.array([246, 241, 227])).max(-1) < 24) & (face[..., 3] > 128)
        self.assertGreater(cream.sum(), 50, "the face layer holds the cream eye rings")
        cream_blink = (np.abs(blink[..., :3].astype(int) - np.array([246, 241, 227])).max(-1) < 24) & (blink[..., 3] > 128)
        self.assertEqual(cream_blink.sum(), 0, "the blink layer has no eye-ring pixels")
        self.assertLess((blink[..., 3] > 128).sum(), (face[..., 3] > 128).sum() * 0.6, "the eyes are cleared")
        gold = (np.abs(blink[..., :3].astype(int) - np.array([201, 162, 39])).max(-1) < 30) & (blink[..., 3] > 128)
        self.assertGreater(gold.sum(), 10, "the beak survives the blink")
        navy = (np.abs(blink[..., :3].astype(int) - np.array([12, 30, 54])).max(-1) < 24) & (blink[..., 3] > 64)
        self.assertGreater(navy.sum(), 10, "lid strokes are drawn")

    def test_flip_mirrors_every_layer(self):
        res2 = owl_layers.split(self.master, self.keys, flip=True)
        for name in ("owl-body", "owl-belly", "owl-accent", "owl-face"):
            a1 = np.asarray(self.res.layers_1x[name]).astype(int)
            a2 = np.asarray(ImageOps.mirror(res2.layers_1x[name])).astype(int)
            best = min(np.abs(a1[:, 2:-2] - np.roll(a2, dx, axis=1)[:, 2:-2]).max() for dx in (-1, 0, 1))
            self.assertLessEqual(best, 1, f"{name} flips consistently (up to the 1 px registration rounding)")
        b1 = np.asarray(self.res.layers_1x["owl-blink"])[..., 3] > 128
        b2 = np.asarray(ImageOps.mirror(res2.layers_1x["owl-blink"]))[..., 3] > 128
        iou = max((b1 & np.roll(b2, dx, axis=1)).sum() / max(1, (b1 | np.roll(b2, dx, axis=1)).sum()) for dx in (-1, 0, 1))
        self.assertGreater(iou, 0.7, "blink mask flips consistently (lid strokes rasterize slightly differently)")

    def test_blink_from_edit_and_label_file(self):
        closed, _ = synth_owl_master(800, 960, eyes_closed=True)
        res = owl_layers.split(self.master, self.keys, blink_from=closed)
        self.assertEqual(res.info["blink"], "from edit")
        blink = np.asarray(res.layers_1x["owl-blink"])
        cream = (np.abs(blink[..., :3].astype(int) - np.array([246, 241, 227])).max(-1) < 24) & (blink[..., 3] > 128)
        self.assertEqual(cream.sum(), 0)
        res3 = owl_layers.split(self.master, self.keys, labels_img=self.res.label_map)
        self.assertEqual(res3.info.get("labels"), "from file")
        self.assertEqual(np.asarray(res3.layers_1x["owl-belly"]).tolist(), np.asarray(self.res.layers_1x["owl-belly"]).tolist())

    def test_a_beak_touching_the_eyes_does_not_hide_an_eye(self):
        master, truth = synth_owl_master(800, 960, beak_touching=True)
        res = owl_layers.split(master, self.keys)
        self.assertEqual(res.info["eyes_found"], 2)
        blink = np.asarray(res.layers_1x["owl-blink"])
        opaque = blink[..., 3] > 128
        cream = (np.abs(blink[..., :3].astype(int) - np.array([246, 241, 227])).max(-1) < 24) & opaque
        self.assertEqual(cream.sum(), 0, "both eyes are cleared in the blink frame")
        gold = (np.abs(blink[..., :3].astype(int) - np.array([201, 162, 39])).max(-1) < 24) & opaque
        self.assertGreater(gold[: blink.shape[0] // 2].sum(), 0, "the beak stays in the blink frame")

    def test_fixed_colour_feet_go_to_the_face_layer(self):
        master, truth = synth_owl_master(800, 960, feet_fixed=True)
        res = owl_layers.split(master, self.keys)
        lm = np.asarray(res.label_map)
        face = (lm == np.array(owl_layers.LABEL_COLOURS[4])).all(-1)
        feet = truth == 6
        self.assertGreater((face & feet).sum() / feet.sum(), 0.97, "gold feet are fixed-colour pixels")
        self.assertEqual(res.info["eyes_found"], 2, "the feet do not confuse eye detection")
        accent = (lm == np.array(owl_layers.LABEL_COLOURS[3])).all(-1)
        self.assertEqual((accent & feet).sum(), 0)

    def test_sidecar_regions_override_the_hue_table(self):
        self.assertEqual((self.keys["backdrop"], self.keys["regions"]["body"]["hue"], self.keys["regions"]["belly"]["hue"], self.keys["regions"]["accent"]["hue"]), ("#FF00FF", 0, 120, 240),
                         "owl-keys.json follows the generator's convention (magenta backdrop, red body, green belly, blue accent)")
        keys = postprocess.owl_keys_from_sidecar(self.keys, {"key_colour": "#00FF00", "regions": {"body": "#0000FF", "belly": "#FF00FF", "accent": "#FF0000"}})
        self.assertEqual(keys["backdrop"], "#00FF00")
        self.assertEqual(keys["regions"]["body"]["hue"], 240)
        self.assertEqual(keys["regions"]["belly"]["hue"], 300)
        self.assertEqual(keys["regions"]["accent"]["hue"], 0)
        self.assertEqual(self.keys["regions"]["body"]["hue"], 0, "the loaded table is not mutated")

    def test_asymmetric_silhouette_is_scaled_to_fit_and_never_clipped(self):
        master, _ = synth_owl_master(800, 960, wing_left=0.25)
        with mock.patch("sys.stderr", new=io.StringIO()) as err:
            res = owl_layers.split(master, self.keys)
        self.assertEqual(res.info["clipped_px"], 0, err.getvalue())
        self.assertLess(res.info["registration"]["scale_logical"], self.res.info["registration"]["scale_logical"], "the wide side of the feet-centred silhouette caps the scale")
        for layers, w, h in ((res.layers_1x, 200, 240), (res.layers_2x, 400, 480)):
            a = np.asarray(layers["owl-body"])[..., 1]
            self.assertEqual(int((a[:, 0] >= 128).sum()) + int((a[:, -1] >= 128).sum()), 0, "nothing opaque on the side edges")
            self.assertTrue((a[h - 1] >= 128).any())
            rows = np.nonzero((a >= 128).any(1))[0]
            feet = a[int(h - 0.06 * (rows[-1] - rows[0])):, :] >= 128
            xs = np.nonzero(feet)[1]
            self.assertAlmostEqual(xs.mean(), w / 2, delta=1.5, msg="the feet stay at the horizontal centre")
            cols = np.nonzero((a >= 128).any(0))[0]
            self.assertLess(cols[0], w / 2 - 95, "the wing reaches almost to the left edge without crossing it")

    def test_a_split_like_another_is_placed_and_shaded_as_it(self):
        # In flight (OP-136): the owl with its folded wing taken away, split like its master, is drawn
        # at the master's size and place, so what the two share comes out the same.
        folded, _ = synth_owl_master(800, 960, wing_left=0.25)
        wingless, _ = synth_owl_master(800, 960)
        with mock.patch("sys.stderr", new=io.StringIO()):
            base = owl_layers.split(folded, self.keys)
            alone = owl_layers.split(wingless, self.keys)
            like = owl_layers.split(wingless, self.keys, like=base.info)
        self.assertGreater(alone.info["registration"]["scale_logical"], base.info["registration"]["scale_logical"], "on its own the narrower owl is drawn bigger")
        reg, was = like.info["registration"], base.info["registration"]
        self.assertTrue(reg["like"])
        self.assertEqual((reg["exact"], reg["bottom"], reg["feet_x"]), (was["exact"], was["bottom"], was["feet_x"]))
        self.assertEqual(like.info["vref"], base.info["vref"])
        for tag, h in (("1x", 240), ("2x", 480)):
            for name in ("owl-belly", "owl-accent", "owl-face"):
                self.assertEqual(np.asarray(getattr(like, f"layers_{tag}")[name]).tolist(), np.asarray(getattr(base, f"layers_{tag}")[name]).tolist(), f"{name} {tag}")
            a, b = (np.asarray(getattr(r, f"layers_{tag}")["owl-body"]) for r in (like, base))
            rows = np.nonzero((a != b).any(axis=(1, 2)))[0]
            self.assertGreater(rows.min(), h // 2, f"the body at {tag} is the same down to the wing")
            self.assertLess(int((a[..., 1] > 0).sum()), int((b[..., 1] > 0).sum()), "and has no wing")

    def test_review_sheet_and_composite(self):
        sheet = owl_layers.review_sheet(self.res)
        self.assertEqual(sheet.mode, "RGB")
        comp = owl_layers.composite(self.res.layers_1x, ("#8B5A2B", "#F6F1E3", "#C9A227"))
        arr = np.asarray(comp)
        belly = np.asarray(self.res.layers_1x["owl-belly"])
        centre = (belly[..., 1] == 255) & (belly[..., 0] == 255)
        self.assertTrue(centre.any())
        self.assertTrue(np.all(arr[centre][:, :3] == np.array([246, 241, 227])), "white belly multiplied by the tint is exactly the tint")

    def test_a_stray_speck_on_the_backdrop_does_not_shrink_the_owl(self):
        arr = np.asarray(self.master.convert("RGB")).copy()
        arr[0:3, 0:3] = (255, 0, 0)  # body-red pixels in a corner of the backdrop
        res = owl_layers.split(Image.fromarray(arr), self.keys)
        self.assertGreaterEqual(res.info.get("specks_dropped", 0), 1)
        self.assertEqual(res.info["registration"], self.res.info["registration"], "the registration box ignores the speck")
        self.assertEqual(np.asarray(res.layers_1x["owl-body"]).tolist(), np.asarray(self.res.layers_1x["owl-body"]).tolist())

    def test_species_settings_override_only_what_they_name(self):
        keys = {**self.keys, "species": {"barn": {"min_val": 0.3}, "wide": {"face_rect": [0.1, 0.1, 0.8, 0.4]}, "tint": {"regions": {"accent": {"window": 14}}}}}
        barn = owl_layers.for_species(keys, "barn")
        self.assertEqual((barn["min_val"], barn["face_rect"]), (0.3, keys["face_rect"]))
        wide = owl_layers.for_species(keys, "wide")
        self.assertEqual(wide["fixed_rects"][0], [0.1, 0.1, 0.8, 0.4], "the head rect of fixed_rects follows face_rect")
        self.assertEqual(wide["fixed_rects"][1:], keys["fixed_rects"][1:])
        tint = owl_layers.for_species(keys, "tint")
        self.assertEqual(tint["regions"]["accent"], {"hue": 240, "window": 14})
        self.assertEqual(keys["regions"]["accent"]["window"], 24, "the table is not mutated")
        self.assertIs(owl_layers.for_species(keys, None), keys)
        self.assertIs(owl_layers.for_species(keys, "nobody"), keys)
        self.assertEqual(sorted(owl_layers.load_keys()["species"]), sorted(OWL_SPECIES), "owl-keys.json has settings for every species")


class TestBudget(unittest.TestCase):
    def noisy(self, w=400, h=300, seed=1):
        rng = np.random.default_rng(seed)
        return Image.fromarray(rng.integers(0, 256, (h, w, 3), dtype=np.uint8), "RGB")

    def test_truecolour_when_it_fits(self):
        data, info = encode_under_budget(Image.new("RGB", (64, 64), (10, 20, 30)), BUDGET_BYTES)
        self.assertIsNone(info["colors"])
        self.assertEqual(info["mode"], "RGB")
        self.assertEqual(pngmeta.png_size(data), (64, 64))

    def test_ladder_descends_and_raises(self):
        img = self.noisy()
        full = len(pngmeta.encode(img))
        data, info = encode_under_budget(img, int(full * 0.7))
        self.assertEqual(info["mode"], "P")
        self.assertIn(info["colors"], (256, 192, 160, 128, 96, 64))
        self.assertLessEqual(len(data), int(full * 0.7))
        with self.assertRaises(BudgetError):
            encode_under_budget(img, 500)
        data2, info2 = encode_under_budget(img, 500, relaxed=10_000_000)
        self.assertTrue(info2["budget_relaxed"])
        self.assertTrue(set(pngmeta.chunk_types(data2)) <= ALLOWED_CHUNKS)

    def test_la_bypass_and_rgba(self):
        la = Image.new("LA", (200, 240), (200, 255))
        data, info = encode_under_budget(la, BUDGET_BYTES)
        self.assertEqual(info["mode"], "LA")
        self.assertIsNone(info["colors"])
        rgba = self.noisy(200, 200).convert("RGBA")
        rgba.putalpha(Image.new("L", (200, 200), 128))
        full = len(pngmeta.encode(rgba))
        data, info = encode_under_budget(rgba, int(full * 0.7))
        self.assertEqual(info["mode"], "P")
        back = Image.open(io.BytesIO(data)).convert("RGBA")
        self.assertEqual(np.asarray(back)[..., 3].max(), 128, "alpha survives palette quantization")

    def test_dither_modes_change_bytes(self):
        img = resize_exact(synth_room(800, 450, 2, "grove"), 800, 450)
        full = len(pngmeta.encode(img))
        d0, i0 = encode_under_budget(img, int(full * 0.6), dither="none")
        d1, i1 = encode_under_budget(img, int(full * 0.6), dither="ordered")
        self.assertNotEqual(d0, d1)
        self.assertGreater(len(d1), len(d0) * 0.5)
        d2, i2 = encode_under_budget(img, 10_000_000, dither="fs")
        self.assertIsNone(i2["colors"], "fs is only used once the ladder quantizes")


class TestResize(unittest.TestCase):
    def test_room_sizes(self):
        for size in ((3200, 1800), (2500, 1700), (4000, 1500)):
            src = Image.new("RGB", size, (1, 2, 3))
            self.assertEqual(resize_exact(src, 1600, 900).size, (1600, 900))
            self.assertEqual(resize_exact(src, 3200, 1800).size, (3200, 1800))
        tall = Image.fromarray(np.tile(np.linspace(0, 255, 1000).astype(np.uint8)[:, None, None], (1, 1600, 3)), "RGB")
        top = np.asarray(resize_exact(tall, 1600, 900, "top"))[0, 0, 0]
        bottom = np.asarray(resize_exact(tall, 1600, 900, "bottom"))[0, 0, 0]
        self.assertLess(top, bottom, "the crop anchor moves the window")

    def test_piece_fit_lands_bottom_centre(self):
        img, _ = synth_keyed_subject(300, 300, "#FF00FF", radius_frac=0.3)
        rgba, _ = key_out(img, ChromaParams(key="#FF00FF"))
        canvas, info = fit_contain(rgba, 720, 820, margin=0.02)
        a = np.asarray(canvas)[..., 3]
        rows = np.nonzero((a > 0).any(1))[0]
        cols = np.nonzero((a > 0).any(0))[0]
        self.assertEqual(rows[-1], 819)
        self.assertAlmostEqual((cols[0] + cols[-1]) / 2, 359.5, delta=1.5)
        self.assertGreaterEqual(cols[0], 14)
        self.assertLessEqual(cols[-1], 705)

    def test_a_glow_painted_over_the_key_is_cleared_inside_its_box_only(self):
        green = (5, 240, 67)
        src = np.zeros((100, 200, 3), np.uint8)
        src[:] = green
        src[40:60, 40:60] = (230, 180, 60)    # a gold lantern
        src[30:70, 30:40] = (150, 255, 90)    # its light on the green, beside it
        src[40:60, 140:160] = (150, 255, 90)  # the same colour outside the box
        src[80:90, 40:60] = (30, 40, 90)      # a navy pennant inside the box
        out, n = clear_glow(Image.fromarray(src, "RGB"), [(20, 20, 100, 95)], "#05F043")
        a = np.asarray(out)
        self.assertEqual(n, 40 * 10)
        self.assertEqual(tuple(a[50, 35]), green, "the light inside the box becomes backdrop")
        self.assertEqual(tuple(a[50, 50]), (230, 180, 60), "the lantern stays")
        self.assertEqual(tuple(a[85, 50]), (30, 40, 90), "navy never leans green")
        self.assertEqual(tuple(a[50, 150]), (150, 255, 90), "outside the box nothing changes")
        rgba, _ = key_out(out, ChromaParams(key="#00FF00"))
        self.assertEqual(np.asarray(rgba)[50, 35, 3], 0, "the cleared light keys out")
        with self.assertRaises(ArtError):
            clear_glow(Image.fromarray(src, "RGB"), [(50, 20, 40, 95)], "#05F043")
        with self.assertRaises(ArtError):
            clear_glow(Image.fromarray(src, "RGB"), [(20, 20, 100, 95)], "#FFFFFF")

    def test_piece_fit_can_centre_vertically_for_items_worn_at_a_point(self):
        img, _ = synth_keyed_subject(300, 300, "#FF00FF", radius_frac=0.3)
        rgba, _ = key_out(img, ChromaParams(key="#FF00FF"))
        canvas, info = fit_contain(rgba, 240, 120, margin=0.04, valign="centre")
        a = np.asarray(canvas)[..., 3]
        rows = np.nonzero((a > 0).any(1))[0]
        self.assertAlmostEqual((rows[0] + rows[-1]) / 2, 59.5, delta=1.5, msg="centred on the canvas' middle row")
        self.assertGreaterEqual(rows[0], 4)
        self.assertEqual(info["valign"], "centre")
        top_canvas, _ = fit_contain(rgba, 260, 160, margin=0.04, valign="top")
        trows = np.nonzero((np.asarray(top_canvas)[..., 3] > 0).any(1))[0]
        self.assertAlmostEqual(trows[0], round(160 * 0.04), delta=1, msg="neckwear hangs from the canvas top")
        with self.assertRaises(ArtError):
            fit_contain(rgba, 240, 120, valign="middle")

    def test_no_dark_fringe_after_downsampling(self):
        disc = Image.new("RGBA", (400, 400), (0, 0, 0, 0))
        ImageDraw.Draw(disc).ellipse((50, 50, 350, 350), fill=(255, 255, 255, 255))
        small = np.asarray(disc.resize((100, 100), Image.Resampling.LANCZOS))
        edge = (small[..., 3] > 0) & (small[..., 3] < 255)
        self.assertGreater(edge.sum(), 100)
        self.assertEqual(small[..., :3][edge].min(), 255)


class TestGrade(unittest.TestCase):
    def test_deterministic_anchors_alpha_and_identity(self):
        pal, sha = load_palette("market")
        self.assertTrue(sha.startswith("sha256:"))
        room = synth_room(320, 180, 4, "market")
        g1, g2 = grade(room, pal, 0.5), grade(room, pal, 0.5)
        self.assertEqual(g1.tobytes(), g2.tobytes())
        self.assertNotEqual(g1.tobytes(), room.tobytes())
        self.assertEqual(grade(room, pal, 0.0).tobytes(), room.tobytes())
        hub, _ = load_palette("hub")
        pal2 = dict(hub, chroma_boost=1.0)  # hub: black and white are the darkest and brightest anchors
        cols = [parse_hex(c) for c in pal2["anchors"]] + [parse_hex(pal2["black"])] * 40 + [parse_hex(pal2["white"])] * 40
        strip = Image.fromarray(np.repeat(np.array(cols, np.uint8)[None, :, :], 8, axis=0), "RGB")
        out = np.asarray(grade(strip, pal2, 1.0))[0, : len(pal2["anchors"])].astype(int)
        self.assertLessEqual(np.abs(out - np.array(cols[: len(pal2["anchors"])])).max(), 2, "anchors are fixed points")
        rgba = room.convert("RGBA")
        rgba.putalpha(Image.fromarray((np.indices((180, 320)).sum(0) % 256).astype(np.uint8)))
        self.assertTrue(np.array_equal(np.asarray(grade(rgba, pal, 0.7))[..., 3], np.asarray(rgba)[..., 3]))


class TestFieldGuides(unittest.TestCase):
    def test_each_guide_is_the_field_at_2x_drawn_from_the_games_geometry(self):
        for game in fields.GAMES:
            img = fields.render_field_guide(game)
            self.assertEqual(img.size, (960, 1280), game)
            self.assertEqual(img.tobytes(), fields.render_field_guide(game).tobytes(), f"{game}: deterministic")
        with self.assertRaises(ValueError):
            fields.render_field_guide("pinball")
        hop = np.asarray(fields.render_field_guide("hop"))
        # Every lane's middle is road and both kerb rows are pavement (x = 100 is clear of the crosswalk).
        for row in range(1, fields.HOP_LANES + 1):
            self.assertEqual(tuple(hop[2 * fields.hop_row_y(row), 100]), fields.ROAD, f"lane {row}")
        for row in (0, fields.HOP_LANES + 1):
            self.assertEqual(tuple(hop[2 * fields.hop_row_y(row), 100]), fields.PAVEMENT, f"kerb row {row}")
        column = {tuple(px) for px in hop[2 * 140:2 * 540, 2 * fields.HOP_X]}
        self.assertIn(fields.CROSSWALK, column, "the crosswalk is where the owl crosses")
        self.assertNotIn(fields.CROSSWALK, {tuple(px) for px in hop[:, 100]})
        flap = np.asarray(fields.render_field_guide("flap"))
        x, y, _ = fields.FLAP_MOON
        self.assertEqual(tuple(flap[2 * y, 2 * x]), fields.MOON)
        self.assertEqual(tuple(flap[2 * fields.FLAP_GROUND_Y + 10, 100]), fields.GROUND)
        self.assertEqual(tuple(flap[600, 100]), fields.SKY, "open sky where the branches stand")
        knock = np.asarray(fields.render_field_guide("knock"))
        self.assertEqual(tuple(knock[2 * fields.KNOCK_GROUND_Y + 20, 900]), fields.GROUND)
        self.assertEqual(tuple(knock[600, 800]), fields.SKY, "open sky where the stacks stand")

    def test_the_field_command_writes_the_generators_canvases(self):
        with tempfile.TemporaryDirectory() as td:
            out = io.StringIO()
            with mock.patch("sys.stdout", out):
                rc = postprocess.main(["field", "hop", "--work", td])
            self.assertEqual(rc, 0)
            self.assertEqual(Image.open(Path(td) / "canvas" / "arcade-hop-bg.png").size, (960, 1280))
            with mock.patch("sys.stderr", io.StringIO()):
                self.assertEqual(postprocess.main(["field", "pinball", "--work", td]), 1)


class TestShift(unittest.TestCase):
    """A tree playfield whose painted floor sits above the shared ground line is moved down (OP-162)."""

    def test_shift_down_drops_the_bottom_rows_and_fills_the_top(self):
        img = Image.new("RGB", (4, 10))
        for y in range(10):
            ImageDraw.Draw(img).line((0, y, 3, y), fill=(y * 20, 0, 0))
        out = np.asarray(postprocess.shift_down(img, 3))
        self.assertEqual([int(out[y, 0][0]) for y in range(3)], [60, 40, 20], "the gap mirrors rows 1 to 3")
        self.assertEqual([int(out[y, 0][0]) for y in range(3, 10)], [y * 20 for y in range(7)])
        with self.assertRaises(ArtError):
            postprocess.shift_down(img, 10)

    def test_shift_down_from_a_row_moves_only_the_band_below_it(self):
        img = Image.new("RGB", (4, 12))
        for y in range(12):
            ImageDraw.Draw(img).line((0, y, 3, y), fill=(y * 20, 0, 0))
        out = np.asarray(postprocess.shift_down(img, 3, top=6))
        self.assertEqual([int(out[y, 0][0]) for y in range(6)], [y * 20 for y in range(6)], "the rows above the band stay")
        self.assertEqual([int(out[y, 0][0]) for y in range(6, 9)], [100, 80, 60], "the gap mirrors the three rows above the band")
        self.assertEqual([int(out[y, 0][0]) for y in range(9, 12)], [120, 140, 160], "the band starts three rows lower")
        with self.assertRaises(ArtError):
            postprocess.shift_down(img, 3, top=2)  # too few rows above the band to mirror

    def test_the_shift_command_lowers_an_overlays_bottom_band(self):
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td) / "fg.png"
            base = Image.new("RGB", (2048, 1152), (250, 3, 248))
            ImageDraw.Draw(base).rectangle((0, 0, 300, 200), fill=(20, 40, 30))  # leaves in the top corner
            ImageDraw.Draw(base).rectangle((900, 930, 1100, 1151), fill=(20, 40, 30))  # leaves rising over the walkway
            base.save(raw)
            out = io.StringIO()
            with mock.patch("sys.stdout", out), mock.patch("sys.stderr", io.StringIO()):
                rc = postprocess.main(["shift", "tree-l3-0-fg", "--dy", "60", "--from-y", "600", "--raw", str(raw), "--work", td, "--now", "2026-11-02T03:00:00Z"])
            self.assertEqual(rc, 0, out.getvalue())
            made = list((Path(td) / "raw" / "tree-l3-0-fg").glob("*.png"))
            sc = json.loads(made[0].with_suffix(".json").read_text())
            self.assertEqual(sc["shifted"], {"base": "fg.png", "dy_room": 60, "dy_px": 77, "fill": "mirror", "from_y_room": 600, "from_y_px": 768})
            px = np.asarray(Image.open(made[0]).convert("RGB"))
            self.assertEqual(tuple(int(c) for c in px[100, 100]), (20, 40, 30), "the top corner's leaves stay")
            self.assertEqual(tuple(int(c) for c in px[1000, 1000]), (250, 3, 248), "the leaves no longer reach the walkway's top")
            self.assertEqual(tuple(int(c) for c in px[1010, 1000]), (20, 40, 30), "they start 77 px lower")
            self.assertEqual(tuple(int(c) for c in px[800, 1000]), (250, 3, 248), "the gap is the painting's own key colour")

    def test_the_shift_command_writes_a_new_candidate_with_its_record(self):
        with tempfile.TemporaryDirectory() as td:
            raw = Path(td) / "base.png"
            base = Image.new("RGB", (2048, 1152), (248, 2, 200))  # a generated "flat" magenta, never quite #FF00FF
            ImageDraw.Draw(base).rectangle((100, 900, 2047, 1151), fill=(90, 60, 40))  # the floor and the earth under it
            ImageDraw.Draw(base).rectangle((40, 0, 60, 400), fill=(30, 50, 30))  # a stalk running out of the top
            base.save(raw)
            out = io.StringIO()
            with mock.patch("sys.stdout", out), mock.patch("sys.stderr", io.StringIO()):
                rc = postprocess.main(["shift", "tree-l1-w1-play", "--dy", "125", "--raw", str(raw), "--work", td, "--now", "2026-11-01T03:00:00Z"])
            self.assertEqual(rc, 0, out.getvalue())
            made = list((Path(td) / "raw" / "tree-l1-w1-play").glob("*.png"))
            self.assertEqual(len(made), 1)
            sc = json.loads(made[0].with_suffix(".json").read_text())
            self.assertEqual(sc["shifted"], {"base": "base.png", "dy_room": 125, "dy_px": 160, "fill": "mirror"})
            self.assertEqual(sc["now_source"], "shift")
            px = np.asarray(Image.open(made[0]).convert("RGB"))
            self.assertEqual(tuple(int(c) for c in px[1059, 500]), (248, 2, 200), "the floor's old top is sky now")
            self.assertEqual(tuple(int(c) for c in px[1060, 500]), (90, 60, 40), "the floor starts 160 px lower")
            self.assertEqual(tuple(int(c) for c in px[10, 500]), (248, 2, 200), "the top continues the painting's own sky")
            self.assertEqual(tuple(int(c) for c in px[0, 50]), (30, 50, 30), "the stalk still runs out of the top")
            self.assertEqual(tuple(int(c) for c in px[0, 70]), (248, 2, 200), "and stays as wide as it was")
            with mock.patch("sys.stdout", io.StringIO()), mock.patch("sys.stderr", io.StringIO()):
                self.assertEqual(postprocess.main(["shift", "tree-l1-w1-play", "--dy", "300", "--raw", str(raw), "--work", td]), 1, "more than a quarter of the height is refused")


class TestSplit(unittest.TestCase):
    """A tree screen's platforms and front props are cut out of its painting by a colour-coded edit of it (OP-173, OP-159)."""

    @staticmethod
    def scene_and_map():
        sky, bark, plank, post = (248, 2, 200), (60, 40, 28), (150, 110, 70), (20, 20, 24)
        scene = Image.new("RGB", (400, 240), sky)
        d = ImageDraw.Draw(scene)
        d.rectangle((150, 0, 250, 239), fill=bark)  # the trunk, behind
        d.rectangle((0, 200, 399, 239), fill=plank)  # the walkway and what is under it
        d.rectangle((260, 120, 330, 132), fill=plank)  # a ledge
        d.rectangle((60, 120, 66, 199), fill=post)  # a lantern post in front of the walkway
        # The model's map: the same picture redrawn a pixel off, the walkway and ledge green (shaded), the post blue,
        # and a stray green fleck in the sky that is not a platform.
        code = scene.copy()
        c = ImageDraw.Draw(code)
        c.rectangle((1, 201, 399, 239), fill=(30, 230, 40))
        c.rectangle((261, 121, 331, 133), fill=(10, 250, 10))
        c.rectangle((61, 121, 67, 199), fill=(15, 15, 240))
        c.rectangle((20, 20, 26, 26), fill=(0, 255, 0))
        return scene, code

    def test_split_keeps_the_paintings_own_pixels_where_the_map_is_coded(self):
        scene, code = self.scene_and_map()
        out, rep = split_layer(scene, code, (0, 255, 0), (255, 0, 255), min_area=100, grow=2)
        a, s = np.asarray(out), np.asarray(scene)
        self.assertEqual(tuple(int(v) for v in a[220, 200]), tuple(int(v) for v in s[220, 200]), "the walkway is the painting's own")
        self.assertEqual(tuple(int(v) for v in a[126, 300]), tuple(int(v) for v in s[126, 300]), "so is the ledge")
        self.assertEqual(tuple(int(v) for v in a[200, 0]), tuple(int(v) for v in s[200, 0]), "grown past the map's pixel-off outline, the top edge is kept")
        self.assertEqual(tuple(int(v) for v in a[60, 200]), (255, 0, 255), "the trunk behind is not a platform")
        self.assertEqual(tuple(int(v) for v in a[23, 23]), (255, 0, 255), "a stray fleck of green is dropped")
        self.assertEqual(rep["parts"], 2)
        self.assertEqual(rep["specks_dropped"], 1)
        front, rep = split_layer(scene, code, (0, 0, 255), (255, 0, 255), min_area=100, grow=2)
        f = np.asarray(front)
        self.assertEqual(tuple(int(v) for v in f[160, 63]), (20, 20, 24), "the post is cut out")
        self.assertEqual(tuple(int(v) for v in f[220, 200]), (255, 0, 255), "and nothing else")
        with self.assertRaises(ValueError):
            split_layer(scene, scene, (0, 255, 0), (255, 0, 255))

    def test_the_split_command_writes_a_keyed_candidate_with_its_record(self):
        scene, code = self.scene_and_map()
        with tempfile.TemporaryDirectory() as td:
            base, mp = Path(td) / "scene.png", Path(td) / "codes.png"
            scene.resize((2048, 1152), Image.Resampling.NEAREST).save(base)
            code.resize((2048, 1152), Image.Resampling.NEAREST).save(mp)
            out = io.StringIO()
            with mock.patch("sys.stdout", out), mock.patch("sys.stderr", io.StringIO()):
                rc = postprocess.main(["split", "tree-l4-0-play", "--base-key", "tree-l4-0-back", "--base", str(base), "--map-key", "tree-l4-0-scene",
                                       "--map", str(mp), "--colour", "#00FF00", "--min-area", "1500", "--work", td, "--now", "2026-11-02T01:00:00Z"])
            self.assertEqual(rc, 0, out.getvalue())
            made = list((Path(td) / "raw" / "tree-l4-0-play").glob("*.png"))
            self.assertEqual(len(made), 1)
            sc = json.loads(made[0].with_suffix(".json").read_text())
            self.assertEqual(sc["now_source"], "split")
            self.assertEqual(sc["key_colour"], "#FF00FF")
            self.assertEqual((sc["split"]["base"]["file"], sc["split"]["map"]["file"], sc["split"]["parts"]), ("scene.png", "codes.png", 2))
            px = np.asarray(Image.open(made[0]).convert("RGB"))
            self.assertEqual(tuple(int(v) for v in px[1100, 1000]), (150, 110, 70), "the walkway, at the full size")
            self.assertEqual(tuple(int(v) for v in px[300, 1000]), (255, 0, 255))
            # The right screen of a row of two, mended at their join: --box takes it out of the row first.
            row = Path(td) / "row.png"
            r = Image.new("RGB", (4096, 1152), (255, 0, 255))
            r.paste(Image.open(base), (2048, 0))
            r.save(row)
            with mock.patch("sys.stdout", io.StringIO()), mock.patch("sys.stderr", io.StringIO()):
                rc = postprocess.main(["split", "tree-l4-e1-play", "--base-key", "tree-l4-0-back", "--base", str(row), "--box", "2048,0,4096,1152",
                                       "--map-key", "tree-l4-0-scene", "--map", str(mp), "--colour", "#00FF00", "--min-area", "1500", "--work", td])
            self.assertEqual(rc, 0)
            made = list((Path(td) / "raw" / "tree-l4-e1-play").glob("*.png"))
            sc = json.loads(made[0].with_suffix(".json").read_text())
            self.assertEqual(sc["split"]["box"], [2048, 0, 4096, 1152])
            self.assertEqual(tuple(int(v) for v in np.asarray(Image.open(made[0]).convert("RGB"))[1100, 1000]), (150, 110, 70), "the walkway of the right screen")
            with mock.patch("sys.stdout", io.StringIO()), mock.patch("sys.stderr", io.StringIO()):
                self.assertEqual(postprocess.main(["split", "tree-l4-0-bg", "--base-key", "tree-l4-0-back", "--base", str(base), "--map-key", "tree-l4-0-scene",
                                                   "--map", str(mp), "--colour", "#00FF00", "--work", td]), 1, "the sky plate has no key colour to cut onto")



class TestMatch(unittest.TestCase):
    """One screen's keyed layer is matched to its neighbour's colours (OP-159)."""

    @staticmethod
    def overlay(fill):
        img = Image.new("RGB", (200, 120), (255, 0, 255))
        d = ImageDraw.Draw(img)
        d.ellipse((10, 10, 90, 70), fill=fill)
        d.rectangle((120, 20, 180, 40), fill=tuple(min(255, v + 30) for v in fill))
        return img

    def test_match_moves_the_props_to_the_references_colours_and_keeps_the_key(self):
        pale, dark = self.overlay((150, 150, 175)), self.overlay((20, 26, 48))
        out, rep = match_colours(pale, dark, (255, 0, 255))
        a, d = np.asarray(out).astype(float), np.asarray(dark).astype(float)
        props = solid_mask(np.asarray(pale), (255, 0, 255))
        want = d[solid_mask(np.asarray(dark), (255, 0, 255))].mean(axis=0)
        self.assertTrue(np.allclose(a[props].mean(axis=0), want, atol=1.0), "the props take the reference's colours")
        self.assertEqual(tuple(int(v) for v in np.asarray(out)[5, 195]), (255, 0, 255), "the key colour is left as it is")
        self.assertEqual(rep["matched_px"], int(props.sum()))

    def test_the_match_command_writes_a_candidate_with_its_record(self):
        with tempfile.TemporaryDirectory() as td:
            src, ref = Path(td) / "pale.png", Path(td) / "dark.png"
            self.overlay((150, 150, 175)).save(src)
            self.overlay((20, 26, 48)).save(ref)
            with mock.patch("sys.stdout", io.StringIO()), mock.patch("sys.stderr", io.StringIO()):
                rc = postprocess.main(["match", "tree-l4-e1-fg", "--to-key", "tree-l4-0-fg", "--raw", str(src), "--to", str(ref), "--work", td])
            self.assertEqual(rc, 0)
            made = list((Path(td) / "raw" / "tree-l4-e1-fg").glob("*.png"))
            self.assertEqual(len(made), 1)
            sc = json.loads(made[0].with_suffix(".json").read_text())
            self.assertEqual(sc["now_source"], "match")
            self.assertEqual(sc["matched"]["base"], "pale.png")
            self.assertEqual(sc["matched"]["to"]["key"], "tree-l4-0-fg")
            with mock.patch("sys.stdout", io.StringIO()), mock.patch("sys.stderr", io.StringIO()):
                self.assertEqual(postprocess.main(["match", "tree-l4-0-bg", "--to-key", "tree-l4-0-fg", "--raw", str(src), "--to", str(ref), "--work", td]), 1,
                                 "the sky plate has no key colour to keep")

class TestKeyScreen(unittest.TestCase):
    """A row of screens laid side by side is keyed one screen at a time (OP-162)."""

    def test_each_screen_of_a_row_is_keyed_on_its_own_shade_of_the_key(self):
        # Two screens painted apart: a dark magenta sky (as generated) and a light one, each with a post.
        row = Image.new("RGB", (640, 180), (205, 40, 170))
        ImageDraw.Draw(row).rectangle((320, 0, 639, 179), fill=(255, 40, 255))
        for x in (140, 460):
            ImageDraw.Draw(row).rectangle((x, 60, x + 40, 179), fill=(70, 50, 30))
        params = ChromaParams(key="#FF00FF")
        for crop, post in (("0,0.5", 140), ("1,0.5", 140)):
            with mock.patch("sys.stderr", io.StringIO()):
                rgba, _ = postprocess.key_screen(row, 1600, 900, crop, 0, params)
            a = np.asarray(rgba.getchannel("A"))
            self.assertEqual(rgba.size, (320, 180))
            self.assertEqual(int(a[10:50, :].max()), 0, f"{crop}: the sky keys out whole")
            self.assertEqual(int(a[80:170, post + 5:post + 35].min()), 255, f"{crop}: the post stays")
        # Keyed as one row, the light screen's backdrop wins and the dark screen's sky stays mostly opaque.
        with mock.patch("sys.stderr", io.StringIO()):
            whole, _ = key_out(row, params)
        self.assertGreater(int(np.asarray(whole.getchannel("A"))[10:50, :320].mean()), 128)


class TestClearPolygon(unittest.TestCase):
    """An overlay's prop cut by the frame is cleared by hand (OP-162)."""

    def test_the_polygon_turns_clear_and_the_rest_stays(self):
        img = Image.new("RGBA", (200, 100), (30, 40, 60, 255))
        out, n = postprocess.clear_polygon(img, "0,0,100,0,0,80")
        a = np.asarray(out.getchannel("A"))
        self.assertEqual(int(a[10, 10]), 0, "inside")
        self.assertEqual(int(a[90, 150]), 255, "outside")
        self.assertTrue(0 < int(a[40, 50]) < 255, "feathered along the edge")
        self.assertEqual(out.getpixel((150, 90))[:3], (30, 40, 60))
        self.assertGreater(n, 3000)
        two, _ = postprocess.clear_polygon(img.resize((400, 200)), "0,0,100,0,0,80", scale=2)
        self.assertEqual(int(np.asarray(two.getchannel("A"))[20, 20]), 0, "scaled for the 2x final")
        with self.assertRaises(ArtError):
            postprocess.clear_polygon(img, "0,0,10,10")


class TestSnapAlpha(unittest.TestCase):
    """The tree's WebP layers drop the faint alpha Lanczos rings around every edge (OP-162)."""

    def test_alpha_within_the_margin_of_clear_or_opaque_snaps_and_the_colour_stays(self):
        img = Image.new("RGBA", (8, 1))
        for x, a in enumerate((0, 1, 4, 5, 250, 251, 254, 255)):
            img.putpixel((x, 0), (10 * x, 20, 30, a))
        out, n = postprocess.snap_alpha(img)
        self.assertEqual([out.getpixel((x, 0))[3] for x in range(8)], [0, 0, 0, 5, 250, 255, 255, 255])
        self.assertEqual([out.getpixel((x, 0))[:3] for x in range(8)], [img.getpixel((x, 0))[:3] for x in range(8)])
        self.assertEqual(n, 4)
        same, none = postprocess.snap_alpha(out)
        self.assertEqual((none, same.tobytes()), (0, out.tobytes()), "nothing left to snap")


class TestGuideOverlay(unittest.TestCase):
    def test_guide_renders_from_the_fixture(self):
        geom = fixture_geometry()
        img = render_guide(geom, "hub")
        self.assertEqual(img.size, (1600, 900))
        arr = np.asarray(img)
        self.assertEqual(tuple(arr[100, 800]), parse_hex("#0C1E36"), "sky is navy")
        self.assertEqual(tuple(arr[800, 800]), (107, 107, 107), "ground plane is mid grey")
        comp = review_composite(img, geom, "hub", 0.4)
        self.assertEqual(comp.size, (1600, 900))

    def test_overlay_rules(self):
        geom = fixture_geometry()
        good, _ = key_out(synth_overlay(1600, 900, "#FF00FF", good=True), ChromaParams(key="#FF00FF"))
        rep = check_overlay(good, geom, "hub")
        self.assertTrue(rep["ok"], rep["violations"])
        bad, _ = key_out(synth_overlay(1600, 900, "#FF00FF", good=False), ChromaParams(key="#FF00FF"))
        rep2 = check_overlay(bad, geom, "hub")
        self.assertFalse(rep2["ok"])
        self.assertTrue(any("coverage" in v for v in rep2["violations"]))
        self.assertTrue(any("spawn default" in v for v in rep2["violations"]))

    def test_a_layer_behind_the_owls_is_checked_for_key_haze_only(self):
        # The tree's playfield (OP-156) is drawn behind the owls, who stand on it: it covers the floor
        # and the spawns by design, but a glow keyed out as magenta would still show.
        geom = fixture_geometry()
        bad, _ = key_out(synth_overlay(1600, 900, "#FF00FF", good=False), ChromaParams(key="#FF00FF"))
        rep = check_overlay(bad, geom, "hub", behind=True)
        self.assertTrue(rep["ok"], rep["violations"])
        self.assertTrue(rep["behind"])
        hazy = bad.copy()
        ImageDraw.Draw(hazy).ellipse((40, 40, 240, 240), fill=(255, 60, 230, 200))
        rep2 = check_overlay(hazy, geom, "hub", key_colour="#FF00FF", behind=True)
        self.assertFalse(rep2["ok"])
        self.assertTrue(rep2["violations"] and all("haze" in v for v in rep2["violations"]), rep2["violations"])

    def test_overlay_rules_keep_sign_boards_readable_and_catch_key_haze(self):
        geom = fixture_geometry()
        good, _ = key_out(synth_overlay(1600, 900, "#FF00FF", good=True), ChromaParams(key="#FF00FF"))
        self.assertTrue(check_overlay(good, geom, "hub", key_colour="#FF00FF")["ok"])
        # A root dangling over a closed sign's board hides the phrase, even if the footprint is mostly clear.
        door = next(d for d in room_of(geom, "hub")["doors"] if d.get("closedSign"))
        bx0, by0, bx1, by1 = sign_board_rect(door["marker"]["x"], door["marker"]["y"])
        cx = (bx0 + bx1) // 2
        hidden = good.copy()
        ImageDraw.Draw(hidden).rectangle((cx - 30, by0 + 10, cx + 30, by1 - 10), fill=(60, 40, 20, 255))
        rep = check_overlay(hidden, geom, "hub")
        self.assertFalse(rep["ok"])
        self.assertTrue(any("sign board" in v for v in rep["violations"]), rep["violations"])
        # Bright magenta-ish haze left behind by a glow over the magenta key.
        hazy = good.copy()
        ImageDraw.Draw(hazy).ellipse((40, 40, 240, 240), fill=(255, 60, 230, 200))
        rep2 = check_overlay(hazy, geom, "hub", key_colour="#FF00FF")
        self.assertFalse(rep2["ok"])
        self.assertTrue(any("haze" in v for v in rep2["violations"]), rep2["violations"])
        self.assertGreater(rep2["key_spill"], 0.005)
        # The finish options fix both deterministically, and the check then passes.
        fixed, n = clear_sign_boards(hidden, geom, "hub")
        self.assertGreater(n, 0)
        self.assertTrue(check_overlay(fixed, geom, "hub")["ok"])
        fixed2, n2 = clear_key_haze(hazy, "#FF00FF")
        self.assertGreater(n2, 0)
        rep3 = check_overlay(fixed2, geom, "hub", key_colour="#FF00FF")
        self.assertTrue(rep3["ok"], rep3["violations"])
        self.assertEqual(np.asarray(fixed2)[..., 3].sum() > 0, True, "the real props survive")
        # At 2x the same board is cleared at twice the coordinates.
        big = hidden.resize((3200, 1800))
        fixed_big, _ = clear_sign_boards(big, geom, "hub", scale=2)
        self.assertTrue(check_overlay(fixed_big.resize((1600, 900)), geom, "hub")["ok"])


def wide_market_geometry() -> dict:
    """The fixture's market grown by an east screen: two background tiles and two overlays."""
    geom = fixture_geometry()
    m = geom["rooms"]["market"]
    m["size"] = {"w": 3200, "h": 900}
    m["walkable"] = [[{"x": 0, "y": 690}, {"x": 3200, "y": 690}, {"x": 3200, "y": 885}, {"x": 0, "y": 885}]]
    m["doors"] = m["doors"] + [{"id": "stage", "rect": {"x": 2300, "y": 700, "w": 200, "h": 100}, "marker": {"x": 2400, "y": 760}}]
    m["spawns"] = {"default": {"x": 200, "y": 760}, "far": {"x": 2600, "y": 800}}
    m["backgrounds"] = [{"key": "market", "x": 0, "y": 0}, {"key": "market-east", "x": 1600, "y": 0}]
    m["foregrounds"] = [{"key": "market-fg", "x": 0, "y": 0}, {"key": "market-east-fg", "x": 1600, "y": 0}]
    return geom


def edge_overlay(w: int, h: int) -> Image.Image:
    """Transparent RGBA with a post touching each side edge and a lamp in the middle."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rectangle((0, h // 10, w // 40, h // 3), fill=(40, 30, 20, 255))
    d.rectangle((w - w // 40, h // 10, w - 1, h // 3), fill=(20, 30, 40, 255))
    d.ellipse((w // 2 - w // 50, h // 12, w // 2 + w // 50, h // 6), fill=(220, 200, 90, 255))
    return img


def cutout(w: int, h: int, seed: int = 5) -> Image.Image:
    """A cut-out like the nests' furniture: a textured ellipse with a soft edge, zeroed RGB where clear."""
    big = Image.new("L", (4 * w, 4 * h), 0)
    ImageDraw.Draw(big).ellipse((4 * w // 10, 4 * h // 10, 36 * w // 10, 36 * h // 10), fill=255)
    alpha = np.asarray(big.resize((w, h), Image.Resampling.BOX))
    rgb = np.random.default_rng(seed).integers(60, 200, (h, w, 3))
    rgba = np.dstack([np.where(alpha[..., None] > 0, rgb, 0), alpha]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


class TestWings(unittest.TestCase):
    def test_wing_keys_name_a_room_and_a_side(self):
        self.assertEqual(wings.wing_of("hub-west"), ("hub", "west"))
        self.assertEqual(wings.wing_of("market-east"), ("market", "east"))
        for key in ("hub", "hub-fg", "market-east-fg", "owl-west-x", "hub-north"):
            self.assertIsNone(wings.wing_of(key), key)
        self.assertEqual([wings.tile_key("grove", p) for p in ("west", "mid", "east")], ["grove-west", "grove", "grove-east"])
        self.assertEqual([wings.tile_key("grove", p, overlay=True) for p in ("west", "mid")], ["grove-west-fg", "grove-fg"])

    def test_the_canvas_holds_the_painting_edge_and_grey_where_the_wing_goes(self):
        painting = synth_room(3200, 1800, 5, "market")
        east = np.asarray(wings.outpaint_canvas(painting, "east")).astype(int)
        west = np.asarray(wings.outpaint_canvas(painting, "west")).astype(int)
        self.assertEqual(east.shape, (900, 2000, 3))
        edge = np.asarray(painting.crop((2400, 0, 3200, 1800)).resize((400, 900), Image.Resampling.LANCZOS)).astype(int)
        self.assertLess(np.abs(east[:, 20:380] - edge[:, 20:380]).mean(), 2, "the painting's east strip opens the canvas")
        self.assertTrue((east[:, 420:] == 127).all(), "grey for the wing")
        self.assertTrue((west[:, :1580] == 127).all())
        self.assertLess(np.abs(west[:, 1620:1980] - np.asarray(painting.crop((0, 0, 800, 1800)).resize((400, 900), Image.Resampling.LANCZOS)).astype(int)[:, 20:380]).mean(), 2)

    def _model_output(self, painting: Image.Image, side: str, shift: float) -> Image.Image:
        """A stand-in for the model: the painting's strip repainted a little brighter, then new paint."""
        art = np.asarray(painting).astype(np.float32)
        out = np.zeros((1800, 4000, 3), np.float32)
        out[:, :, :] = (90, 140, 60)
        if side == "east":
            out[:, :800] = art[:, 2400:] + shift
        else:
            out[:, 3200:] = art[:, :800] + shift
        return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).resize((3040, 1368), Image.Resampling.LANCZOS)

    def test_stitch_keeps_the_painting_and_joins_inside_the_overlap(self):
        painting = synth_room(3200, 1800, 7, "grove")
        art = np.asarray(painting)
        panos = {}
        for side in ("west", "east"):
            pano, rep = wings.stitch(painting, self._model_output(painting, side, 12.0), side)
            self.assertEqual(pano.size, (6400, 1800))
            self.assertEqual(rep["side"], side)
            lo, hi = rep["seam_columns"]
            self.assertTrue(60 <= lo <= hi <= 740, rep)
            a = np.asarray(pano)
            if side == "east":
                self.assertTrue((a[:, :2400] == art[:, :2400]).all(), "the painting west of the overlap is untouched")
                self.assertLess(np.abs(a[:, 3300:3400].astype(int) - (90, 140, 60)).mean(), 25, "the wing's new paint follows, its tone pulled toward the painting")
            else:
                self.assertTrue((a[:, 4000:] == art[:, 800:]).all(), "the painting east of the overlap is untouched")
            panos[side] = pano
        tiles = wings.split_tiles(painting, panos)
        self.assertEqual(list(tiles), ["west", "mid", "east"])
        self.assertTrue(all(t.size == (3200, 1800) for t in tiles.values()))
        mid = np.asarray(tiles["mid"])
        self.assertTrue((mid[:, 800:2400] == art[:, 800:2400]).all(), "the middle screen is the painting between its joins")
        self.assertTrue((np.asarray(tiles["west"]) == np.asarray(panos["west"])[:, :3200]).all())
        self.assertTrue((np.asarray(tiles["east"]) == np.asarray(panos["east"])[:, 3200:]).all())
        only_east = wings.split_tiles(painting, {"east": panos["east"]})
        self.assertEqual(list(only_east), ["mid", "east"])
        self.assertTrue((np.asarray(only_east["mid"])[:, :2400] == art[:, :2400]).all())

    def test_the_overlay_pieces_at_an_edge_move_to_that_end(self):
        fg2 = np.asarray(edge_overlay(3200, 1800))
        fg1 = np.asarray(edge_overlay(1600, 900))
        parts = wings.split_overlay(fg2, fg1, ("east",))
        self.assertEqual(sorted(parts), ["east", "mid"])
        e2, e1 = parts["east"]
        m2, m1 = parts["mid"]
        self.assertTrue((e2[300:500, 3190:, 3] == 255).all(), "the east post moved to the east end")
        self.assertEqual(int((e2[:, :3000, 3] > 0).sum()), 0, "nothing else came with it")
        self.assertTrue((m2[300:500, :40, 3] == 255).all(), "the west post stays: the room has no west wing")
        self.assertTrue((m2[200:250, 1580:1620, 3] == 255).all(), "the middle lamp stays")
        self.assertEqual(int((m2[:, 3100:, 3] > 0).sum()), 0)
        self.assertEqual(int(((e1[:, :, 3] > 0) & (m1[:, :, 3] > 0)).sum()), 0, "no 1x pixel is in both")
        self.assertTrue((e1[150:250, 1595:, 3] == 255).all())
        both = wings.split_overlay(fg2, fg1, ("west", "east"))
        self.assertTrue((both["west"][0][300:500, :40, 3] == 255).all())
        self.assertEqual(int((both["mid"][0][:, :100, 3] > 0).sum()), 0)

    def test_a_screen_of_a_wide_room_sees_the_room_shifted(self):
        geom = wide_market_geometry()
        view = tile_view(geom, "market", 1600, 0)
        room = room_of(view, "market")
        self.assertEqual(room["size"], {"w": 1600, "h": 900})
        self.assertEqual(room["walkable"][0][1], {"x": 1600.0, "y": 690.0})
        stage = next(d for d in room["doors"] if d["id"] == "stage")
        self.assertEqual((stage["rect"]["x"], stage["marker"]), (700.0, {"x": 800.0, "y": 760.0}))
        self.assertEqual(room["spawns"]["far"], {"x": 1000.0, "y": 800.0})
        self.assertEqual(room_of(geom, "market")["spawns"]["far"], {"x": 2600, "y": 800}, "the geometry itself is unchanged")
        # The overlay rules run on the screen: a post on the stage's marker breaks them there only.
        blocker = Image.new("RGBA", (1600, 900), (0, 0, 0, 0))
        ImageDraw.Draw(blocker).rectangle((780, 740, 820, 780), fill=(10, 10, 10, 255))
        self.assertTrue(any("stage marker" in v for v in check_overlay(blocker, view, "market")["violations"]))
        self.assertFalse(any("stage" in v for v in check_overlay(blocker, tile_view(geom, "market", 0, 0), "market")["violations"]))


class TestSprites(unittest.TestCase):
    """The sprite manifest (OP-127): what each published sprite draws, trimmed of its padding."""

    def test_the_drawn_box_skips_transparent_padding_and_faint_fringe(self):
        img = Image.new("RGBA", (40, 30), (0, 0, 0, 0))
        ImageDraw.Draw(img).rectangle((10, 5, 19, 24), fill=(200, 100, 50, 255))
        img.putpixel((2, 2), (255, 255, 255, sprites.ALPHA))  # an export's fringe: not drawn
        self.assertEqual(sprites.drawn_box(img), (10, 5, 10, 20))
        self.assertEqual(sprites.drawn_box(Image.new("RGB", (8, 6))), (0, 0, 8, 6), "no alpha: drawn edge to edge")
        self.assertIsNone(sprites.drawn_box(Image.new("RGBA", (8, 6), (0, 0, 0, 0))))
        # A palette image keeps its transparency in the palette.
        self.assertEqual(sprites.drawn_box(img.convert("P")), (10, 5, 10, 20))

    def test_measured_on_the_2x_file_rounded_outward_with_a_half_pixel_centre(self):
        one = Image.new("RGBA", (40, 30), (0, 0, 0, 0))
        two = Image.new("RGBA", (80, 60), (0, 0, 0, 0))
        ImageDraw.Draw(two).rectangle((21, 11, 40, 50), fill=(0, 0, 0, 255))  # x 21..41, y 11..51 at 2x
        e = sprites.measure(one, two)
        self.assertEqual(e["size"], [40, 30])
        self.assertEqual(e["drawn"], [10, 5, 11, 21], "10.5..20.5 -> 10..21, 5.5..25.5 -> 5..26")
        self.assertEqual(e["centre"], [15.5, 15.5])
        self.assertEqual(e["solid"], e["drawn"], "drawn fully opaque, so the object is all of it")
        # A glow round the object is drawn, but it is not the object.
        ImageDraw.Draw(two).rectangle((0, 0, 79, 9), fill=(255, 220, 120, 60))
        glow = sprites.measure(one, two)
        self.assertEqual((glow["drawn"], glow["solid"]), ([0, 0, 40, 26], [10, 5, 11, 21]))
        # Without its 2x file, the 1x file is measured.
        self.assertEqual(sprites.measure(two.resize((40, 30)))["size"], [40, 30])

    def test_the_manifest_has_one_line_per_sprite_and_is_the_same_twice(self):
        with tempfile.TemporaryDirectory() as tmp:
            pub = Path(tmp)
            a = Image.new("RGBA", (20, 20), (0, 0, 0, 0))
            ImageDraw.Draw(a).rectangle((5, 5, 9, 9), fill=(1, 2, 3, 255))
            a.save(pub / "b-thing.png")
            a.resize((40, 40), Image.Resampling.NEAREST).save(pub / "b-thing@2x.png")
            Image.new("RGB", (10, 10)).save(pub / "a-flat.png")
            (pub / "room.webp").write_bytes(webpmeta.encode(Image.new("RGB", (16, 9), (40, 60, 80)), 80))  # opaque: a room, not a sprite
            (pub / "ab-cut.webp").write_bytes(webpmeta.encode(a, 90))  # a cut-out shipped as WebP is one
            text = sprites.dumps(sprites.build(pub))
            self.assertEqual(text, sprites.dumps(sprites.build(pub)))
            m = json.loads(text)
            self.assertEqual(list(m["sprites"]), ["a-flat", "ab-cut", "b-thing"], "in the order of the file names, whatever their format")
            self.assertEqual(m["sprites"]["b-thing"]["drawn"], [5, 5, 5, 5])
            self.assertEqual(m["sprites"]["ab-cut"], m["sprites"]["b-thing"] | {"drawn": [5, 5, 5, 5]})
            self.assertEqual(sum(1 for line in text.splitlines() if '"size"' in line), 3)

    def test_the_committed_manifest_matches_the_published_art(self):
        with mock.patch("sys.stderr", new=io.StringIO()) as err:
            self.assertEqual(postprocess.main(["sprites", "--check"]), 0, err.getvalue())


class TestPatch(unittest.TestCase):
    def setUp(self):
        self.base = synth_room(400, 240, 7, "hub")
        self.at = (100, 40)
        # The "edit": the crop re-rendered with a little noise everywhere, and a gold disc where a
        # dark square used to be.
        crop = patch.cut(self.base, (100, 40, 228, 168))
        rng = np.random.default_rng(3)
        noisy = np.clip(np.asarray(crop).astype(int) + rng.integers(-6, 7, (128, 128, 3)), 0, 255).astype(np.uint8)
        self.edit = Image.fromarray(noisy)
        ImageDraw.Draw(self.edit).ellipse((40, 40, 80, 80), fill=(201, 162, 39))
        dark = self.base.copy()
        ImageDraw.Draw(dark).rectangle((150, 90, 175, 115), fill=(10, 10, 30))
        self.base = dark

    def test_cut_checks_the_box(self):
        self.assertEqual(patch.cut(self.base, (0, 0, 10, 20)).size, (10, 20))
        with self.assertRaises(ValueError):
            patch.cut(self.base, (390, 0, 410, 20))

    def test_only_the_edited_detail_changes(self):
        out, rep = patch.patch(self.base, self.edit, self.at, box=(20, 20, 108, 108))
        a, b = np.asarray(self.base).astype(int), np.asarray(out).astype(int)
        changed = np.abs(a - b).max(axis=2) > 0
        ys, xs = np.nonzero(changed)
        # The old square and the new disc (crop 40..80 -> 140..180, 80..120), grown and feathered, nothing else.
        self.assertGreaterEqual(xs.min(), 120)
        self.assertLessEqual(xs.max(), 200)
        self.assertGreaterEqual(ys.min(), 60)
        self.assertLessEqual(ys.max(), 140)
        self.assertLessEqual(np.abs(b[100, 160] - [201, 162, 39]).max(), 8, "the disc came across")
        self.assertTrue(rep["patch_bbox"][0] >= 120 and rep["patch_bbox"][2] <= 200, rep["patch_bbox"])
        # The re-render noise elsewhere in the crop stays out: outside the patch, every pixel is the original's.
        self.assertTrue((a[:, :120] == b[:, :120]).all())
        self.assertTrue((a[200:] == b[200:]).all())

    def test_deterministic_and_refuses_an_unchanged_box(self):
        one, _ = patch.patch(self.base, self.edit, self.at, box=(20, 20, 108, 108))
        two, _ = patch.patch(self.base, self.edit, self.at, box=(20, 20, 108, 108))
        self.assertEqual(one.tobytes(), two.tobytes())
        with self.assertRaises(ValueError):
            patch.patch(self.base, self.edit, self.at, box=(0, 0, 12, 12))

    def test_a_band_across_a_seam_joins_each_screen_where_they_agree(self):
        # Two flat "screens" meeting at x 200, and an edit of a crop across the join (x 100..300)
        # that paints it grey, except for two narrow strips where it kept the screens as they were
        # (x 155..165 and 235..245). With every pixel counted (threshold 0) and 40 px joins, the
        # band takes over from each screen along those strips, where the two agree.
        base = Image.new("RGB", (400, 60), (200, 40, 40))
        base.paste((40, 40, 200), (200, 0, 400, 60))
        edit = Image.new("RGB", (200, 60), (120, 120, 120))
        edit.paste((200, 40, 40), (55, 0, 65, 60))
        edit.paste((40, 40, 200), (135, 0, 145, 60))
        out, rep = patch.patch(base, edit, (100, 0), box=(40, 0, 160, 60), threshold=0, join=40)
        a, b = np.asarray(base).astype(int), np.asarray(out).astype(int)
        self.assertTrue((a[:, :140] == b[:, :140]).all() and (a[:, 260:] == b[:, 260:]).all(), "outside the box, the screens' own pixels")
        self.assertTrue(155 <= rep["join_columns"][0][0] <= rep["join_columns"][0][1] < 165, rep["join_columns"])
        self.assertTrue(235 <= rep["join_columns"][1][0] <= rep["join_columns"][1][1] < 245, rep["join_columns"])
        self.assertLessEqual(np.abs(b[30, 145:155] - [200, 40, 40]).max(), 2, "the west screen up to the cut")
        self.assertLessEqual(np.abs(b[30, 172:228] - [120, 120, 120]).max(), 2, "the edit between the cuts")
        self.assertLessEqual(np.abs(b[30, 246:260] - [40, 40, 200]).max(), 2, "the east screen after the cut")
        self.assertEqual(rep["join"], 40)
        with self.assertRaises(ValueError):
            patch.patch(base, edit, (100, 0), box=(40, 0, 160, 60), threshold=0, join=70)


class TestForbiddenAndProvenance(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = mock.patch.dict(os.environ, {}, clear=False)
        self.env.start()
        for v in ("ART_FORBIDDEN_WORDS_FILE", "ART_FORBIDDEN_WORDS", "OWL_PARK_FORBIDDEN"):
            os.environ.pop(v, None)
        self.local = mock.patch.object(forbidden, "LOCAL_DIR", Path(self.tmp.name) / "nolocal")
        self.local.start()

    def tearDown(self):
        self.local.stop()
        self.env.stop()
        forbidden.load_words(refresh=True)
        self.tmp.cleanup()

    def test_noop_without_a_list_and_detection_with_one(self):
        forbidden.load_words(refresh=True)
        self.assertFalse(forbidden.configured())
        self.assertEqual(forbidden.check("anything at all", "test"), [])
        f = Path(self.tmp.name) / "words.txt"
        f.write_text("# private\n=zebrafish\nquux\n", encoding="utf-8")
        os.environ["ART_FORBIDDEN_WORDS_FILE"] = str(f)
        forbidden.load_words(refresh=True)
        self.assertTrue(forbidden.configured())
        with mock.patch("sys.stderr", new=io.StringIO()):
            self.assertEqual(forbidden.check("A ZebraFish swam", "t"), ["=zebrafish"])
            self.assertEqual(forbidden.check("zebrafishes", "t"), [], "= entries match whole words only")
            self.assertEqual(forbidden.check("quuxation", "t"), ["quux"], "plain entries match substrings")

    def test_provenance_lines_are_allowlisted_and_relative(self):
        forbidden.load_words(refresh=True)
        sidecar = {"hash16": "0123456789abcdef", "provider": "mock", "model": "m", "prompt_sha256": "ab" * 32, "seed": 7, "size": "3200x1800", "source_url": None, "generated_at": "2026-10-18T09:00:00Z", "prompt": "never copied"}
        line = prov.build_line(asset="hub.png", key="hub", logical="1x", sha256="cd" * 32, nbytes=1234, colors=160, budget_relaxed=False, sidecar=sidecar, published_at="2026-10-18T10:00:00Z", tools=["room: crop=centre"], human_edits=["picked 3 of 4"])
        self.assertEqual(set(line), set(prov.ALLOWED_FIELDS))
        self.assertNotIn("never copied", json.dumps(line), "prompt text is never recorded")
        self.assertNotIn("prompt", line)
        self.assertEqual(prov.problems(line), [])
        self.assertIn("field 'extra' is not allowlisted", prov.problems(dict(line, extra=1)))
        self.assertTrue(any("absolute path" in p for p in prov.problems(dict(line, tools=["/home/someone/x"]))))
        path = Path(self.tmp.name) / "prov.jsonl"
        prov.append(path, dict(line, extra="dropped"))
        back = prov.read_lines(path)
        self.assertEqual(len(back), 1)
        self.assertEqual(set(back[0]), set(prov.ALLOWED_FIELDS))
        with self.assertRaises(ArtError):
            prov.append(path, dict(line, human_edits=["/abs/path"]))
        prov.append(path, dict(line, asset="hub@2x.png", logical="2x", budget_relaxed=True))
        self.assertEqual(prov.relaxed_assets(path), {"hub@2x.png"})
        self.assertEqual(len(prov.read_lines(path)), 2)

    def test_presigned_result_urls_are_stripped_and_refused(self):
        forbidden.load_words(refresh=True)
        presigned = ("https://bucket.example/seedream/abc.jpeg?X-Tos-Algorithm=TOS4-HMAC-SHA256"
                     "&X-Tos-Credential=AKIDEXAMPLE%2F20261018%2Fap%2Ftos%2Frequest&X-Tos-Date=20261018T000000Z&X-Tos-Expires=86400&X-Tos-Signature=deadbeef")
        sidecar = {"hash16": "0123456789abcdef", "provider": "ark", "model": "m", "prompt_sha256": "ab" * 32, "seed": 7, "size": "3200x1800", "source_url": presigned, "generated_at": "2026-10-18T09:00:00Z"}
        line = prov.build_line(asset="hub.png", key="hub", logical="1x", sha256="cd" * 32, nbytes=1, colors=None, budget_relaxed=False, sidecar=sidecar, published_at="t", tools=[], human_edits=[])
        self.assertEqual(line["source_url"], "https://bucket.example/seedream/abc.jpeg")
        self.assertNotIn("deadbeef", json.dumps(line))
        self.assertEqual(prov.problems(line), [])
        probs = prov.problems(dict(line, source_url=presigned))
        self.assertTrue(any("signed-URL" in p for p in probs), probs)
        self.assertTrue(prov.problems(dict(line, source_url="https://h/x.png#token")))
        with self.assertRaises(ArtError):
            prov.append(Path(self.tmp.name) / "p.jsonl", dict(line, source_url=presigned))
        self.assertFalse((Path(self.tmp.name) / "p.jsonl").exists())
        self.assertEqual(postprocess.sidecar_subset(sidecar)["source_url"], "https://bucket.example/seedream/abc.jpeg")
        self.assertIsNone(prov.public_url(None))

    def test_identity_names_match_whole_words_in_the_notes_only(self):
        forbidden.load_words(refresh=True)
        base = dict(asset="owl-body.png", key="owl-body", logical="1x", sha256="00" * 32, nbytes=1, colors=None, budget_relaxed=False, sidecar=None, published_at="t")
        with mock.patch.object(prov.getpass, "getuser", return_value="tomas"), mock.patch.object(prov.socket, "gethostname", return_value="owlhost"):
            line = prov.build_line(**base, tools=["piece: fit=contain margin=0.02 anchor_x=0.5 pad_bottom=0 tomas"], human_edits=["pad_bottom tweak", "tomasz-style pick", "owlhosting notes"])
            self.assertEqual(prov.problems(line), [], "substrings of tool words and keys never block a publish")
            probs = prov.problems(dict(line, human_edits=["fixed by tomas"]))
            self.assertTrue(any("human_edits[0]" in p and "'tomas'" in p for p in probs), probs)
            probs = prov.problems(dict(line, human_edits=["done on OWLHOST, picked 2"]))
            self.assertTrue(any("'owlhost'" in p for p in probs), probs)
            self.assertEqual(prov.problems(dict(line, asset="owlhost.png", key="owlhost")), [], "fixed fields are a closed vocabulary, not free text")
        with mock.patch.object(prov.getpass, "getuser", return_value="tom"), mock.patch.object(prov.socket, "gethostname", return_value="owl"):
            self.assertEqual(prov.problems(dict(line, human_edits=["tom and the owl"])), [], "names under four characters are not looked for")
        home = str(Path.home())
        if home not in ("/", "."):
            self.assertTrue(any("home directory" in p for p in prov.problems(dict(line, tools=[f"ref: {home}/x.png"]))))
            self.assertTrue(any("absolute path" in p for p in prov.problems(dict(line, human_edits=[f"{home}/x.png"]))))

    def test_forbidden_match_blocks_the_provenance_line(self):
        os.environ["ART_FORBIDDEN_WORDS"] = "zebrafish"
        forbidden.load_words(refresh=True)
        line = prov.build_line(asset="hub.png", key="hub", logical="1x", sha256="00" * 32, nbytes=1, colors=None, budget_relaxed=False, sidecar=None, published_at="t", tools=[], human_edits=["mentions a zebrafish"])
        with mock.patch("sys.stderr", new=io.StringIO()) as err:
            with self.assertRaises(ArtError):
                prov.append(Path(self.tmp.name) / "p.jsonl", line)
            self.assertIn("forbidden-word match", err.getvalue())
        self.assertFalse((Path(self.tmp.name) / "p.jsonl").exists())


class TestPngMeta(unittest.TestCase):
    def test_chunk_allowlist_and_clean_save(self):
        img = Image.new("RGB", (8, 8), (1, 2, 3))
        info = PngImagePlugin.PngInfo()
        info.add_text("Comment", "model output")
        buf = io.BytesIO()
        img.save(buf, "PNG", pnginfo=info, dpi=(72, 72))
        self.assertIn("tEXt", pngmeta.chunk_types(buf.getvalue()))
        self.assertTrue(pngmeta.disallowed_chunks(buf.getvalue()))
        src = Image.open(io.BytesIO(buf.getvalue()))
        src.load()
        clean = pngmeta.encode(src)
        self.assertEqual(pngmeta.chunk_types(clean), ["IHDR", "IDAT", "IEND"])
        with self.assertRaises(ArtError):
            pngmeta.chunk_types(b"not a png")

    def test_assets_table_mirrors_art_ts(self):
        table = load_assets()
        self.assertEqual((table["hub"]["w"], table["hub"]["h"]), (1600, 900))
        self.assertEqual((table["guardian"]["w"], table["guardian"]["h"]), (720, 820))
        self.assertEqual((table["robot-owl"]["w"], table["robot-owl"]["h"]), (900, 900))
        self.assertEqual((table["owl-body"]["w"], table["owl-body"]["h"]), (200, 240))
        src = (HERE.parent.parent / "apps" / "park" / "src" / "game" / "art.ts").read_text(encoding="utf-8")
        for key in ("guardian", "robot-owl", "owl-blink", "hub-fg"):
            self.assertIn(f"'{key}'" if "-" in key else f"{key}:", src)


class TestWebpMeta(unittest.TestCase):
    def test_clean_encode_chunks_and_determinism(self):
        img = synth_room(320, 180, 5, "hub")
        img.info["icc_profile"] = b"\0" * 128
        img.info["exif"] = b"Exif\0\0MM"
        data = webpmeta.encode(img, 80)
        self.assertEqual(webpmeta.chunk_types(data), ["VP8 "])
        self.assertEqual(webpmeta.webp_size(data), (320, 180))
        self.assertEqual(data, webpmeta.encode(img, 80))
        with self.assertRaises(ArtError):
            webpmeta.chunk_types(b"RIFF\0\0\0\0WAVE")
        # A file carrying EXIF or an ICC profile is refused by the verifier.
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=80, icc_profile=b"\0" * 128, exif=b"Exif\0\0MM\0*\0\0\0\x08\0\0")
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / "hub.webp"
            p.write_bytes(buf.getvalue())
            v = webpmeta.verify_file(p, (320, 180), BUDGET_BYTES)
            self.assertFalse(v["ok"])
            self.assertTrue(any("disallowed WebP chunks" in x for x in v["problems"]))
            p.write_bytes(data)
            self.assertTrue(webpmeta.verify_file(p, (320, 180), BUDGET_BYTES)["ok"])
            self.assertIn("is not 640x360", " ".join(webpmeta.verify_file(p, (640, 360), BUDGET_BYTES)["problems"]))
            self.assertIn("exceeds", " ".join(webpmeta.verify_file(p, None, 10)["problems"]))

    def test_quality_ladder_descends_and_raises(self):
        img = synth_room(640, 360, 7, "grove")
        top = len(webpmeta.encode(img, webpmeta.QUALITIES[0]))
        data, info = webpmeta.encode_under_budget(img, top)
        self.assertEqual((info["format"], info["quality"]), ("webp", webpmeta.QUALITIES[0]))
        data, info = webpmeta.encode_under_budget(img, top - 1)
        self.assertLess(info["quality"], webpmeta.QUALITIES[0])
        self.assertLessEqual(len(data), top - 1)
        with self.assertRaises(BudgetError):
            webpmeta.encode_under_budget(img, 100)


class TestCli(unittest.TestCase):
    def _room_raw(self, work: Path, seed: int = 3) -> None:
        d = work / "raw" / "hub"
        d.mkdir(parents=True, exist_ok=True)
        h = f"{seed:016x}"
        (d / f"{h}.png").write_bytes(pngmeta.encode(synth_room(800, 450, seed, "hub")))
        (d / f"{h}.json").write_text(json.dumps({"schema": 1, "key": "hub", "kind": "room", "provider": "mock", "model": "m", "hash16": h, "prompt_sha256": "ab" * 32, "seed": seed, "size": "800x450", "generated_at": "t"}), encoding="utf-8")
        (d / "SELECTED").write_text(h + "\n", encoding="utf-8")

    def test_room_ships_webp_and_replaces_png_everywhere(self):
        with tempfile.TemporaryDirectory() as tmp:
            work, public = Path(tmp) / "work", Path(tmp) / "public"
            (work / "final").mkdir(parents=True)
            public.mkdir()
            provp = Path(tmp) / "p.jsonl"
            common = ["--work", str(work), "--public", str(public), "--provenance", str(provp), "--now", "2026-10-18T09:00:00Z"]
            self._room_raw(work)
            with mock.patch("sys.stderr", new=io.StringIO()), mock.patch("sys.stdout", new=io.StringIO()) as out:
                # The PNG era: a published hub.png and hub@2x.png, and a stale PNG final.
                pngmeta.save(Image.new("RGB", (1600, 900), (5, 5, 5)), work / "final" / "hub.png")
                pngmeta.save(Image.new("RGB", (3200, 1800), (5, 5, 5)), work / "final" / "hub@2x.png")
                self.assertEqual(postprocess.main(["publish", "hub"] + common), 0)
                self.assertTrue((public / "hub@2x.png").exists())
                # The room finish writes WebP only and clears the PNG finals.
                self.assertEqual(postprocess.main(["room", "hub", "--grade", "none", "--with-2x", "--work", str(work), "--now", "2026-10-18T09:00:00Z"]), 0)
                self.assertEqual(sorted(p.name for p in (work / "final").glob("hub*") if p.suffix != ".json"), ["hub.webp", "hub@2x.webp"])
                rec = json.loads((work / "final" / "hub.post.json").read_text(encoding="utf-8"))
                self.assertEqual(rec["outputs"]["1x"]["format"], "webp")
                self.assertTrue(any(t.startswith("budget: webp q") for t in rec["tools"]))
                self.assertTrue(any(t.startswith("budget@2x: webp q") for t in rec["tools"]))
                # Publishing it removes the PNGs the loader would otherwise still find.
                self.assertEqual(postprocess.main(["publish", "hub"] + common), 0)
                self.assertEqual(sorted(p.name for p in public.iterdir()), ["hub.webp", "hub@2x.webp"])
                self.assertIn("removed stale hub.png", out.getvalue())
                lines = prov.read_lines(provp)
                self.assertEqual(lines[-1]["asset"], "hub@2x.webp")
                self.assertEqual(lines[-1]["sha256"], postprocess.sha256_bytes((public / "hub@2x.webp").read_bytes()))
                self.assertEqual(postprocess.main(["check", "--all"] + common), 0)
                # A PNG left beside the WebP is a conflict, and so is a 2x with no 1x.
                pngmeta.save(Image.new("RGB", (1600, 900), (5, 5, 5)), public / "hub.png")
                self.assertEqual(postprocess.main(["check", "hub"] + common), 1)
                self.assertIn("both PNG and WebP", out.getvalue())
                (public / "hub.png").unlink()
                (public / "hub.webp").unlink()
                self.assertEqual(postprocess.main(["check", "hub"] + common), 1)
                self.assertIn("published without hub.webp", out.getvalue())
                # A finish without a 2x drops the old 2x from the finals and, on publish, from the park.
                self.assertEqual(postprocess.main(["room", "hub", "--grade", "none", "--work", str(work), "--now", "2026-10-18T09:00:00Z"]), 0)
                self.assertFalse((work / "final" / "hub@2x.webp").exists())
                self.assertEqual(postprocess.main(["publish", "hub"] + common), 0)
                self.assertEqual(sorted(p.name for p in public.iterdir()), ["hub.webp"])
                self.assertEqual(postprocess.main(["check", "--all"] + common), 0)

    def test_check_refuses_webp_metadata_and_webp_outside_rooms(self):
        with tempfile.TemporaryDirectory() as tmp:
            work, public = Path(tmp) / "work", Path(tmp) / "public"
            (work / "final").mkdir(parents=True)
            public.mkdir()
            provp = Path(tmp) / "p.jsonl"
            common = ["--work", str(work), "--public", str(public), "--provenance", str(provp), "--now", "2026-10-18T09:00:00Z"]
            buf = io.BytesIO()
            Image.new("RGB", (1600, 900), (9, 9, 9)).save(buf, "WEBP", quality=80, exif=b"Exif\0\0MM\0*\0\0\0\x08\0\0")
            (public / "hub.webp").write_bytes(buf.getvalue())
            (public / "guardian.webp").write_bytes(webpmeta.encode(Image.new("RGB", (720, 820), (9, 9, 9)), 80))
            with mock.patch("sys.stderr", new=io.StringIO()), mock.patch("sys.stdout", new=io.StringIO()) as out:
                self.assertEqual(postprocess.main(["check", "hub", "guardian"] + common), 1)
            self.assertIn("hub.webp: disallowed WebP chunks: EXIF", out.getvalue())
            self.assertIn("guardian: published as WebP, but only room backgrounds and the art the table marks webp ship as WebP", out.getvalue())

    def test_check_takes_webp_for_a_painting_the_table_marks_webp(self):
        # The arcade's game fields are opaque paintings, not rooms: the table marks them "format": "webp".
        self.assertEqual(load_assets()["arcade-hop-bg"].get("format"), "webp")
        with tempfile.TemporaryDirectory() as tmp:
            work, public = Path(tmp) / "work", Path(tmp) / "public"
            (work / "final").mkdir(parents=True)
            public.mkdir()
            provp = Path(tmp) / "p.jsonl"
            common = ["--work", str(work), "--public", str(public), "--provenance", str(provp), "--now", "2026-10-18T09:00:00Z"]
            (public / "arcade-hop-bg.webp").write_bytes(webpmeta.encode(Image.new("RGB", (480, 640), (9, 9, 9)), 80))
            with mock.patch("sys.stderr", new=io.StringIO()), mock.patch("sys.stdout", new=io.StringIO()) as out:
                postprocess.main(["check", "arcade-hop-bg"] + common)
            self.assertNotIn("published as WebP", out.getvalue())

    def test_a_published_cutout_the_table_marks_webp_is_reencoded_keeping_its_provenance(self):
        # The nests' furniture shipped as PNG before the table marked it webp (OP-129).
        self.assertEqual(load_assets()["decor-rug"].get("format"), "webp")
        with tempfile.TemporaryDirectory() as tmp:
            work, public = Path(tmp) / "work", Path(tmp) / "public"
            final = work / "final"
            final.mkdir(parents=True)
            public.mkdir()
            provp = Path(tmp) / "p.jsonl"
            common = ["--work", str(work), "--public", str(public), "--provenance", str(provp), "--now", "2026-10-28T09:00:00Z"]
            one, two = cutout(240, 100), cutout(480, 200)
            pngmeta.save(one, final / "decor-rug.png")
            pngmeta.save(two, final / "decor-rug@2x.png")
            sc = {"hash16": "00000000000000aa", "provider": "mock", "model": "m", "prompt_sha256": "ab" * 32, "seed": 7, "size": "960x400", "source_url": None, "generated_at": "t"}
            (final / "decor-rug.post.json").write_text(json.dumps({"key": "decor-rug", "kind": "piece", "raw_sidecar": sc, "outputs": {}, "tools": ["piece: key=#00FF00"], "human_edits": ["picked B"]}), encoding="utf-8")
            with mock.patch("sys.stderr", new=io.StringIO()) as err, mock.patch("sys.stdout", new=io.StringIO()) as out:
                self.assertEqual(postprocess.main(["publish", "decor-rug"] + common), 0)
                drawn = sprites.build(public)["sprites"]["decor-rug"]
                # Published as PNG, but the table says it ships as WebP.
                self.assertEqual(postprocess.main(["check", "decor-rug"] + common), 1)
                self.assertIn("decor-rug: published as PNG, but the table marks it webp (`pnpm art:finish webp decor-rug`", out.getvalue())
                # Only the pixels its provenance describes are re-encoded.
                published = (public / "decor-rug.png").read_bytes()
                pngmeta.save(cutout(240, 100, seed=6), public / "decor-rug.png")
                self.assertEqual(postprocess.main(["webp", "decor-rug"] + common), 1)
                self.assertIn("decor-rug.png: not the file its latest provenance line describes", err.getvalue())
                (public / "decor-rug.png").write_bytes(published)
                # WebP finals only, the alpha exact, and a record that keeps the PNGs' provenance.
                self.assertEqual(postprocess.main(["webp", "decor-rug"] + common), 0)
                self.assertEqual(sorted(p.name for p in final.glob("decor-rug*") if p.suffix != ".json"), ["decor-rug.webp", "decor-rug@2x.webp"])
                for name, src in (("decor-rug.webp", one), ("decor-rug@2x.webp", two)):
                    self.assertTrue(webpmeta.same_alpha((final / name).read_bytes(), src), name)
                rec = json.loads((final / "decor-rug.post.json").read_text(encoding="utf-8"))
                self.assertEqual([rec["outputs"][k]["format"] for k in ("1x", "2x")], ["webp", "webp"])
                self.assertEqual((rec["raw_sidecar"]["seed"], rec["human_edits"], rec["tools"][0]), (7, ["picked B"], "piece: key=#00FF00"))
                self.assertTrue(any(t.startswith("webp: re-encoded from the published decor-rug.png (sha256 ") and "decor-rug@2x.png" in t for t in rec["tools"]), rec["tools"])
                # Publishing ships the WebPs, removes the PNGs and names the candidate the art came from.
                self.assertEqual(postprocess.main(["publish", "decor-rug"] + common), 0)
                self.assertEqual(sorted(p.name for p in public.iterdir()), ["decor-rug.webp", "decor-rug@2x.webp"])
                last = prov.read_lines(provp)[-1]
                self.assertEqual((last["asset"], last["seed"], last["human_edits"]), ("decor-rug@2x.webp", 7, ["picked B"]))
                self.assertEqual(postprocess.main(["check", "--all"] + common), 0)
                # The sprite manifest measures the WebP to the same box as the PNG.
                self.assertEqual(sprites.build(public)["sprites"]["decor-rug"], drawn)
                # Nothing is left to re-encode, and only cut-outs the table marks webp are.
                self.assertEqual(postprocess.main(["webp", "decor-rug"] + common), 1)
                self.assertIn("no published decor-rug.png to re-encode", err.getvalue())
                self.assertEqual(postprocess.main(["webp", "guardian"] + common), 1)
                self.assertIn("'guardian' is not a cut-out the table marks", err.getvalue())

    def test_piece_finishes_a_key_the_table_marks_webp_as_webp(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp) / "work"
            subj, _ = synth_keyed_subject(480, 400, "#00FF00", (150, 110, 70), 0.4)
            postprocess._write_raw(work, "decor-rug", subj, 11, "#00FF00", None, "2026-10-28T09:00:00Z", "piece", "nest")
            # An earlier PNG finish of the key goes: publish would refuse both formats side by side.
            (work / "final").mkdir(parents=True)
            pngmeta.save(cutout(240, 100), work / "final" / "decor-rug.png")
            with mock.patch("sys.stderr", new=io.StringIO()), mock.patch("sys.stdout", new=io.StringIO()):
                self.assertEqual(postprocess.main(["piece", "decor-rug", "--grade", "none", "--work", str(work), "--now", "2026-10-28T09:00:00Z"]), 0)
            final = work / "final"
            self.assertEqual(sorted(p.name for p in final.iterdir() if p.suffix != ".json"), ["decor-rug.webp", "decor-rug@2x.webp"])
            rec = json.loads((final / "decor-rug.post.json").read_text(encoding="utf-8"))
            self.assertEqual([rec["outputs"][k]["format"] for k in ("1x", "2x")], ["webp", "webp"])
            self.assertIn("budget@2x: webp q90", rec["tools"])
            with Image.open(final / "decor-rug@2x.webp") as im:
                self.assertEqual((im.size, im.mode), ((480, 200), "RGBA"))

    def test_demo_runs_the_whole_chain(self):
        with tempfile.TemporaryDirectory() as tmp:
            cmd = [sys.executable, "-I", "-B", str(HERE / "postprocess.py"), "demo", "--scale", "0.25", "--keep", tmp, "--now", "2026-10-18T09:00:00Z"]
            r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
            self.assertEqual(r.returncode, 0, r.stdout[-3000:] + r.stderr[-3000:])
            self.assertIn("demo ok", r.stdout)
            public = Path(tmp) / "public"
            self.assertTrue((public / "hub.webp").exists())
            self.assertFalse((public / "hub.png").exists())
            self.assertTrue((public / "owl-body@2x.png").exists())
            lines = prov.read_lines(Path(tmp) / "provenance.jsonl")
            self.assertEqual(len(lines), 14)
            self.assertTrue(all(set(l) <= set(prov.ALLOWED_FIELDS) for l in lines))
            self.assertTrue(all(l["published_at"] == "2026-10-18T09:00:00Z" for l in lines))
            r2 = subprocess.run(cmd + ["--help"], capture_output=True, text=True, timeout=60)
            self.assertEqual(r2.returncode, 0)

    def test_a_species_master_finishes_and_publishes_as_its_own_layers(self):
        self.assertEqual(species_layers("barn"), ("owl-barn-body", "owl-barn-belly", "owl-barn-accent", "owl-barn-face", "owl-barn-blink"))
        self.assertEqual((owl_layer_base("owl-barn-face"), owl_layer_base("owl-face"), owl_layer_base("hub")), ("owl-face", "owl-face", None))
        self.assertEqual((owl_master_of("owl-snowy-blink"), owl_master_of("owl-body")), ("owl-snowy-master", "owl-master"))
        self.assertEqual(postprocess.expand_publish_keys(["owl-snowy-*", "hub", "owl-body"]), [*species_layers("snowy"), "hub", "owl-body"])
        with tempfile.TemporaryDirectory() as tmp:
            work, public = Path(tmp) / "work", Path(tmp) / "public"
            d = work / "raw" / "owl-barn-master"
            d.mkdir(parents=True)
            public.mkdir()
            master, _ = synth_owl_master(800, 960)
            h = "00000000000000b1"
            (d / f"{h}.png").write_bytes(pngmeta.encode(master))
            (d / f"{h}.json").write_text(json.dumps({"schema": 1, "key": "owl-barn-master", "kind": "owl-edit", "provider": "mock", "model": "m", "hash16": h, "prompt_sha256": "ab" * 32,
                                                     "seed": 1711, "size": "800x960", "generated_at": "t", "key_colour": "#FF00FF",
                                                     "regions": {"body": "#FF0000", "belly": "#00FF00", "accent": "#0000FF"}}), encoding="utf-8")
            (d / "SELECTED").write_text(h + "\n", encoding="utf-8")
            provp = Path(tmp) / "p.jsonl"
            common = ["--work", str(work), "--public", str(public), "--now", "2026-10-20T09:00:00Z"]
            with mock.patch("sys.stderr", new=io.StringIO()) as err, mock.patch("sys.stdout", new=io.StringIO()):
                self.assertEqual(postprocess.main(["owl", "--species", "barn"] + common), 0, err.getvalue())
                for key in species_layers("barn"):
                    self.assertTrue((work / "final" / f"{key}.png").exists(), key)
                    self.assertTrue((work / "final" / f"{key}@2x.png").exists(), key)
                self.assertFalse((work / "final" / "owl-body.png").exists(), "the owl master's own layers are left alone")
                self.assertEqual(json.loads((work / "final" / "owl-barn-master.post.json").read_text())["key"], "owl-barn-master")
                self.assertEqual(postprocess.main(["publish", "owl-barn", "--provenance", str(provp)] + common), 0, err.getvalue())
                self.assertEqual(len(prov.read_lines(provp)), 10)
                self.assertEqual(postprocess.main(["check", "--all", "--provenance", str(provp)] + common), 0, err.getvalue())

    def test_a_flight_master_finishes_as_its_kinds_flight_layers_placed_as_its_master(self):
        # In flight (OP-136) a kind wears its flight body, belly and accent: its master with the folded wings taken away.
        self.assertEqual(flight_layers("barn"), ("owl-barn-flight-body", "owl-barn-flight-belly", "owl-barn-flight-accent"))
        self.assertEqual((flight_layers(None), flight_master(None), flight_master("snowy")), (FLIGHT_LAYERS, "owl-flight-master", "owl-snowy-flight-master"))
        self.assertEqual((owl_layer_base("owl-barn-flight-belly"), owl_master_of("owl-screech-flight-accent"), owl_master_of("owl-flight-body")),
                         ("owl-belly", "owl-screech-flight-master", "owl-flight-master"))
        with tempfile.TemporaryDirectory() as tmp:
            work, public = Path(tmp) / "work", Path(tmp) / "public"
            public.mkdir()
            folded, _ = synth_owl_master(800, 960, wing_left=0.25)
            wingless, _ = synth_owl_master(800, 960)
            for key, img, h in (("owl-barn-master", folded, "00000000000000b1"), ("owl-barn-flight-master", wingless, "00000000000000f1")):
                d = work / "raw" / key
                d.mkdir(parents=True)
                (d / f"{h}.png").write_bytes(pngmeta.encode(img))
                (d / f"{h}.json").write_text(json.dumps({"schema": 1, "key": key, "kind": "owl-edit", "provider": "mock", "model": "m", "hash16": h, "prompt_sha256": "ab" * 32,
                                                         "seed": 1711, "size": "800x960", "generated_at": "t", "key_colour": "#FF00FF",
                                                         "regions": {"body": "#FF0000", "belly": "#00FF00", "accent": "#0000FF"}}), encoding="utf-8")
                (d / "SELECTED").write_text(h + "\n", encoding="utf-8")
            provp = Path(tmp) / "p.jsonl"
            common = ["--work", str(work), "--public", str(public), "--now", "2026-10-28T09:00:00Z"]
            flight = ["owl", "--species", "barn", "--flight"] + common
            with mock.patch("sys.stderr", new=io.StringIO()) as err, mock.patch("sys.stdout", new=io.StringIO()):
                self.assertEqual(postprocess.main(flight), 1, "nothing published to place it against yet")
                self.assertIn("publish owl-barn-master's layers first", err.getvalue())
                self.assertEqual(postprocess.main(["owl", "--species", "barn"] + common), 0, err.getvalue())
                self.assertEqual(postprocess.main(["publish", "owl-barn", "--provenance", str(provp)] + common), 0, err.getvalue())
                # Split with other flags than its layers were finished with, the master is not the one the park draws.
                self.assertEqual(postprocess.main(flight + ["--flip"]), 1)
                self.assertIn("does not give the published owl-barn-body@2x.png", err.getvalue())
                self.assertEqual(postprocess.main(flight), 0, err.getvalue())
                body = np.asarray(Image.open(public / "owl-barn-body@2x.png").convert("LA"))
                flown = np.asarray(Image.open(work / "final" / "owl-barn-flight-body@2x.png").convert("LA"))
                self.assertGreater(np.nonzero((body != flown).any(axis=(1, 2)))[0].min(), 240, "the same owl down to its wing")
                rec = json.loads((work / "final" / "owl-barn-flight-master.post.json").read_text())
                self.assertTrue(rec["split"]["registration"]["like"])
                self.assertTrue(any(t.startswith("owl: species=barn flight, placed and shaded as owl-barn-master") for t in rec["tools"]), rec["tools"])
                self.assertEqual(postprocess.main(["publish", *flight_layers("barn"), "--provenance", str(provp)] + common), 0, err.getvalue())
                self.assertEqual(len(prov.read_lines(provp)), 16)
                self.assertEqual(postprocess.main(["check", "--all", "--provenance", str(provp)] + common), 0, err.getvalue())

    def test_a_seam_between_two_screens_is_cut_across_patched_and_finished_per_screen(self):
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp) / "work"
            west, east = Path(tmp) / "w.webp", Path(tmp) / "e.webp"
            west.write_bytes(webpmeta.encode(Image.new("RGB", (640, 360), (200, 40, 40)), 90))
            east.write_bytes(webpmeta.encode(Image.new("RGB", (640, 360), (40, 40, 200)), 90))
            common = ["--work", str(work), "--now", "2026-10-27T09:00:00Z"]
            pair = f"{west},{east}"
            # The realm as the room server sees it: one room two screens wide.
            geom = fixture_geometry()
            geom["rooms"]["glass"] = {"size": {"w": 3200, "h": 900}, "background": "glass", "walkable": [[{"x": 0, "y": 690}, {"x": 3200, "y": 690}, {"x": 3200, "y": 888}, {"x": 0, "y": 888}]],
                                      "spawns": {"default": {"x": 330, "y": 740}}, "doors": [], "backgrounds": [{"key": "glass", "x": 0, "y": 0}, {"key": "glass-east", "x": 1600, "y": 0}]}
            work.mkdir()
            (work / "geometry.json").write_text(json.dumps(geom), encoding="utf-8")
            with mock.patch("sys.stderr", new=io.StringIO()) as err, mock.patch("sys.stdout", new=io.StringIO()):
                # The crop spans the join at x 640: half of it from each screen.
                self.assertEqual(postprocess.main(["cut", "glass-seam", "--base-key", "glass", "--base", pair, "--box", "512,0,768,360"] + common), 0, err.getvalue())
                crop = np.asarray(Image.open(work / "canvas" / "glass-seam.png")).astype(int)
                self.assertEqual(crop.shape, (360, 256, 3))
                self.assertLess(np.abs(crop[180, 100] - [200, 40, 40]).max(), 8)
                self.assertLess(np.abs(crop[180, 156] - [40, 40, 200]).max(), 8)
                # A crop too big to send whole goes at half size.
                self.assertEqual(postprocess.main(["cut", "glass-seam", "--base-key", "glass", "--base", pair, "--box", "512,0,768,360", "--half"] + common), 0, err.getvalue())
                self.assertEqual(Image.open(work / "canvas" / "glass-seam.png").size, (128, 180))
                # Screens of two heights cannot be laid side by side.
                tall = Path(tmp) / "t.webp"
                tall.write_bytes(webpmeta.encode(Image.new("RGB", (640, 400), (0, 0, 0)), 90))
                self.assertEqual(postprocess.main(["cut", "glass-seam", "--base-key", "glass", "--base", f"{west},{tall}", "--box", "0,0,10,10"] + common), 1)
                # The edit paints the crop grey; its middle half goes in, joined within 16 px of each side.
                edits = work / "raw" / "glass-seam"
                edits.mkdir(parents=True)
                pngmeta.save(Image.new("RGB", (256, 360), (120, 120, 120)), edits / "e1.png")
                self.assertEqual(postprocess.main(["patch", "glass", "--base-key", "glass", "--base", pair, "--edit-key", "glass-seam", "--edit", str(edits / "e1.png"),
                                                   "--at", "512,0", "--box", "64,0,192,360", "--threshold", "0", "--join", "16"] + common), 0, err.getvalue())
                [patched] = (work / "raw" / "glass").glob("*.png")
                sc = json.loads(patched.with_suffix(".json").read_text(encoding="utf-8"))
                self.assertEqual((sc["patched"]["base"]["file"], sc["patched"]["join"], sc["width"], sc["height"]), ("w.webp+e.webp", 16, 1280, 360))
                # Each screen is finished from its half of the patched pair.
                self.assertEqual(postprocess.main(["room", "glass", "--raw", str(patched), "--crop", "left", "--grade", "none"] + common), 0, err.getvalue())
                self.assertEqual(postprocess.main(["room", "glass-east", "--raw", str(patched), "--crop", "right", "--grade", "none"] + common), 0, err.getvalue())
            w1 = np.asarray(Image.open(work / "final" / "glass.webp").convert("RGB")).astype(int)
            e1 = np.asarray(Image.open(work / "final" / "glass-east.webp").convert("RGB")).astype(int)
            self.assertEqual((w1.shape, e1.shape), ((900, 1600, 3), (900, 1600, 3)))
            self.assertLess(np.abs(w1[450, 100] - [200, 40, 40]).max(), 10, "the west screen as it was")
            self.assertLess(np.abs(e1[450, 1500] - [40, 40, 200]).max(), 10, "the east screen as it was")
            self.assertLess(np.abs(w1[450, 1595] - [120, 120, 120]).max(), 10, "both screens meet in the edit")
            self.assertLess(np.abs(e1[450, 4] - [120, 120, 120]).max(), 10)
            rec = json.loads((work / "final" / "glass-east.post.json").read_text(encoding="utf-8"))
            self.assertTrue(any(t.startswith("patch: None seed None (e1.png) pasted into w.webp+e.webp") and "joined along cuts in x" in t for t in rec["tools"]), rec["tools"])
            self.assertIn("room: crop=right", " ".join(rec["tools"]))

    def test_the_street_of_nests_paints_its_west_wing_from_its_painting(self):
        with tempfile.TemporaryDirectory() as tmp:
            work, public = Path(tmp) / "work", Path(tmp) / "public"
            public.mkdir()
            (public / "homes@2x.webp").write_bytes(webpmeta.encode(synth_room(3200, 1800, 7, "grove"), 90))
            with mock.patch("sys.stderr", new=io.StringIO()) as err, mock.patch("sys.stdout", new=io.StringIO()):
                self.assertEqual(postprocess.main(["canvas", "homes-west", "--work", str(work), "--public", str(public)]), 0, err.getvalue())
            canvas = np.asarray(Image.open(work / "canvas" / "homes-west.png")).astype(int)
            self.assertEqual(canvas.shape, (900, 2000, 3))
            self.assertTrue((canvas[:, :1580] == 127).all(), "grey where the wing goes, the painting's west edge on the right")

    def test_wing_finishes_every_screen_and_moves_the_overlay_ends(self):
        with tempfile.TemporaryDirectory() as tmp:
            work, public = Path(tmp) / "work", Path(tmp) / "public"
            public.mkdir()
            provp = Path(tmp) / "p.jsonl"
            common = ["--work", str(work), "--public", str(public), "--provenance", str(provp), "--now", "2026-10-20T09:00:00Z"]
            (work).mkdir()
            (work / "geometry.json").write_text(json.dumps(wide_market_geometry()), encoding="utf-8")
            # The approved painting and its overlay, published with provenance.
            painting = synth_room(3200, 1800, 11, "market")
            (public / "market@2x.webp").write_bytes(webpmeta.encode(painting, 90))
            (public / "market.webp").write_bytes(webpmeta.encode(painting.resize((1600, 900)), 90))
            pngmeta.save(edge_overlay(3200, 1800), public / "market-fg@2x.png")
            pngmeta.save(edge_overlay(1600, 900), public / "market-fg.png")
            for asset, seed in (("market@2x.webp", 1404), ("market-fg@2x.png", 1603)):
                prov.append(provp, prov.build_line(asset=asset, key=asset.split("@")[0].removesuffix(".webp"), logical="2x", sha256="0" * 64, nbytes=1, colors=None, budget_relaxed=False,
                                                   sidecar={"hash16": f"{seed:016x}", "provider": "fal", "model": "m", "prompt_sha256": "cd" * 32, "seed": seed, "size": "3200x1800", "generated_at": "t"},
                                                   published_at="t", tools=[], human_edits=[]))
            # The picked wing candidate.
            d = work / "raw" / "market-east"
            d.mkdir(parents=True)
            h = "00000000000092b2"
            (d / f"{h}.png").write_bytes(pngmeta.encode(TestWings()._model_output(painting.convert("RGB"), "east", 6.0)))
            (d / f"{h}.json").write_text(json.dumps({"schema": 1, "key": "market-east", "kind": "wing", "provider": "fal", "model": "m", "hash16": h, "prompt_sha256": "ef" * 32,
                                                     "seed": 9252, "size": "3040x1368", "generated_at": "t"}), encoding="utf-8")
            (d / "SELECTED").write_text(h + "\n", encoding="utf-8")
            with mock.patch("sys.stderr", new=io.StringIO()) as err, mock.patch("sys.stdout", new=io.StringIO()) as out:
                self.assertEqual(postprocess.main(["canvas", "market-east"] + common[:4]), 0, err.getvalue())
                self.assertEqual(Image.open(work / "canvas" / "market-east.png").size, (2000, 900))
                self.assertEqual(postprocess.main(["canvas", "market"] + common[:4]), 1)
                self.assertEqual(postprocess.main(["wing", "market", "--note", "east B approved by the art director"] + common), 0, err.getvalue())
                final = work / "final"
                self.assertEqual(sorted(p.name for p in final.iterdir() if not p.name.endswith(".json")),
                                 ["market-east-fg.png", "market-east-fg@2x.png", "market-east.webp", "market-east@2x.webp", "market-fg.png", "market-fg@2x.png", "market.webp", "market@2x.webp"])
                rec = {k: json.loads((final / f"{k}.post.json").read_text(encoding="utf-8")) for k in ("market", "market-east", "market-fg", "market-east-fg")}
                self.assertEqual(rec["market-east"]["raw_sidecar"]["seed"], 9252, "a wing records its candidate")
                self.assertEqual(rec["market"]["raw_sidecar"]["seed"], 1404, "the middle screen keeps the painting's own record")
                self.assertEqual(rec["market-east-fg"]["raw_sidecar"]["seed"], 1603)
                self.assertIn("join to market-east (seed 9252", rec["market"]["tools"][0])
                self.assertTrue(rec["market-east-fg"]["overlay_check"]["ok"], rec["market-east-fg"]["overlay_check"])
                self.assertEqual(rec["market-east"]["human_edits"], ["east B approved by the art director"])
                east_fg = np.asarray(Image.open(final / "market-east-fg@2x.png").convert("RGBA"))
                self.assertTrue((east_fg[300:500, 3190:, 3] == 255).all(), "the east post is at the room's east end")
                self.assertTrue((work / "review" / "market-wide.png").exists())
                self.assertIn("publish: pnpm art:finish publish market market-east market-fg market-east-fg", out.getvalue())
                self.assertEqual(postprocess.main(["publish", "market", "market-east", "market-fg", "market-east-fg"] + common), 0, err.getvalue())
                self.assertEqual(postprocess.main(["check", "market", "market-east", "market-fg", "market-east-fg"] + common), 0, out.getvalue()[-2000:])
                lines = [l for l in prov.read_lines(provp) if l["published_at"] == "2026-10-20T09:00:00Z"]
                self.assertEqual(len(lines), 8)
                self.assertEqual({l["seed"] for l in lines if l["key"] == "market-east"}, {9252})
                # A screen the wide room does not draw is left out of the overlay rules, with a warning.
                self.assertEqual(postprocess.main(["check", "hub-fg"] + common), 0)
                # --overlay drop writes no overlay.
                self.assertEqual(postprocess.main(["wing", "market", "--overlay", "drop", "--painting", str(public / "market@2x.webp"), "--out", str(Path(tmp) / "drop")] + common[:2] + common[4:]), 0, err.getvalue())
                self.assertEqual(sorted(p.name for p in (Path(tmp) / "drop").iterdir() if p.suffix == ".webp"), ["market-east.webp", "market-east@2x.webp", "market.webp", "market@2x.webp"])
                self.assertFalse(any((Path(tmp) / "drop").glob("*-fg*")))

    def test_publish_validates_before_touching_the_tree(self):
        with tempfile.TemporaryDirectory() as tmp:
            work, public = Path(tmp) / "work", Path(tmp) / "public"
            (work / "final").mkdir(parents=True)
            public.mkdir()
            pngmeta.save(Image.new("RGB", (1600, 900), (5, 5, 5)), work / "final" / "hub.png")
            (public / "hub.svg").write_text("<svg/>", encoding="utf-8")
            provp = Path(tmp) / "p.jsonl"
            common = ["--work", str(work), "--public", str(public), "--provenance", str(provp), "--now", "2026-10-18T09:00:00Z"]
            with mock.patch("sys.stderr", new=io.StringIO()) as err, mock.patch("sys.stdout", new=io.StringIO()):
                # A note holding an absolute path makes the provenance line unacceptable: nothing may change.
                self.assertEqual(postprocess.main(["publish", "hub", "--retire-svg", "--note", "/abs/path/fixed"] + common), 1)
                self.assertIn("nothing published", err.getvalue())
                self.assertTrue((public / "hub.svg").exists(), "the SVG is still in place")
                self.assertFalse((public / "hub.png").exists(), "no PNG without provenance")
                self.assertFalse((work / "retired-svg" / "hub.svg").exists())
                self.assertFalse(provp.exists())
                self.assertEqual(postprocess.main(["publish", "hub", "--retire-svg", "--note", "picked 3 of 4"] + common), 0)
                self.assertTrue((public / "hub.png").exists())
                self.assertEqual(len(prov.read_lines(provp)), 1)
                self.assertEqual(postprocess.main(["check", "--all"] + common), 0)

    def test_check_requires_provenance_matching_hashes_and_no_stale_2x(self):
        with tempfile.TemporaryDirectory() as tmp:
            work, public = Path(tmp) / "work", Path(tmp) / "public"
            (work / "final").mkdir(parents=True)
            public.mkdir()
            provp = Path(tmp) / "p.jsonl"
            common = ["--work", str(work), "--public", str(public), "--provenance", str(provp), "--now", "2026-10-18T09:00:00Z"]
            pngmeta.save(Image.new("RGB", (1600, 900), (5, 5, 5)), work / "final" / "hub.png")
            pngmeta.save(Image.new("RGB", (3200, 1800), (5, 5, 5)), work / "final" / "hub@2x.png")
            with mock.patch("sys.stderr", new=io.StringIO()), mock.patch("sys.stdout", new=io.StringIO()) as out:
                # A PNG that was never published has no provenance line.
                pngmeta.save(Image.new("RGB", (1600, 900), (9, 9, 9)), public / "hub.png")
                self.assertEqual(postprocess.main(["check", "hub"] + common), 1)
                self.assertIn("no provenance line", out.getvalue())
                self.assertEqual(postprocess.main(["publish", "hub"] + common), 0)
                self.assertTrue((public / "hub@2x.png").exists())
                self.assertEqual(postprocess.main(["check", "hub"] + common), 0)
                # A hand-edited (or stale) file no longer matches its latest line.
                pngmeta.save(Image.new("RGB", (1600, 900), (7, 7, 7)), public / "hub.png")
                self.assertEqual(postprocess.main(["check", "hub"] + common), 1)
                self.assertIn("contents differ from the latest provenance line", out.getvalue())
                # A finish without a 2x removes the stale 2x on publish...
                (work / "final" / "hub@2x.png").unlink()
                self.assertEqual(postprocess.main(["publish", "hub"] + common), 0)
                self.assertIn("removed stale hub@2x.png", out.getvalue())
                self.assertFalse((public / "hub@2x.png").exists())
                self.assertEqual(postprocess.main(["check", "hub"] + common), 0)
                # ...and check flags a 2x that is older than the latest 1x if one comes back.
                pngmeta.save(Image.new("RGB", (3200, 1800), (5, 5, 5)), public / "hub@2x.png")
                self.assertEqual(postprocess.main(["check", "hub"] + common), 1)
                self.assertIn("older than the latest hub.png", out.getvalue())

    def test_presigned_url_never_reaches_the_post_record_or_provenance(self):
        with tempfile.TemporaryDirectory() as tmp:
            work, public = Path(tmp) / "work", Path(tmp) / "public"
            d = work / "raw" / "hub"
            d.mkdir(parents=True)
            public.mkdir()
            img = synth_room(320, 180, 3, "hub")
            data = pngmeta.encode(img)
            h = "0123456789abcdef"
            (d / f"{h}.png").write_bytes(data)
            presigned = "https://bucket.example/seedream/abc.jpeg?X-Tos-Credential=AKIDEXAMPLE%2Freq&X-Tos-Signature=deadbeef"
            (d / f"{h}.json").write_text(json.dumps({"schema": 1, "key": "hub", "kind": "room", "provider": "ark", "model": "m", "hash16": h, "prompt_sha256": "ab" * 32, "seed": 1, "size": "320x180", "source_url": presigned, "generated_at": "t"}), encoding="utf-8")
            (d / "SELECTED").write_text(h + "\n", encoding="utf-8")
            provp = Path(tmp) / "p.jsonl"
            common = ["--work", str(work), "--public", str(public), "--now", "2026-10-18T09:00:00Z"]
            with mock.patch("sys.stderr", new=io.StringIO()), mock.patch("sys.stdout", new=io.StringIO()):
                self.assertEqual(postprocess.main(["room", "hub", "--grade", "none"] + common), 0)
                self.assertEqual(postprocess.main(["publish", "hub", "--provenance", str(provp)] + common), 0)
            self.assertNotIn("deadbeef", (work / "final" / "hub.post.json").read_text(encoding="utf-8"))
            lines = prov.read_lines(provp)
            self.assertEqual(lines[0]["source_url"], "https://bucket.example/seedream/abc.jpeg")
            self.assertNotIn("X-Tos", provp.read_text(encoding="utf-8"))

    def test_publish_refuses_when_svg_exists(self):
        with tempfile.TemporaryDirectory() as tmp:
            work, public = Path(tmp) / "work", Path(tmp) / "public"
            (work / "final").mkdir(parents=True)
            public.mkdir()
            pngmeta.save(Image.new("RGB", (1600, 900), (5, 5, 5)), work / "final" / "hub.png")
            (public / "hub.svg").write_text("<svg/>", encoding="utf-8")
            common = ["--work", str(work), "--public", str(public), "--provenance", str(Path(tmp) / "p.jsonl"), "--now", "2026-10-18T09:00:00Z"]
            with mock.patch("sys.stderr", new=io.StringIO()), mock.patch("sys.stdout", new=io.StringIO()):
                self.assertEqual(postprocess.main(["publish", "hub"] + common), 1)
                self.assertEqual(postprocess.main(["publish", "hub", "--retire-svg"] + common), 0)
                self.assertFalse((public / "hub.svg").exists())
                self.assertTrue((work / "retired-svg" / "hub.svg").exists())
                self.assertTrue((public / "hub.png").exists())
                self.assertEqual(postprocess.main(["check", "--all"] + common), 0)


if __name__ == "__main__":
    unittest.main()


class TestLevel(unittest.TestCase):
    """Levelling the recut's run rows (OP-251): one colour across a row, the alpha and the detail kept."""

    PUBLIC = HERE.parent.parent / "apps" / "park" / "public" / "art"

    @staticmethod
    def ramp(w=320, h=60, lo=110, hi=200, tint=(1.0, 0.9, 0.8)):
        x = np.linspace(lo, hi, w)[None, :, None] * np.array(tint)[None, None, :]
        rgb = np.repeat(x, h, axis=0)
        rgb[::8] *= 0.85  # a joint every 8 rows: detail that must stay
        alpha = np.full((h, w, 1), 255.0)
        alpha[: h // 6] = 0
        return Image.fromarray(np.clip(np.concatenate([rgb, alpha], axis=2), 0, 255).astype(np.uint8), "RGBA")

    def test_a_ramp_comes_out_level_with_its_alpha_and_its_joints(self):
        img = self.ramp()
        target = level.row_target([img])
        out, params = level.level_piece(img, target)
        prof = level.column_profiles(out)[0]
        mid = prof[20:-20]
        self.assertLess(float(mid.max() - mid.min()), 3.0, "the left-to-right drift is gone")
        self.assertAlmostEqual(params["L_after"], target[0], delta=1.5)
        self.assertTrue(np.array_equal(np.asarray(out)[..., 3], np.asarray(img)[..., 3]), "the alpha is untouched")
        L = np.asarray(out.convert("L"), dtype=float)
        self.assertGreater(float(L[16:, 160].std()), 3.0, "the joints inside the piece stay")

    def test_the_same_input_gives_the_same_output(self):
        img = self.ramp()
        t = level.row_target([img])
        self.assertEqual(level.level_piece(img, t)[0].tobytes(), level.level_piece(img, t)[0].tobytes())

    def test_every_published_recut_row_reads_as_one_colour_across(self):
        rows = ["plank", "plank-thin", "plank-rail", "branch", "branch-thin", "branch-mossy", "stone", "stone-thin", "stone-mossy", "earth", "earth-thin", "earth-path"]
        parts = ["cap-left", "mid-320", "mid-480", "mid-640", "cap-right"]
        for row in rows:
            files = [self.PUBLIC / f"kit-cut-{row}-{p}.webp" for p in parts]
            if not all(f.exists() for f in files):
                self.skipTest(f"the {row} row is not in this checkout")
            means = [level.mean_L(Image.open(f)) for f in files]
            self.assertLess(max(means) - min(means), 4.0, f"{row}: its pieces differ in lightness ({', '.join(f'{m:.1f}' for m in means)})")


class TestBands(unittest.TestCase):
    """The value bands (OP-250): the targets set them, the grade reaches them, every published layer keeps them."""

    TARGETS = HERE / "targets"
    PUBLIC = HERE.parent.parent / "apps" / "park" / "public" / "art"

    def test_the_targets_measure_inside_the_bands_they_set(self):
        from PIL import Image
        for key, bands_of in (("l4", {}), ("plaza", {}), ("clearing", {})):
            f = self.TARGETS / f"target-{key}.png"
            if not f.exists():
                self.skipTest(f"{f.name} is not in this checkout")
            m = bands.measure_target(Image.open(f))
            self.assertEqual(bands.problems(m["sky"], "sky"), [], f"{key}: the sky band is the sky layer's band")
            self.assertEqual(bands.problems(m["backdrop"], "mid"), [], f"{key}: the backdrop band is the middle layer's band")
            self.assertEqual(bands.problems(m["floor"], "walk"), [], f"{key}: the floor band is the walkable layer's band")
            self.assertGreaterEqual(m["floor"]["contrast"], 7.5, f"{key}: the floor carries the most contrast")
            self.assertGreater(m["floor"]["L_mean"], m["backdrop"]["L_mean"], f"{key}: the floor is lighter than the backdrop")
            self.assertGreater(m["backdrop"]["L_mean"], m["sky"]["L_mean"], f"{key}: the backdrop is lighter than the sky")

    def test_every_published_backdrop_layer_is_inside_its_band(self):
        from PIL import Image
        assets = load_assets()
        keys = sorted(k for k, v in assets.items() if v.get("kind") == "layer" and (self.PUBLIC / f"{k}.webp").exists())
        if not keys:
            self.skipTest("no published backdrop layer in this checkout")
        failures = []
        for key in keys:
            band, limits = bands.band_of(key)
            with Image.open(self.PUBLIC / f"{key}.webp") as im:
                probs = bands.problems(bands.stats(im), limits)
            if probs:
                failures.append(f"{key} [{band}]: {'; '.join(probs)}")
        self.assertEqual(failures, [], "outside their value bands (docs/TREE_STYLE.md 2b; `pnpm art:finish bands --all`):\n" + "\n".join(failures))

    def _loud_layer(self, w: int, h: int, keyed: bool) -> "Image.Image":
        """A bright, hard, saturated layer: a checker of lantern gold and navy with a soft top (keyed) edge."""
        from PIL import Image
        y, x = np.mgrid[0:h, 0:w]
        checker = ((x // 24 + y // 24) % 2).astype(np.float64)
        rgb = np.stack([30 + checker * 225, 40 + checker * 170, 120 - checker * 90], -1)
        rgb += 20 * np.sin(x / 50.0)[..., None]
        arr = np.clip(rgb, 0, 255).astype(np.uint8)
        if not keyed:
            return Image.fromarray(arr, "RGB")
        alpha = np.clip((y - h * 0.3) / (h * 0.1), 0, 1) * 255
        alpha[(x // 64 + y // 64) % 7 == 0] = 0
        return Image.fromarray(np.dstack([arr, np.round(alpha).astype(np.uint8)]), "RGBA")

    def test_the_grade_reaches_the_band_keeps_the_alpha_and_repeats_itself(self):
        for band, w, h, keyed in (("sky", 400, 225, False), ("far", 400, 225, True), ("mid", 200, 112, True)):
            img = self._loud_layer(w, h, keyed)
            before = bands.stats(img)
            self.assertTrue(bands.problems(before, band), f"{band}: the synthetic layer starts outside its band")
            out, params = bands.grade_to_band(img, band, (40, 60, 100))
            self.assertEqual(out.mode, img.mode)
            self.assertEqual(bands.problems(bands.stats(out), band), [], f"{band}: {params}")
            if keyed:
                self.assertEqual(out.getchannel("A").tobytes(), img.getchannel("A").tobytes(), "the alpha is untouched")
                self.assertIn("haze", params)
                self.assertIn("blur", params)
            else:
                self.assertNotIn("haze", params)
            again, _ = bands.grade_to_band(img, band, (40, 60, 100))
            self.assertEqual(again.tobytes(), out.tobytes(), "deterministic")
            self.assertTrue(bands.tools_line(params).startswith(f"bands: {band}"))
        # a layer already inside its band is left as it is apart from the soft pass it is entitled to
        from PIL import Image
        calm = Image.new("RGB", (400, 225), (28, 36, 60))
        out, params = bands.grade_to_band(calm, "sky")
        self.assertEqual(out.tobytes(), calm.tobytes())
        self.assertEqual(sorted(params), ["after", "band", "before"])

    def test_the_bands_command_grades_in_place_with_provenance_and_a_dry_run_writes_nothing(self):
        from PIL import Image
        area = next(iter(postprocess.kit_table()["areas"]))
        sky_key, far_key, mid_key = f"kit-{area}-sky-a", f"kit-{area}-far-a", f"kit-{area}-mid-b"
        with tempfile.TemporaryDirectory() as td:
            public = Path(td) / "art"
            public.mkdir()
            prov_path = Path(td) / "provenance.jsonl"
            for key, w, h, keyed in ((sky_key, 1600, 900, False), (far_key, 1600, 900, True), (mid_key, 800, 450, True)):
                data, _ = webpmeta.encode_under_budget(self._loud_layer(w, h, keyed), BUDGET_BYTES)
                (public / f"{key}.webp").write_bytes(data)
                prov.append(prov_path, prov.build_line(asset=f"{key}.webp", key=key, logical="1x", sha256=postprocess.sha256_bytes(data), nbytes=len(data), colors=None, budget_relaxed=False,
                                                       sidecar={"hash16": "ab" * 8, "provider": "mock", "seed": 5}, published_at="2026-11-03T00:00:00Z", tools=["layer: heal band=0.2"], human_edits=["picked"]))
            before = {f.name: f.read_bytes() for f in public.iterdir()}
            common = ["--public", str(public), "--provenance", str(prov_path), "--work", str(Path(td) / "work"), "--now", "2026-11-03T01:00:00Z"]
            self.assertEqual(postprocess.main(["bands", "--all", "--dry-run", *common]), 0)
            self.assertEqual({f.name: f.read_bytes() for f in public.iterdir()}, before, "a dry run writes nothing")
            self.assertEqual(len(prov.read_lines(prov_path)), 3)
            self.assertEqual(postprocess.main(["bands", "--all", "--note", "graded into the bands", *common]), 0)
            lines = prov.read_lines(prov_path)
            self.assertEqual(len(lines), 6)
            for key in (sky_key, far_key, mid_key):
                data = (public / f"{key}.webp").read_bytes()
                self.assertNotEqual(data, before[f"{key}.webp"])
                line = [l for l in lines if l["asset"] == f"{key}.webp"][-1]
                self.assertEqual((line["sha256"], line["bytes"], line["raw_hash16"], line["seed"]), (postprocess.sha256_bytes(data), len(data), "ab" * 8, 5))
                self.assertEqual(line["tools"][0], "layer: heal band=0.2")
                self.assertTrue(any(t.startswith("bands: ") for t in line["tools"]), line["tools"])
                self.assertEqual(line["human_edits"], ["picked", "graded into the bands"])
                self.assertEqual(prov.problems(line), [])
                with Image.open(public / f"{key}.webp") as im:
                    self.assertEqual(bands.problems(bands.stats(im), bands.band_of(key)[1]), [], key)
                    if key != sky_key:
                        with Image.open(io.BytesIO(before[f"{key}.webp"])) as was:
                            self.assertEqual(im.getchannel("A").tobytes(), was.getchannel("A").tobytes(), "the alpha is untouched")
            self.assertTrue((Path(td) / "work" / "review" / f"bands-{area}.png").exists())
            # a second run skips what is graded already
            after = {f.name: f.read_bytes() for f in public.iterdir()}
            self.assertEqual(postprocess.main(["bands", "--all", *common]), 0)
            self.assertEqual({f.name: f.read_bytes() for f in public.iterdir()}, after)
            self.assertEqual(len(prov.read_lines(prov_path)), 6)


class TestKit(unittest.TestCase):
    """The art kit (OP-229): healing a texture to tile, and cutting a sheet's cells into pieces."""

    def test_heal_tile_makes_a_painting_wrap(self):
        from PIL import Image
        rng = np.random.default_rng(7)
        # a smooth non-tiling field: a gradient plus low-frequency blobs, strong mismatch at the edges
        y, x = np.mgrid[0:256, 0:256].astype(np.float32)
        base = 128 + 90 * np.sin(x / 40) * np.cos(y / 37) + (x - 128) * 0.4
        arr = np.stack([base, base * 0.8 + 20, base * 0.6 + 40], -1) + rng.normal(0, 3, (256, 256, 3))
        img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
        before = postprocess.tile_seam_ratio(img)
        self.assertGreater(max(before["seam_x"], before["seam_y"]), 3.0)
        healed = postprocess.heal_tile(img)
        after = postprocess.tile_seam_ratio(healed)
        self.assertLess(max(after["seam_x"], after["seam_y"]), 1.6)
        small = postprocess.resize_tiling(healed, 128)
        self.assertEqual(small.size, (128, 128))
        self.assertLess(max(postprocess.tile_seam_ratio(small).values()), 1.6)
        # a keyed layer healed sideways only: its alpha wraps too, and the up-and-down edges are untouched
        rgba = img.convert("RGBA")
        rgba.putalpha(Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "L"))
        side = postprocess.heal_tile(rgba, axes=(1,))
        self.assertEqual(side.mode, "RGBA")
        self.assertLess(postprocess.tile_seam_ratio(side)["seam_x"], 1.6)
        # the up-and-down wrap is neither healed nor broken by a sideways pass
        self.assertAlmostEqual(postprocess.tile_seam_ratio(side)["seam_y"], postprocess.tile_seam_ratio(rgba)["seam_y"], delta=0.6)

    def test_trim_key_frame_cuts_a_painted_border_of_the_key_colour(self):
        from PIL import Image
        # the model paints its magenta a little off (255, 1, 191): the border is sampled, not assumed
        img = Image.new("RGB", (400, 200), (255, 1, 191))
        panel = Image.new("RGB", (300, 120), (30, 40, 90))
        img.paste(panel, (60, 50))
        out, trim = postprocess.trim_key_frame(img, "#FF00FF")
        self.assertEqual(trim, (60, 50, 40, 30))
        self.assertEqual(out.size, (300, 120))
        # a painting that reaches its edges is left alone
        same, none = postprocess.trim_key_frame(panel, "#FF00FF")
        self.assertEqual(none, (0, 0, 0, 0))
        self.assertIs(same, panel)

    def test_layer_fade_top_ramps_the_alpha_in_below_the_first_opaque_row(self):
        from PIL import Image
        kit = postprocess.kit_table()
        area = next(iter(kit["areas"]))
        key = f"kit-{area}-far-a"
        with tempfile.TemporaryDirectory() as td:
            work = Path(td) / "work"
            raw_dir = work / "raw" / key
            raw_dir.mkdir(parents=True)
            img = Image.new("RGB", (2048, 1152), (255, 0, 255))
            img.paste(Image.new("RGB", (2048, 600), (40, 60, 90)), (0, 552))
            img.save(raw_dir / "bbbbbbbbbbbbbbbb.png")
            (raw_dir / "bbbbbbbbbbbbbbbb.json").write_text(json.dumps({"schema": 1, "key": key, "key_colour": "#FF00FF", "hash16": "bbbbbbbbbbbbbbbb"}))
            (raw_dir / "SELECTED").write_text("bbbbbbbbbbbbbbbb")
            (work / "final").mkdir()
            rc = postprocess.main(["layer", key, "--work", str(work), "--no-heal", "--fade-top", "100"])
            self.assertEqual(rc, 0)
            out = np.asarray(Image.open(work / "final" / f"{key}.webp").convert("RGBA"))[..., 3]
            top = int(np.nonzero((out > 0).any(axis=1))[0][0])
            self.assertLess(out[top + 10].mean(), 60, "the first rows below the edge are nearly clear")
            self.assertGreater(out[top + 95].mean(), 200, "the ramp reaches opaque about --fade-top px down")
            self.assertEqual(out[-1].min(), 255, "the bottom stays opaque")

    def test_a_landmark_is_a_one_piece_sheet_on_its_own_canvas(self):
        from PIL import Image, ImageDraw
        kit = postprocess.kit_table()
        name = next(iter(kit["landmarks"]))
        key = f"kit-sheet-landmark-{name}"
        sheet, prefix = postprocess.kit_sheet(key)
        self.assertEqual((prefix, len(sheet["pieces"]), sheet["pieces"][0]["name"]), ("kit-landmark-", 1, name))
        with tempfile.TemporaryDirectory() as td:
            work = Path(td) / "work"
            raw_dir = work / "raw" / key
            raw_dir.mkdir(parents=True)
            img = Image.new("RGB", (1024, 1024), (255, 0, 255))
            d = ImageDraw.Draw(img)
            d.ellipse((312, 212, 712, 812), fill=(74, 51, 34))
            d.ellipse((452, 100, 572, 240), fill=(201, 162, 39))
            img.save(raw_dir / "cccccccccccccccc.png")
            (raw_dir / "cccccccccccccccc.json").write_text(json.dumps({"schema": 1, "key": key, "key_colour": "#FF00FF", "hash16": "cccccccccccccccc"}))
            (raw_dir / "SELECTED").write_text("cccccccccccccccc")
            (work / "final").mkdir()
            rc = postprocess.main(["pieces", key, "--work", str(work), "--grow", "2"])
            self.assertEqual(rc, 0)
            piece = kit["landmarks"][name]
            one = Image.open(work / "final" / f"kit-landmark-{name}.webp")
            self.assertEqual((one.mode, one.size), ("RGBA", (piece["w"], piece["h"])))
            self.assertTrue((work / "final" / f"kit-landmark-{name}@2x.webp").exists())

    def test_a_target_is_kept_as_reference_art_with_its_own_provenance(self):
        from PIL import Image
        key = "target-l4"
        with tempfile.TemporaryDirectory() as td:
            work = Path(td) / "work"
            raw_dir = work / "raw" / key
            raw_dir.mkdir(parents=True)
            Image.new("RGB", (1600, 900), (44, 76, 122)).save(raw_dir / "dddddddddddddddd.png")
            (raw_dir / "dddddddddddddddd.json").write_text(json.dumps({"schema": 1, "key": key, "hash16": "dddddddddddddddd", "provider": "fal", "seed": 9800, "size": "1600x900"}))
            (raw_dir / "SELECTED").write_text("dddddddddddddddd")
            (work / "final").mkdir()
            out = Path(td) / "targets"
            rc = postprocess.main(["target", key, "--work", str(work), "--targets-dir", str(out), "--note", "approved by the owner in chat"])
            self.assertEqual(rc, 0)
            kept = Image.open(out / f"{key}.png")
            self.assertEqual(kept.size, (1600, 900))
            lines = [json.loads(l) for l in (out / "provenance.jsonl").read_text().splitlines()]
            self.assertEqual((len(lines), lines[0]["key"], lines[0]["asset"], lines[0]["raw_hash16"], lines[0]["seed"]), (1, key, f"{key}.png", "dddddddddddddddd", 9800))
            self.assertEqual(lines[0]["human_edits"], ["approved by the owner in chat"])
            self.assertEqual(postprocess.prov.problems(lines[0]), [])

    def test_runs_cuts_caps_and_three_middles_from_each_run(self):
        from PIL import Image, ImageDraw
        kit = postprocess.kit_table()
        material = next(iter(kit["recut"]["runs"]))
        run = kit["recut"]["runs"][material]
        key = f"kit-sheet-cut-run-{material}"
        with tempfile.TemporaryDirectory() as td:
            work = Path(td) / "work"
            raw_dir = work / "raw" / key
            raw_dir.mkdir(parents=True)
            img = Image.new("RGB", (2720, 1530), (255, 0, 255))
            d = ImageDraw.Draw(img)
            for i, row in enumerate(run["rows"]):
                h2 = 2 * row["h"]
                y = 120 + i * 480
                d.rectangle((100, y, 2620, y + h2), fill=(74, 51, 34))
                d.rectangle((100, y, 2620, y + 12), fill=(140, 110, 70))
            img.save(raw_dir / "eeeeeeeeeeeeeeee.png")
            (raw_dir / "eeeeeeeeeeeeeeee.json").write_text(json.dumps({"schema": 1, "key": key, "key_colour": "#FF00FF", "hash16": "eeeeeeeeeeeeeeee"}))
            (raw_dir / "SELECTED").write_text("eeeeeeeeeeeeeeee")
            (work / "final").mkdir()
            rc = postprocess.main(["runs", key, "--work", str(work)])
            self.assertEqual(rc, 0)
            row = run["rows"][0]
            for part, w in (("cap-left", kit["recut"]["cap"]), ("cap-right", kit["recut"]["cap"]), *[(f"mid-{n}", n) for n in kit["recut"]["lengths"]]):
                # a wholly opaque piece is written without an alpha channel, so it opens as RGB
                one = Image.open(work / "final" / f"kit-cut-{row['name']}-{part}.webp").convert("RGBA")
                self.assertEqual(one.size, (w, row["h"]), part)
                a = np.asarray(one)[..., 3]
                self.assertGreater(a.mean(), 250, f"{part}: a run piece is opaque")
            self.assertEqual(len(list((work / "final").glob("kit-cut-*.webp"))), 2 * 5 * len(run["rows"]))

    def test_columns_cuts_full_height_pieces_and_heals_the_tile(self):
        from PIL import Image, ImageDraw
        kit = postprocess.kit_table()
        name, col = next((n, c) for n, c in kit["recut"]["columns"].items() if n != "about")
        key = f"kit-sheet-cut-col-{name}"
        with tempfile.TemporaryDirectory() as td:
            work = Path(td) / "work"
            raw_dir = work / "raw" / key
            raw_dir.mkdir(parents=True)
            W, H = [int(v) for v in col["size"].split("x")]
            img = Image.new("RGB", (W, H), (255, 0, 255))
            d = ImageDraw.Draw(img)
            xs = [(120, 560), (700, 1500), (1640, 2000)]
            for (x0, x1) in xs:
                d.rectangle((x0, 0, x1, H), fill=(74, 51, 34))
                for y in range(0, H, 40):
                    d.rectangle((x0, y, x1, y + 6), fill=(50, 34, 22))
            img.save(raw_dir / "ffffffffffffffff.png")
            (raw_dir / "ffffffffffffffff.json").write_text(json.dumps({"schema": 1, "key": key, "key_colour": "#FF00FF", "hash16": "ffffffffffffffff"}))
            (raw_dir / "SELECTED").write_text("ffffffffffffffff")
            (work / "final").mkdir()
            rc = postprocess.main(["columns", key, "--work", str(work)])
            self.assertEqual(rc, 0)
            for p in col["pieces"]:
                one = Image.open(work / "final" / f"kit-cut-{p['name']}.webp").convert("RGBA")
                self.assertEqual(one.size, (p["w"], p["h"]), p["name"])
                a = np.asarray(one)[..., 3]
                self.assertGreater(a.mean(), 250, f"{p['name']}: a column piece is opaque")
                self.assertGreater(a[0].mean(), 250, f"{p['name']}: cut straight at the top")
                self.assertGreater(a[-1].mean(), 250, f"{p['name']}: cut straight at the bottom")
            tile = next(p for p in col["pieces"] if p.get("tile"))
            two = np.asarray(Image.open(work / "final" / f"kit-cut-{tile['name']}@2x.webp").convert("RGB")).astype(float)
            self.assertLess(float(np.abs(two[0] - two[-1]).mean()), 12.0, "the tile's top and bottom rows meet")

    def test_pieces_cuts_six_cells_into_their_keys(self):
        from PIL import Image, ImageDraw
        kit = postprocess.kit_table()
        name, sheet = next(iter(kit["sheets"].items()))
        key = f"kit-sheet-{name}"
        with tempfile.TemporaryDirectory() as td:
            work = Path(td) / "work"
            raw_dir = work / "raw" / key
            raw_dir.mkdir(parents=True)
            img = Image.new("RGB", (2048, 1152), (255, 0, 255))
            d = ImageDraw.Draw(img)
            for i in range(6):
                cx, cy = (i % 3 + 0.5) * 2048 / 3, (i // 3 + 0.5) * 576
                d.ellipse((cx - 200, cy - 120, cx + 200, cy + 120), fill=(74, 51, 34))
                d.ellipse((cx - 60, cy - 200, cx + 60, cy - 80), fill=(201, 162, 39))
            img.save(raw_dir / "aaaaaaaaaaaaaaaa.png")
            (raw_dir / "aaaaaaaaaaaaaaaa.json").write_text(json.dumps({"schema": 1, "key": key, "key_colour": "#FF00FF", "hash16": "aaaaaaaaaaaaaaaa"}))
            (raw_dir / "SELECTED").write_text("aaaaaaaaaaaaaaaa")
            (work / "final").mkdir()
            rc = postprocess.main(["pieces", key, "--work", str(work)])
            self.assertEqual(rc, 0)
            for p in sheet["pieces"]:
                pkey = f"kit-{p['name']}"
                one = work / "final" / f"{pkey}.webp"
                self.assertTrue(one.exists(), pkey)
                with Image.open(one) as im:
                    self.assertEqual(im.size, (p.get("w", sheet["w"]), p.get("h", sheet["h"])))
                    self.assertIn("A", im.getbands())
                rec = json.loads((work / "final" / f"{pkey}.post.json").read_text())
                self.assertEqual(rec["sheet"]["key"], key)
                self.assertEqual(rec["sheet"]["cell"], sheet["pieces"].index(p) + 1)
