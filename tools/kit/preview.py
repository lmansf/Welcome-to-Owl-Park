#!/usr/bin/env python3
"""Renders a kit room with the published art (OP-241): what the park draws, as PNGs, with no browser.

It asks the greybox tool for the room's drawing as data (node tools/kit/greybox.mjs <room> --plan -)
and composites the kit's 1x webps from apps/park/public/art: the backdrops at their scroll rates
for a camera resting on each screen, then the room's pieces, with a plain owl marker on each spawn
for scale. One PNG per screen, and one of the whole room at rest.

  python3 tools/kit/preview.py l4 [--out <dir>] [--scale 0.5] [--marks] [--target]

--marks draws where an owl stands (white), the doorways' triggers (gold) and the ground line (blue).
--target also writes the room's target screen (OP-249, tools/art/targets/) beside the screen it was
painted for, <room>-vs-target.png, for holding a screen to its target before it ships (OP-252), with
the story of each scene on that screen under it (docs/TREE_STYLE.md section 8: what story does this
corner tell?). It fails when a prop belongs to no scene or the scenes break the story rule.
The whole-room PNG marks each scene's group and prints its story under the room.

  python3 tools/kit/preview.py --check [<room> ...]

--check holds every screen of each kit room (all of them when none is named) to the value bands and the
palette (OP-252), as the park composites it, writes no PNG, and fails on the first room that misses:
- the backdrop as seen (the pixels no room piece covers) inside its layers' bands taken together, and
  every backdrop layer the room uses a kit layer inside its own band (docs/TREE_STYLE.md section 2b);
- the walkable layer as seen (the floor, the platforms and the props on them: the play, piece and front
  cells) inside the walkable band, its contrast at least 7.5;
- the front overlay, where a room has one, inside its band;
- the order: the walkable layer lighter than the backdrop by ORDER_GAP and harder and brighter at the rim
  (the ink-wash realm, which fades toward paper, keeps only the contrast and rim order);
- every colour family within the palette's tolerance and little off it (tools/art/artlib/palette.py);
- no kit problem, and every prop in a scene that tells a story.
It prints each screen's numbers, and for the screen a target was painted for, the target's beside them.
Needs Pillow with webp, and numpy. The PNGs go to work/kit/preview/ by default (work/ is not committed).
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools' / 'art'))
ART = ROOT / 'apps' / 'park' / 'public' / 'art'
ROOM_W, ROOM_H = 1600, 900
TILE_GROW = 0.2
TARGETS = ROOT / 'tools' / 'art' / 'targets'
# The approved target for a kit room (OP-249): its key and the screen it was painted for.
ROOM_TARGETS = {'l4': ('target-l4', 0), 'plaza': ('target-plaza', 0)}
_cache = {}
# The art file each key draws from, as the plans give it (OP-275: a realm slot's key draws its stand-in's file until its own comes).
FILES = {}


def art(key):
    if key not in _cache:
        name = FILES.get(key, key)
        f = next((ART / f'{name}.{ext}' for ext in ('webp', 'png') if (ART / f'{name}.{ext}').exists()), None)
        _cache[key] = Image.open(f).convert('RGBA') if f else None
    return _cache[key]


def plan_of(room):
    out = subprocess.run(['node', str(ROOT / 'tools' / 'kit' / 'greybox.mjs'), room, '--plan', '-'], check=True, capture_output=True, text=True, cwd=ROOT).stdout
    plan = json.loads(out)
    FILES.update(plan.get('files', {}))
    return plan


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


def paste(dst, im, x, y, w, h, k, flip=False, alpha=1.0, tint=None):
    w2, h2 = max(1, round(w * k)), max(1, round(h * k))
    im = im.resize((w2, h2), Image.LANCZOS)
    if flip:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)
    if tint is not None:
        # A colour the piece is drawn multiplied by (a drop's shade, a surface's tint), as the park draws it.
        shade = Image.new('RGBA', im.size, ((tint >> 16) & 255, (tint >> 8) & 255, tint & 255, 255))
        im = ImageChops.multiply(im, shade)
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


def render(p, cam_x, view_w, k, marks, owl_marker=True):
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
    watered = False
    for c in p['images']:
        if c['layer'] == 'front':
            fronts.append(c)
            continue
        # A flooded walk's water lies over the walk (the play cells) and under the pieces on it.
        if not watered and c['layer'] == 'piece':
            draw_floods(out, p, cam_x, k)
            watered = True
        draw_cell(out, c, cam_x, k)
    if not watered:
        draw_floods(out, p, cam_x, k)
    for s in p['spawns'].values() if marks else [p['spawns'].get('default')]:
        if s and owl_marker:
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
        paste(out, sub, c['x'] + cr['x'] - cam_x, c['y'] + cr['y'], cr['w'], cr['h'], k, c['flip'], c['alpha'], c.get('tint'))
    else:
        # A piece drawn to its box shows all of itself, but for an end piece on a run too short for both
        # its ends (KitDraw.crop, OP-348): that one shows only its part across, where that part lies.
        scale = c['h'] / cr['h'] if cr['h'] else 1
        piece_w = c['w'] / scale if scale else c['w']
        if not c['flip'] and (cr['x'] > 0.5 or cr['w'] < piece_w - 0.5):
            fx = im.width / piece_w
            sub = im.crop((round(cr['x'] * fx), 0, round((cr['x'] + cr['w']) * fx), im.height))
            paste(out, sub, c['x'] + cr['x'] * scale - cam_x, c['y'], cr['w'] * scale, c['h'], k, False, c['alpha'], c.get('tint'))
        else:
            paste(out, im, c['x'] - cam_x, c['y'], c['w'], c['h'], k, c['flip'], c['alpha'], c.get('tint'))


def draw_floods(out, p, cam_x, k):
    """The flooded walks' still water (OP-343): each a box of its colour over the walk, as the park paints it."""
    d = ImageDraw.Draw(out)
    for f in p.get('floods', []):
        c = f['color']
        box = [round((f['x'] - cam_x) * k), round(f['y'] * k), round((f['x'] + f['w'] - cam_x) * k) - 1, round((f['y'] + f['h']) * k) - 1]
        if box[2] >= box[0] and box[3] >= box[1]:
            d.rectangle(box, fill=((c >> 16) & 255, (c >> 8) & 255, c & 255, 255))


def beside(screen, target, gap=8):
    """The screen as the kit draws it (left) and its target (right), at the screen's size, on one sheet."""
    t = target.convert('RGB').resize(screen.size, Image.LANCZOS)
    sheet = Image.new('RGB', (screen.width * 2 + gap, screen.height), (20, 20, 28))
    sheet.paste(screen.convert('RGB'), (0, 0))
    sheet.paste(t, (screen.width + gap, 0))
    return sheet


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow without FreeType: the fixed bitmap font
        return ImageFont.load_default()


def with_stories(im, scenes, cam_x, k, mark=False):
    """The picture with a strip under it: one line per scene in view, its number, id and story (the story rule).
    With mark, the strip opens with a bracket under each scene's group, numbered as its line."""
    size = max(12, round(28 * k))
    f = font(size)
    line = round(size * 1.5)
    lines = scenes or [{'id': '', 'story': 'no scenes: no props on this screen'}]
    band = line + size // 2 if mark and scenes else 0
    strip = Image.new('RGB', (im.width, band + line * len(lines) + size), (20, 20, 28))
    d = ImageDraw.Draw(strip)
    if band:
        y = size // 2
        for i, sc in enumerate(scenes):
            x0, x1 = (sc['x0'] - cam_x) * k, (sc['x1'] - cam_x) * k
            d.line([(x0, y), (x1, y)], fill=(232, 192, 64), width=3)
            d.line([(x0, y), (x0, y + size // 2)], fill=(232, 192, 64), width=3)
            d.line([(x1, y), (x1, y + size // 2)], fill=(232, 192, 64), width=3)
            d.text(((x0 + x1) / 2 - size / 3, y + 4), str(i + 1), fill=(232, 192, 64), font=f)
    for i, sc in enumerate(lines):
        text = f"{i + 1}. {sc['id']}: {sc['story']}" if sc['id'] else sc['story']
        d.text((size, band + size // 2 + i * line), text, fill=(236, 230, 214), font=f)
    out = Image.new('RGB', (im.width, im.height + strip.height))
    out.paste(im.convert('RGB'), (0, 0))
    out.paste(strip, (0, im.height))
    return out


#: The cells of the walkable layer: the floor and platforms (play) and the props on them (piece, and front,
#: the props an owl walks behind). The back cells (the trunk, a wall) are neither backdrop nor walkway, and
#: neither is the hazard layer (OP-343): a course's drop and the danger in it. A flooded walk's water is no
#: layer of cells: the park paints it over the walk, and the walk is measured as seen, under its water.
WALK_LAYERS = ('play', 'piece', 'front')
BEHIND_LAYERS = ('back', 'hazard')
#: How much lighter (L mean) the walkable layer reads than the backdrop on every screen: a step darker (section 1).
ORDER_GAP = 5.0
#: The walkable layer's contrast floor (docs/TREE_STYLE.md section 2b: "14, and at least 7.5").
WALK_CONTRAST_MIN = 7.5


def kit_rooms():
    out = subprocess.run(['node', str(ROOT / 'tools' / 'kit' / 'greybox.mjs'), '--list'], check=True, capture_output=True, text=True, cwd=ROOT).stdout
    return [line for line in out.split() if line]


def alpha_of(p, cam_x, k, size, layers=(), foregrounds=False):
    """The alpha (H, W) of a room's cells in the given layers, or of its foreground tiles, as the screen draws them."""
    import numpy as np
    im = Image.new('RGBA', size, (0, 0, 0, 0))
    for c in p['images']:
        if c['layer'] in layers:
            draw_cell(im, c, cam_x, k)
    if foregrounds:
        for t in p['foregrounds']:
            tile(im, t, cam_x, k, ROOM_W)
    return np.asarray(im)[..., 3]


def envelope(keys):
    """The backdrop layers' bands taken together (the loosest of each limit), and why any key has none."""
    from artlib import bands
    limits, faults = [], []
    for key in dict.fromkeys(keys):
        try:
            limits.append(bands.band_of(key)[1])
        except ValueError:
            faults.append(f'backdrop {key} is not a kit backdrop layer, so it has no value band')
    if not limits:
        return None, faults
    env = {'L_mean': (min(b['L_mean'][0] for b in limits), max(b['L_mean'][1] for b in limits))}
    for m in ('L_p95', 'contrast', 'sat'):
        env[m] = max(b[m] for b in limits)
    return env, faults


def check_screen(p, s, k):
    """(problems, numbers) for one screen of a kit room, as the park composites it (no owl marker)."""
    import numpy as np
    from artlib import bands, palette
    cam = s * ROOM_W
    comp = render(p, cam, ROOM_W, k, False, owl_marker=False).convert('RGB')
    size = comp.size
    rgb = np.asarray(comp).astype(np.float64) / 255.0
    blk = bands.block_for(size[0])
    walk = alpha_of(p, cam, k, size, WALK_LAYERS) >= bands.OPAQUE
    front = alpha_of(p, cam, k, size, foregrounds=True)
    covered = (alpha_of(p, cam, k, size, BEHIND_LAYERS + WALK_LAYERS) >= 8) | (front >= 8)
    nums = {'backdrop': bands.stats_of(rgb, ~covered, blk), 'walk': bands.stats_of(rgb, walk, blk)}
    if (front >= bands.OPAQUE).any():
        nums['overlay'] = bands.stats_of(rgb, front >= bands.OPAQUE, blk)
    nums['palette'] = palette.measure(comp)
    out = []
    keys = [t['key'] for t in p['backgrounds']]
    env, faults = envelope(keys)
    out += faults
    if env and nums['backdrop']['opaque'] > 0:
        out += [f'backdrop: {m}' for m in bands.problems(nums['backdrop'], env)]
    if nums['walk']['opaque'] > 0:
        out += [f'walkable layer: {m}' for m in bands.problems(nums['walk'], 'walk')]
        if nums['walk']['contrast'] < WALK_CONTRAST_MIN:
            out.append(f"walkable layer: contrast {nums['walk']['contrast']} under {WALK_CONTRAST_MIN}")
    else:
        out.append('no walkable layer on this screen')
    if 'overlay' in nums:
        out += [f'front overlay: {m}' for m in bands.problems(nums['overlay'], 'front')]
    b, w = nums['backdrop'], nums['walk']
    if b['opaque'] > 0 and w['opaque'] > 0:
        paper = any(bands.layer_area(key) in bands.AREA_BANDS for key in keys if key.startswith('kit-'))
        if not paper and w['L_mean'] < b['L_mean'] + ORDER_GAP:
            out.append(f"the backdrop competes with the walkway: L mean {b['L_mean']} behind {w['L_mean']} (the walkway at least {ORDER_GAP} lighter)")
        if w['contrast'] <= b['contrast']:
            out.append(f"the backdrop reads as hard as the walkway: contrast {b['contrast']} behind {w['contrast']}")
        if w['L_p95'] < b['L_p95']:
            out.append(f"the backdrop's rim light outshines the walkway's: L p95 {b['L_p95']} behind {w['L_p95']}")
    out += [f'palette: {m}' for m in palette.problems(nums['palette'])]
    return out, nums


def fmt(st):
    return f"L {st['L_mean']}, p95 {st['L_p95']}, contrast {st['contrast']}, sat {st['sat']}"


def check(rooms, k=0.5):
    """Holds every screen of the kit rooms to the bands and the palette; prints the numbers; returns the exit code."""
    from artlib import bands, palette
    failed = []
    for room in rooms or kit_rooms():
        p = plan_of(room)
        faults = list(p['problems'])
        for key in dict.fromkeys(t['key'] for t in p['backgrounds']):
            im = art(key)
            if im is None:
                faults.append(f'backdrop {key} has no published art')
                continue
            try:
                name, band = bands.band_of(key)
            except ValueError:
                continue
            faults += [f'backdrop layer {key} ({name}): {m}' for m in bands.problems(bands.stats(im), band)]
        target = ROOM_TARGETS.get(p['id'])
        for s in range(max(1, round(p['size']['w'] / ROOM_W))):
            probs, nums = check_screen(p, s, k)
            pal = nums['palette']
            fams = ', '.join(f"{n} {f['drift']}" for n, f in pal['families'].items() if f['share'] >= palette.MIN_SHARE)
            print(f"{p['id']} screen {s}: backdrop {fmt(nums['backdrop'])}; walkway {fmt(nums['walk'])}")
            print(f"  palette: {pal['off'] * 100:.1f} % off; drift {fams}")
            if target and target[1] == s:
                t = bands.measure_target(Image.open(TARGETS / f'{target[0]}.png'))
                print(f"  its target {target[0]}: backdrop band {fmt(t['backdrop'])}; floor band {fmt(t['floor'])}")
            faults += [f'screen {s}: {m}' for m in probs]
        for m in faults:
            print(f'  FAIL {m}')
        print(f"{p['id']}: {'not ready to ship' if faults else 'inside the bands and the palette'}")
        if faults:
            failed.append(p['id'])
    if failed:
        print(f"failed: {', '.join(failed)} (docs/TREE_STYLE.md sections 1 and 2b)", file=sys.stderr)
        return 1
    return 0


def main(argv):
    args = argv[1:]
    if '--check' in args:
        args.remove('--check')
        return check(args)
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
    with_target = '--target' in args
    if with_target:
        args.remove('--target')
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
    if with_target:
        if p['id'] not in ROOM_TARGETS:
            print(f"no target screen for {p['id']} (targets: {', '.join(ROOM_TARGETS)})", file=sys.stderr)
            return 2
        key, s = ROOM_TARGETS[p['id']]
        on_screen = [sc for sc in p.get('scenes', []) if sc['screen'] == s]
        sheet = with_stories(beside(render(p, s * ROOM_W, ROOM_W, k, marks), Image.open(TARGETS / f'{key}.png')), on_screen, s * ROOM_W, k)
        f = out_dir / f"{p['id']}-vs-target{tag}.png"
        sheet.save(f)
        print(f'wrote {f}')
        for sc in on_screen:
            print(f"screen {s}, {sc['id']}: {sc['story']}")
    whole = with_stories(render(p, 0, p['size']['w'], k, marks), p.get('scenes', []), 0, k, mark=True)
    f = out_dir / f"{p['id']}-whole{tag}.png"
    whole.save(f)
    print(f'wrote {f}')
    story_faults = [m for m in p['problems'] if m.startswith(('scene', 'scenes', 'prop '))]
    if with_target and story_faults:
        print('not ready to ship: every prop must belong to a scene that tells a story (docs/TREE_STYLE.md section 8)', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
