import json
from pathlib import Path

from agenticflow_cli import main as main_module
from agenticflow_cli.main import run_cli


def _write_env_file(path: Path, *, api_key: str = "", base_url: str = "") -> None:
    lines: list[str] = []
    if api_key:
        lines.append(f"AGENTICFLOW_PUBLIC_API_KEY={api_key}")
    if base_url:
        lines.append(f"NEXT_PUBLIC_BASE_API_URL={base_url}")
    path.write_text("\n".join(lines))


def _write_spec(path: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "openapi": "3.1.0",
                "paths": {
                    "/v1/health": {
                        "get": {
                            "operationId": "health_check",
                            "responses": {"200": {"description": "ok"}},
                        }
                    }
                },
            }
        )
    )


def test_auth_import_env_stores_profile(tmp_path: Path, monkeypatch, capsys) -> None:
    env_file = tmp_path / "agenticflow.env"
    _write_env_file(
        env_file,
        api_key="secret-token-abc",
        base_url="https://staging.agenticflow.ai/",
    )
    config_path = tmp_path / ".agenticflow" / "config.json"
    monkeypatch.setattr(
        main_module, "_default_auth_config_path", lambda: config_path
    )

    rc = run_cli(
        [
            "auth",
            "import-env",
            "--file",
            str(env_file),
            "--profile",
            "ci",
        ],
    )
    capture = capsys.readouterr()
    out = capture.out
    err = capture.err
    assert rc == 0
    assert "secret-token-abc" not in out
    assert "secret-token-abc" not in err
    assert "ci" in out
    stored = json.loads(config_path.read_text())
    assert stored["active_profile"] == "ci"
    assert stored["profiles"]["ci"]["api_key"] == "secret-token-abc"
    assert stored["profiles"]["ci"]["base_url"] == "https://staging.agenticflow.ai/"


def test_auth_whoami_supports_json_without_secret(tmp_path: Path, monkeypatch, capsys) -> None:
    config_path = tmp_path / ".agenticflow" / "config.json"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        json.dumps(
            {
                "active_profile": "ci",
                "profiles": {
                    "ci": {
                        "api_key": "super-secret-token",
                        "base_url": "https://staging.agenticflow.ai/",
                    }
                },
            }
        )
    )
    monkeypatch.setattr(
        main_module, "_default_auth_config_path", lambda: config_path
    )

    rc = run_cli(["auth", "whoami", "--json"])
    raw = capsys.readouterr().out
    payload = json.loads(raw)

    assert rc == 0
    assert payload["profile"] == "ci"
    assert payload["has_api_key"] is True
    assert payload["base_url"] == "https://staging.agenticflow.ai/"
    assert "api_key" not in payload
    assert "super-secret-token" not in raw


def test_auth_whoami_unknown_profile_reports_error(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    config_path = tmp_path / ".agenticflow" / "config.json"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        json.dumps(
            {
                "active_profile": "default",
                "profiles": {
                    "default": {"api_key": "default-token"},
                },
            }
        )
    )
    monkeypatch.setattr(
        main_module, "_default_auth_config_path", lambda: config_path
    )

    rc = run_cli(["auth", "whoami", "--profile", "missing"])
    err = capsys.readouterr().err

    assert rc == 1
    assert "Unknown profile 'missing'" in err


def test_call_uses_profile_api_key_by_default(
    tmp_path: Path, monkeypatch
) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)
    config_path = tmp_path / ".agenticflow" / "config.json"
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(
        json.dumps(
            {
                "active_profile": "ci",
                "profiles": {
                    "ci": {"api_key": "profile-token"},
                },
            }
        )
    )
    monkeypatch.setattr(
        main_module, "_default_auth_config_path", lambda: config_path
    )

    captured: dict[str, str | None] = {}

    def _fake_invoke_operation(**kwargs: object) -> tuple[int, dict[str, int]]:
        captured["token"] = kwargs.get("token")
        return 0, {"status": 200}

    monkeypatch.setattr(main_module, "_invoke_operation", _fake_invoke_operation)

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "call",
            "--operation-id",
            "health_check",
            "--dry-run",
            "--profile",
            "ci",
        ]
    )

    assert rc == 0
    assert captured["token"] == "profile-token"
