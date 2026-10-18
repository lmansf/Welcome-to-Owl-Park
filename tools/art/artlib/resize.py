"""Aspect crop, Lanczos resize and ``fit contain`` placement for set pieces.

Pillow premultiplies alpha while resizing RGBA and LA images, so downsampled edges keep their
colour (a white disc keeps RGB 255 on its anti-aliased rim). Every target size is produced from
the source image, never from another resized copy, to avoid double resampling.
"""

from __future__ import annotations

import numpy as np
from PIL import Image

from . import ArtError
from .labels import bbox_of

LANCZOS = Image.Resampling.LANCZOS


def parse_crop_anchor(spec: str) -> tuple[float, float]:
    """'centre' | 'center' | 'top' | 'bottom' | 'fx,fy' (fractions of the slack, 0..1)."""
    s = (spec or "centre").strip().lower()
    named = {"centre": (0.5, 0.5), "center": (0.5, 0.5), "top": (0.5, 0.0), "bottom": (0.5, 1.0), "left": (0.0, 0.5), "right": (1.0, 0.5)}
    if s in named:
        return named[s]
    try:
        fx, fy = (float(v) for v in s.split(","))
    except ValueError:
        raise ArtError(f"bad crop anchor {spec!r}: use centre|top|bottom|fx,fy") from None
    return min(1.0, max(0.0, fx)), min(1.0, max(0.0, fy))


def crop_to_aspect(img: Image.Image, aw: int, ah: int, anchor: str = "centre", shift_y: int = 0) -> Image.Image:
    """Crop to the aspect aw:ah; the window sits at the anchor fraction of the slack, shifted by shift_y px."""
    W, H = img.size
    fx, fy = parse_crop_anchor(anchor)
    target = aw / ah
    if W / H > target:
        cw, ch = int(round(H * target)), H
    else:
        cw, ch = W, int(round(W / target))
    cw, ch = min(cw, W), min(ch, H)
    x0 = int(round((W - cw) * fx))
    y0 = int(round((H - ch) * fy)) + int(shift_y)
    y0 = max(0, min(H - ch, y0))
    x0 = max(0, min(W - cw, x0))
    if (x0, y0, cw, ch) == (0, 0, W, H):
        return img
    return img.crop((x0, y0, x0 + cw, y0 + ch))


def resize_exact(img: Image.Image, w: int, h: int, anchor: str = "centre", shift_y: int = 0) -> Image.Image:
    """Crop to w:h then Lanczos to exactly w x h."""
    c = crop_to_aspect(img, w, h, anchor, shift_y)
    if c.size == (w, h):
        return c.copy()
    return c.resize((w, h), LANCZOS)


def downsample(img: Image.Image, w: int, h: int) -> Image.Image:
    return img.resize((w, h), LANCZOS) if img.size != (w, h) else img.copy()


def alpha_bbox(img: Image.Image, threshold: int = 0) -> tuple[int, int, int, int] | None:
    if img.mode not in ("RGBA", "LA"):
        return (0, 0, img.width, img.height)
    a = np.asarray(img.getchannel("A"))
    return bbox_of(a > threshold)


def fit_contain(img: Image.Image, canvas_w: int, canvas_h: int, margin: float = 0.02, anchor_x: float = 0.5, pad_bottom: int = 0, valign: str = "bottom") -> tuple[Image.Image, dict]:
    """Scale the alpha bbox to fit the canvas; bottom opaque row on the last row minus pad_bottom.

    With ``valign="centre"`` the bbox is centred vertically instead (margin on all four sides), for
    items worn at a point (glasses on the eye line, neckwear at the neck) rather than standing on one.

    The point at ``anchor_x`` of the bbox width lands on the canvas' horizontal centre. The real
    bbox after resampling is measured and the paste shifted so the registration is exact.
    """
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    bb = alpha_bbox(img)
    if bb is None:
        raise ArtError("fit_contain: the image is fully transparent")
    x0, y0, x1, y1 = bb
    crop = img.crop((x0, y0, x1, y1))
    bw, bh = crop.size
    avail_w = canvas_w * (1.0 - 2.0 * margin)
    if valign not in ("bottom", "centre"):
        raise ArtError(f"fit_contain: valign must be bottom or centre, not {valign!r}")
    avail_h = canvas_h * (1.0 - 2.0 * margin) if valign == "centre" else canvas_h * (1.0 - margin) - pad_bottom
    s = min(avail_w / bw, avail_h / bh)
    nw, nh = max(1, int(round(bw * s))), max(1, int(round(bh * s)))
    scaled = crop.resize((nw, nh), LANCZOS) if (nw, nh) != (bw, bh) else crop
    sb = alpha_bbox(scaled) or (0, 0, nw, nh)
    canvas = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    left = int(round(canvas_w / 2.0 - anchor_x * (sb[2] - sb[0]))) - sb[0]
    top = int(round((canvas_h - (sb[3] - sb[1])) / 2.0)) - sb[1] if valign == "centre" else canvas_h - pad_bottom - sb[3]
    canvas.paste(scaled, (left, top))
    info = {"scale": round(s, 5), "bbox": [x0, y0, x1, y1], "placed": [left + sb[0], top + sb[1], left + sb[2], top + sb[3]], "margin": margin, "anchor_x": anchor_x, "pad_bottom": pad_bottom, "valign": valign}
    return canvas, info
