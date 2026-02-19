#!/usr/bin/env python3
"""Entrypoint wrapper for the AgenticFlow CLI."""

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
SRC_DIR = ROOT_DIR / "src"
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) in sys.path:
    sys.path.remove(str(SCRIPT_DIR))
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from agenticflow_cli.main import run_cli


def main() -> None:
    raise SystemExit(run_cli())


if __name__ == "__main__":
    main()
