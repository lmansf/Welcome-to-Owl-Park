"""Draws the whole world as one picture, 1 pixel = SCALE^-1 metres: build/map.png. No Blender needed.

Run: python map_preview.py [--reach reach.json] [--scale 2]
Rock is dark, open air light, water blue, ledges white, hazards red, rising air green; shrines,
bells, benches and feathers are marked, and each region is labelled. With --reach, the places the
map checker found the owl could stand are tinted by the moves it needed to get there.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from wr.world import build_world  # noqa: E402
from wr.world.reaches import REGIONS, X0, X1, Z0, Z1  # noqa: E402

S = 2
for i, a in enumerate(sys.argv):
    if a == "--scale":
        S = int(sys.argv[i + 1])
w = build_world()
W, H = (X1 - X0) * S, (Z1 - Z0) * S
REGION_TINT = {"grove": (214, 170, 70), "falls": (120, 170, 160), "heart": (150, 105, 60), "spire": (170, 120, 70),
               "ember": (200, 80, 40), "frost": (170, 210, 240), "colonnade": (190, 150, 100), "canyon": (225, 170, 110),
               "gloam": (70, 150, 220), "sea": (40, 110, 160), "sky": (200, 220, 250)}
img = Image.new("RGB", (W, H), (28, 24, 30))
d = ImageDraw.Draw(img)


def box(x0, z0, x1, z1, fill=None, outline=None, width=1):
    d.rectangle([(x0 - X0) * S, (Z1 - z1) * S, (x1 - X0) * S - 1, (Z1 - z0) * S - 1], fill=fill, outline=outline, width=width)


# open air: every zone, tinted, then rock over it
for key, (title, (a, b, c, dd), *_r) in REGIONS.items():
    t = REGION_TINT[key]
    box(a * 32, c * 20, (b + 1) * 32, (dd + 1) * 20, fill=tuple(int(v * 0.55 + 230 * 0.45) for v in t))
for s in w["solids"]:
    box(s["x0"], s["z0"], s["x1"], s["z1"], fill=(46, 40, 48))
for wt in w["waters"]:
    ov = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).rectangle([(wt["x0"] - X0) * S, (Z1 - wt["z1"]) * S, (wt["x1"] - X0) * S, (Z1 - wt["z0"]) * S], fill=(40, 120, 230, 90))
    img.paste(ov, (0, 0), ov)
d = ImageDraw.Draw(img)
if "--reach" in sys.argv:
    reach = json.load(open(sys.argv[sys.argv.index("--reach") + 1]))
    cols = {0: (255, 255, 255), 1: (255, 220, 80), 2: (255, 140, 60), 3: (120, 220, 255), 4: (60, 140, 255), 5: (140, 255, 140)}
    for x, z, k in reach["stand"]:
        d.rectangle([(x - X0) * S, (Z1 - z - 1) * S, (x - X0 + 1) * S, (Z1 - z) * S], fill=cols.get(k, (255, 0, 255)))
for o in w["oneways"]:
    d.line([((o["x0"] - X0) * S, (Z1 - o["z"]) * S), ((o["x1"] - X0) * S, (Z1 - o["z"]) * S)], fill=(250, 245, 230), width=max(1, S // 2 + 1))
for h in w["hazards"]:
    box(h["x0"], h["z0"], h["x1"], h["z1"] + 0.6, fill=(230, 50, 40))
for u in w["updrafts"]:
    box(u["x0"], u["z0"], u["x1"], u["z1"], outline=(90, 230, 120))
for b in w["benches"]:
    box(b["x"] - 1, b["z"], b["x"] + 1, b["z"] + 1.2, fill=(255, 210, 90))
for f in w["feathers"]:
    d.ellipse([(f["x"] - X0) * S - 2, (Z1 - f["z"]) * S - 2, (f["x"] - X0) * S + 2, (Z1 - f["z"]) * S + 2], fill=(255, 255, 255))
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 9 * S)
    big = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 12 * S)
except OSError:
    font = big = ImageFont.load_default()
for s in w["shrines"]:
    box(s["x"] - 2, s["z"], s["x"] + 2, s["z"] + 4, fill=(255, 120, 220))
    d.text(((s["x"] - X0) * S + 6, (Z1 - s["z"] - 8) * S), s["grants"].upper(), fill=(255, 120, 220), font=font)
for r in w["relics"]:
    box(r["x"] - 1.5, r["z"] - 1, r["x"] + 1.5, r["z"] + 2, fill=(255, 240, 120))
c = w["crown"]
box(c["x"] - 3, c["z"], c["x"] + 3, c["z"] + 5, fill=(255, 250, 200))
sp = w["spawn"]
box(sp["x"] - 1.5, sp["z"], sp["x"] + 1.5, sp["z"] + 3, fill=(120, 255, 160))
for key, (title, (a, b, cc, dd), *_r) in REGIONS.items():
    d.text(((a * 32 - X0) * S + 6, (Z1 - (dd + 1) * 20) * S + 4), title, fill=(20, 16, 22), font=big)
out = os.path.join(HERE, "..", "build")
os.makedirs(out, exist_ok=True)
img.save(os.path.join(out, "map.png"))
print("map.png", img.size)
