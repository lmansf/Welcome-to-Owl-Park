"""PNG chunk inspection and a save helper that never writes ancillary chunks.

Image models and download paths attach text, time, colour-profile and physical-size chunks.
Finals are always re-encoded by Pillow from a copy whose ``info`` has been cleared, so none of
that survives, and every write is read back and checked against the allowlist
IHDR / PLTE / tRNS / IDAT / IEND.
"""

from __future__ import annotations

import io
import struct
from pathlib import Path

from PIL import Image

from . import ALLOWED_CHUNKS, ArtError

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def chunk_types(data: bytes) -> list[str]:
    """Chunk type names in file order; raises ArtError when the bytes are not a PNG."""
    if not data.startswith(PNG_SIGNATURE):
        raise ArtError("not a PNG file (bad signature)")
    out: list[str] = []
    i = 8
    while i + 8 <= len(data):
        (n,) = struct.unpack(">I", data[i : i + 4])
        name = data[i + 4 : i + 8].decode("latin-1")
        out.append(name)
        i += 12 + n
        if name == "IEND":
            break
    return out


def disallowed_chunks(data: bytes) -> list[str]:
    return [c for c in chunk_types(data) if c not in ALLOWED_CHUNKS]


def png_size(data: bytes) -> tuple[int, int]:
    if not data.startswith(PNG_SIGNATURE) or data[12:16] != b"IHDR":
        raise ArtError("not a PNG file")
    w, h = struct.unpack(">II", data[16:24])
    return w, h


def clean_copy(img: Image.Image) -> Image.Image:
    """A copy carrying no metadata except palette transparency (which becomes tRNS)."""
    out = img.copy()
    keep = {}
    if "transparency" in img.info and out.mode in ("P", "L", "RGB"):
        keep["transparency"] = img.info["transparency"]
    out.info = keep
    return out


def encode(img: Image.Image, compress_level: int = 9, optimize: bool = True) -> bytes:
    buf = io.BytesIO()
    clean_copy(img).save(buf, "PNG", optimize=optimize, compress_level=compress_level, icc_profile=None)
    data = buf.getvalue()
    bad = disallowed_chunks(data)
    if bad:  # cannot happen with a cleaned copy; guard anyway
        raise ArtError(f"encoder wrote disallowed chunks {bad}")
    return data


def write_bytes(path: Path, data: bytes) -> int:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return len(data)


def save(img: Image.Image, path: Path) -> int:
    """Encode through the clean path and write; returns the byte count."""
    return write_bytes(Path(path), encode(img))


def verify_file(path: Path, expect_size: tuple[int, int] | None = None, budget: int | None = None) -> dict:
    """Re-read a written PNG and check dimensions, chunk allowlist and size budget."""
    data = Path(path).read_bytes()
    problems: list[str] = []
    try:
        w, h = png_size(data)
        bad = disallowed_chunks(data)
    except ArtError as e:
        return {"ok": False, "problems": [str(e)], "bytes": len(data)}
    if bad:
        problems.append(f"disallowed PNG chunks: {', '.join(bad)}")
    if expect_size and (w, h) != tuple(expect_size):
        problems.append(f"size {w}x{h} is not {expect_size[0]}x{expect_size[1]}")
    if budget is not None and len(data) > budget:
        problems.append(f"{len(data)} bytes exceeds the {budget} byte budget")
    return {"ok": not problems, "problems": problems, "bytes": len(data), "width": w, "height": h, "chunks": chunk_types(data)}
