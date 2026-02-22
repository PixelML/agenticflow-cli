import json
import pytest
from pathlib import Path
from typing import Any

from agenticflow_cli import main as main_module
from agenticflow_cli.spec import OperationRegistry, default_spec_path, load_openapi_spec
from agenticflow_cli.main import (
    AGENT_OPERATION_IDS,
    CONNECTION_OPERATION_IDS,
    NODE_TYPE_OPERATION_IDS,
    UPLOAD_OPERATION_IDS,
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


def _write_rank_scope_spec(path: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "openapi": "3.1.0",
                "paths": {
                    "/v1/public/a": {
                        "get": {
                            "operationId": "op_a",
                            "tags": ["public", "workflow", "nodes"],
                            "responses": {"200": {"description": "ok"}},
                        },
                    },
                    "/v1/public/b": {
                        "get": {
                            "operationId": "op_b",
                            "tags": ["public", "workflow", "nodes"],
                            "responses": {"200": {"description": "ok"}},
                        },
                    },
                },
            }
        )
    )


def _snapshot_operation_ids() -> set[str]:
    registry = OperationRegistry.from_spec(load_openapi_spec(default_spec_path()))
    return {op.operation_id for op in registry.list_operations(public_only=False)}


def _hardcoded_main_operation_ids() -> set[str]:
    return {
        *WORKFLOW_OPERATION_IDS.values(),
        *AGENT_OPERATION_IDS.values(),
        *NODE_TYPE_OPERATION_IDS.values(),
        *CONNECTION_OPERATION_IDS.values(),
        *UPLOAD_OPERATION_IDS.values(),
    }


def _resolve_preferred_operation_id(
    *,
    authenticated_operation_id: str,
    anonymous_operation_id: str | None,
    token: str | None,
) -> str:
    registry = OperationRegistry.from_spec(load_openapi_spec(default_spec_path()))
    if token:
        candidates = [authenticated_operation_id]
        if anonymous_operation_id is not None:
            candidates.append(anonymous_operation_id)
    else:
        candidates = []
        if anonymous_operation_id is not None:
            candidates.append(anonymous_operation_id)
        candidates.append(authenticated_operation_id)

    for candidate in candidates:
        if registry.get_operation_by_id(candidate) is not None:
            return candidate
    return candidates[0]


def _build_sdk_client_spy(
    captured: dict[str, object],
    handlers: dict[tuple[str, str], Any] | None = None,
    default_response: dict[str, object] | None = None,
) -> Any:
    handlers = handlers or {}
    default_response = default_response or {"status": 200}

    def _record_call(
        resource_name: str,
        method_name: str,
        *args: Any,
        **kwargs: Any,
    ) -> dict[str, object]:
        captured["resource"] = resource_name
        captured["resource_method"] = method_name
        captured["args"] = args
        captured["kwargs"] = kwargs
        handler = handlers.get((resource_name, method_name))
        if handler is None:
            return dict(default_response)
        response = handler(*args, **kwargs)
        if isinstance(response, dict):
            return response
        return {"status": 200, "body": response}

    class _Resource:
        def __init__(self, resource_name: str) -> None:
            self._resource_name = resource_name

        def __getattr__(self, method_name: str):
            if method_name.startswith("__"):
                raise AttributeError(method_name)

            def _method(*args: Any, **kwargs: Any) -> dict[str, object]:
                return _record_call(self._resource_name, method_name, *args, **kwargs)

            return _method

    class _SDKClient:
        def __init__(self, *_: Any, **__: Any) -> None:
            self.workflows = _Resource("workflows")
            self.agents = _Resource("agents")
            self.node_types = _Resource("node_types")
            self.connections = _Resource("connections")
            self.uploads = _Resource("uploads")

    return _SDKClient()


def test_ops_list_public_only_outputs_only_public_operations(capsys, tmp_path: Path) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_spec(spec_file)

    rc = run_cli(["--spec-file", str(spec_file), "ops", "list", "--public-only"])
    out = capsys.readouterr().out

    assert rc == 0
    assert "health_check" in out
    assert "get_item" not in out
    assert "admin_items" not in out


def test_ops_list_public_only_applies_curated_manifest_filter_when_enabled(
    capsys,
    tmp_path: Path,
    monkeypatch,
) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_rank_scope_spec(spec_file)
    monkeypatch.setattr(
        main_module,
        "_should_use_curated_manifest",
        lambda *_args, **_kwargs: True,
    )
    monkeypatch.setattr(
        main_module,
        "_manifest_metadata_by_operation_id",
        lambda: {
            "op_a": {"operation_id": "op_a", "support_scope": "supported-executed"}
        },
    )

    rc = run_cli(["--spec-file", str(spec_file), "ops", "list", "--public-only"])
    out = capsys.readouterr().out

    assert rc == 0
    assert "op_a" in out
    assert "op_b" not in out


def test_ops_list_public_only_respects_manifest_exposure_flag(
    capsys,
    tmp_path: Path,
    monkeypatch,
) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_rank_scope_spec(spec_file)
    monkeypatch.setattr(
        main_module,
        "_should_use_curated_manifest",
        lambda *_args, **_kwargs: True,
    )
    monkeypatch.setattr(
        main_module,
        "_manifest_metadata_by_operation_id",
        lambda: {
            "op_a": {
                "operation_id": "op_a",
                "support_scope": "supported-executed",
                "exposed_to_end_user": True,
            },
            "op_b": {
                "operation_id": "op_b",
                "support_scope": "supported-executed",
                "exposed_to_end_user": False,
            },
        },
    )

    rc = run_cli(["--spec-file", str(spec_file), "ops", "list", "--public-only"])
    out = capsys.readouterr().out

    assert rc == 0
    assert "op_a" in out
    assert "op_b" not in out


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


def test_help_includes_code_command(capsys) -> None:
    rc = run_cli(["--help"])
    out = capsys.readouterr().out

    assert rc == 0
    assert " code " in f" {out} "


def test_code_search_help_is_available(capsys) -> None:
    rc = run_cli(["code", "search", "--help"])
    out = capsys.readouterr().out

    assert rc == 0
    assert "usage:" in out
    assert "--task" in out
    assert "--node-query" in out


def test_code_execute_help_is_available(capsys) -> None:
    rc = run_cli(["code", "execute", "--help"])
    out = capsys.readouterr().out

    assert rc == 0
    assert "usage:" in out
    assert "--plan" in out
    assert "--dry-run" in out


def test_code_search_includes_catalog_rank_and_node_types(capsys, monkeypatch) -> None:
    captured: dict[str, object] = {}
    fake_sdk = _build_sdk_client_spy(
        captured,
        handlers={
            ("node_types", "search"): lambda query, **kwargs: {
                "status": 200,
                "query": query,
                "count": 1,
                "body": [{"name": "llm node"}],
            },
        },
    )
    monkeypatch.setattr(main_module, "_build_sdk_client", lambda *_: fake_sdk)  # noqa: ARG005

    rc = run_cli(
        [
            "code",
            "search",
            "--task",
            "public item",
            "--node-query",
            "llm",
            "--json",
        ],
    )
    payload = json.loads(capsys.readouterr().out)

    assert rc == 0
    assert payload["schema_version"] == "agenticflow.code.search.v1"
    assert payload["task"] == "public item"
    assert isinstance(payload["operations"], list)
    assert payload["node_types"]["query"] == "llm"
    assert payload["node_types"]["count"] == 1
    assert payload["node_types"]["body"] == [{"name": "llm node"}]
    assert captured["resource"] == "node_types"
    assert captured["resource_method"] == "search"


def test_code_execute_runs_plan_steps_with_dry_run_and_policy_checks(monkeypatch, capsys) -> None:
    captured_calls: list[dict[str, object]] = []

    def _fake_invoke_operation(**kwargs: Any) -> tuple[int, Any]:
        captured_calls.append(dict(kwargs))
        operation_id = kwargs.get("operation_id")
        assert isinstance(operation_id, str)
        return 0, {"status": 200, "operation_id": operation_id}

    monkeypatch.setattr(main_module, "_invoke_operation", _fake_invoke_operation)
    plan = json.dumps({"operation_id": "health_check"})

    rc = run_cli(
        [
            "code",
            "execute",
            "--plan",
            plan,
            "--dry-run",
        ],
    )
    payload = json.loads(capsys.readouterr().out)

    assert rc == 0
    assert len(captured_calls) == 1
    assert captured_calls[0]["dry_run"] is True
    assert payload["operation_id"] == "health_check"
    assert payload["status"] == 200


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
    assert (
        payload["heuristic"]["formula"]
        == "score = relevance*10 - cost - latency/200 + "
        "scope_bonus + intent_bonus + stage_bonus + dependency_bonus"
    )


def test_catalog_rank_prefers_executed_manifest_scope_for_builder_tasks(
    capsys,
    tmp_path: Path,
    monkeypatch,
) -> None:
    spec_file = tmp_path / "openapi.json"
    _write_rank_scope_spec(spec_file)
    monkeypatch.setattr(
        main_module,
        "_should_use_curated_manifest",
        lambda *_args, **_kwargs: True,
    )
    monkeypatch.setattr(
        main_module,
        "_manifest_metadata_by_operation_id",
        lambda: {
            "op_a": {
                "operation_id": "op_a",
                "support_scope": "supported-executed",
                "intents": ["build_workflow"],
                "stage": "discover",
                "dependencies": ["node_types"],
            },
            "op_b": {
                "operation_id": "op_b",
                "support_scope": "supported-blocked-policy",
                "intents": ["run"],
                "stage": "apply",
                "dependencies": [],
            },
        },
    )

    rc = run_cli(
        [
            "--spec-file",
            str(spec_file),
            "catalog",
            "rank",
            "--public-only",
            "--task",
            "build workflow",
            "--json",
        ],
    )
    payload = json.loads(capsys.readouterr().out)
    ranked = payload["items"]

    assert rc == 0
    assert ranked[0]["operation_id"] == "op_a"
    assert ranked[0]["support_scope"] == "supported-executed"
    assert ranked[0]["scope_bonus"] > ranked[1]["scope_bonus"]
    assert ranked[0]["intent_bonus"] > ranked[1]["intent_bonus"]
    assert ranked[0]["stage_bonus"] > ranked[1]["stage_bonus"]


def test_workflow_run_routes_to_expected_operation(capsys, monkeypatch) -> None:
    captured: dict[str, object] = {}

    fake_sdk = _build_sdk_client_spy(captured)
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )

    rc = run_cli(
        [
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
    out = capsys.readouterr().out
    payload = json.loads(out)

    assert rc == 0
    assert captured["resource"] == "workflows"
    assert captured["resource_method"] == "run"
    assert payload["operation_id"] == WORKFLOW_OPERATION_IDS["run_anonymous"]
    assert captured["kwargs"] == {
        "workflow_id": "wf-123",
        "input_data": {"topic": "agenticflow"},
        "response_type": "queue",
        "authenticated": False,
        "dry_run": True,
    }
    assert payload["status"] == 200
    assert "workflow" not in capsys.readouterr().err.lower()


def test_workflow_run_defaults_to_empty_input_payload(monkeypatch, capsys) -> None:
    captured: dict[str, object] = {}
    fake_sdk = _build_sdk_client_spy(captured)
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )

    rc = run_cli(
        [
            "workflow",
            "run",
            "--workflow-id",
            "wf-123",
            "--dry-run",
        ],
    )
    payload = json.loads(capsys.readouterr().out)

    assert rc == 0
    assert captured["resource"] == "workflows"
    assert captured["resource_method"] == "run"
    assert captured["kwargs"]["input_data"] == {}
    assert payload["operation_id"] == WORKFLOW_OPERATION_IDS["run_anonymous"]


def test_workflow_run_input_file_uploads_and_injects_reference(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    captured: dict[str, object] = {}
    uploaded_requests: list[dict[str, Any]] = []
    workflow_runs: list[dict[str, Any]] = []

    def _handle_input_create(payload: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        uploaded_requests.append({"payload": payload, "kwargs": kwargs})
        return {
            "status": 200,
            "body": {
                "session_id": "sess-1",
                "upload_url": "https://uploads.example/sess-1",
                "output_url": "https://cdn.example/file-1",
            },
        }

    def _handle_workflow_run(**kwargs: Any) -> dict[str, Any]:
        workflow_runs.append(kwargs)
        return {"status": 200, "body": {"workflow_run_id": "run-1"}}

    fake_sdk = _build_sdk_client_spy(
        captured,
        handlers={
            ("uploads", "input_create"): _handle_input_create,
            ("workflows", "run"): _handle_workflow_run,
        },
    )
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )
    monkeypatch.setattr(
        main_module,
        "_put_file_to_upload_url",
        lambda **kwargs: (0, {"status": 200, "file": str(kwargs["file_path"])}),
    )

    attachment = tmp_path / "brief.txt"
    attachment.write_text("hello", encoding="utf-8")

    rc = run_cli(
        [
            "workflow",
            "run",
            "--workflow-id",
            "wf-123",
            "--input",
            '{"topic":"agenticflow"}',
            "--input-file",
            f"document=@{attachment}",
        ],
    )
    payload = json.loads(capsys.readouterr().out)

    assert rc == 0
    assert uploaded_requests
    assert uploaded_requests[0]["payload"]["resource_type"] == "workflow"
    assert uploaded_requests[0]["payload"]["resource_id"] == "wf-123"
    assert workflow_runs
    assert workflow_runs[0]["input_data"]["topic"] == "agenticflow"
    assert workflow_runs[0]["input_data"]["document"] == "https://cdn.example/file-1"
    assert payload["uploaded_inputs"][0]["input_key"] == "document"
    assert payload["uploaded_inputs"][0]["upload_put"]["status"] == 200


def test_workflow_run_input_file_queries_status_when_reference_missing_in_create(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    captured: dict[str, object] = {}
    uploaded_requests: list[dict[str, Any]] = []
    upload_status_calls: list[dict[str, Any]] = []
    workflow_runs: list[dict[str, Any]] = []

    def _handle_input_create(payload: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        uploaded_requests.append({"payload": payload, "kwargs": kwargs})
        return {
            "status": 200,
            "body": {
                "session_id": "sess-1",
                "upload_url": "https://uploads.example/sess-1",
            },
        }

    def _handle_input_status(**kwargs: Any) -> dict[str, Any]:
        upload_status_calls.append(kwargs)
        return {
            "status": 200,
            "body": {
                "session_id": "sess-1",
                "status": "completed",
                "download_url": "https://cdn.example/file-from-status",
            },
        }

    def _handle_workflow_run(**kwargs: Any) -> dict[str, Any]:
        workflow_runs.append(kwargs)
        return {"status": 200, "body": {"workflow_run_id": "run-1"}}

    fake_sdk = _build_sdk_client_spy(
        captured,
        handlers={
            ("uploads", "input_create"): _handle_input_create,
            ("uploads", "input_status"): _handle_input_status,
            ("workflows", "run"): _handle_workflow_run,
        },
    )
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )
    monkeypatch.setattr(
        main_module,
        "_put_file_to_upload_url",
        lambda **kwargs: (0, {"status": 200, "file": str(kwargs["file_path"])}),
    )

    attachment = tmp_path / "brief.txt"
    attachment.write_text("hello", encoding="utf-8")

    rc = run_cli(
        [
            "workflow",
            "run",
            "--workflow-id",
            "wf-123",
            "--input",
            '{"topic":"agenticflow"}',
            "--input-file",
            f"document=@{attachment}",
        ],
    )
    payload = json.loads(capsys.readouterr().out)

    assert rc == 0
    assert uploaded_requests
    assert upload_status_calls
    assert upload_status_calls[0]["session_id"] == "sess-1"
    assert workflow_runs
    assert workflow_runs[0]["input_data"]["topic"] == "agenticflow"
    assert workflow_runs[0]["input_data"]["document"] == "https://cdn.example/file-from-status"
    assert payload["uploaded_inputs"][0]["upload_status"]["body"]["status"] == "completed"


def test_workflow_run_input_file_accepts_output_url_from_status_payload(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    captured: dict[str, object] = {}
    workflow_runs: list[dict[str, Any]] = []
    upload_status_calls: list[dict[str, Any]] = []

    def _handle_input_create(payload: dict[str, Any], **kwargs: Any) -> dict[str, Any]:
        return {
            "status": 200,
            "body": {
                "session_id": "sess-2",
                "upload_url": "https://uploads.example/sess-2",
            },
        }

    def _handle_input_status(**kwargs: Any) -> dict[str, Any]:
        upload_status_calls.append(kwargs)
        return {
            "status": 200,
            "body": {
                "session_id": "sess-2",
                "status": "completed",
                "output_url": "https://cdn.example/status-output-file-2",
            },
        }

    def _handle_workflow_run(**kwargs: Any) -> dict[str, Any]:
        workflow_runs.append(kwargs)
        return {"status": 200, "body": {"workflow_run_id": "run-2"}}

    fake_sdk = _build_sdk_client_spy(
        captured,
        handlers={
            ("uploads", "input_create"): _handle_input_create,
            ("uploads", "input_status"): _handle_input_status,
            ("workflows", "run"): _handle_workflow_run,
        },
    )
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )
    monkeypatch.setattr(
        main_module,
        "_put_file_to_upload_url",
        lambda **kwargs: (0, {"status": 200, "file": str(kwargs["file_path"])}),
    )

    attachment = tmp_path / "brief.txt"
    attachment.write_text("hello", encoding="utf-8")

    rc = run_cli(
        [
            "workflow",
            "run",
            "--workflow-id",
            "wf-123",
            "--input-file",
            f"document=@{attachment}",
        ],
    )
    payload = json.loads(capsys.readouterr().out)

    assert rc == 0
    assert upload_status_calls
    assert upload_status_calls[0]["session_id"] == "sess-2"
    assert workflow_runs
    assert workflow_runs[0]["input_data"]["document"] == "https://cdn.example/status-output-file-2"
    assert payload["uploaded_inputs"][0]["upload_status"]["body"]["output_url"] == "https://cdn.example/status-output-file-2"


def test_workflow_create_routes_to_expected_operation(monkeypatch, capsys) -> None:
    captured: dict[str, object] = {}

    fake_sdk = _build_sdk_client_spy(captured)
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )

    rc = run_cli(
        [
            "workflow",
            "create",
            "--workspace-id",
            "ws-1",
            "--body",
            "{}",
            "--dry-run",
        ],
    )
    payload = json.loads(capsys.readouterr().out)

    assert rc == 0
    assert captured["resource"] == "workflows"
    assert captured["resource_method"] == "create"
    assert payload["operation_id"] == WORKFLOW_OPERATION_IDS["create"]
    assert captured["kwargs"] == {
        "workspace_id": "ws-1",
        "payload": {},
        "dry_run": True,
    }
    assert payload["status"] == 200


def test_workflow_update_routes_to_expected_operation(monkeypatch, capsys) -> None:
    captured: dict[str, object] = {}

    fake_sdk = _build_sdk_client_spy(captured)
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )

    rc = run_cli(
        [
            "workflow",
            "update",
            "--workspace-id",
            "ws-1",
            "--workflow-id",
            "wf-1",
            "--body",
            "{}",
            "--dry-run",
        ],
    )
    out = capsys.readouterr().out

    assert rc == 0
    assert captured["resource"] == "workflows"
    assert captured["resource_method"] == "update"
    assert json.loads(out)["operation_id"] == WORKFLOW_OPERATION_IDS["update"]
    assert captured["kwargs"] == {
        "workspace_id": "ws-1",
        "workflow_id": "wf-1",
        "payload": {},
        "dry_run": True,
    }


def test_workflow_list_routes_to_expected_operation(monkeypatch, capsys) -> None:
    captured: dict[str, object] = {}

    fake_sdk = _build_sdk_client_spy(captured)
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )

    rc = run_cli(
        [
            "workflow",
            "list",
            "--workspace-id",
            "ws-1",
            "--project-id",
            "project-1",
            "--limit",
            "5",
            "--offset",
            "2",
            "--dry-run",
        ],
    )
    out = capsys.readouterr().out

    assert rc == 0
    assert captured["resource"] == "workflows"
    assert captured["resource_method"] == "list"
    assert json.loads(out)["operation_id"] == WORKFLOW_OPERATION_IDS["list"]
    assert captured["kwargs"] == {
        "workspace_id": "ws-1",
        "project_id": "project-1",
        "limit": 5,
        "offset": 2,
        "dry_run": True,
    }


def test_agent_stream_routes_to_expected_operation(monkeypatch, capsys) -> None:
    captured: dict[str, object] = {}

    fake_sdk = _build_sdk_client_spy(captured)
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )

    rc = run_cli(
        [
            "agent",
            "stream",
            "--agent-id",
            "agent-1",
            "--body",
            '{"messages":[{"role":"user","content":"hello"}]}',
            "--dry-run",
        ],
    )
    out = capsys.readouterr().out

    assert rc == 0
    assert captured["resource"] == "agents"
    assert captured["resource_method"] == "stream"
    assert json.loads(out)["operation_id"] == AGENT_OPERATION_IDS["stream_anonymous"]
    assert captured["kwargs"] == {
        "agent_id": "agent-1",
        "payload": {"messages": [{"role": "user", "content": "hello"}]},
        "authenticated": False,
        "dry_run": True,
    }


def test_agent_list_routes_to_expected_operation(monkeypatch, capsys) -> None:
    captured: dict[str, object] = {}

    fake_sdk = _build_sdk_client_spy(captured)
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )

    rc = run_cli(
        [
            "agent",
            "list",
            "--workspace-id",
            "ws-1",
            "--project-id",
            "project-1",
            "--limit",
            "10",
            "--offset",
            "4",
            "--dry-run",
        ],
    )
    out = capsys.readouterr().out

    assert rc == 0
    assert captured["resource"] == "agents"
    assert captured["resource_method"] == "list"
    assert json.loads(out)["operation_id"] == AGENT_OPERATION_IDS["list"]
    assert captured["kwargs"] == {
        "workspace_id": "ws-1",
        "project_id": "project-1",
        "limit": 10,
        "offset": 4,
        "dry_run": True,
    }


def test_agent_upload_file_executes_session_put_and_status(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    captured: dict[str, object] = {}
    upload_status_calls: list[dict[str, Any]] = []

    def _handle_upload_file(*args: Any, **kwargs: Any) -> dict[str, Any]:
        return {
            "status": 200,
            "body": {
                "session_id": "sess-agent-1",
                "upload_url": "https://uploads.example/sess-agent-1",
            },
        }

    def _handle_upload_status(*args: Any, **kwargs: Any) -> dict[str, Any]:
        upload_status_calls.append(kwargs)
        return {
            "status": 200,
            "body": {
                "session_id": "sess-agent-1",
                "status": "completed",
                "download_url": "https://cdn.example/agent-file",
            },
        }

    fake_sdk = _build_sdk_client_spy(
        captured,
        handlers={
            ("agents", "upload_file"): _handle_upload_file,
            ("agents", "upload_status"): _handle_upload_status,
        },
    )
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )
    monkeypatch.setattr(
        main_module,
        "_put_file_to_upload_url",
        lambda **kwargs: (0, {"status": 200, "file": str(kwargs["file_path"])}),
    )

    image_path = tmp_path / "avatar.png"
    image_path.write_bytes(b"not-a-real-png")

    rc = run_cli(
        [
            "agent",
            "upload-file",
            "--agent-id",
            "agent-1",
            "--file",
            str(image_path),
        ],
    )
    payload = json.loads(capsys.readouterr().out)

    assert rc == 0
    assert payload["operation_id"] == AGENT_OPERATION_IDS["upload_file"]
    assert payload["upload_put"]["status"] == 200
    assert payload["upload_status"]["operation_id"] == AGENT_OPERATION_IDS["upload_status"]
    assert upload_status_calls
    assert upload_status_calls[0]["session_id"] == "sess-agent-1"


def test_uploads_input_create_routes_to_expected_operation(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    captured: dict[str, object] = {}
    fake_sdk = _build_sdk_client_spy(captured)
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )

    attachment = tmp_path / "input.txt"
    attachment.write_text("demo", encoding="utf-8")

    rc = run_cli(
        [
            "uploads",
            "input-create",
            "--resource-type",
            "workflow",
            "--resource-id",
            "wf-1",
            "--file",
            str(attachment),
            "--dry-run",
        ],
    )
    payload = json.loads(capsys.readouterr().out)

    assert rc == 0
    assert captured["resource"] == "uploads"
    assert captured["resource_method"] == "input_create"
    kwargs = captured["kwargs"]
    assert kwargs["dry_run"] is True
    assert kwargs["payload"]["resource_type"] == "workflow"
    assert kwargs["payload"]["resource_id"] == "wf-1"
    assert kwargs["payload"]["name"] == "input.txt"
    assert payload["operation_id"] == UPLOAD_OPERATION_IDS["input_create"]


def test_uploads_status_routes_to_agent_or_generic_status(monkeypatch, capsys) -> None:
    captured: dict[str, object] = {}
    fake_sdk = _build_sdk_client_spy(captured)
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )

    rc_agent = run_cli(
        [
            "uploads",
            "status",
            "--session-id",
            "session-1",
            "--agent-id",
            "agent-1",
            "--dry-run",
        ],
    )
    payload_agent = json.loads(capsys.readouterr().out)
    assert rc_agent == 0
    assert captured["resource"] == "agents"
    assert captured["resource_method"] == "upload_status"
    assert payload_agent["operation_id"] == AGENT_OPERATION_IDS["upload_status"]

    rc_generic = run_cli(
        [
            "uploads",
            "status",
            "--session-id",
            "session-2",
            "--dry-run",
        ],
    )
    payload_generic = json.loads(capsys.readouterr().out)
    assert rc_generic == 0
    assert captured["resource"] == "uploads"
    assert captured["resource_method"] == "input_status"
    assert payload_generic["operation_id"] == UPLOAD_OPERATION_IDS["input_status"]


def test_uploads_put_routes_through_put_helper(tmp_path: Path, monkeypatch, capsys) -> None:
    captured: dict[str, Any] = {}

    def _fake_put(**kwargs: Any) -> tuple[int, dict[str, Any]]:
        captured.update(kwargs)
        return 0, {"status": 200, "ok": True, "file": str(kwargs["file_path"])}

    monkeypatch.setattr(main_module, "_put_file_to_upload_url", _fake_put)

    attachment = tmp_path / "upload.bin"
    attachment.write_bytes(b"\x01\x02\x03")

    rc = run_cli(
        [
            "uploads",
            "put",
            "--upload-url",
            "https://uploads.example/sess-2",
            "--file",
            str(attachment),
            "--content-type",
            "application/octet-stream",
            "--header",
            "x-amz-acl=private",
            "--dry-run",
        ],
    )
    payload = json.loads(capsys.readouterr().out)

    assert rc == 0
    assert payload["status"] == 200
    assert captured["upload_url"] == "https://uploads.example/sess-2"
    assert captured["dry_run"] is True
    assert captured["headers"]["x-amz-acl"] == "private"
    assert str(captured["file_path"]).endswith("upload.bin")


@pytest.mark.parametrize(
    ("command_args", "authenticated_operation_id", "anonymous_operation_id"),
    [
        (
            ["workflow", "get", "--workflow-id", "wf-1", "--dry-run"],
            WORKFLOW_OPERATION_IDS["get_authenticated"],
            WORKFLOW_OPERATION_IDS["get_anonymous"],
        ),
        (
            ["workflow", "run", "--workflow-id", "wf-1", "--input", "{}", "--dry-run"],
            WORKFLOW_OPERATION_IDS["run_authenticated"],
            WORKFLOW_OPERATION_IDS["run_anonymous"],
        ),
        (
            ["workflow", "run-status", "--workflow-run-id", "run-1", "--dry-run"],
            WORKFLOW_OPERATION_IDS["run_status_authenticated"],
            WORKFLOW_OPERATION_IDS["run_status_anonymous"],
        ),
        (
            ["workflow", "validate", "--body", "{}", "--dry-run"],
            WORKFLOW_OPERATION_IDS["validate"],
            None,
        ),
        (
            [
                "workflow",
                "list",
                "--workspace-id",
                "ws-1",
                "--project-id",
                "project-1",
                "--dry-run",
            ],
            WORKFLOW_OPERATION_IDS["list"],
            None,
        ),
        (["agent", "get", "--agent-id", "agent-1", "--dry-run"], AGENT_OPERATION_IDS["get_authenticated"], AGENT_OPERATION_IDS["get_anonymous"]),
        (["agent", "stream", "--agent-id", "agent-1", "--body", '{"messages":[]}', "--dry-run"], AGENT_OPERATION_IDS["stream_authenticated"], AGENT_OPERATION_IDS["stream_anonymous"]),
        (
            [
                "agent",
                "list",
                "--workspace-id",
                "ws-1",
                "--project-id",
                "project-1",
                "--dry-run",
            ],
            AGENT_OPERATION_IDS["list"],
            None,
        ),
    ],
)
def test_workflow_and_agent_commands_resolve_snapshot_operation_ids(
    capsys,
    command_args: list[str],
    authenticated_operation_id: str,
    anonymous_operation_id: str,
    monkeypatch,
) -> None:
    captured: dict[str, object] = {}
    fake_sdk = _build_sdk_client_spy(captured)
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )
    monkeypatch.delenv("AGENTICFLOW_PUBLIC_API_KEY", raising=False)
    monkeypatch.setattr(main_module, "_load_profile_value", lambda *args, **kwargs: None)
    monkeypatch.setattr(main_module, "_resolve_token_from_args", lambda *_: None)
    rc = run_cli(["--spec-file", str(default_spec_path()), *command_args])
    out = capsys.readouterr().out

    assert rc == 0
    payload = json.loads(out)
    expected_operation_id = _resolve_preferred_operation_id(
        authenticated_operation_id=authenticated_operation_id,
        anonymous_operation_id=anonymous_operation_id,
        token=None,
    )
    assert payload["operation_id"] == expected_operation_id


@pytest.mark.parametrize(
    ("command_args", "authenticated_operation_id", "anonymous_operation_id"),
    [
        (
            ["workflow", "get", "--workflow-id", "wf-1", "--dry-run"],
            WORKFLOW_OPERATION_IDS["get_authenticated"],
            WORKFLOW_OPERATION_IDS["get_anonymous"],
        ),
        (
            ["workflow", "run", "--workflow-id", "wf-1", "--input", "{}", "--dry-run"],
            WORKFLOW_OPERATION_IDS["run_authenticated"],
            WORKFLOW_OPERATION_IDS["run_anonymous"],
        ),
        (
            ["workflow", "run-status", "--workflow-run-id", "run-1", "--dry-run"],
            WORKFLOW_OPERATION_IDS["run_status_authenticated"],
            WORKFLOW_OPERATION_IDS["run_status_anonymous"],
        ),
        (
            [
                "workflow",
                "list",
                "--workspace-id",
                "ws-1",
                "--project-id",
                "project-1",
                "--dry-run",
            ],
            WORKFLOW_OPERATION_IDS["list"],
            None,
        ),
        (
            ["agent", "get", "--agent-id", "agent-1", "--dry-run"],
            AGENT_OPERATION_IDS["get_authenticated"],
            AGENT_OPERATION_IDS["get_anonymous"],
        ),
        (
            ["agent", "stream", "--agent-id", "agent-1", "--body", '{"messages":[]}', "--dry-run"],
            AGENT_OPERATION_IDS["stream_authenticated"],
            AGENT_OPERATION_IDS["stream_anonymous"],
        ),
        (
            [
                "agent",
                "list",
                "--workspace-id",
                "ws-1",
                "--project-id",
                "project-1",
                "--dry-run",
            ],
            AGENT_OPERATION_IDS["list"],
            None,
        ),
    ],
)
def test_workflow_and_agent_commands_prefer_authenticated_operation_ids_when_api_key_present(
    capsys,
    command_args: list[str],
    authenticated_operation_id: str,
    anonymous_operation_id: str,
    monkeypatch,
) -> None:
    monkeypatch.setenv("AGENTICFLOW_PUBLIC_API_KEY", "secure-token")
    rc = run_cli(["--spec-file", str(default_spec_path()), *command_args])
    out = capsys.readouterr().out

    assert rc == 0
    payload = json.loads(out)
    expected_operation_id = _resolve_preferred_operation_id(
        authenticated_operation_id=authenticated_operation_id,
        anonymous_operation_id=anonymous_operation_id,
        token="secure-token",
    )
    assert payload["operation_id"] == expected_operation_id


def test_node_types_search_filters_results(capsys, monkeypatch) -> None:
    captured: dict[str, object] = {}
    fake_sdk = _build_sdk_client_spy(
        captured,
        handlers={
            ("node_types", "search"): lambda query, **kwargs: {
                "status": 200,
                "count": 1,
                "body": [
                    {"name": "LLM Chat", "description": "Model inference"},
                ]
                if query == "llm"
                else [],
            },
        },
    )
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )

    rc = run_cli(
        [
            "node-types",
            "search",
            "--query",
            "llm",
            "--dry-run",
        ],
    )
    out = capsys.readouterr().out
    payload = json.loads(out)

    assert rc == 0
    assert captured["resource"] == "node_types"
    assert captured["resource_method"] == "search"
    assert captured["kwargs"] == {"query": "llm", "dry_run": True}
    assert payload["operation_id"] == NODE_TYPE_OPERATION_IDS["list"]
    assert payload["count"] == 1
    assert payload["body"] == [{"name": "LLM Chat", "description": "Model inference"}]


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
            "--project-id",
            "proj-1",
            "--input-config",
            "{bad-json}",
            "--dry-run",
        ],
    )
    err = capsys.readouterr().err

    assert rc == 1
    assert "Invalid --input-config" in err


def test_connections_list_routes_to_expected_operation(monkeypatch, capsys) -> None:
    captured: dict[str, object] = {}
    fake_sdk = _build_sdk_client_spy(captured)
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )

    rc = run_cli(
        [
            "connections",
            "list",
            "--workspace-id",
            "ws-001",
            "--project-id",
            "proj-001",
            "--limit",
            "25",
            "--offset",
            "5",
            "--dry-run",
        ],
    )
    out = capsys.readouterr().out
    payload = json.loads(out)

    assert rc == 0
    assert captured["resource"] == "connections"
    assert captured["resource_method"] == "list"
    assert payload["operation_id"] == CONNECTION_OPERATION_IDS["list"]
    assert captured["kwargs"] == {
        "workspace_id": "ws-001",
        "project_id": "proj-001",
        "limit": 25,
        "offset": 5,
        "dry_run": True,
    }
    assert payload["status"] == 200


def test_connections_categories_requires_jwt_when_using_api_key_auth(
    monkeypatch, capsys
) -> None:
    captured: dict[str, object] = {}
    fake_sdk = _build_sdk_client_spy(captured)
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )
    monkeypatch.setenv("AGENTICFLOW_PUBLIC_API_KEY", "a9w_fake_api_key")

    rc = run_cli(
        [
            "connections",
            "categories",
            "--workspace-id",
            "ws-001",
            "--dry-run",
        ],
    )
    out = capsys.readouterr()

    assert rc == 1
    assert "requires a user JWT bearer token" in out.err
    assert "resource" not in captured


def test_connections_categories_routes_when_jwt_is_present(
    monkeypatch, capsys
) -> None:
    captured: dict[str, object] = {}
    fake_sdk = _build_sdk_client_spy(captured)
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )
    monkeypatch.setenv("AGENTICFLOW_PUBLIC_API_KEY", "header.payload.signature")

    rc = run_cli(
        [
            "connections",
            "categories",
            "--workspace-id",
            "ws-001",
            "--limit",
            "10",
            "--offset",
            "2",
            "--dry-run",
        ],
    )
    out = capsys.readouterr().out
    payload = json.loads(out)

    assert rc == 0
    assert captured["resource"] == "connections"
    assert captured["resource_method"] == "categories"
    assert payload["operation_id"] == CONNECTION_OPERATION_IDS["categories"]
    assert captured["kwargs"] == {
        "workspace_id": "ws-001",
        "limit": 10,
        "offset": 2,
        "dry_run": True,
    }


def test_main_hardcoded_operation_ids_exist_in_snapshot() -> None:
    missing_ids = sorted(_hardcoded_main_operation_ids() - _snapshot_operation_ids())
    assert not missing_ids, f"Missing hardcoded operation IDs in openapi snapshot: {missing_ids}"


def test_node_types_list_routes_to_expected_operation(monkeypatch, capsys) -> None:
    captured: dict[str, object] = {}
    fake_sdk = _build_sdk_client_spy(captured)
    monkeypatch.setattr(
        main_module,
        "_build_sdk_client",
        lambda *_: fake_sdk,  # noqa: ARG005
    )

    rc = run_cli(
        [
            "node-types",
            "list",
            "--dry-run",
        ],
    )
    out = capsys.readouterr().out
    payload = json.loads(out)

    assert rc == 0
    assert captured["resource"] == "node_types"
    assert captured["resource_method"] == "list"
    assert payload["operation_id"] == NODE_TYPE_OPERATION_IDS["list"]
    assert payload["status"] == 200


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
