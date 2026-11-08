"""WebP encoding and inspection for room backgrounds and the cut-outs the table marks webp.

A painted 1600 x 900 room cannot meet the 200 KB budget as PNG (even at 64 colours), so rooms
ship as lossy WebP; so does a cut-out marked ``"format": "webp"`` (the nests' furniture), whose
colour is lossy but whose alpha libwebp keeps exact (``same_alpha`` proves it per file). Finals
are encoded by Pillow from a copy whose ``info`` has been cleared, with no EXIF, XMP or ICC
profile, and every write is read back and checked: a RIFF/WEBP container whose chunks are all in
the allowlist VP8 / VP8L / VP8X / ALPH, the expected size and the byte budget.

The quality ladder is deterministic (libwebp is, for one input and one set of parameters): the
first quality from ``QUALITIES`` whose encoding fits the budget wins and is recorded.
"""

from __future__ import annotations

import io
import struct
from pathlib import Path

from PIL import Image

from . import ArtError

#: The only chunks a published WebP may carry: image data, the extended header and alpha.
ALLOWED_WEBP_CHUNKS = frozenset({"VP8 ", "VP8L", "VP8X", "ALPH"})
QUALITIES = (90, 86, 82, 78, 74, 70, 65, 60, 55, 50)
METHOD = 6


def is_webp(data: bytes) -> bool:
    return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"


def chunk_types(data: bytes) -> list[str]:
    """Chunk FourCCs in file order; raises ArtError when the bytes are not a WebP."""
    if not is_webp(data):
        raise ArtError("not a WebP file (bad RIFF/WEBP header)")
    out: list[str] = []
    i = 12
    while i + 8 <= len(data):
        name = data[i : i + 4].decode("latin-1")
        (n,) = struct.unpack("<I", data[i + 4 : i + 8])
        out.append(name)
        i += 8 + n + (n & 1)
    return out


def disallowed_chunks(data: bytes) -> list[str]:
    return [c.strip() for c in chunk_types(data) if c not in ALLOWED_WEBP_CHUNKS]


def webp_size(data: bytes) -> tuple[int, int]:
    if not is_webp(data):
        raise ArtError("not a WebP file")
    with Image.open(io.BytesIO(data)) as im:
        return im.size


def encode(img: Image.Image, quality: int) -> bytes:
    out = img.copy()
    out.info = {}
    if out.mode not in ("RGB", "RGBA"):
        out = out.convert("RGBA" if "A" in out.getbands() else "RGB")
    buf = io.BytesIO()
    out.save(buf, "WEBP", quality=quality, method=METHOD)
    data = buf.getvalue()
    bad = disallowed_chunks(data)
    if bad:  # cannot happen with a cleaned copy; guard anyway
        raise ArtError(f"encoder wrote disallowed WebP chunks {bad}")
    return data


def encode_under_budget(img: Image.Image, budget: int, qualities: tuple[int, ...] = QUALITIES) -> tuple[bytes, dict]:
    """Returns (webp bytes, info) with info = {format, quality, bytes, budget, budget_relaxed}."""
    smallest = None
    for q in qualities:
        data = encode(img, q)
        if len(data) <= budget:
            return data, {"format": "webp", "mode": img.mode, "quality": q, "colors": None, "bytes": len(data), "budget": budget, "budget_relaxed": False, "dither": "none"}
        smallest = len(data)
    from .budget import BudgetError

    raise BudgetError(f"nothing fits: smallest WebP encoding (quality {qualities[-1]}) is {smallest} bytes against a {budget} byte budget")


def same_alpha(data: bytes, img: Image.Image) -> bool:
    """Whether the WebP ``data`` decodes to exactly ``img``'s alpha (opaque when ``img`` has none)."""
    with Image.open(io.BytesIO(data)) as back:
        return back.convert("RGBA").getchannel("A").tobytes() == img.convert("RGBA").getchannel("A").tobytes()


def verify_file(path: Path, expect_size: tuple[int, int] | None = None, budget: int | None = None) -> dict:
    """Re-read a written WebP and check dimensions, chunk allowlist and size budget."""
    data = Path(path).read_bytes()
    problems: list[str] = []
    try:
        chunks = chunk_types(data)
        bad = disallowed_chunks(data)
        w, h = webp_size(data)
    except (ArtError, OSError) as e:
        return {"ok": False, "problems": [str(e)], "bytes": len(data)}
    if bad:
        problems.append(f"disallowed WebP chunks: {', '.join(bad)}")
    if expect_size and (w, h) != tuple(expect_size):
        problems.append(f"size {w}x{h} is not {expect_size[0]}x{expect_size[1]}")
    if budget is not None and len(data) > budget:
        problems.append(f"{len(data)} bytes exceeds the {budget} byte budget")
    return {"ok": not problems, "problems": problems, "bytes": len(data), "width": w, "height": h, "chunks": chunks}
