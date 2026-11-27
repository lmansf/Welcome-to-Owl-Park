"""A compact contact sheet of a key's raw candidates beside its published art, for picking.

    python3 -B tools/art/candsheet.py <key> [<key> ...] [--work work/art] [--out <dir>] [--width 1400]

Writes <out>/<key>-cands.jpg: the published file first (labelled "now"), then each ok candidate
labelled with its hash16, on a checkerboard so transparency shows. Reads only; offline.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parent.parent
ART = REPO / "apps" / "park" / "public" / "art"


def published(key: str) -> Path | None:
    for ext in (".webp", ".png", "@2x.webp", "@2x.png"):
        f = ART / f"{key}{ext}"
        if f.exists():
            return f
    guide = REPO / "work" / "art" / "guides" / f"{key}-current.png"
    return guide if guide.exists() else None


def checker(w: int, h: int, step: int = 12) -> Image.Image:
    im = Image.new("RGB", (w, h), (205, 205, 205))
    d = ImageDraw.Draw(im)
    for y in range(0, h, step):
        for x in range(0, w, step):
            if (x // step + y // step) % 2:
                d.rectangle([x, y, x + step - 1, y + step - 1], fill=(160, 160, 160))
    return im


def sheet(key: str, work: Path, out: Path, width: int) -> Path:
    raw = work / "raw" / key
    cands = []
    for sc in sorted(raw.glob("*.json")):
        d = json.loads(sc.read_text())
        img = raw / f"{d['hash16']}.{'jpg' if d.get('format') == 'jpg' else 'png'}"
        if img.exists():
            cands.append((d["hash16"], img))
    tiles = ([("now", published(key))] if published(key) else []) + cands
    cols = min(3, len(tiles))
    tw = width // cols
    ims = []
    for label, f in tiles:
        im = Image.open(f).convert("RGBA")
        im.thumbnail((tw - 8, tw - 8))
        bg = checker(im.width, im.height)
        bg.paste(im, (0, 0), im)
        ims.append((label, bg))
    th = max(i.height for _, i in ims) + 22
    rows = -(-len(ims) // cols)
    canvas = Image.new("RGB", (width, rows * th), (30, 30, 30))
    d = ImageDraw.Draw(canvas)
    for n, (label, im) in enumerate(ims):
        x, y = (n % cols) * tw, (n // cols) * th
        d.text((x + 4, y + 4), label, fill=(255, 240, 120))
        canvas.paste(im, (x + 4, y + 20))
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{key}-cands.jpg"
    canvas.save(path, quality=85)
    return path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("keys", nargs="+")
    ap.add_argument("--work", default=str(REPO / "work" / "art"))
    ap.add_argument("--out", default=str(REPO / "work" / "art" / "review"))
    ap.add_argument("--width", type=int, default=1400)
    a = ap.parse_args()
    for k in a.keys:
        print(sheet(k, Path(a.work), Path(a.out), a.width))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
