"""Provenance lines for tools/art/provenance.jsonl (one per published file).

Fields are allowlisted; paths are repository-relative; prompt text never appears (only its
hash); the provider's result URL is recorded without its query string (presigned URLs carry
credentials and signatures there); the login name and host name are refused as whole tokens in
the free-text field (``human_edits``) and the home directory anywhere; and the forbidden-word
check runs over the whole line before it is appended. ``human_edits`` holds the art director's
``--note`` entries (what was picked, what was fixed by hand).
"""

from __future__ import annotations

import getpass
import json
import os
import re
import socket
from pathlib import Path

from . import REPO_ROOT, ArtError
from . import forbidden

ALLOWED_FIELDS = (
    "schema", "asset", "key", "logical", "sha256", "bytes", "colors", "budget_relaxed",
    "raw_hash16", "provider", "model", "prompt_sha256", "seed", "gen_size", "source_url",
    "generated_at", "published_at", "tools", "human_edits",
)
SIDECAR_FIELDS = ("hash16", "provider", "model", "prompt_sha256", "seed", "size", "source_url", "generated_at")
#: The fields holding free text: the only place a login or host name is looked for. The rest
#: (asset, key, provider, model, gen_size, tools) is a closed vocabulary that a login such as
#: "tom" (pad_bottom) or "owl" (owl-body) must not be able to block.
FREE_TEXT_FIELDS = ("human_edits",)
_ABS = re.compile(r"^(/|[A-Za-z]:[\\/]|\\\\)")
_URL_SECRET = re.compile(r"[?#]|signature|credential|token|x-tos-|x-amz-", re.IGNORECASE)


def public_url(u) -> str | None:
    """A result URL stripped of its query string and fragment (where presigned credentials live)."""
    if not u:
        return None
    s = str(u).split("?", 1)[0].split("#", 1)[0]
    return s or None


def _identity_names() -> list[str]:
    """The login and host name, four characters or longer (shorter ones match ordinary words)."""
    out = []
    for getter in (getpass.getuser, socket.gethostname):
        try:
            v = getter()
            if v and len(v) >= 4:
                out.append(v)
        except Exception:
            pass
    return out


def _home_dirs() -> list[str]:
    try:
        h = str(Path.home())
        return [h] if h and h not in ("/", ".") else []
    except Exception:
        return []


def _identity_strings() -> list[str]:  # kept for callers that want the whole list
    return _identity_names() + _home_dirs()


def build_line(*, asset: str, key: str, logical: str, sha256: str, nbytes: int, colors: int | None, budget_relaxed: bool,
               sidecar: dict | None, published_at: str, tools: list[str], human_edits: list[str]) -> dict:
    sc = sidecar or {}
    return {
        "schema": 1,
        "asset": asset,
        "key": key,
        "logical": logical,
        "sha256": sha256,
        "bytes": int(nbytes),
        "colors": colors,
        "budget_relaxed": bool(budget_relaxed),
        "raw_hash16": sc.get("hash16"),
        "provider": sc.get("provider"),
        "model": sc.get("model"),
        "prompt_sha256": sc.get("prompt_sha256"),
        "seed": sc.get("seed"),
        "gen_size": sc.get("size"),
        "source_url": public_url(sc.get("source_url")),
        "generated_at": sc.get("generated_at"),
        "published_at": published_at,
        "tools": list(tools),
        "human_edits": list(human_edits),
    }


def sanitize(line: dict) -> dict:
    return {k: line[k] for k in ALLOWED_FIELDS if k in line}


def problems(line: dict) -> list[str]:
    """Why a line may not be written: unknown fields, absolute paths, identity strings, prompt text."""
    out = []
    for k in line:
        if k not in ALLOWED_FIELDS:
            out.append(f"field {k!r} is not allowlisted")
    if "prompt" in line:
        out.append("prompt text is never recorded (only prompt_sha256)")
    names = _identity_names()
    homes = _home_dirs()

    def walk(v, path, free_text):
        if isinstance(v, str):
            if path == "source_url":
                if _URL_SECRET.search(v):
                    out.append("source_url carries a query string or signed-URL parameters")
                return
            if _ABS.match(v):
                out.append(f"{path} holds an absolute path")
            for h in homes:
                if h in v:
                    out.append(f"{path} contains the home directory path")
                    break
            if free_text:
                for ident in names:
                    if re.search(r"(?<![A-Za-z0-9])" + re.escape(ident) + r"(?![A-Za-z0-9])", v, re.IGNORECASE):
                        out.append(f"{path} contains the user or host name {ident!r}")
                        break
        elif isinstance(v, list):
            for i, item in enumerate(v):
                walk(item, f"{path}[{i}]", free_text)
        elif isinstance(v, dict):
            for kk, vv in v.items():
                walk(vv, f"{path}.{kk}", free_text)

    for k, v in line.items():
        walk(v, k, k in FREE_TEXT_FIELDS)
    text = json.dumps(line, ensure_ascii=False)
    if forbidden.configured() and forbidden.check(text, f"provenance line for {line.get('asset')}"):
        out.append("forbidden-word match (details on stderr)")
    return out


def append(path: Path, line: dict) -> dict:
    clean = sanitize(line)
    probs = problems(clean)
    if probs:
        raise ArtError("refusing to write provenance line: " + "; ".join(probs))
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(clean, ensure_ascii=False, sort_keys=False) + "\n")
    return clean


def read_lines(path: Path) -> list[dict]:
    p = Path(path)
    if not p.exists():
        return []
    out = []
    for n, raw in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip():
            continue
        try:
            out.append(json.loads(raw))
        except ValueError as e:
            raise ArtError(f"{p.name} line {n} is not JSON: {e}") from None
    return out


def relaxed_assets(path: Path) -> set[str]:
    """Asset file names whose latest provenance line says budget_relaxed."""
    latest: dict[str, bool] = {}
    for line in read_lines(path):
        if isinstance(line, dict) and line.get("asset"):
            latest[line["asset"]] = bool(line.get("budget_relaxed"))
    return {a for a, r in latest.items() if r}
