"""References for the Gemini repaint pass (tools/art/gemini-pass.mjs).

    python3 -B tools/art/gemini_pass_refs.py [--work work/art]

Writes into <work>/guides/:
  - <sheet>-current.png for every kit sheet in the pass: the sheet's published pieces laid back on
    its key colour, in the order the cutter reads them (a grid three across for a prop sheet, one
    row per material for a run sheet, side by side for a column sheet), so the model's Sheet 1 is
    the art as it ships today;
  - target-<name>-ref.png: the approved art targets (tools/art/targets) at 1280 x 720, under the
    generator's inline reference limit.
Reads only published files; writes nothing under apps/ or tools/.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

from PIL import Image

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parent.parent
ART = REPO / "apps" / "park" / "public" / "art"
LONG_SIDE = 1280


def published(key: str) -> Path | None:
    for ext in (".png", ".webp", "@2x.png", "@2x.webp"):
        f = ART / f"{key}{ext}"
        if f.exists():
            return f
    return None


def hex_rgb(h: str) -> tuple[int, int, int]:
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


def fit(im: Image.Image, w: int, h: int) -> Image.Image:
    im = im.copy()
    im.thumbnail((w, h), Image.LANCZOS)
    return im


def sheet_current(job: dict) -> Image.Image:
    w, h = (int(v) for v in job["size"].split("x"))
    bg = Image.new("RGBA", (w, h), hex_rgb(job.get("key_colour") or "#FF00FF") + (255,))
    pieces = [(k, published(k)) for k in job.get("derives", [])]
    pieces = [(k, f) for k, f in pieces if f]
    if "cut-run" in job["key"]:
        # One band per material: cap-left, the longest middle, cap-right, end to end.
        rows: dict[str, dict[str, Path]] = {}
        for k, f in pieces:
            m = re.match(r"(.+?)-(cap-left|cap-right|mid-\d+)$", k)
            if m:
                rows.setdefault(m.group(1), {})[m.group(2)] = f
        band = h // max(1, len(rows))
        for i, parts in enumerate(rows.values()):
            mids = sorted((p for p in parts if p.startswith("mid-")), key=lambda p: int(p[4:]))
            order = [p for p in ["cap-left", *(mids[-1:]), "cap-right"] if p in parts]
            ims = [Image.open(parts[p]).convert("RGBA") for p in order]
            row_h = int(band * 0.6)
            ims = [im.resize((max(1, im.width * row_h // im.height), row_h), Image.LANCZOS) for im in ims]
            total = sum(im.width for im in ims)
            scale = min(1.0, (w * 0.9) / max(1, total))
            x = int((w - total * scale) / 2)
            for im in ims:
                im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
                bg.alpha_composite(im, (x, i * band + (band - im.height) // 2))
                x += im.width
        return bg
    if "cut-col" in job["key"] or "cut-trunk" in job["key"]:
        cols = max(1, len(pieces))
        cw = w // cols
        for i, (_, f) in enumerate(pieces):
            im = fit(Image.open(f).convert("RGBA"), int(cw * 0.85), h)
            bg.alpha_composite(im, (i * cw + (cw - im.width) // 2, h - im.height))
        return bg
    cols = 3 if len(pieces) > 1 else 1
    rows = max(1, -(-len(pieces) // cols))
    cw, ch = w // cols, h // rows
    for i, (_, f) in enumerate(pieces):
        im = fit(Image.open(f).convert("RGBA"), int(cw * 0.8), int(ch * 0.8))
        x, y = (i % cols) * cw, (i // cols) * ch
        bg.alpha_composite(im, (x + (cw - im.width) // 2, y + (ch - im.height) // 2))
    return bg


def save(im: Image.Image, out: Path) -> None:
    im = im.convert("RGB")
    if max(im.size) > LONG_SIDE:
        im.thumbnail((LONG_SIDE, LONG_SIDE), Image.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, optimize=True)


def pass_jobs() -> list[dict]:
    script = "const m = await import(process.argv[1]); console.log(JSON.stringify(m.JOBS.map(({ key, kind, size, key_colour, derives }) => ({ key, kind, size, key_colour, derives }))));"
    out = subprocess.run(["node", "--input-type=module", "-e", script, str(TOOLS / "gemini-pass.mjs")], check=True, capture_output=True, text=True)
    return json.loads(out.stdout)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--work", default=str(REPO / "work" / "art"))
    args = ap.parse_args()
    guides = Path(args.work) / "guides"
    n = 0
    for job in pass_jobs():
        if job["kind"] == "sheet":
            save(sheet_current(job), guides / f"{job['key']}-current.png")
            n += 1
    for t in sorted((TOOLS / "targets").glob("target-*.png")):
        save(Image.open(t), guides / f"{t.stem}-ref.png")
        n += 1
    print(f"wrote {n} references to {guides}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
