#!/usr/bin/env python3
"""Entrypoint for offline release-gate validation of operation-id mappings."""

from __future__ import annotations

from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
SCRIPT_DIR = Path(__file__).resolve().parent
SRC_DIR = ROOT_DIR / "src"
if str(SCRIPT_DIR) in sys.path:
    sys.path.remove(str(SCRIPT_DIR))
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from agenticflow_cli.operation_id_gate import main


if __name__ == "__main__":
    raise SystemExit(main())
