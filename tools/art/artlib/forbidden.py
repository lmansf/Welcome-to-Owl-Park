"""Forbidden-word check (Python twin of the generator's forbidden.mjs).

The list itself is private and never lives in the repository. It is read, in order, from
``ART_FORBIDDEN_WORDS_FILE`` (one entry per line, ``#`` comments), ``OWL_PARK_FORBIDDEN`` or
``ART_FORBIDDEN_WORDS`` (comma separated) or the gitignored ``tools/art/.local/forbidden-words.txt``. Without a list the
check is a no-op that prints a one-line notice once. Entries match case-insensitively as
substrings; an entry starting with ``=`` matches as a whole word (the same convention as the
generator's check, so one list serves both). Matches are reported on stderr only and are never
written into any file.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

from . import LOCAL_DIR

_noticed = False
_cache: tuple[str, list[str] | None] | None = None


def _sources() -> tuple[str, list[str] | None]:
    f = os.environ.get("ART_FORBIDDEN_WORDS_FILE")
    if f:
        try:
            return f"file {Path(f).name}", _parse(Path(f).read_text(encoding="utf-8").splitlines())
        except OSError:
            return "file (unreadable)", []
    for var in ("OWL_PARK_FORBIDDEN", "ART_FORBIDDEN_WORDS"):
        env = os.environ.get(var)
        if env:
            return var, _parse(env.split(","))
    local = LOCAL_DIR / "forbidden-words.txt"
    if local.exists():
        return "tools/art/.local/forbidden-words.txt", _parse(local.read_text(encoding="utf-8").splitlines())
    return "none", None


def _parse(lines) -> list[str]:
    out = []
    for raw in lines:
        s = raw.strip()
        if s and not s.startswith("#"):
            out.append(s)
    return out


def load_words(refresh: bool = False) -> list[str] | None:
    global _cache
    if _cache is None or refresh:
        _cache = _sources()
    return _cache[1]


def configured() -> bool:
    return load_words() is not None


def find_matches(text: str, words: list[str] | None = None) -> list[str]:
    ws = load_words() if words is None else words
    if not ws or not text:
        return []
    hits = []
    low = text.lower()
    for w in ws:
        if w.startswith("="):
            if re.search(r"(?<![a-z0-9])" + re.escape(w[1:].lower()) + r"(?![a-z0-9])", low):
                hits.append(w)
        elif w.lower() in low:
            hits.append(w)
    return hits


def check(text: str, where: str = "", words: list[str] | None = None) -> list[str]:
    """Returns the matches and reports them on stderr; silent no-op without a list."""
    global _noticed
    ws = load_words() if words is None else words
    if ws is None:
        if not _noticed:
            print("note: no forbidden-word list configured (ART_FORBIDDEN_WORDS_FILE); the check is a no-op", file=sys.stderr)
            _noticed = True
        return []
    hits = find_matches(text, ws)
    if hits:
        print(f"forbidden-word match in {where or 'text'}: {len(hits)} entr{'y' if len(hits) == 1 else 'ies'} matched", file=sys.stderr)
        for h in hits:
            print(f"  - {h}", file=sys.stderr)
    return hits


def check_file(path: Path, words: list[str] | None = None) -> list[str]:
    try:
        text = Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    return check(text, str(Path(path).name), words)
