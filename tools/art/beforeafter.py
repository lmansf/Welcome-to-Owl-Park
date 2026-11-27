"""Before/after sheet: each finished key in work/art/final beside the file the game ships today.

    python3 -B tools/art/beforeafter.py <key> [<key> ...] --out work/art/review/<name>.jpg [--title "..."]

A key with no published file shows only its new art ("new"). Transparent art sits on the park's
navy so halos and keying show as they would in the game. Reads only; offline.
"""
from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parent.parent
ART = REPO / "apps" / "park" / "public" / "art"
FINAL = REPO / "work" / "art" / "final"
NAVY = (12, 30, 54)


def find(folder: Path, key: str) -> Path | None:
    for ext in ("@2x.webp", "@2x.png", ".webp", ".png"):
        f = folder / f"{key}{ext}"
        if f.exists():
            return f
    return None


def tile(f: Path | None, w: int, h: int) -> Image.Image:
    out = Image.new("RGB", (w, h), NAVY)
    if f:
        im = Image.open(f).convert("RGBA")
        im.thumbnail((w - 8, h - 8), Image.LANCZOS)
        bg = Image.new("RGBA", im.size, NAVY + (255,))
        bg.alpha_composite(im)
        out.paste(bg.convert("RGB"), ((w - im.width) // 2, (h - im.height) // 2))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("keys", nargs="+")
    ap.add_argument("--out", required=True)
    ap.add_argument("--title", default="")
    ap.add_argument("--cell", type=int, default=260)
    ap.add_argument("--wide", action="store_true", help="16:9 cells, for rooms")
    a = ap.parse_args()
    w = a.cell * 2 if a.wide else a.cell
    h = a.cell * 9 // 8 if a.wide else a.cell
    pairs = 2 if a.wide else 3
    cols = pairs * 2
    rows = -(-len(a.keys) // pairs)
    head = 34 if a.title else 0
    sheet = Image.new("RGB", (cols * w, head + rows * (h + 20)), (24, 24, 28))
    d = ImageDraw.Draw(sheet)
    if a.title:
        d.text((8, 10), a.title, fill=(255, 240, 150))
    for i, key in enumerate(a.keys):
        x, y = (i % pairs) * 2 * w, head + (i // pairs) * (h + 20)
        before, after = find(ART, key), find(FINAL, key)
        d.text((x + 4, y + 3), f"{key}: {'before' if before else '(new)'}", fill=(200, 200, 200))
        d.text((x + w + 4, y + 3), "after", fill=(150, 255, 150))
        sheet.paste(tile(before, w, h), (x, y + 18))
        sheet.paste(tile(after, w, h), (x + w, y + 18))
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    sheet.save(a.out, quality=88)
    print(a.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
