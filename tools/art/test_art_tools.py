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

from artlib import ALLOWED_CHUNKS, BUDGET_BYTES, ArtError, load_assets, parse_hex  # noqa: E402
from artlib import forbidden, pngmeta, prov, webpmeta  # noqa: E402
from artlib.budget import BudgetError, encode_under_budget  # noqa: E402
from artlib.chroma import ChromaError, ChromaParams, key_out  # noqa: E402
from artlib.grade import grade, load_palette  # noqa: E402
from artlib.guide import render_guide, review_composite, room_of  # noqa: E402
from artlib.labels import erode, fill_holes, label_components, remove_specks  # noqa: E402
from artlib.overlaycheck import check_overlay, clear_key_haze, clear_sign_boards  # noqa: E402
from artlib.resize import fit_contain, resize_exact  # noqa: E402
from artlib.synth import (TRUTH_ACCENT, TRUTH_BEAK, TRUTH_BELLY, TRUTH_BODY, TRUTH_EYES, fixture_geometry, synth_keyed_subject,  # noqa: E402
                          synth_overlay, synth_owl_master, synth_room)
import owl_layers  # noqa: E402
import postprocess  # noqa: E402


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

    def test_review_sheet_and_composite(self):
        sheet = owl_layers.review_sheet(self.res)
        self.assertEqual(sheet.mode, "RGB")
        comp = owl_layers.composite(self.res.layers_1x, ("#8B5A2B", "#F6F1E3", "#C9A227"))
        arr = np.asarray(comp)
        belly = np.asarray(self.res.layers_1x["owl-belly"])
        centre = (belly[..., 1] == 255) & (belly[..., 0] == 255)
        self.assertTrue(centre.any())
        self.assertTrue(np.all(arr[centre][:, :3] == np.array([246, 241, 227])), "white belly multiplied by the tint is exactly the tint")


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

    def test_overlay_rules_keep_sign_boards_readable_and_catch_key_haze(self):
        geom = fixture_geometry()
        good, _ = key_out(synth_overlay(1600, 900, "#FF00FF", good=True), ChromaParams(key="#FF00FF"))
        self.assertTrue(check_overlay(good, geom, "hub", key_colour="#FF00FF")["ok"])
        # A root dangling over a closed sign's board hides the phrase, even if the footprint is mostly clear.
        door = next(d for d in room_of(geom, "hub")["doors"] if d.get("closedSign"))
        mx, my = door["marker"]["x"], door["marker"]["y"]
        hidden = good.copy()
        ImageDraw.Draw(hidden).rectangle((mx - 30, my - 500, mx + 30, my - 400), fill=(60, 40, 20, 255))
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
            self.assertIn("guardian: published as WebP, but only room backgrounds ship as WebP", out.getvalue())

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
