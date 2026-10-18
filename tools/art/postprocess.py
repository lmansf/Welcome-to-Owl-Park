#!/usr/bin/env python3
"""Art post-processing CLI: a selected raw candidate -> the files the game loads.

Stage 2 of the art pipeline (stage 1 is ``generate.mjs``). Every command runs offline with the
generator's mock output or the synthetic images in ``artlib/synth.py``; nothing here calls a
network or git. Python 3, Pillow 12 and numpy only; deterministic (same input and flags give
byte-identical files).

Commands (``python3 -B tools/art/postprocess.py <command> --help`` for flags):

  guide <room>|--all   layout guides from work/art/geometry.json (text-free, used as references)
  room <key>           crop/resize to 1600x900 (and opt-in 3200x1800), grade, WebP under budget, review
  piece <key>          chroma key, fit into the logical canvas at 2x, downsample, grade, budget
  overlay <key>        chroma key a full-frame foreground overlay; --check enforces the overlay rules
  owl                  split the owl master into the five layers at 200x240 and 400x480
  grade <in> <out>     the palette grade hook on its own
  ref <in> <out>       prepare a committed anchor reference (<= 1024 px, no metadata, under budget)
  sheet <key>          contact sheet of a key's raw candidates for picking the winner
  publish <key...>     move finals into apps/park/public/art, append tools/art/provenance.jsonl
  check [--all|keys]   verify what is published against the loader contract
  demo                 run the whole chain on synthetic (or mock) input in a temp dir and assert it

Outputs: finals in work/art/final/<key>.png (and <key>@2x.png; rooms as <key>.webp and
<key>@2x.webp, since a painted room cannot meet the budget as PNG), a review composite in
work/art/review/<key>.png with the room geometry drawn over it, and a work/art/final/<key>.post.json
record of the parameters, from which ``publish`` writes the committed provenance line. Finals are
re-encoded by Pillow with no ancillary chunks (no EXIF, XMP or ICC in a WebP), re-read, and checked
for size, dimensions and the chunk allowlist before the command returns.

Raw candidates: ``--raw <file>`` or the key's SELECTED candidate under work/art/raw/<key>/
(written by ``generate.mjs select``); a lone candidate is used with a notice. The candidate's JSON
sidecar supplies the key colour, the owl region colours, the seed and the provider for provenance.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

try:
    import numpy as np  # noqa: E402
    from PIL import Image, ImageDraw, ImageFont  # noqa: E402
except ImportError as _missing:  # pragma: no cover - depends on the machine
    print(f"pnpm art:finish needs Pillow 12 and numpy ({_missing.name or 'a module'} is missing): python3 -m pip install pillow numpy (a venv is fine)", file=sys.stderr)
    sys.exit(2)

from artlib import (BUDGET_2X_RELAXED, BUDGET_2X_ROOM, BUDGET_BYTES,DEFAULT_WORK_DIR, HELPER_KEYS, OVERLAY_KEYS, OWL_LAYERS,  # noqa: E402
                    PALETTES_DIR, PIECE_ANCHOR, PROVENANCE_PATH, PUBLIC_ART_DIR, PUBLIC_ROOMS, REALM_OF_KEY, ROOM_H, ROOM_W,
                    TINTED_LAYERS, TOOLS_ART_DIR, ArtError, load_assets, load_key_colours, logical_size, now_iso, rel_to_repo, sha256_bytes, validate_key)
from artlib import forbidden, pngmeta, prov, webpmeta  # noqa: E402
from artlib.budget import BudgetError, encode_under_budget  # noqa: E402
from artlib.chroma import ChromaParams, key_out  # noqa: E402
from artlib.grade import grade as grade_image, load_palette  # noqa: E402
from artlib.guide import fit_below_top, load_geometry, render_guide, review_composite, room_of  # noqa: E402
from artlib.overlaycheck import check_overlay  # noqa: E402
from artlib.resize import downsample, fit_contain, resize_exact  # noqa: E402
from artlib.synth import fixture_geometry, synth_keyed_subject, synth_overlay, synth_owl_master, synth_room  # noqa: E402
import owl_layers  # noqa: E402

Image.MAX_IMAGE_PIXELS = 80_000_000


def warn(msg: str) -> None:
    print(f"warning: {msg}", file=sys.stderr)


def note(msg: str) -> None:
    print(msg)


class Ctx:
    """Per-invocation paths and shared flags."""

    def __init__(self, a: argparse.Namespace):
        self.work = Path(getattr(a, "work", None) or os.environ.get("ART_WORK_DIR") or DEFAULT_WORK_DIR)
        self.out = Path(getattr(a, "out", None) or (self.work / "final"))
        self.review = self.work / "review"
        self.geometry_path = Path(getattr(a, "geometry", None) or (self.work / "geometry.json"))
        self.now = now_iso(getattr(a, "now", None))
        self.budget = int(getattr(a, "budget", None) or BUDGET_BYTES)
        self.notes = list(getattr(a, "note", None) or [])
        self.assets = load_assets()
        self.key_colours = load_key_colours()
        self.public = Path(getattr(a, "public", None) or PUBLIC_ART_DIR)
        self._geom: dict | None = None

    def geometry(self) -> dict:
        if self._geom is None:
            if self.geometry_path.exists():
                self._geom = load_geometry(self.geometry_path)
            else:
                warn(f"no geometry at {self.geometry_path}; using the built-in fixture mirror (run `pnpm art:geometry` for the live data)")
                self._geom = fixture_geometry()
        return self._geom

    def room_for(self, key: str) -> str:
        if key in PIECE_ANCHOR:
            return PIECE_ANCHOR[key][0]
        return key[:-3] if key.endswith("-fg") else key


# ----------------------------------------------------------------------------------------------
# Raw candidates and post records


def resolve_raw(ctx: Ctx, key: str, raw_flag: str | None) -> tuple[Path, dict | None]:
    if raw_flag:
        p = Path(raw_flag)
        if not p.exists():
            raise ArtError(f"raw file {p} does not exist")
        sc = p.with_suffix(".json")
        return p, (json.loads(sc.read_text(encoding="utf-8")) if sc.exists() else None)
    d = ctx.work / "raw" / key
    if not d.is_dir():
        raise ArtError(f"no raw candidates for {key!r} under {d} (run `pnpm art:generate --only {key}` or pass --raw)")
    sel = d / "SELECTED"
    cands = sorted([p for p in d.iterdir() if p.suffix.lower() in (".png", ".jpg", ".jpeg")])
    if sel.exists():
        h = sel.read_text(encoding="utf-8").strip()
        for p in cands:
            if p.stem == h:
                sc = p.with_suffix(".json")
                return p, (json.loads(sc.read_text(encoding="utf-8")) if sc.exists() else None)
        raise ArtError(f"SELECTED candidate {h} of {key!r} has no image file in {d}")
    if len(cands) == 1:
        note(f"{key}: no SELECTED marker, using the only candidate {cands[0].name}")
        sc = cands[0].with_suffix(".json")
        return cands[0], (json.loads(sc.read_text(encoding="utf-8")) if sc.exists() else None)
    if not cands:
        raise ArtError(f"no raw candidates for {key!r} in {d}")
    raise ArtError(f"{key!r} has {len(cands)} candidates and no SELECTED marker: run `node tools/art/generate.mjs select {key} <hash16|latest>` or pass --raw")


def open_raw(path: Path) -> Image.Image:
    img = Image.open(path)
    img.load()
    if path.suffix.lower() in (".jpg", ".jpeg"):
        warn(f"{path.name} is JPEG; ringing around saturated key edges costs matte quality (request PNG output from the provider)")
    return img


def sidecar_subset(sc: dict | None) -> dict | None:
    """The sidecar fields the post record and the provenance line carry (result URL without its query)."""
    if not sc:
        return None
    out = {k: sc.get(k) for k in prov.SIDECAR_FIELDS if k in sc}
    if "source_url" in out:
        out["source_url"] = prov.public_url(out["source_url"])
    return out


#: Raster formats the loader tries after the SVG, in its order of preference.
RASTER_EXTS = ("webp", "png")


def verify_final(path: Path, expect: tuple[int, int] | None, budget: int | None) -> dict:
    """pngmeta.verify_file or webpmeta.verify_file, by the file's extension."""
    return (webpmeta if Path(path).suffix.lower() == ".webp" else pngmeta).verify_file(path, expect, budget)


def remove_rasters(d: Path, key: str, keep: set[str]) -> list[str]:
    """Delete <key>.png|webp and <key>@2x.png|webp in d except the names in keep; returns what went."""
    removed = []
    for ext in RASTER_EXTS:
        for name in (f"{key}.{ext}", f"{key}@2x.{ext}"):
            if name not in keep and (d / name).exists():
                (d / name).unlink()
                removed.append(name)
    return removed


def write_final(ctx: Ctx, name: str, data: bytes, expect: tuple[int, int], budget: int) -> dict:
    path = ctx.out / name
    pngmeta.write_bytes(path, data)
    v = verify_final(path, expect, budget)
    if not v["ok"]:
        raise ArtError(f"{name}: " + "; ".join(v["problems"]))
    return {"file": name, "bytes": v["bytes"], "sha256": sha256_bytes(data), "size": f"{expect[0]}x{expect[1]}"}


def budget_line(info: dict) -> str:
    if info.get("format") == "webp":
        return f"budget: webp q{info['quality']}"
    if info.get("colors"):
        return f"budget: P{info['colors']}" + (" relaxed" if info.get("budget_relaxed") else "") + (f" dither={info['dither']}" if info.get("dither", "none") != "none" else "")
    return f"budget: {info.get('mode', 'truecolour')}" + (" relaxed" if info.get("budget_relaxed") else "")


def encode_final(img: Image.Image, budget: int, relaxed: int | None, dither: str, label: str) -> tuple[bytes, dict]:
    data, info = encode_under_budget(img, budget, relaxed=relaxed, dither=dither)
    if info.get("colors") and info["colors"] < 128:
        warn(f"{label}: palette reduced to {info['colors']} colours to meet the budget; expect banding")
    if info.get("budget_relaxed"):
        warn(f"{label}: {info['bytes']} bytes exceeds the {BUDGET_BYTES} byte rule; shipped under the relaxed budget (flagged in provenance)")
    return data, info


def save_post_record(ctx: Ctx, key: str, record: dict) -> Path:
    record = dict(record)
    record["finished_at"] = ctx.now
    record["human_edits"] = list(ctx.notes)
    p = ctx.out / f"{key}.post.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(record, indent=2), encoding="utf-8")
    return p


def load_post_record(ctx: Ctx, key: str) -> dict | None:
    p = ctx.out / f"{key}.post.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def grade_spec(ctx: Ctx, key: str, flag: str | None, strength: float | None) -> tuple[dict | None, str | None, float | None]:
    realm = flag if flag is not None else REALM_OF_KEY.get(key)
    if realm in (None, "none", ""):
        return None, None, None
    pal, sha = load_palette(realm)
    return pal, f"grade: {realm}@{strength if strength is not None else pal['strength']} palette={sha}", strength


def apply_grade(img: Image.Image, pal: dict | None, strength: float | None) -> Image.Image:
    return grade_image(img, pal, strength) if pal else img


def key_colour_for(ctx: Ctx, key: str, flag: str | None, sidecar: dict | None) -> str | None:
    """--key-colour, else the candidate's sidecar, else config/assets.json (the generator's own table)."""
    if flag:
        return None if flag.lower() == "auto" else flag
    if sidecar and sidecar.get("key_colour"):
        return sidecar["key_colour"]
    return ctx.key_colours.get(key)


def chroma_params(a: argparse.Namespace, key_colour: str | None) -> ChromaParams:
    return ChromaParams(key=key_colour, t0=a.t0, t1=a.t1, despill_band=a.despill_band, min_area=a.min_area, max_hole=a.max_hole, feather=a.feather, trust_key=a.trust_key)


def background_for(ctx: Ctx, room: str) -> Image.Image:
    for cand in (ctx.public / f"{room}.webp", ctx.public / f"{room}.png", ctx.out / f"{room}.webp", ctx.out / f"{room}.png"):
        if cand.exists():
            return Image.open(cand).convert("RGB").resize((ROOM_W, ROOM_H), Image.Resampling.LANCZOS)
    return render_guide(ctx.geometry(), room, ctx.assets)


def write_review(ctx: Ctx, name: str, img: Image.Image) -> Path:
    p = ctx.review / name
    pngmeta.save(img, p)
    return p


# ----------------------------------------------------------------------------------------------
# Commands


def cmd_guide(ctx: Ctx, a: argparse.Namespace) -> int:
    geom = ctx.geometry()
    rooms = sorted(geom["rooms"]) if a.all or not a.room else [a.room]
    out_dir = ctx.work / "guides"
    for r in rooms:
        img = render_guide(geom, r, ctx.assets)
        n = pngmeta.save(img, out_dir / f"{r}.png")
        note(f"guide {r}: {rel_to_repo(out_dir / f'{r}.png')} ({n} bytes)")
    return 0


def cmd_room(ctx: Ctx, a: argparse.Namespace) -> int:
    """Rooms ship as lossy WebP: a painted 1600x900 room cannot meet the budget as PNG."""
    key = validate_key(a.key, allow_helpers=False, assets=ctx.assets)
    W, H = logical_size(key, ctx.assets)
    raw, sc = resolve_raw(ctx, key, a.raw)
    img = open_raw(raw).convert("RGB")
    pal, gline, strength = grade_spec(ctx, key, a.grade, a.strength)
    tools = [f"room: crop={a.crop} shift={a.shift_y} source={img.width}x{img.height}"]
    if gline:
        tools.append(gline)
    outputs = {}
    fields = ("format", "quality", "colors", "mode", "budget_relaxed")

    one = apply_grade(resize_exact(img, W, H, a.crop, a.shift_y), pal, strength)
    data, info = webpmeta.encode_under_budget(one, ctx.budget)
    outputs["1x"] = {**write_final(ctx, f"{key}.webp", data, (W, H), ctx.budget), **{k: info.get(k) for k in fields}}
    tools.append(budget_line(info))
    if a.with_2x:
        two = apply_grade(resize_exact(img, 2 * W, 2 * H, a.crop, a.shift_y), pal, strength)
        data2, info2 = webpmeta.encode_under_budget(two, a.budget_2x)
        outputs["2x"] = {**write_final(ctx, f"{key}@2x.webp", data2, (2 * W, 2 * H), a.budget_2x), **{k: info2.get(k) for k in fields}}
        tools.append("budget@2x: " + budget_line(info2)[8:])
    # Only this finish's files may remain: a PNG from an earlier finish, or a 2x this one did not
    # write, would otherwise be published with it.
    for name in remove_rasters(ctx.out, key, {o["file"] for o in outputs.values()}):
        note(f"removed stale final {name}")
    rv = write_review(ctx, f"{key}.png", review_composite(Image.open(ctx.out / f"{key}.webp"), ctx.geometry(), ctx.room_for(key), 0.4, ctx.assets))
    save_post_record(ctx, key, {"key": key, "kind": "room", "raw": rel_to_repo(raw), "raw_sidecar": sidecar_subset(sc), "outputs": outputs, "tools": tools, "params": {"crop": a.crop, "shift_y": a.shift_y, "with_2x": a.with_2x}})
    for k, o in outputs.items():
        note(f"{key} {k}: {o['file']} {o['bytes']} bytes WebP q{o['quality']}")
    note(f"review: {rel_to_repo(rv)}")
    return 0


def _floor_cut(rgba: Image.Image, y: int | None) -> Image.Image:
    if y is None:
        return rgba
    arr = np.asarray(rgba).copy()
    arr[y:, :, :] = 0
    return Image.fromarray(arr, "RGBA")


def cmd_piece(ctx: Ctx, a: argparse.Namespace) -> int:
    key = validate_key(a.key, allow_helpers=False, assets=ctx.assets)
    W, H = logical_size(key, ctx.assets)
    raw, sc = resolve_raw(ctx, key, a.raw)
    img = open_raw(raw)
    kc = key_colour_for(ctx, key, a.key_colour, sc)
    rgba, cinfo = key_out(img, chroma_params(a, kc))
    rgba = _floor_cut(rgba, a.floor_cut)
    canvas2x, finfo = fit_contain(rgba, 2 * W, 2 * H, a.margin, a.anchor_x, a.pad_bottom)
    pal, gline, strength = grade_spec(ctx, key, a.grade, a.strength)
    canvas2x = apply_grade(canvas2x, pal, strength)
    one = downsample(canvas2x, W, H)
    tools = [f"piece: key={cinfo['backdrop']} t0={a.t0} t1={a.t1} despill={a.despill_band} fit=contain margin={a.margin} anchor_x={a.anchor_x} pad_bottom={a.pad_bottom} scale={finfo['scale']}" + (f" floor_cut={a.floor_cut}" if a.floor_cut is not None else "")]
    if gline:
        tools.append(gline)
    outputs = {}
    data, info = encode_final(one, ctx.budget, None, a.dither, f"{key}.png")
    outputs["1x"] = {**write_final(ctx, f"{key}.png", data, (W, H), ctx.budget), **{k: info.get(k) for k in ("colors", "mode", "budget_relaxed", "dither")}}
    tools.append(budget_line(info))
    if not a.no_2x:
        data2, info2 = encode_final(canvas2x, ctx.budget, None, a.dither, f"{key}@2x.png")
        outputs["2x"] = {**write_final(ctx, f"{key}@2x.png", data2, (2 * W, 2 * H), ctx.budget), **{k: info2.get(k) for k in ("colors", "mode", "budget_relaxed", "dither")}}
        tools.append("budget@2x: " + budget_line(info2)[8:])
    elif (ctx.out / f"{key}@2x.png").exists():
        (ctx.out / f"{key}@2x.png").unlink()
    remove_rasters(ctx.out, key, {f"{key}.png", f"{key}@2x.png"})
    # Review: the piece in its room at the anchor, scaled as ambience.ts does.
    room, anchor = PIECE_ANCHOR.get(key, (None, None))
    geom = ctx.geometry()
    if room and anchor and anchor in (room_of(geom, room).get("anchors") or {}):
        ax, ay = (room_of(geom, room)["anchors"][anchor][k] for k in ("x", "y"))
        k = fit_below_top(H, ay)
        bg = background_for(ctx, room).convert("RGBA")
        piece_img = Image.open(ctx.out / f"{key}.png").convert("RGBA").resize((max(1, int(round(W * k))), max(1, int(round(H * k)))), Image.Resampling.LANCZOS)
        bg.alpha_composite(piece_img, (int(round(ax - piece_img.width / 2)), int(round(ay - piece_img.height))))
        rv = write_review(ctx, f"{key}.png", review_composite(bg, geom, room, 0.4, ctx.assets))
        note(f"review: {rel_to_repo(rv)}")
    save_post_record(ctx, key, {"key": key, "kind": "piece", "raw": rel_to_repo(raw), "raw_sidecar": sidecar_subset(sc), "outputs": outputs, "tools": tools, "chroma": {k: v for k, v in cinfo.items() if k != "params"}, "fit": finfo})
    for k2, o in outputs.items():
        note(f"{key} {k2}: {o['file']} {o['bytes']} bytes" + (f" P{o['colors']}" if o.get("colors") else " truecolour"))
    return 0


def cmd_overlay(ctx: Ctx, a: argparse.Namespace) -> int:
    key = validate_key(a.key, allow_helpers=False, assets=ctx.assets)
    if key not in OVERLAY_KEYS:
        raise ArtError(f"{key!r} is not an overlay key ({', '.join(OVERLAY_KEYS)})")
    W, H = logical_size(key, ctx.assets)
    room = ctx.room_for(key)
    raw, sc = resolve_raw(ctx, key, a.raw)
    img = open_raw(raw)
    kc = key_colour_for(ctx, key, a.key_colour, sc)
    rgba, cinfo = key_out(img, chroma_params(a, kc))
    pal, gline, strength = grade_spec(ctx, key, a.grade, a.strength)
    tools = [f"overlay: key={cinfo['backdrop']} t0={a.t0} t1={a.t1} despill={a.despill_band} crop={a.crop}"]
    if gline:
        tools.append(gline)
    outputs = {}
    one = apply_grade(resize_exact(rgba, W, H, a.crop, a.shift_y), pal, strength)
    data, info = encode_final(one, ctx.budget, None, a.dither, f"{key}.png")
    outputs["1x"] = {**write_final(ctx, f"{key}.png", data, (W, H), ctx.budget), **{k: info.get(k) for k in ("colors", "mode", "budget_relaxed", "dither")}}
    tools.append(budget_line(info))
    if a.with_2x:
        two = apply_grade(resize_exact(rgba, 2 * W, 2 * H, a.crop, a.shift_y), pal, strength)
        data2, info2 = encode_final(two, ctx.budget, a.budget_2x, a.dither, f"{key}@2x.png")
        outputs["2x"] = {**write_final(ctx, f"{key}@2x.png", data2, (2 * W, 2 * H), max(ctx.budget, a.budget_2x)), **{k: info2.get(k) for k in ("colors", "mode", "budget_relaxed", "dither")}}
    elif (ctx.out / f"{key}@2x.png").exists():
        (ctx.out / f"{key}@2x.png").unlink()
    remove_rasters(ctx.out, key, {f"{key}.png", f"{key}@2x.png"})
    geom = ctx.geometry()
    final = Image.open(ctx.out / f"{key}.png").convert("RGBA")
    report = check_overlay(final, geom, room)
    bg = background_for(ctx, room).convert("RGBA")
    bg.alpha_composite(final)
    rv = write_review(ctx, f"{key}.png", review_composite(bg, geom, room, 0.4, ctx.assets))
    save_post_record(ctx, key, {"key": key, "kind": "overlay", "raw": rel_to_repo(raw), "raw_sidecar": sidecar_subset(sc), "outputs": outputs, "tools": tools, "chroma": {k: v for k, v in cinfo.items() if k != "params"}, "overlay_check": report})
    for k2, o in outputs.items():
        note(f"{key} {k2}: {o['file']} {o['bytes']} bytes" + (f" P{o['colors']}" if o.get("colors") else " truecolour"))
    note(f"review: {rel_to_repo(rv)}")
    note(f"overlay check: coverage {report['coverage'] * 100:.1f} % of the walkable interior; {'ok' if report['ok'] else 'FAILED'}")
    for v in report["violations"]:
        note(f"  - {v}")
    if a.check and not report["ok"]:
        return 1
    return 0


def owl_keys_from_sidecar(keys: dict, sc: dict | None) -> dict:
    """The sidecar's key_colour and region colours override the hue table (the generator decides)."""
    if not sc:
        return keys
    keys = json.loads(json.dumps(keys))
    if sc.get("key_colour"):
        keys["backdrop"] = sc["key_colour"]
    regions = sc.get("regions") or {}
    for name, col in regions.items():
        if name in keys["regions"] and isinstance(col, str):
            from artlib import parse_hex
            import colorsys
            r, g, b = parse_hex(col)
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            keys["regions"][name]["hue"] = round(h * 360.0, 1)
    return keys


def cmd_owl(ctx: Ctx, a: argparse.Namespace) -> int:
    raw, sc = resolve_raw(ctx, "owl-master", a.raw)
    master = open_raw(raw)
    keys = owl_keys_from_sidecar(owl_layers.load_keys(Path(a.keys) if a.keys else None), sc)
    blink_from = None
    blink_note = "programmatic"
    if a.blink:
        if not a.blink.startswith("from:"):
            raise ArtError("--blink takes from:<png>")
        blink_from = open_raw(Path(a.blink[5:]))
        blink_note = f"from {Path(a.blink[5:]).name}"
    labels_img = Image.open(a.labels) if a.labels else None
    debug_dir = (ctx.work / "intermediates" / "owl-master") if a.debug else None
    # The chroma flags work here as for pieces: --key-colour auto|#RRGGBB and --trust-key, so a
    # hand-edited master on another shade of backdrop can be finished without editing a sidecar.
    auto = bool(a.key_colour) and a.key_colour.lower() == "auto"
    kc = None if auto else (key_colour_for(ctx, "owl-master", a.key_colour, sc) or keys["backdrop"])
    chroma = chroma_params(a, kc)
    res = owl_layers.split(master, keys, height=a.height, flip=a.flip, blink_from=blink_from, labels_img=labels_img, debug_dir=debug_dir, chroma=chroma)
    outputs: dict[str, dict] = {}
    for name in OWL_LAYERS:
        for tag, layer, mult in (("1x", res.layers_1x[name], 1), ("2x", res.layers_2x[name], 2)):
            fname = f"{name}.png" if tag == "1x" else f"{name}@2x.png"
            data, info = encode_under_budget(layer, ctx.budget)
            outputs[fname] = {**write_final(ctx, fname, data, (200 * mult, 240 * mult), ctx.budget), "mode": layer.mode, "colors": None, "budget_relaxed": False, "key": name, "logical": tag}
    rv = write_review(ctx, "owl-layers.png", owl_layers.review_sheet(res))
    tools = [f"owl: height={a.height or keys['registration'].get('height', 220)} flip={a.flip} blink={blink_note} labels={'file' if a.labels else 'auto'} key={res.info.get('backdrop')} t0={a.t0} t1={a.t1} despill={a.despill_band} windows=" + ",".join(f"{n}:{r['hue']}±{r['window']}" for n, r in keys["regions"].items()) + f" floor={keys['luminance_floor']} lit_pct={keys['lit_percentile']}", "budget: LA/RGBA truecolour"]
    if res.info.get("clipped_px"):
        warn(f"owl layers: {res.info['clipped_px']} opaque px touch the canvas edge after registration; lower --height or check the silhouette")
    save_post_record(ctx, "owl-master", {"key": "owl-master", "kind": "owl", "raw": rel_to_repo(raw), "raw_sidecar": sidecar_subset(sc), "outputs": outputs, "tools": tools, "split": res.info})
    for fname, o in outputs.items():
        note(f"{fname}: {o['bytes']} bytes ({o['mode']})")
    note(f"review: {rel_to_repo(rv)}")
    note(json.dumps({k: res.info[k] for k in ("region_px", "eyes_found", "blink", "registration") if k in res.info}))
    return 0


def cmd_grade(ctx: Ctx, a: argparse.Namespace) -> int:
    pal, sha = load_palette(a.realm)
    img = Image.open(a.input)
    img.load()
    out = grade_image(img, pal, a.strength, a.chroma_boost)
    n = pngmeta.save(out, Path(a.output))
    note(f"graded {a.input} -> {a.output} ({n} bytes) with {pal['_file']} {sha} strength={a.strength if a.strength is not None else pal['strength']}")
    return 0


def cmd_ref(ctx: Ctx, a: argparse.Namespace) -> int:
    """Prepare a committed anchor reference: at most --max px on the long side, no metadata, under budget."""
    img = Image.open(a.input)
    img.load()
    img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
    if max(img.size) > a.max:
        s = a.max / max(img.size)
        img = img.resize((max(1, int(round(img.width * s))), max(1, int(round(img.height * s)))), Image.Resampling.LANCZOS)
    data, info = encode_final(img, ctx.budget, None, "none", Path(a.output).name)
    out = Path(a.output)
    pngmeta.write_bytes(out, data)
    v = pngmeta.verify_file(out, img.size, ctx.budget)
    if not v["ok"]:
        raise ArtError(f"{out.name}: " + "; ".join(v["problems"]))
    note(f"ref {out.name}: {img.width}x{img.height}, {len(data)} bytes" + (f", P{info['colors']}" if info.get("colors") else ", truecolour") + " (no metadata)")
    return 0


def cmd_sheet(ctx: Ctx, a: argparse.Namespace) -> int:
    key = validate_key(a.key, assets=ctx.assets)
    d = ctx.work / "raw" / key
    cands = sorted([p for p in d.iterdir() if p.suffix.lower() in (".png", ".jpg", ".jpeg")]) if d.is_dir() else []
    if not cands:
        raise ArtError(f"no raw candidates for {key!r} in {d}")
    selected = (d / "SELECTED").read_text(encoding="utf-8").strip() if (d / "SELECTED").exists() else None
    tw = a.width
    cols = max(1, min(a.columns, len(cands)))
    tiles = []
    for p in cands:
        im = Image.open(p).convert("RGB")
        th = max(1, int(round(im.height * tw / im.width)))
        sc = p.with_suffix(".json")
        seed = json.loads(sc.read_text(encoding="utf-8")).get("seed") if sc.exists() else None
        tiles.append((p.stem, seed, im.resize((tw, th), Image.Resampling.LANCZOS)))
    th = max(t[2].height for t in tiles)
    pad, cap = 10, 20
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (tw + pad) + pad, rows * (th + pad + cap) + pad), (40, 40, 40))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=14)
    for i, (h, seed, im) in enumerate(tiles):
        x, y = pad + (i % cols) * (tw + pad), pad + (i // cols) * (th + pad + cap)
        sheet.paste(im, (x, y))
        label = f"{h}  seed {seed}" if seed is not None else h
        if h == selected:
            label += "  [SELECTED]"
            draw.rectangle((x - 3, y - 3, x + tw + 2, y + im.height + 2), outline=(201, 162, 39), width=3)
        draw.text((x, y + th + 3), label, fill=(240, 240, 240), font=font)
    out = ctx.review / f"sheet-{key}.png"
    n = pngmeta.save(sheet, out)
    note(f"sheet {key}: {rel_to_repo(out)} ({len(tiles)} candidates, {n} bytes)")
    return 0


def expand_publish_keys(keys: list[str]) -> list[str]:
    out: list[str] = []
    for k in keys:
        if k in ("owl-*", "owl"):
            out.extend(OWL_LAYERS)
        else:
            out.append(k)
    return out


def cmd_publish(ctx: Ctx, a: argparse.Namespace) -> int:
    keys = expand_publish_keys(a.keys)
    for key in keys:
        validate_key(key, allow_helpers=False, assets=ctx.assets)
    prov_path = Path(a.provenance) if a.provenance else PROVENANCE_PATH

    # Pass 1: validate everything (finals, SVG conflicts and the provenance lines themselves)
    # before the tree is touched, so a refused line (a note naming the user, an absolute path, a
    # forbidden word) cannot leave a PNG in the public dir with no provenance and the SVG gone.
    plan: list[tuple[str, Path | None, list[tuple[Path, bytes, dict]]]] = []
    for key in keys:
        W, H = logical_size(key, ctx.assets)
        found = [ext for ext in RASTER_EXTS if (ctx.out / f"{key}.{ext}").exists()]
        if not found:
            raise ArtError(f"no final for {key!r} at {ctx.out / f'{key}.png'} (or .webp); run the room/piece/overlay/owl command first")
        if len(found) > 1:
            raise ArtError(f"{key!r} has both {key}.png and {key}.webp in {ctx.out}; rerun its finish (which removes the other) or delete the stale one")
        ext = found[0]
        one = ctx.out / f"{key}.{ext}"
        two = ctx.out / f"{key}@2x.{ext}"
        svg = ctx.public / f"{key}.svg"
        if svg.exists() and not a.retire_svg:
            raise ArtError(f"{svg.name} exists and the loader prefers SVG, so the {ext.upper()} would never show; pass --retire-svg to move it to work/art/retired-svg/")
        record_key = "owl-master" if key in OWL_LAYERS else key
        rec = load_post_record(ctx, record_key) or {}
        outs = rec.get("outputs", {})
        files: list[tuple[Path, bytes, dict]] = []
        for path, expect, logical in [(one, (W, H), "1x")] + ([(two, (2 * W, 2 * H), "2x")] if two.exists() else []):
            oinfo = outs.get(path.name) if key in OWL_LAYERS else outs.get(logical)
            relaxed = bool(oinfo and oinfo.get("budget_relaxed"))
            if ext == "webp" and logical == "2x":
                budget = BUDGET_2X_ROOM
            else:
                budget = BUDGET_2X_RELAXED if (relaxed and logical == "2x" and key in PUBLIC_ROOMS + OVERLAY_KEYS) else ctx.budget
            v = verify_final(path, expect, budget)
            if not v["ok"]:
                raise ArtError(f"{path.name}: " + "; ".join(v["problems"]))
            data = path.read_bytes()
            line = prov.sanitize(prov.build_line(asset=path.name, key=key, logical=logical, sha256=sha256_bytes(data), nbytes=len(data), colors=(oinfo or {}).get("colors"),
                                                 budget_relaxed=relaxed, sidecar=rec.get("raw_sidecar"), published_at=ctx.now, tools=rec.get("tools", []),
                                                 human_edits=list(rec.get("human_edits", [])) + ctx.notes))
            probs = prov.problems(line)
            if probs:
                raise ArtError(f"{path.name}: nothing published, its provenance line would be refused: " + "; ".join(probs))
            files.append((path, data, line))
        plan.append((key, svg if svg.exists() else None, files))

    # Pass 2: retire the SVG, copy the finals and append the pre-validated lines. A write that
    # still fails midway puts that key back as it was (SVG restored, targets removed or restored).
    ctx.public.mkdir(parents=True, exist_ok=True)
    written = 0
    for key, svg, files in plan:
        retired: tuple[Path, Path] | None = None
        previous: dict[Path, bytes | None] = {}
        try:
            if svg is not None:
                dest = ctx.work / "retired-svg" / svg.name
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(svg), str(dest))
                retired = (svg, dest)
                note(f"retired {svg.name} -> {rel_to_repo(dest)} (commit the deletion)")
            for path, data, line in files:
                target = ctx.public / path.name
                previous[target] = target.read_bytes() if target.exists() else None
                target.write_bytes(data)
                prov.append(prov_path, line)
                written += 1
                note(f"published {path.name} ({len(data)} bytes) -> {rel_to_repo(target)}")
        except Exception:
            for target, old in previous.items():
                try:
                    if old is None:
                        target.unlink()
                    else:
                        target.write_bytes(old)
                except OSError:
                    pass
            if retired is not None:
                shutil.move(str(retired[1]), str(retired[0]))
            raise
        # Only the files just published may remain for this key: the loader prefers a 2x on every
        # dense screen and WebP over PNG, so an older <key>@2x.png, or a PNG left beside a new
        # WebP (or the reverse), would keep showing the retired art somewhere.
        for name in remove_rasters(ctx.public, key, {path.name for path, _, _ in files}):
            note(f"removed stale {name} (not part of this finish; the loader would have kept showing the old art)")
    note(f"{written} file(s) published; provenance appended to {rel_to_repo(prov_path)}")
    return 0


def cmd_check(ctx: Ctx, a: argparse.Namespace) -> int:
    problems: list[str] = []
    warnings: list[str] = []
    pub = ctx.public
    prov_path = Path(a.provenance) if a.provenance else PROVENANCE_PATH
    try:
        lines = prov.read_lines(prov_path)
    except ArtError as e:
        problems.append(str(e))
        lines = []
    relaxed = prov.relaxed_assets(prov_path) if lines else set()
    latest: dict[str, tuple[int, dict]] = {}  # asset -> (line index, line): the newest line per published file
    for i, line in enumerate(lines, 1):
        probs = [p for p in prov.problems(line) if "forbidden" not in p] if isinstance(line, dict) else ["not an object"]
        if not isinstance(line, dict) or line.get("schema") != 1:
            probs.append("schema is not 1")
        for p in probs:
            problems.append(f"provenance line {i}: {p}")
        if isinstance(line, dict) and line.get("asset"):
            latest[str(line["asset"])] = (i, line)

    keys = a.keys if a.keys else [k for k in ctx.assets if not k.startswith("sign-")]
    pngs = {p.name: p for p in pub.glob("*.png")} if pub.is_dir() else {}
    rasters = {p.name: p for ext in RASTER_EXTS for p in pub.glob(f"*.{ext}")} if pub.is_dir() else {}
    checked = 0
    for key in keys:
        if key not in ctx.assets:
            problems.append(f"{key}: not an art key")
            continue
        W, H = logical_size(key, ctx.assets)
        formats = [ext for ext in RASTER_EXTS if f"{key}.{ext}" in rasters or f"{key}@2x.{ext}" in rasters]
        if len(formats) > 1:
            problems.append(f"{key}: both PNG and WebP files are published; the loader uses the WebP, so the PNG is stale (republish {key})")
        if "webp" in formats and key not in PUBLIC_ROOMS:
            problems.append(f"{key}: published as WebP, but only room backgrounds ship as WebP")
        for ext in RASTER_EXTS:
            one_name, two_name = f"{key}.{ext}", f"{key}@2x.{ext}"
            if two_name in rasters and one_name not in rasters:
                problems.append(f"{two_name}: published without {one_name} (screens that are not dense have nothing to load)")
            if two_name in rasters and one_name in latest and two_name in latest and latest[one_name][0] > latest[two_name][0]:
                problems.append(f"{two_name}: older than the latest {one_name} (the 1x was republished without a 2x; dense screens would show the old art)")
        for name, expect in [(f"{key}.{ext}", (W, H)) for ext in RASTER_EXTS] + [(f"{key}@2x.{ext}", (2 * W, 2 * H)) for ext in RASTER_EXTS]:
            p = rasters.get(name)
            if not p:
                continue
            checked += 1
            if name.endswith("@2x.webp"):
                budget = BUDGET_2X_ROOM
            else:
                budget = BUDGET_2X_RELAXED if (name in relaxed and name.endswith("@2x.png")) else BUDGET_BYTES
            v = verify_final(p, expect, budget)
            for pr in v["problems"]:
                problems.append(f"{name}: {pr}")
            if (pub / f"{key}.svg").exists():
                warnings.append(f"{key}: both {key}.svg and {name} exist; the loader uses the SVG")
            # Every published file needs a provenance line, and the file must be the one that line describes.
            if name not in latest:
                problems.append(f"{name}: no provenance line (publish it with `pnpm art:finish publish {key}`)")
            else:
                want = latest[name][1].get("sha256")
                if want and want != sha256_bytes(p.read_bytes()):
                    problems.append(f"{name}: contents differ from the latest provenance line (stale or hand-edited; republish it)")
        if key in OVERLAY_KEYS and f"{key}.png" in pngs:
            rep = check_overlay(Image.open(pngs[f"{key}.png"]), ctx.geometry(), ctx.room_for(key))
            for v in rep["violations"]:
                problems.append(f"{key}.png: {v}")
        if key in OWL_LAYERS:
            for name in (f"{key}.png", f"{key}@2x.png"):
                p = pngs.get(name)
                if not p:
                    continue
                im = Image.open(p)
                arr = np.asarray(im.convert("RGBA"))
                if key in TINTED_LAYERS:
                    if im.mode not in ("LA", "RGBA", "P"):
                        problems.append(f"{name}: tintable layer must be LA or RGBA with R=G=B, found {im.mode}")
                    elif not (arr[..., 0] == arr[..., 1]).all() or not (arr[..., 1] == arr[..., 2]).all():
                        problems.append(f"{name}: tintable layer has colour (R, G, B differ); it must be white with grey shading")
                elif im.mode not in ("RGBA", "P"):
                    problems.append(f"{name}: face/blink must be RGBA, found {im.mode}")
                if key == "owl-body" and not (arr[-1, :, 3] >= 128).any():
                    problems.append(f"{name}: the feet do not touch the bottom row")
    # Forbidden words over committed tool files (no-op without a list).
    scan = [TOOLS_ART_DIR / "prompts.mjs", TOOLS_ART_DIR / "jobs.json", prov_path] + sorted(PALETTES_DIR.glob("*.json")) + sorted((TOOLS_ART_DIR / "config").glob("*.json"))
    hits = 0
    for f in scan:
        if f.exists():
            hits += len(forbidden.check_file(f))
    if hits:
        problems.append(f"forbidden-word check: {hits} match(es), see stderr")
    for w in warnings:
        warn(w)
    for p in problems:
        print(f"FAIL: {p}")
    note(f"check: {checked} published PNG/WebP file(s), {len(lines)} provenance line(s), {len(problems)} problem(s), {len(warnings)} warning(s)")
    return 1 if problems else 0


def _write_raw(work: Path, key: str, img: Image.Image, seed: int, key_colour: str | None, regions: dict | None, now: str, kind: str, realm: str) -> None:
    d = work / "raw" / key
    d.mkdir(parents=True, exist_ok=True)
    data = pngmeta.encode(img, compress_level=1, optimize=False)
    h = sha256_bytes(data)[:16]
    (d / f"{h}.png").write_bytes(data)
    sc = {"schema": 1, "key": key, "kind": kind, "realm": realm, "provider": "synthetic", "model": "artlib-synth", "hash16": h, "prompt_sha256": sha256_bytes(key.encode())[:64],
          "seed": seed, "seed_returned": seed, "size": f"{img.width}x{img.height}", "width": img.width, "height": img.height, "format": "png", "key_colour": key_colour,
          "refs": [], "source_url": None, "generated_at": now, "now_source": "flag", "cost_estimate_usd": 0, "provider_meta": {}}
    if regions:
        sc["regions"] = regions
    (d / f"{h}.json").write_text(json.dumps(sc, indent=2), encoding="utf-8")
    (d / "SELECTED").write_text(h + "\n", encoding="utf-8")


def _latest_candidate(d: Path) -> Path | None:
    if not d.is_dir():
        return None
    sel = d / "SELECTED"
    cands = sorted([p for p in d.iterdir() if p.suffix.lower() in (".png", ".jpg")])
    if sel.exists():
        h = sel.read_text(encoding="utf-8").strip()
        for p in cands:
            if p.stem == h:
                return p
    return cands[-1] if cands else None


def cmd_demo(ctx: Ctx, a: argparse.Namespace) -> int:
    """Synthetic (or the generator's mock) input through guide, room, piece, overlay --check and owl."""
    base = Path(a.keep) if a.keep else Path(tempfile.mkdtemp(prefix="owl-art-demo-"))
    work = base / "work"
    public = base / "public"
    work.mkdir(parents=True, exist_ok=True)
    now = ctx.now
    s = float(a.scale)
    sz = lambda w, h: (max(16, int(round(w * s))), max(16, int(round(h * s))))  # noqa: E731
    from_work = Path(a.from_work) if a.from_work else None
    used_mock = False
    if from_work:
        for key in ("hub", "guardian", "hub-fg", "owl-master"):
            src = _latest_candidate(from_work / "raw" / key)
            if src:
                d = work / "raw" / key
                d.mkdir(parents=True, exist_ok=True)
                shutil.copy(src, d / src.name)
                if src.with_suffix(".json").exists():
                    shutil.copy(src.with_suffix(".json"), d / src.with_suffix(".json").name)
                (d / "SELECTED").write_text(src.stem + "\n", encoding="utf-8")
                used_mock = True
        geo = from_work / "geometry.json"
        if geo.exists():
            shutil.copy(geo, work / "geometry.json")
    if not used_mock:
        # The same key-colour convention as the generator's job list (config/assets.json): green
        # for pieces and overlays, magenta for the owl master with red body, green belly, blue accent.
        _write_raw(work, "hub", synth_room(*sz(3200, 1800), 11, "hub"), 1101, None, None, now, "room", "hub")
        subj, _ = synth_keyed_subject(*sz(1440, 1640), "#00FF00", (120, 140, 90), 0.4)
        _write_raw(work, "guardian", subj, 1301, "#00FF00", None, now, "piece", "grove")
        _write_raw(work, "hub-fg", synth_overlay(*sz(3200, 1800), "#00FF00", True), 1601, "#00FF00", None, now, "overlay", "hub")
        owl, _ = synth_owl_master(*sz(1600, 1920))
        _write_raw(work, "owl-master", owl, 1701, "#FF00FF", {"body": "#FF0000", "belly": "#00FF00", "accent": "#0000FF"}, now, "owl", "hub")
    if not (work / "geometry.json").exists():
        if ctx.geometry_path.exists():
            shutil.copy(ctx.geometry_path, work / "geometry.json")
        else:
            (work / "geometry.json").write_text(json.dumps(fixture_geometry()), encoding="utf-8")
    common = ["--work", str(work), "--geometry", str(work / "geometry.json"), "--now", now, "--public", str(public)]
    # The overlay rules are enforced on both the synthetic overlay and the generator's mock one,
    # which keep their props out of the walkable band on purpose.
    steps = [
        ["guide", "--all"],
        ["room", "hub", "--grade", "hub"],
        ["piece", "guardian"],
        ["overlay", "hub-fg", "--check"],
        ["owl"],
        ["publish", "hub", "guardian", "owl-*", "hub-fg", "--provenance", str(base / "provenance.jsonl"), "--note", "demo run"],
        ["check", "--all", "--provenance", str(base / "provenance.jsonl")],
    ]
    for step in steps:
        note(f"\n== demo: {' '.join(step)}")
        rc = main(step + common)
        if rc != 0:
            print(f"demo FAILED at: {' '.join(step)}", file=sys.stderr)
            return 1
    # Contract assertions on what was published.
    expect = {"hub.webp": (1600, 900), "guardian.png": (720, 820), "guardian@2x.png": (1440, 1640), "hub-fg.png": (1600, 900)}
    for name in OWL_LAYERS:
        expect[f"{name}.png"] = (200, 240)
        expect[f"{name}@2x.png"] = (400, 480)
    failures = []
    for name, size in expect.items():
        p = public / name
        if not p.exists():
            failures.append(f"missing {name}")
            continue
        v = verify_final(p, size, BUDGET_BYTES)
        failures += [f"{name}: {x}" for x in v["problems"]]
    body = np.asarray(Image.open(public / "owl-body.png").convert("LA")) if (public / "owl-body.png").exists() else None
    if body is not None:
        if not (body[-1, :, 1] >= 128).any():
            failures.append("owl-body.png: feet do not touch the bottom row")
        if body[..., 0][body[..., 1] == 255].max() != 255:
            failures.append("owl-body.png: lit base is not white")
    lines = prov.read_lines(base / "provenance.jsonl")
    if len(lines) != len(expect):
        failures.append(f"provenance has {len(lines)} lines, expected {len(expect)}")
    for f in failures:
        print(f"FAIL: {f}")
    note(f"\ndemo {'ok' if not failures else 'FAILED'}: {len(expect)} files, {len(lines)} provenance lines, work dir {base}" + ("" if a.keep else " (removed)"))
    if not a.keep:
        shutil.rmtree(base, ignore_errors=True)
    return 1 if failures else 0


# ----------------------------------------------------------------------------------------------
# Argument parsing


def add_common(sp: argparse.ArgumentParser) -> None:
    sp.add_argument("--work", default=None, help="work directory (default ART_WORK_DIR or work/art)")
    sp.add_argument("--geometry", default=None, help="geometry JSON (default <work>/geometry.json)")
    sp.add_argument("--out", default=None, help="finals directory (default <work>/final)")
    sp.add_argument("--now", default=None, help="ISO-8601 timestamp for records (default ART_NOW or the clock)")
    sp.add_argument("--budget", type=int, default=None, help=f"PNG byte budget (default {BUDGET_BYTES})")
    sp.add_argument("--note", action="append", default=[], help="a human edit to record (repeatable)")
    sp.add_argument("--public", default=None, help=argparse.SUPPRESS)


def add_chroma_flags(sp: argparse.ArgumentParser) -> None:
    sp.add_argument("--key-colour", default=None, help="auto | #RRGGBB (default: the sidecar's key colour, else the key's default)")
    sp.add_argument("--t0", type=float, default=40.0)
    sp.add_argument("--t1", type=float, default=110.0)
    sp.add_argument("--despill-band", type=int, default=6)
    sp.add_argument("--min-area", type=float, default=0.002, help="speck threshold as a fraction of the largest component (never below 16 px; components touching the frame edge are never specks)")
    sp.add_argument("--max-hole", type=int, default=64)
    sp.add_argument("--feather", type=float, default=0.0)
    sp.add_argument("--trust-key", action="store_true", help="key on --key-colour even when the border says otherwise")


def add_grade_flags(sp: argparse.ArgumentParser) -> None:
    sp.add_argument("--grade", default=None, help="realm palette (default: the key's realm) or none")
    sp.add_argument("--strength", type=float, default=None)
    sp.add_argument("--dither", choices=("none", "ordered", "fs"), default="none")


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="postprocess.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="command", required=True)

    sp = sub.add_parser("guide", help="layout guides from the room geometry")
    sp.add_argument("room", nargs="?")
    sp.add_argument("--all", action="store_true")
    add_common(sp)
    sp.set_defaults(fn=cmd_guide)

    sp = sub.add_parser("room", help="room background -> 1600x900 WebP (+ optional 3200x1800)")
    sp.add_argument("key")
    sp.add_argument("--raw", default=None)
    sp.add_argument("--crop", default="centre", help="centre|top|bottom|fx,fy")
    sp.add_argument("--shift-y", type=int, default=0)
    sp.add_argument("--with-2x", action="store_true", help="also write <key>@2x.webp under --budget-2x")
    sp.add_argument("--budget-2x", type=int, default=BUDGET_2X_ROOM, help=f"byte budget of the 2x WebP (default {BUDGET_2X_ROOM})")
    add_grade_flags(sp)
    add_common(sp)
    sp.set_defaults(fn=cmd_room)

    sp = sub.add_parser("piece", help="set piece -> chroma key, fit, 1x + 2x")
    sp.add_argument("key")
    sp.add_argument("--raw", default=None)
    add_chroma_flags(sp)
    sp.add_argument("--floor-cut", type=int, default=None, help="drop everything below this source row")
    sp.add_argument("--fit", choices=("contain",), default="contain")
    sp.add_argument("--margin", type=float, default=0.02)
    sp.add_argument("--anchor-x", type=float, default=0.5)
    sp.add_argument("--pad-bottom", type=int, default=0)
    sp.add_argument("--no-2x", action="store_true")
    add_grade_flags(sp)
    add_common(sp)
    sp.set_defaults(fn=cmd_piece)

    sp = sub.add_parser("overlay", help="foreground overlay -> chroma key, 1600x900 RGBA")
    sp.add_argument("key")
    sp.add_argument("--raw", default=None)
    add_chroma_flags(sp)
    sp.add_argument("--crop", default="centre")
    sp.add_argument("--shift-y", type=int, default=0)
    sp.add_argument("--with-2x", action="store_true")
    sp.add_argument("--budget-2x", type=int, default=BUDGET_2X_RELAXED)
    sp.add_argument("--check", action="store_true", help="fail when the overlay rules are violated")
    add_grade_flags(sp)
    add_common(sp)
    sp.set_defaults(fn=cmd_overlay)

    sp = sub.add_parser("owl", help="owl master -> five layers at 1x and 2x")
    sp.add_argument("--raw", default=None)
    sp.add_argument("--keys", default=None, help="owl-keys.json override")
    sp.add_argument("--height", type=int, default=None)
    sp.add_argument("--flip", action="store_true")
    sp.add_argument("--blink", default=None, help="from:<png> (an eyes-closed edit of the master)")
    sp.add_argument("--labels", default=None, help="hand-edited label map")
    sp.add_argument("--debug", action="store_true", help="dump intermediates to <work>/intermediates/owl-master")
    add_chroma_flags(sp)
    sp.set_defaults(despill_band=4)  # the owl's flat fills need only a narrow despill band
    add_common(sp)
    sp.set_defaults(fn=cmd_owl)

    sp = sub.add_parser("grade", help="apply a realm palette grade to one image")
    sp.add_argument("input")
    sp.add_argument("output")
    sp.add_argument("--realm", required=True)
    sp.add_argument("--strength", type=float, default=None)
    sp.add_argument("--chroma-boost", type=float, default=None)
    add_common(sp)
    sp.set_defaults(fn=cmd_grade)

    sp = sub.add_parser("ref", help="prepare an anchor reference image for tools/art/refs (<= 1024 px, no metadata, under budget)")
    sp.add_argument("input")
    sp.add_argument("output")
    sp.add_argument("--max", type=int, default=1024, help="longest side in px")
    add_common(sp)
    sp.set_defaults(fn=cmd_ref)

    sp = sub.add_parser("sheet", help="contact sheet of a key's raw candidates")
    sp.add_argument("key")
    sp.add_argument("--width", type=int, default=320)
    sp.add_argument("--columns", type=int, default=3)
    add_common(sp)
    sp.set_defaults(fn=cmd_sheet)

    sp = sub.add_parser("publish", help="copy finals into apps/park/public/art and log provenance")
    sp.add_argument("keys", nargs="+", help="keys, or owl-* for the five owl layers")
    sp.add_argument("--retire-svg", action="store_true", help="move <key>.svg to work/art/retired-svg/ so the PNG is used")
    sp.add_argument("--provenance", default=None, help=argparse.SUPPRESS)
    add_common(sp)
    sp.set_defaults(fn=cmd_publish)

    sp = sub.add_parser("check", help="verify published art against the loader contract")
    sp.add_argument("keys", nargs="*")
    sp.add_argument("--all", action="store_true")
    sp.add_argument("--provenance", default=None, help=argparse.SUPPRESS)
    add_common(sp)
    sp.set_defaults(fn=cmd_check)

    sp = sub.add_parser("demo", help="run the chain on synthetic input in a temp dir and assert the contract")
    sp.add_argument("--keep", default=None, help="keep the demo directory here")
    sp.add_argument("--scale", default="1.0", help="scale synthetic sizes (tests use 0.25)")
    sp.add_argument("--from-work", default=None, help="use the generator's mock candidates from this work dir")
    add_common(sp)
    sp.set_defaults(fn=cmd_demo)
    return ap


def main(argv: list[str] | None = None) -> int:
    ap = build_parser()
    a = ap.parse_args(argv)
    try:
        ctx = Ctx(a)
        return int(a.fn(ctx, a) or 0)
    except ArtError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    except BudgetError as e:  # pragma: no cover (BudgetError is an ArtError)
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
