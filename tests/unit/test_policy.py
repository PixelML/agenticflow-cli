import json
from pathlib import Path

import pytest

from agenticflow_cli import policy as policy_module
from agenticflow_cli.main import run_cli
from agenticflow_cli.spec import Operation


def _write_simple_spec(path: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "openapi": "3.1.0",
                "paths": {
                    "/v1/health": {"get": {"operationId": "health_check"}},
                    "/v1/admin/items": {
                        "get": {"operationId": "admin_items"},
                    },
                },
            }
        )
    )


def _operation(operation_id: str, raw: dict[str, object] | None = None) -> Operation:
    return Operation(
        operation_id=operation_id,
        method="GET",
        path="/v1/example",
        raw=raw or {},
    )


def test_load_policy_missing_file_returns_defaults(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("AGENTICFLOW_CLI_DIR", str(tmp_path))
    loaded = policy_module.load_policy()

    assert loaded.spend_ceiling is None
    assert loaded.allowlist == ()
    assert loaded.blocklist == ()


def test_load_policy_reads_allowlist_blocklist_and_spend(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("AGENTICFLOW_CLI_DIR", str(tmp_path))
    path = tmp_path / "policy.json"
    path.write_text(
        json.dumps(
            {
                "spend_ceiling": 5.25,
                "allowlist": ["health_check"],
                "blocklist": ["admin_items"],
            }
        )
    )

    loaded = policy_module.load_policy()

    assert loaded.spend_ceiling == 5.25
    assert loaded.allowlist == ("health_check",)
    assert loaded.blocklist == ("admin_items",)


def test_load_policy_rejects_invalid_json(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("AGENTICFLOW_CLI_DIR", str(tmp_path))
    path = tmp_path / "policy.json"
    path.write_text("{this is not json}")

    with pytest.raises(policy_module.PolicyConfigError):
        policy_module.load_policy()


def test_enforce_policy_returns_expected_violation_codes() -> None:
    config = policy_module.PolicyConfig(
        spend_ceiling=10.0,
        allowlist=("health_check",),
        blocklist=(),
    )

    assert policy_module.evaluate_policy(
        config,
        _operation("admin_items"),
    ) is not None

    assert (
        policy_module.evaluate_policy(
            config,
            _operation("health_check"),
            estimated_cost=20.0,
        )
        is not None
    )

    assert (
        policy_module.evaluate_policy(
            config,
            _operation("health_check"),
            estimated_cost=2.0,
        )
        is None
    )


def test_policy_init_and_show_roundtrip(
    tmp_path,
    monkeypatch,
    capsys,
) -> None:
    monkeypatch.setenv("AGENTICFLOW_CLI_DIR", str(tmp_path))

    init_rc = run_cli(
        [
            "policy",
            "init",
            "--spend-ceiling",
            "10",
            "--allow-operation",
            "health_check",
        ],
    )
    init_out = capsys.readouterr().out
    init_payload = json.loads(init_out)

    assert init_rc == 0
    assert init_payload["status"] == "ok"
    assert init_payload["policy"]["spend_ceiling"] == 10.0
    assert init_payload["policy"]["allowlist"] == ["health_check"]

    show_rc = run_cli(["policy", "show"])
    show_out = capsys.readouterr().out
    show_payload = json.loads(show_out)

    assert show_rc == 0
    assert show_payload["initialized"] is True
    assert show_payload["policy"]["spend_ceiling"] == 10.0


def test_call_with_policy_blocklist_fails_before_request(
    tmp_path,
    monkeypatch,
    capsys,
) -> None:
    monkeypatch.setenv("AGENTICFLOW_CLI_DIR", str(tmp_path))
    spec_file = tmp_path / "openapi.json"
    _write_simple_spec(spec_file)

    assert (
        run_cli(
            [
                "policy",
                "init",
                "--allow-operation",
                "health_check",
            ]
        )
        == 0
    )
    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "call",
            "--operation-id",
            "admin_items",
            "--dry-run",
        ],
    )

    err = capsys.readouterr().err
    payload = json.loads(err)

    assert rc == 1
    assert payload["code"] == "policy.not_allowlisted"
    assert payload["operation_id"] == "admin_items"


def test_call_with_spend_ceiling_violation_is_audit_block(tmp_path, monkeypatch, capsys) -> None:
    monkeypatch.setenv("AGENTICFLOW_CLI_DIR", str(tmp_path))
    spec_file = tmp_path / "openapi.json"
    _write_simple_spec(spec_file)

    assert (
        run_cli(
            [
                "policy",
                "init",
                "--spend-ceiling",
                "1",
            ]
        )
        == 0
    )
    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "call",
            "--operation-id",
            "health_check",
            "--estimated-cost",
            "3",
            "--dry-run",
        ],
    )

    err = capsys.readouterr().err
    payload = json.loads(err)

    assert rc == 1
    assert payload["code"] == "policy.spend_ceiling_exceeded"
    assert payload["operation_id"] == "health_check"


def test_call_success_writes_audit_entry(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("AGENTICFLOW_CLI_DIR", str(tmp_path))
    spec_file = tmp_path / "openapi.json"
    _write_simple_spec(spec_file)

    assert (
        run_cli(
            [
                "policy",
                "init",
                "--allow-operation",
                "health_check",
            ]
        )
        == 0
    )
    assert (
        run_cli(
            [
                "--spec-file",
                str(spec_file),
                "call",
                "--operation-id",
                "health_check",
                "--dry-run",
            ]
        )
        == 0
    )

    audit_path = tmp_path / "agenticflow-audit.log"
    assert audit_path.exists()
    last_entry = json.loads(audit_path.read_text().splitlines()[-1])

    assert last_entry["operation_id"] == "health_check"
    assert last_entry["status"] == "dry_run"
    assert "result_code" in last_entry
    assert last_entry["result_code"] == "dry_run"
