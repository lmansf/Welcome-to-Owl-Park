"""Shared constants and small helpers for the art post-processing tools.

Everything the post stage needs to agree on with the game lives here: the repository paths,
the PNG size budget, the PNG chunk allowlist, the logical sizes mirrored from
``apps/park/src/game/art.ts`` and the public key list. The committed ``config/assets.json``
(owned by the generator half of the pipeline) wins over the built-in table when it exists, so
the two halves cannot drift apart silently.

Only the Python standard library, Pillow and numpy are used anywhere under ``tools/art``.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
import os
import re
from pathlib import Path

TOOLS_ART_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = TOOLS_ART_DIR.parent.parent
PUBLIC_ART_DIR = REPO_ROOT / "apps" / "park" / "public" / "art"
DEFAULT_WORK_DIR = REPO_ROOT / "work" / "art"
PALETTES_DIR = TOOLS_ART_DIR / "palettes"
CONFIG_DIR = TOOLS_ART_DIR / "config"
PROVENANCE_PATH = TOOLS_ART_DIR / "provenance.jsonl"
LOCAL_DIR = TOOLS_ART_DIR / ".local"

#: Every shipped file must encode under this many bytes (the "about 200 KB" rule).
BUDGET_BYTES = 200_000
#: Opt-in relaxed budget for a 3200x1800 room, which cannot meet 200 KB as PNG.
BUDGET_2X_RELAXED = 640_000
#: The only chunks a published PNG may carry: no text, time, physical or colour-profile chunks.
ALLOWED_CHUNKS = frozenset({"IHDR", "PLTE", "tRNS", "IDAT", "IEND"})

ROOM_W, ROOM_H = 1600, 900
OWL_W, OWL_H = 200, 240
KEY_RE = re.compile(r"^[a-z][a-z0-9-]*$")

NAVY, GOLD, CREAM = "#0C1E36", "#C9A227", "#F6F1E3"

#: Logical sizes mirrored from apps/park/src/game/art.ts (kind: room | piece | sign | owl).
BUILTIN_ASSETS: dict[str, dict] = {
    "hub": {"w": ROOM_W, "h": ROOM_H, "kind": "room"},
    "hub-fg": {"w": ROOM_W, "h": ROOM_H, "kind": "room"},
    "grove": {"w": ROOM_W, "h": ROOM_H, "kind": "room"},
    "grove-fg": {"w": ROOM_W, "h": ROOM_H, "kind": "room"},
    "market": {"w": ROOM_W, "h": ROOM_H, "kind": "room"},
    "market-fg": {"w": ROOM_W, "h": ROOM_H, "kind": "room"},
    "guardian": {"w": 720, "h": 820, "kind": "piece"},
    "robot-owl": {"w": 900, "h": 900, "kind": "piece"},
    "sign-not-yet-fledged": {"w": 420, "h": 520, "kind": "sign"},
    "sign-closed-for-molting": {"w": 420, "h": 520, "kind": "sign"},
    "sign-pardon-our-feathers": {"w": 420, "h": 520, "kind": "sign"},
    "sign-hatching-soon": {"w": 420, "h": 520, "kind": "sign"},
    "owl-body": {"w": OWL_W, "h": OWL_H, "kind": "owl"},
    "owl-belly": {"w": OWL_W, "h": OWL_H, "kind": "owl"},
    "owl-accent": {"w": OWL_W, "h": OWL_H, "kind": "owl"},
    "owl-face": {"w": OWL_W, "h": OWL_H, "kind": "owl"},
    "owl-blink": {"w": OWL_W, "h": OWL_H, "kind": "owl"},
}

OWL_LAYERS = ("owl-body", "owl-belly", "owl-accent", "owl-face", "owl-blink")
TINTED_LAYERS = ("owl-body", "owl-belly", "owl-accent")
#: Helper keys used by the generator for anchors and masters; never published as art.
HELPER_KEYS = ("owl-master", "owl-blink-src", "tree-master")
PUBLIC_ROOMS = ("hub", "grove", "market")
OVERLAY_KEYS = ("hub-fg", "grove-fg", "market-fg")
PIECE_KEYS = ("guardian", "robot-owl")

#: Which realm's palette grades which key.
REALM_OF_KEY = {
    "hub": "hub", "hub-fg": "hub",
    "grove": "grove", "grove-fg": "grove", "guardian": "grove",
    "market": "market", "market-fg": "market", "robot-owl": "market",
}
#: Set pieces: (room id, anchor name) as ambience.ts places them (origin bottom-centre).
PIECE_ANCHOR = {"guardian": ("grove", "guardian"), "robot-owl": ("market", "robot")}


class ArtError(Exception):
    """A user-facing failure: the CLI prints the message and exits 1."""


def load_assets(path: Path | None = None) -> dict[str, dict]:
    """The key -> {w, h, kind} table, from config/assets.json when present, else built in.

    The generator's file may nest the table under ``keys`` or ``assets``; anything that does not
    look like a size table falls back to the built-in mirror of art.ts.
    """
    p = path or (CONFIG_DIR / "assets.json")
    table: dict[str, dict] = {k: dict(v) for k, v in BUILTIN_ASSETS.items()}
    try:
        data = json.loads(Path(p).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return table
    for container in (data.get("keys"), data.get("assets"), data):
        if isinstance(container, dict) and all(isinstance(v, dict) for v in container.values()):
            found = {k: v for k, v in container.items() if isinstance(v.get("w"), int) and isinstance(v.get("h"), int)}
            if found:
                for k, v in found.items():
                    table[k] = {"w": v["w"], "h": v["h"], "kind": v.get("kind", table.get(k, {}).get("kind", "room")), **{kk: vv for kk, vv in v.items() if kk not in ("w", "h", "kind")}}
                return table
    return table


def load_key_colours(path: Path | None = None) -> dict[str, str]:
    """key -> chroma backdrop (#RRGGBB) from config/assets.json, public keys and helpers alike.

    This is the single source of truth for which backdrop each job is generated on: the
    generator reads the same file (prompts.mjs is validated against it), and the candidate's
    sidecar carries the same value, so the post stage never keeps a table of its own.
    """
    p = path or (CONFIG_DIR / "assets.json")
    out: dict[str, str] = {}
    try:
        data = json.loads(Path(p).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return out
    for container in (data.get("keys"), data.get("helpers")):
        if isinstance(container, dict):
            for k, v in container.items():
                if isinstance(v, dict) and isinstance(v.get("key_colour"), str):
                    out[k] = v["key_colour"]
    return out


def logical_size(key: str, assets: dict | None = None) -> tuple[int, int]:
    table = assets or load_assets()
    if key not in table:
        raise ArtError(f"unknown art key {key!r}; known keys: {', '.join(sorted(table))}")
    return int(table[key]["w"]), int(table[key]["h"])


def validate_key(key: str, allow_helpers: bool = True, assets: dict | None = None) -> str:
    table = assets or load_assets()
    if not KEY_RE.match(key):
        raise ArtError(f"invalid key {key!r}: keys match ^[a-z][a-z0-9-]*$")
    if key in table or (allow_helpers and key in HELPER_KEYS):
        return key
    raise ArtError(f"{key!r} is not a public art key")


def parse_hex(s: str) -> tuple[int, int, int]:
    s = s.strip()
    if not re.fullmatch(r"#?[0-9a-fA-F]{6}", s):
        raise ArtError(f"not a #RRGGBB colour: {s!r}")
    s = s.lstrip("#")
    return int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16)


def hex_of(rgb) -> str:
    r, g, b = (int(round(float(c))) for c in rgb[:3])
    return "#%02X%02X%02X" % (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))


def now_iso(explicit: str | None = None) -> str:
    """The timestamp written into sidecars: --now, else ART_NOW, else the clock (UTC, seconds)."""
    if explicit:
        return explicit
    env = os.environ.get("ART_NOW")
    if env:
        return env
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(Path(path).read_bytes())


def rel_to_repo(path: Path | str) -> str:
    """A repository-relative, forward-slash path for logs; never an absolute path."""
    p = Path(path).resolve()
    try:
        return p.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return p.name
