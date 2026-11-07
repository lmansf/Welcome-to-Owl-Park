#!/usr/bin/env python3
"""Cuts a realm's skin sheet into the realm kit's slot files: pnpm kit:skin <sheet> <out>.

The realm asset kit (Nov 7) asks each artist for one skin sheet, A8: ten fixed cells on a 1760 x 880
template (delivered at 3520 x 1760), in place of a file per slot. The importer (art_import.py) still
takes a file per slot, named as tools/kit/realm-kit.csv names it, so this cuts the sheet into those
files at the size each slot is delivered at:

  C1 ground        -> texture-ground.png   (the kit list's 1024 is cut to the importer's 512)
  C2 wall          -> texture-wall.png
  C3 perch         -> perch-end.png (left 160) and perch-mid.png (right 320)
  C4 slope         -> slope.png
  C5 roost         -> roost.png
  C7 wind streaks  -> wind-current.png
  C8 hazard look 1 -> hazard.png           (the bottom 120 of the cell: the thorns outline, H1)

Three cells have no slot to go to: C6 (updraft bits) becomes updraft-bits.png, each bit apart in a
square frame of its own (a strip of up to six, 160 px each), which the game reads only on a skin
trial (`?skin=`); C9 and C10 become hazard-2.png and hazard-3.png, which nothing
draws yet, since a course has one hazard look. One slot has no cell: perch-small, the small perch
the courses hop between; `--derive-small` makes one from C3 (its end, a short middle and the end
mirrored), marked as made here in the summary.

  python3 tools/kit/skin_sheet.py <sheet.png> <out_dir> [--derive-small]
  python3 tools/kit/skin_sheet.py <sheet.png> <out_dir> --trial <name> --realm clearing [--pieces <dir>]

--trial publishes the cut files into apps/park/public/art as trial-<name>-kit-<realm>-<slot>.webp
(game size) and @2x.webp (delivered size), which the park draws in place of the realm's slots only
on a page opened with `?skin=<name>` (apps/park/src/game/skinTrial.ts); visitors see no change.
--pieces adds slot-named files from a folder (knot-hole.png, plant.png ...) to the trial as they are.
Needs Pillow.
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'apps' / 'park' / 'public' / 'art'
KIT_CSV = ROOT / 'tools' / 'kit' / 'realm-kit.csv'

SHEET_W, SHEET_H = 1760, 880
# The template's cells at game size (x, y, w, h), from the realm asset list's sheet_cell_xy.
CELLS = {
    'C1': (20, 40, 512, 512),
    'C2': (572, 40, 512, 512),
    'C3': (1124, 40, 480, 120),
    'C4': (1124, 200, 320, 160),
    'C5': (1124, 400, 320, 160),
    'C6': (20, 600, 240, 240),
    'C7': (300, 600, 320, 120),
    'C8': (660, 600, 320, 240),
    'C9': (1020, 600, 320, 240),
    'C10': (1380, 600, 320, 240),
}
# Extra files that are not slots of tools/kit/realm-kit.csv, at their delivered size.
EXTRA = {'updraft-bits': (480, 480), 'hazard-2': (640, 480), 'hazard-3': (640, 480)}


def slot_sizes(path: Path = KIT_CSV) -> dict[str, tuple[int, int, int, int]]:
    """Each slot's game and delivered size: slot -> (w, h, deliver_w, deliver_h)."""
    out = {}
    with path.open(newline='') as f:
        for r in csv.DictReader(f):
            w, h = (int(v) for v in r['game_size_px'].split('x'))
            dw, dh = (int(v) for v in r['deliver_size_px'].split('x'))
            out[r['asset']] = (w, h, dw, dh)
    return out


def cell(sheet: Image.Image, cid: str, x0: int = 0, x1: int | None = None, y0: int = 0, y1: int | None = None) -> Image.Image:
    """A cell of the sheet (or a part of it, in game pixels), at the sheet's own scale."""
    k = sheet.width / SHEET_W
    x, y, w, h = CELLS[cid]
    x1 = w if x1 is None else x1
    y1 = h if y1 is None else y1
    return sheet.crop((round((x + x0) * k), round((y + y0) * k), round((x + x1) * k), round((y + y1) * k)))


def is_empty(img: Image.Image) -> bool:
    """A cell left blank (the artist keeps our default for it)."""
    return img.convert('RGBA').getchannel('A').getbbox() is None


BIT_FRAME = 160
MAX_BITS = 6


def split_bits(img: Image.Image) -> list[Image.Image]:
    """The separate bits of the updraft cell, largest first: each patch of art not touching another
    (a pixel's eight neighbours, on a quarter-size mask), down to a fiftieth of the largest."""
    img = img.convert('RGBA')
    q = 4
    small = img.getchannel('A').resize((max(1, img.width // q), max(1, img.height // q)))
    w, h = small.size
    solid = [v > 40 for v in (small.get_flattened_data() if hasattr(small, "get_flattened_data") else small.getdata())]
    seen = [False] * (w * h)
    parts = []
    for start in range(w * h):
        if not solid[start] or seen[start]:
            continue
        stack, xs, ys, n = [start], [], [], 0
        seen[start] = True
        while stack:
            i = stack.pop()
            x, y = i % w, i // w
            xs.append(x)
            ys.append(y)
            n += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    nx, ny = x + dx, y + dy
                    j = ny * w + nx
                    if 0 <= nx < w and 0 <= ny < h and solid[j] and not seen[j]:
                        seen[j] = True
                        stack.append(j)
        parts.append((n, (min(xs) * q, min(ys) * q, (max(xs) + 1) * q, (max(ys) + 1) * q)))
    parts.sort(key=lambda p: -p[0])
    if not parts:
        return []
    keep = [box for n, box in parts if n >= parts[0][0] / 50][:MAX_BITS]
    return [img.crop(box) for box in keep]


def bits_strip(bits: list[Image.Image], frame: int = BIT_FRAME) -> Image.Image:
    """The bits side by side, each centred in a square frame of its own."""
    strip = Image.new('RGBA', (frame * len(bits), frame), (0, 0, 0, 0))
    for i, b in enumerate(bits):
        k = min(frame / b.width, frame / b.height)
        b = b.resize((max(1, round(b.width * k)), max(1, round(b.height * k))), Image.LANCZOS)
        strip.alpha_composite(b, (i * frame + (frame - b.width) // 2, (frame - b.height) // 2))
    return strip


def small_perch(end: Image.Image, mid: Image.Image, w: int, h: int) -> Image.Image:
    """A small perch made from the perch's end, a short middle and the end mirrored, squeezed to w x h."""
    ew = end.width
    strip = Image.new('RGBA', (ew * 2 + mid.width // 2, end.height), (0, 0, 0, 0))
    strip.alpha_composite(end.convert('RGBA'), (0, 0))
    strip.alpha_composite(mid.convert('RGBA').crop((0, 0, mid.width // 2, mid.height)), (ew, 0))
    strip.alpha_composite(end.convert('RGBA').transpose(Image.FLIP_LEFT_RIGHT), (ew + mid.width // 2, 0))
    return strip.resize((w, h), Image.LANCZOS)


def cut(sheet: Image.Image, derive_small: bool = False) -> tuple[dict[str, Image.Image], list[str]]:
    """The sheet's cells as slot files at their delivered sizes, and a line for each thing worth knowing."""
    ratio = sheet.width / sheet.height
    notes: list[str] = []
    if abs(ratio - SHEET_W / SHEET_H) > 0.01:
        raise SystemExit(f'the sheet is {sheet.width}x{sheet.height}; a skin sheet is 2:1 (3520x1760 delivered, 1760x880 at game size)')
    if sheet.width != SHEET_W * 2:
        notes.append(f'the sheet is {sheet.width}x{sheet.height}, not the 3520x1760 the kit asks for; scaled to fit')
    sizes = slot_sizes()
    sheet = sheet.convert('RGBA')
    plan = {
        'texture-ground': cell(sheet, 'C1'),
        'texture-wall': cell(sheet, 'C2'),
        'perch-end': cell(sheet, 'C3', 0, 160),
        'perch-mid': cell(sheet, 'C3', 160, 480),
        'slope': cell(sheet, 'C4'),
        'roost': cell(sheet, 'C5'),
        'wind-current': cell(sheet, 'C7'),
        'hazard': cell(sheet, 'C8', y0=120),
        'updraft-bits': cell(sheet, 'C6'),
        'hazard-2': cell(sheet, 'C9'),
        'hazard-3': cell(sheet, 'C10'),
    }
    out: dict[str, Image.Image] = {}
    for name, img in plan.items():
        if is_empty(img):
            notes.append(f'{name}: its cell is blank, so the realm keeps our default')
            continue
        dw, dh = sizes[name][2:] if name in sizes else EXTRA[name]
        img = img.resize((dw, dh), Image.LANCZOS)
        if name == 'updraft-bits':
            bits = split_bits(img)
            notes.append(f'updraft-bits: {len(bits)} separate bit{"s" if len(bits) != 1 else ""} found (the kit asks for three to six)')
            img = bits_strip(bits)
        out[name] = img
    if derive_small and 'perch-end' in out and 'perch-mid' in out:
        _, _, dw, dh = sizes['perch-small']
        out['perch-small'] = small_perch(out['perch-end'], out['perch-mid'], dw, dh)
        notes.append('perch-small: the template has no cell for it; made here from C3 (end, short middle, end mirrored)')
    return out, notes


def publish_trial(files: dict[str, Image.Image], name: str, realm: str) -> list[str]:
    """Write the trial's files into public/art: 1x at game size and @2x at the delivered size."""
    sizes = slot_sizes()
    written = []
    for slot, img in files.items():
        if slot in sizes:
            w, h, dw, dh = sizes[slot]
        else:
            dw, dh = img.size
            w, h = dw // 2, dh // 2
        base = f'trial-{name}-kit-{realm}-{slot}'
        img = img.convert('RGBA')
        if img.size != (dw, dh):
            img = img.resize((dw, dh), Image.LANCZOS)
        img.resize((w, h), Image.LANCZOS).save(ART / f'{base}.webp', quality=82, method=6)
        written.append(f'{base}.webp')
        if (dw, dh) == (w * 2, h * 2):
            img.save(ART / f'{base}@2x.webp', quality=82, method=6)
            written.append(f'{base}@2x.webp')
    return written


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('sheet', type=Path)
    ap.add_argument('out', type=Path)
    ap.add_argument('--derive-small', action='store_true')
    ap.add_argument('--trial')
    ap.add_argument('--realm', default='clearing', choices=('glass', 'ink', 'clearing', 'neon'))
    ap.add_argument('--pieces', type=Path)
    a = ap.parse_args(argv)
    with Image.open(a.sheet) as im:
        files, notes = cut(im, a.derive_small)
    a.out.mkdir(parents=True, exist_ok=True)
    for slot, img in files.items():
        img.save(a.out / f'{slot}.png')
    print(f'cut {len(files)} files into {a.out}')
    for n in notes:
        print(f'  - {n}')
    if a.trial:
        trial = dict(files)
        if a.pieces:
            for p in sorted(a.pieces.glob('*.png')):
                with Image.open(p) as im:
                    trial[p.stem] = im.convert('RGBA')
        for f in publish_trial(trial, a.trial, a.realm):
            print(f'  published {f}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
