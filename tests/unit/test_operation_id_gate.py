from __future__ import annotations

import json
from pathlib import Path

from agenticflow_cli import operation_id_gate as gate


def _write_openapi_fixture(path: Path) -> None:
    path.write_text(
        json.dumps(
            {
                "openapi": "3.1.0",
                "paths": {
                    "/v1/health": {
                        "get": {
                            "operationId": "health_check",
                            "responses": {"200": {"description": "ok"}},
                        },
                    },
                    "/v1/workflows": {
                        "post": {
                            "operationId": "create_workflow_model_v1_workspaces__workspace_id__workflows_post",
                            "responses": {"200": {"description": "ok"}},
                        },
                    },
                },
            }
        )
    )


def _write_manifest_fixture(path: Path) -> None:
    path.write_text(
        json.dumps(
            [
                {
                    "operation_id": "health_check",
                    "method": "GET",
                    "path": "/v1/health",
                    "tags": [],
                    "security_len": 0,
                },
                {
                    "operation_id": "create_workflow_model_v1_workspaces__workspace_id__workflows_post",
                    "method": "POST",
                    "path": "/v1/workflows",
                    "tags": [],
                    "security_len": 0,
                },
            ]
        )
    )


def test_check_fails_with_stale_hardcoded_mapping(tmp_path: Path) -> None:
    spec_file = tmp_path / "openapi.json"
    manifest_file = tmp_path / "public_ops_manifest.json"
    _write_openapi_fixture(spec_file)
    _write_manifest_fixture(manifest_file)

    custom_mappings = {"cli.workflow.run": "missing_workflow_operation_id"}
    stale_mappings, stale_manifest = gate.find_operation_id_issues(
        spec_file=spec_file,
        manifest_file=manifest_file,
        mapped_operation_ids=custom_mappings,
    )

    assert stale_mappings == [("cli.workflow.run", "missing_workflow_operation_id")]
    assert stale_manifest == []
    assert (
        gate.check_operation_id_mappings(
            spec_file=spec_file,
            manifest_file=manifest_file,
            mapped_operation_ids=custom_mappings,
        )
        == 1
    )


def test_check_fails_with_stale_manifest_entry(tmp_path: Path) -> None:
    spec_file = tmp_path / "openapi.json"
    manifest_file = tmp_path / "public_ops_manifest.json"
    _write_openapi_fixture(spec_file)
    manifest_file.write_text(
        json.dumps(
            [
                {
                    "operation_id": "health_check",
                    "method": "GET",
                    "path": "/v1/health",
                    "tags": [],
                    "security_len": 0,
                },
                {
                    "operation_id": "stale_manifest_operation_id",
                    "method": "GET",
                    "path": "/v1/stale",
                    "tags": [],
                    "security_len": 0,
                },
            ]
        )
    )

    stale_mappings, stale_manifest = gate.find_operation_id_issues(
        spec_file=spec_file,
        manifest_file=manifest_file,
        mapped_operation_ids={},
    )

    assert stale_mappings == []
    assert stale_manifest == ["stale_manifest_operation_id"]
    assert (
        gate.check_operation_id_mappings(
            spec_file=spec_file,
            manifest_file=manifest_file,
            mapped_operation_ids={},
        )
        == 1
    )
