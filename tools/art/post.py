#!/usr/bin/env python3
"""Alias for postprocess.py (the generator's README refers to the post stage as post.py)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from postprocess import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
