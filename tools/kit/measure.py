#!/usr/bin/env python3
"""Measures where each published kit piece's art stands in its box (OP-241), for the level assembler.

For every piece in the art kit (tools/art/config/kit.json, its 1x webp in apps/park/public/art) it
writes four numbers to tools/kit/stand.json, in the piece's logical pixels:

- top: where its upper edge is across the middle half of its width (the median of the first opaque
  row in each of those columns), so a platform's walking line can be put at the ground line's height;
- foot: the row under its lowest opaque one, so a prop, door or barrier stands on the floor and not
  on its box;
- left, right: its first opaque column and the one after its last, so copies of a run's middle meet
  art to art and a platform spans its run with its art, not its box.

  python3 tools/kit/measure.py            # rewrites tools/kit/stand.json
  python3 tools/kit/measure.py --check    # exits 1 if stand.json is out of date

Needs Pillow with webp. tools/kit/catalog.mjs folds stand.json into the shared catalogue.
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'apps' / 'park' / 'public' / 'art'
OUT = ROOT / 'tools' / 'kit' / 'stand.json'


def pieces():
    """Every piece key with its logical size, from the art tools' own list (tools/art/kit.mjs)."""
    js = (
        "const k = await import(process.argv[1]);"
        "console.log(JSON.stringify([...k.KIT_PIECES, ...k.KIT_AREA_PIECES, ...k.KIT_COURSE_PIECES, ...k.KIT_LANDMARK_PIECES, ...k.KIT_RECUT_PIECES].map(p => [p.key, p.w, p.h])));"
    )
    out = subprocess.run(['node', '--input-type=module', '-e', js, (ROOT / 'tools' / 'art' / 'kit.mjs').as_uri()], check=True, capture_output=True, text=True).stdout
    return json.loads(out)


def measure(path, w, h):
    im = Image.open(path).convert('RGBA')
    a = im.getchannel('A').resize((w, h))
    px = a.load()
    cols = range(w // 4, w - w // 4)
    tops = []
    for x in cols:
        for y in range(h):
            if px[x, y] > 128:
                tops.append(y)
                break
    foot = 0
    for y in range(h - 1, -1, -1):
        if any(px[x, y] > 128 for x in range(w)):
            foot = y + 1
            break
    left, right = 0, w
    for x in range(w):
        if any(px[x, y] > 128 for y in range(h)):
            left = x
            break
    for x in range(w - 1, -1, -1):
        if any(px[x, y] > 128 for y in range(h)):
            right = x + 1
            break
    tops.sort()
    top = tops[len(tops) // 2] if tops else 0
    return [top, foot, left, right]


def main(argv):
    table = {}
    for key, w, h in pieces():
        f = ART / f'{key}.webp'
        if f.exists():
            table[key] = measure(f, w, h)
    text = '{\n' + ',\n'.join(f'  "{k}": [{", ".join(str(n) for n in v)}]' for k, v in sorted(table.items())) + '\n}\n'
    if '--check' in argv:
        if not OUT.exists() or OUT.read_text() != text:
            print('tools/kit/stand.json is out of date: run python3 tools/kit/measure.py', file=sys.stderr)
            return 1
        return 0
    OUT.write_text(text)
    print(f'wrote {OUT.relative_to(ROOT)} ({len(table)} pieces)')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
