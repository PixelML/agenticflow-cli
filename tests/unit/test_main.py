import json
import pytest
from pathlib import Path

from agenticflow_cli import main as main_module
from agenticflow_cli.main import (
    AGENT_OPERATION_IDS,
    CONNECTION_OPERATION_IDS,
    NODE_TYPE_OPERATION_IDS,
    WORKFLOW_OPERATION_IDS,
    run_cli,
)


def _write_spec(path: Path) -> None:
    spec = {
        "openapi": "3.1.0",
        "paths": {
            "/v1/health": {
                "get": {
                    "operationId": "health_check",
                    "tags": ["health"],
                    "responses": {"200": {"description": "ok"}},
                },
            },
            "/v1/items/{item_id}": {
                "get": {
                    "operationId": "get_item",
                    "tags": ["items"],
                    "security": [{"AuthHTTPBearer": []}],
                    "responses": {"200": {"description": "ok"}},
                },
            },
            "/v1/admin/platform/items": {
                "get": {
                    "operationId": "admin_items",
                    "responses": {"200": {"description": "ok"}},
                },
            },
        },
    }
    path.write_text(json.dumps(spec))


def _write_trailing_slash_spec(path: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "openapi": "3.1.0",
                "paths": {
                    "/v1/workflow_templates/": {
                        "get": {
                            "operationId": "list_workflow_templates",
                            "responses": {"200": {"description": "ok"}},
                        }
                    }
                },
            }
        )
    )


def _write_post_body_spec(path: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "openapi": "3.1.0",
                "paths": {
                    "/v1/items/{item_id}": {
                        "post": {
                            "operationId": "create_item",
                            "requestBody": {
                                "content": {
                                    "application/json": {
                                        "schema": {"type": "object"}
                                    }
                                }
                            },
                            "responses": {"200": {"description": "created"}},
                        }
                    }
                },
            }
        )
    )


def _write_catalog_spec(path: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "openapi": "3.1.0",
                "paths": {
                    "/v1/health": {
                        "get": {
                            "operationId": "health_check",
                            "tags": ["health"],
                            "responses": {"200": {"description": "ok"}},
                        },
                    },
                    "/v1/public/list": {
                        "get": {
                            "operationId": "list_public_items",
                            "tags": ["catalog", "public"],
                            "responses": {"200": {"description": "ok"}},
                        },
                    },
                    "/v1/public/{item_id}": {
                        "get": {
                            "operationId": "get_public_item",
                            "tags": ["catalog", "public", "items"],
                            "parameters": [
                                {
                                    "name": "item_id",
                                    "in": "path",
                                    "required": True,
                                }
                            ],
                            "responses": {"200": {"description": "ok"}},
                        },
                    },
                    "/v1/private/{item_id}": {
                        "get": {
                            "operationId": "get_private_item",
                            "tags": ["catalog", "private"],
                            "security": [{"AuthHTTPBearer": []}],
                            "parameters": [
                                {
                                    "name": "item_id",
                                    "in": "path",
                                    "required": True,
                                }
                            ],
                            "responses": {"200": {"description": "ok"}},
                        },
                    },
                    "/v1/admin/platform/items": {
                        "get": {
                            "operationId": "admin_items",
                            "responses": {"200": {"description": "ok"}},
                        },
                    },
                },
            }
        )
    )


def test_ops_list_public_only_outputs_only_public_operations(capsys, tmp_path: Path) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)

    rc = run_cli(["--spec-file", str(spec_file), "ops", "list", "--public-only"])
    out = capsys.readouterr().out

    assert rc == 0
    assert "health_check" in out
    assert "get_item" not in out
    assert "admin_items" not in out


def test_call_dry_run_by_operation_id(capsys, tmp_path: Path) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "call",
            "--operation-id",
            "health_check",
            "--dry-run",
        ],
    )
    out = capsys.readouterr().out

    assert rc == 0
    assert '"operation_id": "health_check"' in out
    assert "/v1/health" in out


def test_call_dry_run_by_method_and_path(capsys, tmp_path: Path) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "call",
            "--method",
            "GET",
            "--path",
            "/v1/health",
            "--dry-run",
        ],
    )
    out = capsys.readouterr().out

    assert rc == 0
    assert '"operation_id": "health_check"' in out


def test_call_unknown_operation_returns_error(capsys, tmp_path: Path) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "call",
            "--operation-id",
            "does_not_exist",
            "--dry-run",
        ],
    )
    err = capsys.readouterr().err

    assert rc == 1
    assert "Unknown operation_id" in err


def test_call_requires_operation_selector(capsys, tmp_path: Path) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)

    rc = run_cli(["--spec-file", str(spec_file), "call", "--dry-run"])
    combined = capsys.readouterr()
    message = combined.out + combined.err

    assert rc == 1
    assert "operation" in message.lower() or "path" in message.lower()


def test_call_by_method_and_path_normalizes_trailing_slash(
    capsys, tmp_path: Path
) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_trailing_slash_spec(spec_file)

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "call",
            "--method",
            "GET",
            "--path",
            "/v1/workflow_templates",
            "--dry-run",
        ],
    )
    out = capsys.readouterr().out

    assert rc == 0
    assert '"operation_id": "list_workflow_templates"' in out
    assert '"url": "https://api.agenticflow.ai/v1/workflow_templates/"' in out


def test_call_by_method_and_path_rejects_missing_selector_combo(capsys, tmp_path: Path) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "call",
            "--operation-id",
            "health_check",
            "--method",
            "GET",
            "--path",
            "/v1/health",
            "--dry-run",
        ],
    )
    err = capsys.readouterr().err

    assert rc == 1
    assert "Use --operation-id OR --method + --path" in err


def test_call_dry_run_serializes_json_body_and_content_type(
    capsys, tmp_path: Path
) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_post_body_spec(spec_file)

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "call",
            "--operation-id",
            "create_item",
            "--path-param",
            "item_id=123",
            "--body",
            '{"name":"alpha","active":true}',
            "--dry-run",
        ],
    )
    out = capsys.readouterr().out

    assert rc == 0
    assert '"body": {\n    "name": "alpha",\n    "active": true\n  }' in out
    assert '"Content-Type": "application/json"' in out


def test_call_invalid_body_payload_is_rejected(capsys, tmp_path: Path) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_post_body_spec(spec_file)

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "call",
            "--operation-id",
            "create_item",
            "--path-param",
            "item_id=123",
            "--body",
            "{not-json}",
            "--dry-run",
        ],
    )
    err = capsys.readouterr().err

    assert rc == 1
    assert "Invalid --body" in err


def test_call_non_2xx_status_returns_failure_exit_code(capsys, tmp_path, monkeypatch) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)

    monkeypatch.setattr(
        "agenticflow_cli.main._request",
        lambda _request_spec: (
            401,
            {"status": 401, "error": {"detail": "Unauthorized"}},
        ),
    )

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "call",
            "--operation-id",
            "health_check",
            "--base-url",
            "https://api.agenticflow.ai",
        ],
    )
    out = capsys.readouterr().out

    assert rc == 1
    assert '"status": 401' in out


def test_playbook_list_outputs_topics(capsys) -> None:
    rc = run_cli(["playbook", "list"])
    out = capsys.readouterr().out

    assert rc == 0
    assert "workflow-build" in out
    assert "workflow-run" in out
    assert "agent-build" in out
    assert "mcp-to-cli-map" in out


def test_playbook_unknown_topic_returns_error(capsys) -> None:
    rc = run_cli(["playbook", "show", "unknown-topic"])
    err = capsys.readouterr().err

    assert rc == 1
    assert "Unknown playbook topic" in err
    assert "playbook list" in err


def test_doctor_json_reports_stable_schema_and_checks(capsys, tmp_path: Path, monkeypatch) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)
    monkeypatch.setenv("AGENTICFLOW_PUBLIC_API_KEY", "tok-123")

    monkeypatch.setattr(
        main_module,
        "_request",
        lambda _request_spec: (200, {"status": 200}),
    )

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "--base-url",
            "https://api.agenticflow.ai",
            "doctor",
            "--json",
        ],
    )
    out = capsys.readouterr().out
    payload = json.loads(out)

    assert rc == 0
    assert payload["schema_version"] == "agenticflow.doctor.v1"
    assert payload["status"] == "ok"
    checks = {entry["check"]: entry for entry in payload["checks"]}
    assert checks["config"]["status"] == "ok"
    assert checks["base_url"]["status"] == "ok"
    assert checks["token"]["status"] == "ok"
    assert checks["auth_boundary"]["status"] == "ok"
    assert checks["health"]["status"] == "ok"


def test_doctor_json_treats_invalid_base_url_as_fail(tmp_path: Path, monkeypatch, capsys) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)

    monkeypatch.setattr(
        main_module,
        "_request",
        lambda _request_spec: (200, {"status": 200}),
    )

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "--base-url",
            "://invalid",
            "doctor",
            "--json",
        ],
    )
    out = capsys.readouterr().out
    payload = json.loads(out)

    assert rc == 1
    assert payload["status"] == "fail"
    checks = {entry["check"]: entry["status"] for entry in payload["checks"]}
    assert checks["base_url"] == "fail"


def test_doctor_json_warns_when_token_missing(tmp_path: Path, monkeypatch, capsys) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)
    monkeypatch.delenv("AGENTICFLOW_PUBLIC_API_KEY", raising=False)
    monkeypatch.setattr(
        main_module,
        "_request",
        lambda _request_spec: (200, {"status": 200}),
    )

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "doctor",
            "--json",
        ],
    )
    out = capsys.readouterr().out
    payload = json.loads(out)

    assert rc == 0
    checks = {entry["check"]: entry["status"] for entry in payload["checks"]}
    assert checks["token"] == "warn"


def test_catalog_export_json_public_only(capsys, tmp_path: Path) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_catalog_spec(spec_file)

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "catalog",
            "export",
            "--public-only",
            "--json",
        ],
    )
    out = capsys.readouterr().out
    payload = json.loads(out)
    items = payload["items"]

    assert rc == 0
    assert payload["schema_version"] == "agenticflow.catalog.export.v1"
    assert payload["public_only"] is True
    assert items == sorted(items, key=lambda item: (item["path"], item["method"], item["operation_id"]))
    assert len(items) == 3
    assert {item["operation_id"] for item in items} == {
        "health_check",
        "list_public_items",
        "get_public_item",
    }


def test_catalog_rank_json_applies_relevance_heuristic(
    capsys, tmp_path: Path, monkeypatch
) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_catalog_spec(spec_file)
    monkeypatch.setattr(
        main_module,
        "_request",
        lambda _request_spec: (200, {"status": 200}),
    )

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "catalog",
            "rank",
            "--public-only",
            "--task",
            "public item",
            "--max-cost",
            "100",
            "--max-latency-ms",
            "5000",
            "--json",
        ],
    )
    out = capsys.readouterr().out
    payload = json.loads(out)
    ranked = payload["items"]

    assert rc == 0
    assert payload["schema_version"] == "agenticflow.catalog.rank.v1"
    assert payload["task"] == "public item"
    assert payload["count"] == len(ranked)
    assert ranked[0]["operation_id"] == "get_public_item"
    assert ranked[0]["relevance"] >= ranked[1]["relevance"]
    assert payload["heuristic"]["formula"] == "score = relevance*10 - cost - latency/200"


def test_workflow_run_routes_to_expected_operation(capsys, tmp_path: Path, monkeypatch) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)
    captured: dict[str, object] = {}

    def _fake_invoke_operation(**kwargs):
        captured.update(kwargs)
        return 0, {"status": 200}

    monkeypatch.setattr(main_module, "_invoke_operation", _fake_invoke_operation)

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "workflow",
            "run",
            "--workflow-id",
            "wf-123",
            "--input",
            '{"topic":"agenticflow"}',
            "--response-type",
            "queue",
            "--dry-run",
        ],
    )

    assert rc == 0
    assert captured["operation_id"] == WORKFLOW_OPERATION_IDS["run"]
    assert captured["body"] == {
        "workflow_id": "wf-123",
        "input": {"topic": "agenticflow"},
        "response_type": "queue",
    }
    assert captured["dry_run"] is True
    assert captured["token"] is None
    assert captured["base_url"] == "https://api.agenticflow.ai/"
    assert "workflow" not in capsys.readouterr().err.lower()


def test_workflow_create_rejects_invalid_body(capsys, tmp_path: Path) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "workflow",
            "create",
            "--workspace-id",
            "ws-1",
            "--body",
            "{bad-json}",
            "--dry-run",
        ],
    )
    err = capsys.readouterr().err

    assert rc == 1
    assert "Invalid --body" in err


def test_agent_stream_routes_to_expected_operation(tmp_path: Path, monkeypatch) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)
    captured: dict[str, object] = {}

    def _fake_invoke_operation(**kwargs):
        captured.update(kwargs)
        return 0, {"status": 200}

    monkeypatch.setattr(main_module, "_invoke_operation", _fake_invoke_operation)

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "agent",
            "stream",
            "--agent-id",
            "agent-1",
            "--body",
            '{"messages":[{"role":"user","content":"hello"}]}',
            "--dry-run",
        ],
    )

    assert rc == 0
    assert captured["operation_id"] == AGENT_OPERATION_IDS["stream"]
    assert captured["path_params"] == {"agent_id": "agent-1"}
    assert captured["body"] == {"messages": [{"role": "user", "content": "hello"}]}
    assert captured["dry_run"] is True


def test_node_types_search_filters_results(capsys, tmp_path: Path, monkeypatch) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)

    def _fake_invoke_operation(**_kwargs):
        return (
            0,
            {
                "status": 200,
                "body": [
                    {"name": "LLM Chat", "description": "Model inference"},
                    {"name": "HTTP Request", "description": "Call URL"},
                ],
            },
        )

    monkeypatch.setattr(main_module, "_invoke_operation", _fake_invoke_operation)

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "node-types",
            "search",
            "--query",
            "llm",
        ],
    )
    out = capsys.readouterr().out

    assert rc == 0
    assert '"count": 1' in out
    assert "LLM Chat" in out
    assert "HTTP Request" not in out


def test_node_types_dynamic_options_rejects_invalid_input_config(
    capsys, tmp_path: Path
) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "node-types",
            "dynamic-options",
            "--name",
            "google-drive",
            "--field-name",
            "folder",
            "--input-config",
            "{bad-json}",
            "--dry-run",
        ],
    )
    err = capsys.readouterr().err

    assert rc == 1
    assert "Invalid --input-config" in err


def test_connections_list_routes_to_expected_operation(tmp_path: Path, monkeypatch) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)
    captured: dict[str, object] = {}

    def _fake_invoke_operation(**kwargs):
        captured.update(kwargs)
        return 0, {"status": 200}

    monkeypatch.setattr(main_module, "_invoke_operation", _fake_invoke_operation)

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "connections",
            "list",
            "--workspace-id",
            "ws-001",
            "--dry-run",
        ],
    )

    assert rc == 0
    assert captured["operation_id"] == CONNECTION_OPERATION_IDS["list"]
    assert captured["path_params"] == {"workspace_id": "ws-001"}
    assert captured["dry_run"] is True


def test_node_types_list_routes_to_expected_operation(tmp_path: Path, monkeypatch) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)
    captured: dict[str, object] = {}

    def _fake_invoke_operation(**kwargs):
        captured.update(kwargs)
        return 0, {"status": 200}

    monkeypatch.setattr(main_module, "_invoke_operation", _fake_invoke_operation)

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "node-types",
            "list",
            "--dry-run",
        ],
    )

    assert rc == 0
    assert captured["operation_id"] == NODE_TYPE_OPERATION_IDS["list"]
    assert captured["dry_run"] is True


def test_run_cli_with_missing_spec_file_fails_cleanly(capsys, tmp_path: Path) -> None:
    nonexistent_spec = tmp_path / "missing.json"
    rc = run_cli(
        ["--spec-file", str(nonexistent_spec), "ops", "list"],
    )
    err = capsys.readouterr().err

    assert rc == 1
    assert f"Unable to read spec-file: {nonexistent_spec}" in err


def test_run_cli_with_invalid_spec_file_reports_error(capsys, tmp_path: Path) -> None:
    invalid_spec = tmp_path / "invalid.json"
    invalid_spec.write_text("{not-json")

    rc = run_cli(
        ["--spec-file", str(invalid_spec), "ops", "list"],
    )
    err = capsys.readouterr().err

    assert rc == 1
    assert f"Invalid spec-file {invalid_spec}" in err


def test_run_cli_unknown_command_returns_usage_exit_code(capsys) -> None:
    rc = run_cli(["totally-invalid-command"])
    out = capsys.readouterr()
    message = (out.out + out.err).lower()

    assert rc == 2
    assert "invalid choice: 'totally-invalid-command'" in message
    assert "usage:" in message


def test_run_cli_rejects_token_override_flag(capsys) -> None:
    rc = run_cli(["--token", "abc", "ops", "list"])
    out = capsys.readouterr()
    message = (out.out + out.err).lower()

    assert rc == 2
    assert "invalid choice: 'abc'" in message


def test_run_cli_uses_environment_token_by_default(capsys, tmp_path: Path, monkeypatch) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)
    captured: dict[str, object] = {}

    def _fake_invoke_operation(**kwargs):
        captured.update(kwargs)
        return 0, {"status": 200}

    monkeypatch.setattr(main_module, "_invoke_operation", _fake_invoke_operation)
    monkeypatch.setenv("AGENTICFLOW_PUBLIC_API_KEY", "env-token")

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "call",
            "--method",
            "GET",
            "--path",
            "/v1/health",
        ],
    )

    assert rc == 0
    assert captured["token"] == "env-token"
