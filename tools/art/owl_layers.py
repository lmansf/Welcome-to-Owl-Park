#!/usr/bin/env python3
"""Owl master splitter: one key-coloured generation -> the five layers the game loads.

Input: a master image of the mascot on a flat magenta backdrop (#FF00FF) painted in the
key-colour convention that the generator's owl job sends (``prompts.mjs`` OWL_REGIONS, mirrored
by ``tools/art/config/owl-keys.json``): body, head, wings and ear tufts pure red (hue 0), chest
patch pure green (hue 120), accent parts (tuft tips, wing tips, tail) pure blue (hue 240),
shading only as darker tones of those hues, eyes cream / navy / a catchlight and a gold beak and
feet. The three key hues are 120 degrees apart and the backdrop magenta (hue 300) is 60 degrees
from red and blue and 180 from green, so a hue window of 24-28 degrees classifies every region;
everything that is not a key hue inside the head is the face. The candidate's sidecar
(``key_colour`` and ``regions``) overrides the table, so a master painted in other hues still
splits as long as the generator recorded them.

Output: ``owl-body``, ``owl-belly``, ``owl-accent`` as white tintable layers and ``owl-face``,
``owl-blink`` in fixed colours, at 200 x 240 (feet at (100, 240)) and a 400 x 480 @2x set
(feet at (200, 480)), as the loader in ``apps/park/src/game/art.ts`` expects.

Why the tintable layers carry shading as grey LUMINANCE with full alpha, never as alpha:
``apps/park/src/game/Owl.ts`` tints each layer by multiplication. On WebGL ``setTint`` multiplies
every texel's RGB by the visitor's colour; the Canvas fallback ``tintedLayer`` draws the layer,
fills it with the colour in ``multiply`` mode and then masks with ``destination-in`` using the
layer's own alpha. In both paths white becomes exactly the chosen colour and a grey becomes that
colour darker, while alpha only controls coverage. Had shading been stored in alpha, the room
would show through every shadow on the body and the body's tint would bleed through the
belly and accent shadows, desaturating the picked colours and changing with the background.
Multiplication can only darken, so the lit base of each region is mapped to white (the
``lit_percentile`` of the region's HSV value) and all modelling is shadow, clipped at
``luminance_floor`` (0.45) so shadows never go black under the palette's darkest bodies
(#2F3E5C, #5C4033). Glints and highlights brighter than the base belong in the face layer.

Deviation from the written spec, on purpose: the body layer is the WHOLE silhouette
(under-painted beneath the belly, the accent and the face), not silhouette minus belly minus
accent. The inter-region borders are feathered by a 3 x 3 mean so they do not alias, and with a
cut-out body the two half-covered borders would leave a one-pixel seam where the room shows
through; with a full under-paint the seam is merely a slightly darker line. The body's luminance
under the face is not observable in the master, so it is filled from the ring around each face
component (that fill is what shows during a blink, where the eyes are cleared).

Pipeline: matte (artlib.chroma) -> HSV classification -> face by component size and position
with an enclosed-island rule (pupils, irises and glints can never leak into body/accent) ->
absorption of unlabelled highlights and dark shading into the nearest region (order belly,
accent, body); a non-key component at the feet (gold feet in a fixed colour) also goes to the
face layer, so it is never tinted -> closing -> luminance mapping -> blink (programmatic lid strokes, or from an
eyes-closed edit of the master) -> registration (bbox height 220 of 240 logical, the feet
centroid at the horizontal centre, and the scale capped so the wider side of the feet-centred
silhouette still fits 196 of the 200 px, so a tail or wing to one side is never clipped; any
opaque pixel left on the canvas edge is reported) -> Lanczos downsampling from the
full-resolution layers, premultiplied by Pillow so edges keep no fringe.
Hand-fix path: ``--labels <png>`` takes an edited label map (pure colours: body blue, belly
magenta, accent red, face yellow; these are the label-map colours, not the master's hues) and
skips the classification steps.

Usage: python3 -B tools/art/owl_layers.py <master.png> [--out dir] [--keys owl-keys.json]
       [--height 220] [--flip] [--blink from:<png>] [--labels <png>] [--debug <dir>] [--sheet <png>]
Deterministic: same inputs and parameters give byte-identical files.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

try:
    import numpy as np  # noqa: E402
    from PIL import Image, ImageDraw, ImageFont, ImageOps  # noqa: E402
except ImportError as _missing:  # pragma: no cover - depends on the machine
    print(f"pnpm art:finish needs Pillow 12 and numpy ({_missing.name or 'a module'} is missing): python3 -m pip install pillow numpy (a venv is fine)", file=sys.stderr)
    sys.exit(2)

from artlib import CONFIG_DIR, OWL_H, OWL_W, ArtError, hex_of, parse_hex  # noqa: E402
from artlib.chroma import ChromaParams, key_out  # noqa: E402
from artlib.labels import (bbox_of, component_areas, component_bboxes, component_centroids, dilate, enclosed_by,  # noqa: E402
                           label_components, closing, mean_filter, remove_specks)
from artlib import pngmeta  # noqa: E402

DEFAULT_KEYS_PATH = CONFIG_DIR / "owl-keys.json"
L_NONE, L_BODY, L_BELLY, L_ACCENT, L_FACE = 0, 1, 2, 3, 4
LABEL_NAMES = {L_BODY: "body", L_BELLY: "belly", L_ACCENT: "accent", L_FACE: "face"}
LABEL_COLOURS = {L_NONE: (0, 0, 0), L_BODY: (0, 0, 255), L_BELLY: (255, 0, 255), L_ACCENT: (255, 0, 0), L_FACE: (255, 255, 0)}
LAYER_KEYS = ("owl-body", "owl-belly", "owl-accent", "owl-face", "owl-blink")
#: Three looks from packages/shared/src/look.ts for the review composites (default first).
REVIEW_LOOKS = (("#8B5A2B", "#F6F1E3", "#C9A227"), ("#2F3E5C", "#BFC9D6", "#00E5FF"), ("#5C4033", "#E8D8B8", "#FF2AA1"))


def load_keys(path: Path | None = None) -> dict:
    p = Path(path) if path else DEFAULT_KEYS_PATH
    keys = json.loads(p.read_text(encoding="utf-8"))
    keys.setdefault("backdrop", "#FF00FF")
    keys.setdefault("regions", {"body": {"hue": 0, "window": 28}, "belly": {"hue": 120, "window": 24}, "accent": {"hue": 240, "window": 24}})
    keys.setdefault("min_sat", 0.45)
    keys.setdefault("min_val", 0.22)
    keys.setdefault("face_min_area_frac", 0.0004)
    keys.setdefault("face_rect", [0.18, 0.12, 0.64, 0.42])
    # Non-key components become fixed-colour (face layer) pixels when their centroid lies in one
    # of these rects (fractions of the silhouette bbox): the head, and a band at the feet so a
    # master whose feet are painted in a fixed colour (gold) keeps them instead of tinting them.
    keys.setdefault("fixed_rects", [list(keys["face_rect"]), [0.0, 0.88, 1.0, 0.12]])
    keys.setdefault("luminance_floor", 0.45)
    keys.setdefault("lit_percentile", 92)
    keys.setdefault("shade_gamma", 1.0)
    keys.setdefault("blink", {"width_frac": 0.025, "bow_frac": 0.3, "colour": "#0C1E36"})
    keys.setdefault("registration", {"height": 220, "max_width": 196, "feet_rows_frac": 0.06})
    # Opaque specks on the backdrop smaller than this share of the owl are dropped before
    # registration (one stray pixel in a corner would otherwise stretch the box and shrink the owl).
    keys.setdefault("speck_frac", 0.002)
    return keys


def for_species(keys: dict, species: str | None) -> dict:
    """The table with a species' overrides from ``species.<id>`` applied (region entries are merged).

    A species painted with a different face (dark eyes with no cream ring, eyes set wider) needs a
    few different thresholds; everything it does not name keeps the owl master's value. A new
    ``face_rect`` without ``fixed_rects`` moves the head rect of ``fixed_rects`` with it.
    """
    over = (keys.get("species") or {}).get(species) if species else None
    if not over:
        return keys
    out = json.loads(json.dumps(keys))
    for name, value in over.items():
        if name == "regions":
            for region, fields in value.items():
                out["regions"].setdefault(region, {}).update(fields)
        else:
            out[name] = value
    if "face_rect" in over and "fixed_rects" not in over:
        out["fixed_rects"] = [list(over["face_rect"])] + [r for r in keys.get("fixed_rects", [])[1:]]
    return out


@dataclass
class OwlSplit:
    layers_1x: dict[str, Image.Image]
    layers_2x: dict[str, Image.Image]
    label_map: Image.Image
    matte: Image.Image
    info: dict = field(default_factory=dict)


def _circ_dist(hue_deg: np.ndarray, centre: float) -> np.ndarray:
    d = np.abs(hue_deg - centre) % 360.0
    return np.minimum(d, 360.0 - d)


def matte(master: Image.Image, keys: dict, chroma: ChromaParams | None = None) -> tuple[np.ndarray, np.ndarray, dict]:
    """Returns (clean RGB uint8, alpha float 0..1, info)."""
    p = chroma or ChromaParams(key=keys.get("backdrop", "#FF00FF"), despill_band=4)
    rgba, info = key_out(master, p)
    arr = np.asarray(rgba).copy()
    # The chroma key keeps anything touching the frame (it is a frame element in a room); an owl
    # touches the frame only with its feet, so small specks go wherever they are, with their halo.
    sil = arr[..., 3] >= 128
    if sil.any():
        kept, dropped = remove_specks(sil, 16, keep_inside_largest=True, largest_frac=float(keys.get("speck_frac", 0.002)))
        if dropped:
            gone = sil & ~kept
            arr[dilate(gone, 2) & ~dilate(kept, 2), 3] = 0
            arr[gone, 3] = 0
            info["specks_dropped"] = int(dropped)
    return arr[..., :3].copy(), arr[..., 3].astype(np.float32) / 255.0, info


def classify(rgb: np.ndarray, alpha: np.ndarray, keys: dict) -> tuple[np.ndarray, np.ndarray, dict]:
    """Label map (0 none, 1 body, 2 belly, 3 accent, 4 face), absorbed mask and stats."""
    H, W = alpha.shape
    sil = alpha > 0.5
    hsv = np.asarray(Image.fromarray(rgb, "RGB").convert("HSV"))
    hue = hsv[..., 0].astype(np.float32) * (360.0 / 255.0)
    sat, val = hsv[..., 1], hsv[..., 2]
    cand = sil & (sat >= keys["min_sat"] * 255) & (val >= keys["min_val"] * 255)
    labels = np.zeros((H, W), np.int8)
    best = np.full((H, W), np.inf, np.float32)
    for lab, name in ((L_BODY, "body"), (L_BELLY, "belly"), (L_ACCENT, "accent")):
        reg = keys["regions"][name]
        d = _circ_dist(hue, float(reg["hue"]))
        ok = cand & (d <= float(reg["window"])) & (d < best)
        labels[ok] = lab
        best[ok] = d[ok]
    stats = {"keyed_px": {LABEL_NAMES[l]: int((labels == l).sum()) for l in (L_BODY, L_BELLY, L_ACCENT)}}

    # Face: unlabelled components by size and position, plus everything they enclose.
    bb = bbox_of(sil)
    if bb is None:
        raise ArtError("the matte is empty: no owl found against the backdrop")
    x0, y0, x1, y1 = bb
    bw, bh = x1 - x0, y1 - y0
    rects = [(x0 + r[0] * bw, y0 + r[1] * bh, x0 + (r[0] + r[2]) * bw, y0 + (r[1] + r[3]) * bh) for r in keys["fixed_rects"]]
    unl = sil & (labels == L_NONE)
    comps, n = label_components(unl)
    face = np.zeros((H, W), bool)
    face_ids: list[int] = []
    if n:
        areas = component_areas(comps, n)
        cents = component_centroids(comps, n)
        min_px = keys["face_min_area_frac"] * H * W
        for i in range(1, n + 1):
            cx, cy = cents[i]
            if areas[i] >= min_px and any(rx0 <= cx < rx1 and ry0 <= cy < ry1 for rx0, ry0, rx1, ry1 in rects):
                face_ids.append(i)
        if face_ids:
            face = np.isin(comps, face_ids)
            for i in face_ids:
                face |= enclosed_by(comps == i) & sil
    labels[face] = L_FACE
    stats["face_components"] = len(face_ids)
    stats["face_px"] = int(face.sum())

    # Absorption of the rest into the nearest region: belly, accent, then body.
    todo = sil & (labels == L_NONE)
    absorbed = todo.copy()
    for _ in range(64):
        if not todo.any():
            break
        for lab in (L_BELLY, L_ACCENT, L_BODY):
            grow = dilate(labels == lab, 1) & todo
            if grow.any():
                labels[grow] = lab
                todo &= ~grow
    labels[todo] = L_BODY
    stats["absorbed_px"] = int(absorbed.sum())

    # Closing per region, then exclusive again with priority belly > accent > body.
    closed = {lab: closing(labels == lab, 2) & sil & ~face for lab in (L_BODY, L_ACCENT, L_BELLY)}
    out = np.zeros((H, W), np.int8)
    for lab in (L_BODY, L_ACCENT, L_BELLY):
        out[closed[lab]] = lab
    out[face] = L_FACE
    lost = sil & (out == L_NONE)
    out[lost] = labels[lost]
    out[~sil] = L_NONE
    stats["region_px"] = {LABEL_NAMES[l]: int((out == l).sum()) for l in LABEL_NAMES}
    return out, absorbed, stats


def labels_from_image(img: Image.Image, alpha: np.ndarray) -> np.ndarray:
    """Read a hand-edited label map in the LABEL_COLOURS convention (nearest colour wins)."""
    arr = np.asarray(img.convert("RGB")).astype(np.int32)
    cols = np.array([LABEL_COLOURS[l] for l in (L_NONE, L_BODY, L_BELLY, L_ACCENT, L_FACE)], np.int32)
    d = ((arr[:, :, None, :] - cols[None, None, :, :]) ** 2).sum(-1)
    labels = np.argmin(d, axis=-1).astype(np.int8)
    sil = alpha > 0.5
    labels[~sil] = L_NONE
    labels[sil & (labels == L_NONE)] = L_BODY
    return labels


def label_image(labels: np.ndarray, absorbed: np.ndarray | None = None, hatch: bool = False) -> Image.Image:
    out = np.zeros(labels.shape + (3,), np.uint8)
    for lab, col in LABEL_COLOURS.items():
        out[labels == lab] = col
    if hatch and absorbed is not None:
        ys, xs = np.nonzero(absorbed)
        sel = ((xs + ys) // 3) % 2 == 0
        out[ys[sel], xs[sel]] = (128, 128, 128)
    return Image.fromarray(out, "RGB")


def _luminance(V: np.ndarray, region: np.ndarray, keys: dict) -> tuple[np.ndarray, float]:
    vals = V[region]
    vref = float(np.percentile(vals, keys["lit_percentile"])) if vals.size else 1.0
    vref = max(vref, 1e-3)
    L = np.clip((V / vref) ** float(keys["shade_gamma"]), float(keys["luminance_floor"]), 1.0)
    return L.astype(np.float32), vref


def _feather(mask: np.ndarray) -> np.ndarray:
    return mean_filter(mask.astype(np.float64), 1).astype(np.float32)


def _la(L: np.ndarray, A: np.ndarray) -> Image.Image:
    a8 = np.round(np.clip(A, 0, 1) * 255).astype(np.uint8)
    l8 = np.round(np.clip(L, 0, 1) * 255).astype(np.uint8)
    l8[a8 == 0] = 0
    return Image.fromarray(np.dstack([l8, a8]), "LA")


def _rgba(rgb: np.ndarray, A: np.ndarray) -> Image.Image:
    a8 = np.round(np.clip(A, 0, 1) * 255).astype(np.uint8)
    out = np.dstack([rgb.astype(np.uint8), a8])
    out[a8 == 0, :3] = 0
    return Image.fromarray(out, "RGBA")


def _eye_components(face: np.ndarray, sil_bbox: tuple[int, int, int, int], face_rect: list, gold: np.ndarray | None = None) -> tuple[np.ndarray, list[tuple[int, int, int, int]], np.ndarray]:
    """The two eyes: the largest face components in the head rect, wider than 12 % of the owl.

    Gold pixels (the beak) are left out while the eyes are found, so a beak painted touching an
    eye cannot merge with it; each eye then takes back every face pixel its outline encloses (a
    gold iris, the pupil, the catchlight). A third eye-sized component is the beak: the lowest one
    is dropped.
    """
    base = face & ~gold if gold is not None else face
    comps, n = label_components(base)
    if n == 0:
        return np.zeros_like(face), [], comps
    x0, y0, x1, y1 = sil_bbox
    bw, bh = x1 - x0, y1 - y0
    fx0, fy0 = x0 + face_rect[0] * bw, y0 + face_rect[1] * bh
    fx1, fy1 = fx0 + face_rect[2] * bw, fy0 + face_rect[3] * bh
    areas = component_areas(comps, n)
    boxes = component_bboxes(comps, n)
    cents = component_centroids(comps, n)
    cand = [i for i in range(1, n + 1) if fx0 <= cents[i][0] < fx1 and fy0 <= cents[i][1] < fy1 and (boxes[i][2] - boxes[i][0] + 1) > 0.12 * bw]
    if len(cand) > 2:
        cand.remove(max(cand, key=lambda i: cents[i][1]))
    cand.sort(key=lambda i: -areas[i])
    eyes = cand[:2]
    eye_mask = np.zeros_like(face)
    for i in eyes:
        comp = comps == i
        eye_mask |= comp | (enclosed_by(comp) & face)
    return eye_mask, [tuple(int(v) for v in boxes[i]) for i in eyes], comps


def _lid_strokes(shape: tuple[int, int], eye_boxes: list[tuple[int, int, int, int]], sil_bbox_w: int, blink_cfg: dict) -> np.ndarray:
    H, W = shape
    stroke = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(stroke)
    width = max(1, int(round(float(blink_cfg["width_frac"]) * sil_bbox_w)))
    bow = float(blink_cfg["bow_frac"])
    for (x0, y0, x1, y1) in eye_boxes:
        h = y1 - y0 + 1
        y = y0 + 0.55 * h
        cx = (x0 + x1) / 2.0
        p0, p1, p2 = (x0, y), (cx, y - 2.0 * bow * h), (x1, y)
        pts = []
        for t in np.linspace(0.0, 1.0, 33):
            px = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
            py = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
            pts.append((px, py))
        d.line(pts, fill=255, width=width, joint="curve")
    return np.asarray(stroke).astype(np.float32) / 255.0


def _over(dst_rgb: np.ndarray, dst_a: np.ndarray, src_rgb: np.ndarray, src_a: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    out_a = src_a + dst_a * (1 - src_a)
    with np.errstate(invalid="ignore", divide="ignore"):
        out_rgb = np.where(out_a[..., None] > 0, (src_rgb * src_a[..., None] + dst_rgb * (dst_a * (1 - src_a))[..., None]) / np.maximum(out_a, 1e-6)[..., None], 0)
    return out_rgb, out_a


def split(master: Image.Image, keys: dict | None = None, *, height: int | None = None, flip: bool = False, blink_from: Image.Image | None = None,
          labels_img: Image.Image | None = None, debug_dir: Path | None = None, chroma: ChromaParams | None = None) -> OwlSplit:
    keys = keys or load_keys()
    reg = keys["registration"]
    target_h = int(height or reg.get("height", 220))
    if flip:
        master = ImageOps.mirror(master)
        blink_from = ImageOps.mirror(blink_from) if blink_from is not None else None
        labels_img = ImageOps.mirror(labels_img) if labels_img is not None else None
    rgb, A, minfo = matte(master, keys, chroma)
    H, W = A.shape
    sil = A > 0.5
    info: dict = {"backdrop": minfo.get("backdrop"), "flipped": flip, "source_size": [W, H]}
    if minfo.get("specks_dropped"):
        info["specks_dropped"] = minfo["specks_dropped"]
    absorbed = np.zeros((H, W), bool)
    if labels_img is not None:
        labels = labels_from_image(labels_img.resize((W, H), Image.Resampling.NEAREST) if labels_img.size != (W, H) else labels_img, A)
        info["labels"] = "from file"
    else:
        labels, absorbed, stats = classify(rgb, A, keys)
        info.update(stats)

    hsv = np.asarray(Image.fromarray(rgb, "RGB").convert("HSV"))
    V = hsv[..., 2].astype(np.float32) / 255.0
    body_m, belly_m, accent_m, face_m = (labels == l for l in (L_BODY, L_BELLY, L_ACCENT, L_FACE))
    bb = bbox_of(sil)
    if bb is None:
        raise ArtError("empty silhouette")
    x0, y0, x1, y1 = bb
    bw, bh = x1 - x0, y1 - y0

    # Body luminance under the face: ring mean per face component, then a light smoothing.
    Vbody = V.copy()
    if face_m.any():
        fcomps, fn = label_components(face_m)
        for i in range(1, fn + 1):
            comp = fcomps == i
            ring = dilate(comp, 8) & ~face_m & sil
            Vbody[comp] = float(V[ring].mean()) if ring.any() else 1.0
        sm = mean_filter(Vbody, 2)
        Vbody[face_m] = sm[face_m]
    Lbody, vref_body = _luminance(Vbody, body_m, keys)
    Lbelly, vref_belly = _luminance(V, belly_m, keys)
    Laccent, vref_accent = _luminance(V, accent_m, keys)
    info["vref"] = {"body": round(vref_body, 4), "belly": round(vref_belly, 4), "accent": round(vref_accent, 4)}

    body_a = A
    belly_a = A * _feather(belly_m)
    accent_a = A * _feather(accent_m)
    face_a = A * _feather(face_m)
    face_rgb = rgb.astype(np.float32)

    # Blink: eyes cleared, lids drawn (or lids taken from an eyes-closed edit).
    hdeg = hsv[..., 0].astype(np.float32) * (360.0 / 255.0)
    gold = (hdeg >= 25) & (hdeg <= 60) & (hsv[..., 1] > 115) & (V > 0.45)
    eye_mask, eye_boxes, _ = _eye_components(face_m, (x0, y0, x1, y1), keys["face_rect"], gold)
    info["eyes_found"] = len(eye_boxes)
    blink_face_m = face_m & ~dilate(eye_mask, 1)
    blink_a = A * _feather(blink_face_m)
    blink_rgb = face_rgb.copy()
    blink_cfg = keys["blink"]
    if blink_from is not None:
        if blink_from.size != master.size:
            raise ArtError(f"--blink source is {blink_from.size[0]}x{blink_from.size[1]}, the master is {W}x{H}")
        rgb2, A2, _ = matte(blink_from, keys, chroma)
        labels2, _, _ = classify(rgb2, A2, keys)
        face2 = labels2 == L_FACE
        zone = np.zeros((H, W), bool)
        pad = int(round(6 * W / OWL_W))
        for (ex0, ey0, ex1, ey1) in eye_boxes:
            zone[max(0, ey0 - pad) : ey1 + pad + 1, max(0, ex0 - pad) : ex1 + pad + 1] = True
        src_a = (A2 * _feather(face2)) * zone
        blink_rgb, blink_a = _over(blink_rgb, blink_a, rgb2.astype(np.float32), src_a)
        info["blink"] = "from edit"
    else:
        strokes = _lid_strokes((H, W), eye_boxes, bw, blink_cfg)
        col = np.array(parse_hex(blink_cfg.get("colour", "#0C1E36")), np.float32)
        blink_rgb, blink_a = _over(blink_rgb, blink_a, np.broadcast_to(col, (H, W, 3)), strokes * sil)
        info["blink"] = "programmatic"

    # Registration: the feet centroid is the horizontal anchor (it lands on the canvas centre),
    # so the scale is the bbox height into target_h, capped so that the WIDER side of the
    # feet-centred silhouette still fits half of max_width: a tail or a wing to one side of the
    # feet (the three-quarter pose) would otherwise run off the canvas edge.
    feet_rows = sil.copy()
    feet_rows[: int(round(y1 - reg.get("feet_rows_frac", 0.06) * bh)), :] = False
    fy, fx = np.nonzero(feet_rows)
    feet_x = float(fx.mean()) if fx.size else (x0 + x1) / 2.0
    max_w = float(reg.get("max_width", 196))
    half = max(feet_x - x0, x1 - feet_x, 1.0)
    s_logical = min(target_h / bh, max_w / bw, (max_w / 2.0) / half)
    info["registration"] = {"scale_logical": round(s_logical, 5), "bbox": [x0, y0, x1, y1], "feet_x": round(feet_x, 1), "half_width": round(half, 1)}

    full = {
        "owl-body": _la(Lbody, body_a),
        "owl-belly": _la(Lbelly, belly_a),
        "owl-accent": _la(Laccent, accent_a),
        "owl-face": _rgba(np.round(face_rgb), face_a),
        "owl-blink": _rgba(np.round(np.clip(blink_rgb, 0, 255)), blink_a),
    }

    def place(k: int) -> dict[str, Image.Image]:
        s = s_logical * k
        size = (max(1, int(round(W * s))), max(1, int(round(H * s))))
        scaled = {name: im.resize(size, Image.Resampling.LANCZOS) for name, im in full.items()}
        a = np.asarray(scaled["owl-body"].getchannel("A"))
        rows = np.nonzero((a >= 128).any(1))[0]
        bottom = int(rows[-1]) if rows.size else size[1] - 1
        ox = int(round(OWL_W * k / 2.0 - feet_x * s))
        oy = OWL_H * k - 1 - bottom
        out = {}
        for name, im in scaled.items():
            canvas = Image.new(im.mode, (OWL_W * k, OWL_H * k), (0, 0) if im.mode == "LA" else (0, 0, 0, 0))
            canvas.paste(im, (ox, oy))
            out[name] = canvas
        return out

    layers_2x = place(2)
    layers_1x = place(1)
    # Nothing opaque may sit on the left, right or top canvas edge after registration.
    clipped = 0
    for layers in (layers_1x, layers_2x):
        a = np.asarray(layers["owl-body"])[..., 1]
        clipped += int((a[:, 0] >= 128).sum() + (a[:, -1] >= 128).sum() + (a[0] >= 128).sum())
    info["clipped_px"] = clipped
    if clipped:
        print(f"warning: owl registration left {clipped} opaque px on the canvas edge (1x and 2x together); the silhouette is clipped", file=sys.stderr)
    lm = label_image(labels, absorbed, hatch=False)
    result = OwlSplit(layers_1x=layers_1x, layers_2x=layers_2x, label_map=lm, matte=_rgba(rgb, A), info=info)
    if debug_dir:
        dd = Path(debug_dir)
        dd.mkdir(parents=True, exist_ok=True)
        pngmeta.save(result.matte, dd / "matte.png")
        pngmeta.save(lm, dd / "labels.png")
        pngmeta.save(label_image(labels, absorbed, hatch=True), dd / "labels-hatched.png")
        for name, im in full.items():
            pngmeta.save(im, dd / f"{name}-full.png")
        (dd / "info.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    return result


def composite(layers: dict[str, Image.Image], look: tuple[str, str, str], blink: bool = False) -> Image.Image:
    """What the game draws: each white layer multiplied by its tint, then the face or blink frame."""
    size = layers["owl-body"].size
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    for name, hexcol in zip(("owl-body", "owl-belly", "owl-accent"), look):
        la = np.asarray(layers[name].convert("LA")).astype(np.float32)
        tint = np.array(parse_hex(hexcol), np.float32)
        rgb = (la[..., :1] / 255.0) * tint
        layer = np.dstack([np.round(rgb).astype(np.uint8), la[..., 1].astype(np.uint8)])
        out = Image.alpha_composite(out, Image.fromarray(layer, "RGBA"))
    return Image.alpha_composite(out, layers["owl-blink" if blink else "owl-face"].convert("RGBA"))


def review_sheet(result: OwlSplit, looks=REVIEW_LOOKS) -> Image.Image:
    """Contact sheet: label map, the five 1x layers, and composites in three looks (open and blinking)."""
    cells: list[tuple[str, Image.Image]] = [("labels", result.label_map.resize((OWL_W, OWL_H), Image.Resampling.NEAREST))]
    for name in LAYER_KEYS:
        cells.append((name, result.layers_1x[name].convert("RGBA")))
    for i, look in enumerate(looks):
        cells.append((f"look {i + 1}", composite(result.layers_1x, look)))
        cells.append((f"look {i + 1} blink", composite(result.layers_1x, look, blink=True)))
    cols = 6
    rows = (len(cells) + cols - 1) // cols
    pad, cap = 12, 18
    sheet = Image.new("RGB", (cols * (OWL_W + pad) + pad, rows * (OWL_H + pad + cap) + pad), (70, 70, 70))
    d = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=13)
    for i, (title, im) in enumerate(cells):
        cx, cy = pad + (i % cols) * (OWL_W + pad), pad + (i // cols) * (OWL_H + pad + cap)
        d.rectangle((cx, cy, cx + OWL_W - 1, cy + OWL_H - 1), fill=(120, 120, 120))
        for yy in range(0, OWL_H, 20):
            for xx in range(0, OWL_W, 20):
                if (xx // 20 + yy // 20) % 2 == 0:
                    d.rectangle((cx + xx, cy + yy, cx + xx + 19, cy + yy + 19), fill=(150, 150, 150))
        tile = im if im.mode == "RGBA" else im.convert("RGBA")
        sheet.paste(tile, (cx, cy), tile)
        d.text((cx, cy + OWL_H + 2), title, fill=(240, 240, 240), font=font)
    return sheet


def write_layers(result: OwlSplit, out_dir: Path) -> dict[str, int]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    written = {}
    for name in LAYER_KEYS:
        written[f"{name}.png"] = pngmeta.save(result.layers_1x[name], out_dir / f"{name}.png")
        written[f"{name}@2x.png"] = pngmeta.save(result.layers_2x[name], out_dir / f"{name}@2x.png")
    return written


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Split an owl master into the five game layers (1x and 2x).")
    ap.add_argument("master")
    ap.add_argument("--out", default="work/art/final")
    ap.add_argument("--keys", default=None, help="owl-keys.json (default tools/art/config/owl-keys.json)")
    ap.add_argument("--height", type=int, default=None, help="silhouette height in logical px (default 220 of 240)")
    ap.add_argument("--flip", action="store_true", help="mirror every layer (the winner faces left)")
    ap.add_argument("--blink", default=None, help="from:<png> uses an eyes-closed edit of the master for the lids")
    ap.add_argument("--labels", default=None, help="hand-edited label map PNG (skips classification)")
    ap.add_argument("--debug", default=None, help="directory for intermediates")
    ap.add_argument("--sheet", default=None, help="write the review contact sheet here")
    a = ap.parse_args(argv)
    try:
        keys = load_keys(Path(a.keys) if a.keys else None)
        blink_from = None
        if a.blink:
            if not a.blink.startswith("from:"):
                raise ArtError("--blink takes from:<png>")
            blink_from = Image.open(a.blink[5:])
        labels_img = Image.open(a.labels) if a.labels else None
        res = split(Image.open(a.master), keys, height=a.height, flip=a.flip, blink_from=blink_from, labels_img=labels_img, debug_dir=Path(a.debug) if a.debug else None)
        written = write_layers(res, Path(a.out))
        if a.sheet:
            Path(a.sheet).parent.mkdir(parents=True, exist_ok=True)
            pngmeta.save(review_sheet(res), Path(a.sheet))
        for name, n in written.items():
            print(f"{name}: {n} bytes")
        print(json.dumps(res.info))
        return 0
    except ArtError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
