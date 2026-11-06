#!/usr/bin/env python3
"""Imports a realm artist's delivery into the park (OP-274): pnpm art:import <folder> <realm>.

<folder> is a local copy of what the artist sent (a Drive folder downloaded), one PNG per slot of the
realm kit, named as the kit list names it (tools/kit/realm-kit.csv: start-screen.png, perch-mid.png
and so on). <realm> is the realm it is for: glass, ink, clearing or neon.

First every file is checked against its slot, and if any is missing or wrong the import stops with
each file and the reason, and nothing is written. A file is wrong when:
- its name is no slot's, or it is not a PNG;
- it is not the size the kit asks the artist to deliver;
- it is meant to be solid edge to edge and has see-through pixels, or meant to stand on a see-through
  background and has none;
- it must repeat and its edges don't join a copy of itself (the seam is compared with the picture's
  own detail: a small difference is a warning, a large one refuses the file);
- it is a perch or roost and its top edge, the line an owl walks on, isn't level;
- it is the slope and its top edge isn't one straight rise from the bottom left to the top right.

Then, with every file right, each slot's art is published as kit-<realm>-<slot> in apps/park/public/art:
the 1x file at the game's size and the 2x file at the delivered size where that is twice it, PNG,
with the start screen converted to WebP. The pieces are measured as art:finish measures them
(tools/kit/measure.py), the kit's catalogue is regenerated (pnpm kit:catalog), so the slot draws its
own art in place of its stand-in, and a preview sheet of every slot is written with a preview and a
greybox of one of the realm's course screens (pnpm kit:preview, pnpm kit:greybox), in
work/kit/import/<realm>/ (work/ is not committed).

  python3 tools/kit/art_import.py <folder> <realm> [--partial] [--check]

--partial imports what the folder has (an artist's first batch) and lists the slots still to come.
--check checks the folder and writes nothing.
Needs Pillow and numpy.
"""
from __future__ import annotations

import argparse
import csv
import difflib
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'apps' / 'park' / 'public' / 'art'
KIT_CSV = ROOT / 'tools' / 'kit' / 'realm-kit.csv'
WORK = ROOT / 'work' / 'kit' / 'import'
REALMS = ('glass', 'ink', 'clearing', 'neon')
# One course room of each realm with a 2D course, for the preview and greybox of a course screen.
COURSE_ROOM = {'clearing': 'canopy-1', 'ink': 'brush-1', 'neon': 'circuit-1'}

# A seam this many times the picture's own detail is a warning; this many, a refusal.
SEAM_WARN = 1.6
SEAM_REFUSE = 3.0
# How far a walking line may wander (share of the delivered height, at least LEVEL_MIN_PX).
LEVEL_SHARE = 0.04
LEVEL_MIN_PX = 3
# The slope's top edge: how far it may stray from one straight line, and how much it must rise.
SLOPE_STRAY = 0.04
SLOPE_RISE = 0.25
# Slots whose top edge is an owl's walking line.
LEVEL_SLOTS = ('perch-end', 'perch-mid', 'perch-small', 'roost')
# A see-through slot has at least this share of clear pixels.
CLEAR_SHARE = 0.01
EDGES = {'x': 'left and right edges', 'y': 'top and bottom edges'}


@dataclass(frozen=True)
class Slot:
    id: str
    slot: str
    what: str
    w: int
    h: int
    deliver_w: int
    deliver_h: int
    opaque: bool
    repeat: str  # 'xy', 'x', 'y' or 'none'
    anchor: str

    @property
    def file(self) -> str:
        return f'{self.slot}.png'


def _repeat(text: str) -> str:
    return {'all four edges': 'xy', 'left and right edges': 'x', 'top and bottom edges': 'y'}.get(text.strip(), 'none')


def slots(path: Path = KIT_CSV) -> list[Slot]:
    """The realm kit's slots, from the kit list (the same rows tools/kit/catalog.mjs reads)."""
    out = []
    with path.open(newline='') as f:
        for r in csv.DictReader(f):
            w, h = (int(v) for v in r['game_size_px'].split('x'))
            dw, dh = (int(v) for v in r['deliver_size_px'].split('x'))
            out.append(Slot(r['id'], r['asset'], r['what_it_is'], w, h, dw, dh, r['background'] == 'opaque', _repeat(r['must_repeat_seamlessly']), r['anchor']))
    return out


def slot_key(realm: str, slot: str) -> str:
    return f'kit-{realm}-{slot}'


# ---------- The checks ----------


def seam_ratio(img: Image.Image) -> dict:
    """How visible the wrap seams are: the difference between the last and first columns (rows)
    against the difference between neighbouring columns (rows) inside; about 1 for a picture that
    tiles. Premultiplied, so a see-through picture's clear parts are one colour (as art:finish's)."""
    arr = np.asarray(img.convert('RGBA')).astype(np.float32)
    arr = arr[..., :3] * arr[..., 3:4] / 255.0
    inner_x = float(np.abs(np.diff(arr, axis=1)).mean())
    inner_y = float(np.abs(np.diff(arr, axis=0)).mean())
    seam_x = float(np.abs(arr[:, 0] - arr[:, -1]).mean())
    seam_y = float(np.abs(arr[0] - arr[-1]).mean())
    return {'x': round(seam_x / max(inner_x, 2.0), 2), 'y': round(seam_y / max(inner_y, 2.0), 2)}


def top_profile(alpha: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """The columns that have art and, for each, its first solid row from the top."""
    solid = alpha > 128
    cols = np.where(solid.any(axis=0))[0]
    return cols, solid[:, cols].argmax(axis=0)


def level_problem(slot: Slot, img: Image.Image) -> str | None:
    """A walking line that isn't level: the top edge across the art's middle (all of a perch's middle;
    a perch end from a third in, past its rounded end), its spread past a few stray columns."""
    alpha = np.asarray(img.convert('RGBA'))[..., 3]
    cols, tops = top_profile(alpha)
    if not len(cols):
        return 'has no art in it'
    left, right = int(cols[0]), int(cols[-1]) + 1
    span = right - left
    lo, hi = (left + span // 3, right - span // 16) if slot.slot == 'perch-end' else (left + span // 16, right - span // 16)
    keep = (cols >= lo) & (cols < hi)
    t = tops[keep] if keep.any() else tops
    spread = float(np.percentile(t, 95) - np.percentile(t, 5))
    tol = max(LEVEL_MIN_PX, round(LEVEL_SHARE * slot.deliver_h))
    if spread > tol:
        return f'its top edge, where an owl walks, is not level: it wanders {spread:.0f} px up and down, and must stay within {tol} px'
    return None


def slope_problem(slot: Slot, img: Image.Image) -> str | None:
    """The slope's top edge: one straight rise from the bottom left to the top right."""
    alpha = np.asarray(img.convert('RGBA'))[..., 3]
    cols, tops = top_profile(alpha)
    if len(cols) < 8:
        return 'has no art in it'
    a, b = np.polyfit(cols.astype(float), tops.astype(float), 1)
    fit = a * cols + b
    stray = float(np.percentile(np.abs(tops - fit), 95))
    rise = float(fit[0] - fit[-1])
    if rise < SLOPE_RISE * slot.deliver_h:
        return f'its top edge does not rise from the bottom left to the top right (it rises {rise:.0f} px; the kit asks for at least {SLOPE_RISE * slot.deliver_h:.0f})'
    tol = max(LEVEL_MIN_PX, round(SLOPE_STRAY * slot.deliver_h))
    if stray > tol:
        return f'its top edge is not one straight rise: it bends {stray:.0f} px off a straight line, and must stay within {tol} px'
    return None


@dataclass
class Checked:
    """What the check found: problems refuse the delivery, warnings let it through."""
    problems: list[str]
    warnings: list[str]
    found: dict[str, Path]  # slot name -> its file
    missing: list[Slot]


def check_file(slot: Slot, path: Path) -> tuple[list[str], list[str]]:
    problems: list[str] = []
    warnings: list[str] = []
    try:
        with Image.open(path) as im:
            im.load()
            img = im.copy()
            img.format = im.format
    except Exception as e:  # noqa: BLE001 - any file Pillow can't read is refused with its reason
        return [f'{path.name}: could not be opened as a picture ({e})'], []
    if img.format != 'PNG':
        problems.append(f'{path.name}: is a {img.format} saved with a .png name; save it as a PNG')
    if img.size != (slot.deliver_w, slot.deliver_h):
        problems.append(f'{path.name}: is {img.size[0]}x{img.size[1]}; the kit asks for {slot.deliver_w}x{slot.deliver_h}')
        return problems, warnings
    rgba = img.convert('RGBA')
    alpha = np.asarray(rgba)[..., 3]
    if slot.opaque and alpha.min() < 255:
        problems.append(f'{path.name}: has see-through pixels; it must be solid edge to edge')
    if not slot.opaque and float((alpha == 0).mean()) < CLEAR_SHARE:
        problems.append(f'{path.name}: has no see-through background; everything around the art must be clear')
    if slot.repeat != 'none':
        ratio = seam_ratio(rgba)
        for axis in slot.repeat:
            r = ratio[axis]
            if r > SEAM_REFUSE:
                problems.append(f'{path.name}: its {EDGES[axis]} do not join a copy of itself (the seam is {r}x its own detail; the limit is {SEAM_REFUSE})')
            elif r > SEAM_WARN:
                warnings.append(f'{path.name}: its {EDGES[axis]} show a faint seam ({r}x its own detail); it imports, but a cleaner join would look better')
    if slot.slot in LEVEL_SLOTS and (p := level_problem(slot, rgba)):
        problems.append(f'{path.name}: {p}')
    if slot.slot == 'slope' and (p := slope_problem(slot, rgba)):
        problems.append(f'{path.name}: {p}')
    return problems, warnings


def check_delivery(folder: Path, partial: bool = False, kit: list[Slot] | None = None) -> Checked:
    """Every file in the folder against its slot, and every slot with no file."""
    kit = kit or slots()
    by_name = {s.file: s for s in kit}
    stems = {s.slot: s for s in kit}
    problems: list[str] = []
    warnings: list[str] = []
    found: dict[str, Path] = {}
    for f in sorted(p for p in folder.iterdir() if p.is_file() and not p.name.startswith('.')):
        slot = by_name.get(f.name)
        if slot:
            p, w = check_file(slot, f)
            problems += p
            warnings += w
            found[slot.slot] = f
        elif f.stem in stems:
            problems.append(f'{f.name}: is a {f.suffix or "file with no type"}; the kit takes PNG only ({f.stem}.png)')
        else:
            near = difflib.get_close_matches(f.stem, list(stems), n=1)
            problems.append(f'{f.name}: is not a kit slot name' + (f' (did you mean {near[0]}.png?)' if near else ''))
    missing = [s for s in kit if s.slot not in found and not any(p.startswith(f'{s.slot}.') for p in (q.name for q in folder.iterdir()))]
    if not partial:
        problems += [f'{s.file}: is missing ({s.what})' for s in missing]
    return Checked(problems, warnings, found, missing)


# ---------- The import ----------


def _resize(img: Image.Image, size: tuple[int, int], repeat: str) -> Image.Image:
    """Resized with the filter kept off the edges a picture repeats across: tiled, resized, the middle kept."""
    if img.size == size:
        return img
    if repeat == 'none':
        return img.resize(size, Image.Resampling.LANCZOS)
    w, h = img.size
    nx, ny = (3 if 'x' in repeat else 1), (3 if 'y' in repeat else 1)
    big = Image.new(img.mode, (nx * w, ny * h))
    for i in range(nx):
        for j in range(ny):
            big.paste(img, (i * w, j * h))
    big = big.resize((nx * size[0], ny * size[1]), Image.Resampling.LANCZOS)
    ox, oy = (size[0] if nx == 3 else 0), (size[1] if ny == 3 else 0)
    return big.crop((ox, oy, ox + size[0], oy + size[1]))


def publish(found: dict[str, Path], realm: str, art: Path = ART, kit: list[Slot] | None = None) -> list[Path]:
    """Each slot's art as kit-<realm>-<slot>: the 1x file, and the 2x where the delivery is twice the
    game's size; PNG, the start screen WebP. Any earlier file of the key is replaced."""
    kit = kit or slots()
    written: list[Path] = []
    art.mkdir(parents=True, exist_ok=True)
    for s in kit:
        src = found.get(s.slot)
        if not src:
            continue
        key = slot_key(realm, s.slot)
        for old in [*art.glob(f'{key}.*'), *art.glob(f'{key}@2x.*')]:
            old.unlink()
        with Image.open(src) as im:
            img = im.convert('RGB' if s.opaque else 'RGBA')
        ext = 'webp' if s.slot == 'start-screen' else 'png'
        sizes = [('', (s.w, s.h))]
        if (s.deliver_w, s.deliver_h) == (2 * s.w, 2 * s.h):
            sizes.append(('@2x', (s.deliver_w, s.deliver_h)))
        for suffix, size in sizes:
            out = art / f'{key}{suffix}.{ext}'
            pic = _resize(img, size, s.repeat)
            if ext == 'webp':
                pic.save(out, 'WEBP', quality=90, method=6)
            else:
                pic.save(out, 'PNG', optimize=True)
            written.append(out)
    return written


def preview_sheet(realm: str, art: Path = ART, kit: list[Slot] | None = None, out: Path | None = None) -> tuple[Path, list[str]]:
    """Every slot of the realm's kit on one sheet, as the park has it: its art (1x) on a checker, its
    name and size under it; a slot with no art yet as an empty, marked box. Returns the sheet and the
    slots drawn with their own art."""
    kit = kit or slots()
    cell_w, cell_h, pad, label = 260, 200, 12, 30
    cols = 7
    rows = -(-len(kit) // cols)
    sheet = Image.new('RGB', (cols * cell_w, rows * (cell_h + label)), (28, 30, 38))
    draw = ImageDraw.Draw(sheet)
    drawn: list[str] = []
    for i, s in enumerate(kit):
        x0, y0 = (i % cols) * cell_w, (i // cols) * (cell_h + label)
        box = (x0 + pad, y0 + pad, x0 + cell_w - pad, y0 + cell_h - pad)
        bw, bh = box[2] - box[0], box[3] - box[1]
        for cy in range(box[1], box[3], 10):
            for cx in range(box[0], box[2], 10):
                shade = 70 if ((cx - box[0]) // 10 + (cy - box[1]) // 10) % 2 else 54
                draw.rectangle((cx, cy, min(cx + 9, box[2] - 1), min(cy + 9, box[3] - 1)), fill=(shade, shade, shade))
        key = slot_key(realm, s.slot)
        f = next((art / f'{key}.{ext}' for ext in ('png', 'webp') if (art / f'{key}.{ext}').exists()), None)
        if f:
            with Image.open(f) as im:
                pic = im.convert('RGBA')
            k = min(bw / pic.width, bh / pic.height)
            pic = pic.resize((max(1, round(pic.width * k)), max(1, round(pic.height * k))), Image.Resampling.LANCZOS)
            sheet.paste(pic, (box[0] + (bw - pic.width) // 2, box[1] + (bh - pic.height) // 2), pic)
            drawn.append(s.slot)
        else:
            draw.line((box[0], box[1], box[2], box[3]), fill=(150, 80, 80), width=2)
            draw.line((box[0], box[3], box[2], box[1]), fill=(150, 80, 80), width=2)
        draw.text((x0 + pad, y0 + cell_h - 4), f'{s.id} {s.slot}  {s.w}x{s.h}', fill=(230, 230, 230) if f else (200, 120, 120))
    out = out or WORK / realm / f'{realm}-slots.png'
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    return out, drawn


def _run(cmd: list[str]) -> None:
    print('  $', ' '.join(cmd))
    subprocess.run(cmd, check=True, cwd=ROOT)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog='pnpm art:import', description='Check and import a realm artist\'s delivery (OP-274).')
    ap.add_argument('folder', type=Path, help='a local copy of the folder the artist sent')
    ap.add_argument('realm', choices=REALMS)
    ap.add_argument('--partial', action='store_true', help='import the slots the folder has; list the rest as still to come')
    ap.add_argument('--check', action='store_true', help='check the folder and write nothing')
    a = ap.parse_args(argv)
    if not a.folder.is_dir():
        print(f'{a.folder}: no such folder', file=sys.stderr)
        return 2
    got = check_delivery(a.folder, a.partial)
    for w in got.warnings:
        print(f'warning  {w}')
    if got.problems:
        print(f'\nNot imported: {len(got.problems)} file{"s" if len(got.problems) != 1 else ""} to fix in {a.folder}. Nothing was written.', file=sys.stderr)
        for p in got.problems:
            print(f'  - {p}', file=sys.stderr)
        return 1
    if not got.found:
        print(f'{a.folder}: no kit slot files to import', file=sys.stderr)
        return 1
    print(f'{len(got.found)} of {len(slots())} slots check out for {a.realm}.')
    if a.partial and got.missing:
        print('still to come: ' + ', '.join(s.slot for s in got.missing))
    if a.check:
        return 0
    written = publish(got.found, a.realm)
    print(f'published {len(written)} files in {ART.relative_to(ROOT)}')
    _run([sys.executable, '-B', 'tools/kit/measure.py'])
    _run(['node', 'tools/kit/catalog.mjs'])
    sheet, drawn = preview_sheet(a.realm)
    print(f'preview sheet: {sheet.relative_to(ROOT)} ({len(drawn)} slots with their own art)')
    room = COURSE_ROOM.get(a.realm)
    if room:
        out = WORK / a.realm
        _run([sys.executable, '-B', 'tools/kit/preview.py', room, '--out', str(out), '--scale', '0.5'])
        _run(['node', 'tools/kit/greybox.mjs', room, '--out', str(out / f'{room}-greybox.png'), '--scale', '0.5'])
    else:
        print(f'{a.realm} has no 2D course room yet: no course screen to preview')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
