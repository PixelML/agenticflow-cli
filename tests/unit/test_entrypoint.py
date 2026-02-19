import os
import subprocess
import sys
from pathlib import Path


def test_agenticflow_cli_script_runs_without_pythonpath() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    script_path = repo_root / "scripts" / "agenticflow_cli.py"

    env = os.environ.copy()
    env.pop("PYTHONPATH", None)

    result = subprocess.run(
        [sys.executable, str(script_path), "--help"],
        cwd=repo_root,
        env=env,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0
    assert "Call AgenticFlow OpenAPI operations from the CLI." in result.stdout
