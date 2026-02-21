from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _isolate_cli_auth_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Prevent host auth/profile leakage from influencing test outcomes."""
    monkeypatch.setenv("AGENTICFLOW_CLI_DIR", str(tmp_path))
    monkeypatch.delenv("AGENTICFLOW_PUBLIC_API_KEY", raising=False)
