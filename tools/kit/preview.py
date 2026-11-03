#!/usr/bin/env python3
"""Renders a kit room with the published art (OP-241): what the park draws, as PNGs, with no browser.

It asks the greybox tool for the room's drawing as data (node tools/kit/greybox.mjs <room> --plan -)
and composites the kit's 1x webps from apps/park/public/art: the backdrops at their scroll rates
for a camera resting on each screen, then the room's pieces, with a plain owl marker on each spawn
for scale. One PNG per screen, and one of the whole room at rest.

  python3 tools/kit/preview.py l4 [--out <dir>] [--scale 0.5] [--marks]

--marks draws where an owl stands (white), the doorways' triggers (gold) and the ground line (blue).
Needs Pillow with webp. The PNGs go to work/kit/preview/ by default (work/ is not committed).
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'apps' / 'park' / 'public' / 'art'
ROOM_W, ROOM_H = 1600, 900
TILE_GROW = 0.2
_cache = {}


def art(key):
    if key not in _cache:
        f = ART / f'{key}.webp'
        _cache[key] = Image.open(f).convert('RGBA') if f.exists() else None
    return _cache[key]


def plan_of(room):
    out = subprocess.run(['node', str(ROOT / 'tools' / 'kit' / 'greybox.mjs'), room, '--plan', '-'], check=True, capture_output=True, text=True, cwd=ROOT).stdout
    return json.loads(out)


def faded(im, fade, w):
    """A tile's edge fades (room px at each side), as RoomScene draws them."""
    left, right = (fade or {}).get('left', 0), (fade or {}).get('right', 0)
    if not left and not right:
        return im
    im = im.copy()
    a = im.getchannel('A')
    ramp = Image.new('L', im.size, 255)
    px = ramp.load()
    lw, rw = round(left * im.width / w), round(right * im.width / w)
    for x in range(im.width):
        v = 255
        if lw and x < lw:
            v = round(255 * x / lw)
        if rw and x >= im.width - rw:
            v = min(v, round(255 * (im.width - 1 - x) / rw))
        if v < 255:
            for y in range(im.height):
                px[x, y] = v
    from PIL import ImageChops
    im.putalpha(ImageChops.multiply(a, ramp))
    return im


def paste(dst, im, x, y, w, h, k, flip=False, alpha=1.0):
    w2, h2 = max(1, round(w * k)), max(1, round(h * k))
    im = im.resize((w2, h2), Image.LANCZOS)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if alpha < 1:
        im = im.copy()
        im.putalpha(im.getchannel('A').point(lambda v: round(v * alpha)))
    dst.alpha_composite(im, (round(x * k), round(y * k)))


def tile(dst, t, cam_x, k, view_w):
    """A backdrop tile for a camera whose left edge is at cam_x (room px), as tilePlacement places it."""
    im = art(t['key'])
    if im is None:
        return
    rate = t.get('rate', 1)
    grow = 1 + max(0, 1 - rate) * TILE_GROW
    w, h = ROOM_W * grow, ROOM_H * grow
    cx, cy = t['x'] + ROOM_W / 2, t.get('y', 0) + ROOM_H / 2
    # Lined up with the room when the camera is centred on the tile's own screen, drifting from there by (1 - rate) of its move.
    cam_c = cam_x + view_w / 2
    x = cx - w / 2 - (1 - rate) * (cx - cam_c) - cam_x
    y = cy - h / 2
    paste(dst, faded(im, t.get('fade'), ROOM_W), x, y, w, h, k)


def owl(dst, x, y, k, scale):
    """A plain owl for scale: an owl's drawn size in this room (200 x 240 at half size, times the room's owlScale), feet at x, y."""
    w, h = 200 * 0.5 * scale, 240 * 0.5 * scale
    d = ImageDraw.Draw(dst)
    box = [(x - w * 0.38) * k, (y - h * 0.92) * k, (x + w * 0.38) * k, y * k]
    d.ellipse(box, fill=(143, 128, 104, 255))
    d.ellipse([(x - w * 0.26) * k, (y - h * 0.62) * k, (x + w * 0.26) * k, (y - h * 0.08) * k], fill=(246, 241, 227, 255))
    for ex in (-0.15, 0.15):
        d.ellipse([(x + w * (ex - 0.09)) * k, (y - h * 0.82) * k, (x + w * (ex + 0.09)) * k, (y - h * 0.64) * k], fill=(255, 211, 106, 255))


def render(p, cam_x, view_w, k, marks):
    out = Image.new('RGBA', (round(view_w * k), round(p['size']['h'] * k)), (12, 30, 54, 255))
    rest = view_w != ROOM_W
    for t in p['backgrounds']:
        if t.get('rate', 1) != 1 and not rest:
            tile(out, t, cam_x, k, view_w)
        else:
            im = art(t['key'])
            if im is not None:
                paste(out, faded(im, t.get('fade'), ROOM_W), t['x'] - cam_x, t.get('y', 0), ROOM_W, ROOM_H, k)
    fronts = []
    for c in p['images']:
        if c['layer'] == 'front':
            fronts.append(c)
            continue
        draw_cell(out, c, cam_x, k)
    for s in p['spawns'].values() if marks else [p['spawns'].get('default')]:
        if s:
            owl(out, s['x'] - cam_x, s['y'], k, p['owlScale'])
    for c in fronts:
        draw_cell(out, c, cam_x, k)
    for t in p['foregrounds']:
        if rest:
            im = art(t['key'])
            if im is not None:
                paste(out, faded(im, t.get('fade'), ROOM_W), t['x'] - cam_x, t.get('y', 0), ROOM_W, ROOM_H, k)
        else:
            tile(out, t, cam_x, k, view_w)
    if marks:
        d = ImageDraw.Draw(out)
        g = p['ground']
        d.line([(0, g * k), (out.width, g * k)], fill=(60, 120, 200, 255), width=2)
        for q in p['perches']:
            d.line([((q['x0'] - cam_x) * k, (g - q['top']) * k), ((q['x1'] - cam_x) * k, (g - q['top']) * k)], fill=(244, 244, 244, 255), width=3)
        for dr in p['doors']:
            r = dr['rect']
            top = dr.get('top', 0)
            d.rectangle([((r['x'] - cam_x) * k, (g - top - 6) * k), ((r['x'] + r['w'] - cam_x) * k, (g - top) * k)], fill=(232, 192, 64, 255))
    return out


def draw_cell(out, c, cam_x, k):
    im = art(c['key'])
    if im is None:
        return
    cr = c['crop']
    # A texture's crop is in its logical px, which its 1x file is.
    if c['tile'] == 'xy':
        sub = im.crop((round(cr['x']), round(cr['y']), round(cr['x'] + cr['w']), round(cr['y'] + cr['h'])))
        paste(out, sub, c['x'] + cr['x'] - cam_x, c['y'] + cr['y'], cr['w'], cr['h'], k, c['flip'], c['alpha'])
    else:
        paste(out, im, c['x'] - cam_x, c['y'], c['w'], c['h'], k, c['flip'], c['alpha'])


def main(argv):
    args = argv[1:]
    def flag(name, default=None):
        if name in args:
            i = args.index(name)
            v = args[i + 1]
            del args[i:i + 2]
            return v
        return default
    marks = '--marks' in args
    if marks:
        args.remove('--marks')
    out_dir = Path(flag('--out', str(ROOT / 'work' / 'kit' / 'preview')))
    k = float(flag('--scale', '0.5'))
    if not args:
        print(__doc__, file=sys.stderr)
        return 2
    p = plan_of(args[0])
    for msg in p['problems']:
        print(f'warning: {msg}', file=sys.stderr)
    out_dir.mkdir(parents=True, exist_ok=True)
    screens = max(1, round(p['size']['w'] / ROOM_W))
    tag = '-marks' if marks else ''
    for s in range(screens):
        im = render(p, s * ROOM_W, ROOM_W, k, marks)
        f = out_dir / f"{p['id']}-screen{s}{tag}.png"
        im.convert('RGB').save(f)
        print(f'wrote {f}')
    whole = render(p, 0, p['size']['w'], k, marks)
    f = out_dir / f"{p['id']}-whole{tag}.png"
    whole.convert('RGB').save(f)
    print(f'wrote {f}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
