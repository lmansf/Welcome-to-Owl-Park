"""
Flight (OP-084): the owls' wing, from a colour-coded painting of one right wing spread open (the owl
master's code: the covert feathers FLAT red, the long flight feathers FLAT blue, on magenta), into
the two tintable layers the game draws behind an owl's body: `owl-wing-body`, tinted with the owl's
body colour, and `owl-wing-accent`, its accent colour. Both are white with the shading as grey
luminance, as the owl's own layers are, and the body layer is the whole wing (the accent sits on
top of it), so the wing is never see-through.

The wing is registered on a 200 x 120 canvas (400 x 240 at 2x) with its root, where it meets the
shoulder, at ROOT and its tip SPAN to the right of it: the game mirrors it for the left wing and
turns both about the root (`apps/park/src/game/Owl.ts`, WING). Every owl kind wears the same wing in
its own colours.

TODO-DOCS (OP-084): docs/ART-PIPELINE.md: the `owl-wing-right` job (an edit of the owl master), its
finish (`pnpm art:finish wings`, then `publish owl-wing-body owl-wing-accent`), and the two layers in
the art table (200 x 120, the root at ROOT, tintable like the owl's own).
"""
from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

import numpy as np  # noqa: E402
from PIL import Image, ImageOps  # noqa: E402

import owl_layers  # noqa: E402
from artlib import ArtError  # noqa: E402
from artlib.chroma import ChromaParams  # noqa: E402
from artlib.labels import bbox_of  # noqa: E402

WING_W, WING_H = 200, 120
#: Where the wing's root lands on the 200 x 120 canvas (logical pixels); the game's WING.root.
ROOT = (12, 72)
#: From the root to the tip of the longest flight feather (logical pixels; an owl is 220 tall).
SPAN = 176
#: The root is this far into the wing from its inner end, as a share of the wing's length.
ROOT_INSET = 0.03
#: The rows of the wing's inner end (this share of its length) whose middle is the root's height.
ROOT_BAND = 0.06

LAYER_NAMES = ("owl-wing-body", "owl-wing-accent")


@dataclass
class WingSplit:
    layers_1x: dict[str, Image.Image]
    layers_2x: dict[str, Image.Image]
    info: dict = field(default_factory=dict)


def split_wing(master: Image.Image, keys: dict | None = None, *, flip: bool = False, chroma: ChromaParams | None = None) -> WingSplit:
    """The two layers at 1x and 2x, the root on ROOT and the tip SPAN to its right."""
    keys = dict(keys or owl_layers.load_keys())
    # A wing has no face: nothing is kept in natural colours.
    keys["fixed_rects"] = []
    keys["face_min_area_frac"] = 1.0
    if flip:
        master = ImageOps.mirror(master)
    rgb, A, minfo = owl_layers.matte(master, keys, chroma)
    sil = A > 0.5
    bb = bbox_of(sil)
    if bb is None:
        raise ArtError("the matte is empty: no wing found against the backdrop")
    x0, y0, x1, y1 = bb
    bw = x1 - x0
    labels, _absorbed, stats = owl_layers.classify(rgb, A, keys)
    body_m = labels == owl_layers.L_BODY
    accent_m = labels == owl_layers.L_ACCENT
    if not accent_m.any():
        raise ArtError("no flight feathers (accent hue) found in the wing")

    hsv = np.asarray(Image.fromarray(rgb, "RGB").convert("HSV"))
    V = hsv[..., 2].astype(np.float32) / 255.0
    Lbody, vref_body = owl_layers._luminance(V, body_m, keys)
    Laccent, vref_accent = owl_layers._luminance(V, accent_m, keys)
    full = {
        "owl-wing-body": owl_layers._la(Lbody, A),
        "owl-wing-accent": owl_layers._la(Laccent, A * owl_layers._feather(accent_m)),
    }

    # The root: just inside the wing's inner end, at the middle of that end's rows.
    band = sil[:, x0 : x0 + max(1, int(round(ROOT_BAND * bw)))]
    rows = np.nonzero(band.any(1))[0]
    root_x = x0 + ROOT_INSET * bw
    root_y = float(rows.mean()) if rows.size else (y0 + y1) / 2.0
    s_logical = SPAN / max(1.0, x1 - root_x)
    box = {
        "left": ROOT[0] - (root_x - x0) * s_logical,
        "top": ROOT[1] - (root_y - y0) * s_logical,
        "right": ROOT[0] + (x1 - root_x) * s_logical,
        "bottom": ROOT[1] + (y1 - root_y) * s_logical,
    }
    if box["left"] < 0 or box["top"] < 0 or box["right"] > WING_W or box["bottom"] > WING_H:
        raise ArtError(f"the wing does not fit the {WING_W}x{WING_H} canvas with its root at {ROOT}: {', '.join(f'{k} {v:.1f}' for k, v in box.items())}")

    def place(k: int) -> dict[str, Image.Image]:
        s = s_logical * k
        H, W = A.shape
        size = (max(1, int(round(W * s))), max(1, int(round(H * s))))
        ox = int(round(ROOT[0] * k - root_x * s))
        oy = int(round(ROOT[1] * k - root_y * s))
        out = {}
        for name, im in full.items():
            canvas = Image.new("LA", (WING_W * k, WING_H * k), (0, 0))
            canvas.paste(im.resize(size, Image.Resampling.LANCZOS), (ox, oy))
            out[name] = canvas
        return out

    info = {
        "backdrop": minfo.get("backdrop"),
        "flipped": flip,
        "source_size": list(master.size),
        "region_px": stats.get("region_px"),
        "vref": {"body": round(vref_body, 4), "accent": round(vref_accent, 4)},
        "registration": {"root_source": [round(root_x, 1), round(root_y, 1)], "scale_logical": round(s_logical, 5), "box": {k: round(v, 1) for k, v in box.items()}},
    }
    return WingSplit(layers_1x=place(1), layers_2x=place(2), info=info)


def composite(layers: dict[str, Image.Image], body: str, accent: str) -> Image.Image:
    """The wing as the game draws it in two colours (a multiply tint), for review sheets."""
    out = Image.new("RGBA", layers["owl-wing-body"].size, (0, 0, 0, 0))
    for name, hexc in (("owl-wing-body", body), ("owl-wing-accent", accent)):
        L, a = (np.asarray(c, np.float32) / 255.0 for c in layers[name].split())
        col = np.array([int(hexc[i : i + 2], 16) for i in (1, 3, 5)], np.float32) / 255.0
        rgb = (L[..., None] * col[None, None, :] * 255.0).round().astype(np.uint8)
        im = Image.fromarray(np.dstack([rgb, (a * 255).round().astype(np.uint8)]), "RGBA")
        out = Image.alpha_composite(out, im)
    return out
