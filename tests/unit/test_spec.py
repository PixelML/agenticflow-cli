import json
from pathlib import Path

from agenticflow_cli.spec import OperationRegistry, default_spec_path, load_openapi_spec


def _sample_spec() -> dict:
    return {
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
                "parameters": [
                    {"name": "item_id", "in": "path", "required": True},
                ],
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


def _bundled_openapi_path() -> Path:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "openapi.json"
        if candidate.exists():
            return candidate
    raise AssertionError("openapi.json is not available in repo root")


def test_registry_indexes_operation_id_and_method_path() -> None:
    registry = OperationRegistry.from_spec(_sample_spec())
    op = registry.get_operation_by_id("health_check")

    assert op is not None
    assert op.method == "GET"
    assert registry.get_operation_by_method_path("GET", "/v1/health") == op


def test_registry_lookup_is_tolerant_to_trailing_slash() -> None:
    spec = {
        "openapi": "3.1.0",
        "paths": {
            "/v1/workflow_templates/": {
                "get": {
                    "operationId": "list_workflow_templates",
                    "responses": {"200": {"description": "ok"}},
                },
            }
        },
    }
    registry = OperationRegistry.from_spec(spec)
    trailing_path_operation = registry.get_operation_by_method_path(
        "GET", "/v1/workflow_templates/"
    )
    assert trailing_path_operation is not None
    assert trailing_path_operation.path == "/v1/workflow_templates/"
    assert (
        registry.get_operation_by_method_path("GET", "/v1/workflow_templates")
        == trailing_path_operation
    )


def test_registry_lookup_is_tolerant_to_missing_leading_slash_and_method_case() -> None:
    spec = {
        "openapi": "3.1.0",
        "paths": {
            "/v1/workflow_templates": {
                "get": {
                    "operationId": "list_workflow_templates",
                    "responses": {"200": {"description": "ok"}},
                },
            }
        },
    }
    registry = OperationRegistry.from_spec(spec)

    operation = registry.get_operation_by_method_path("get", "v1/workflow_templates")
    assert operation is not None
    assert operation.operation_id == "list_workflow_templates"


def test_get_operation_by_id_returns_none_for_unknown() -> None:
    registry = OperationRegistry.from_spec(_sample_spec())
    assert registry.get_operation_by_id("missing_operation") is None


def test_public_filter_excludes_admin_and_secured_operations() -> None:
    registry = OperationRegistry.from_spec(_sample_spec())

    public_ops = registry.list_operations(public_only=True)
    public_ids = {op.operation_id for op in public_ops}

    assert "health_check" in public_ids
    assert "get_item" not in public_ids
    assert "admin_items" not in public_ids


def test_load_openapi_spec_from_disk(tmp_path: Path) -> None:
    spec_path = tmp_path / "openapi.json"
    spec_path.write_text(json.dumps(_sample_spec()))

    loaded = load_openapi_spec(spec_path)
    registry = OperationRegistry.from_spec(loaded)

    assert len(registry.list_operations()) == 3


def test_public_operation_snapshot_matches_bundled_spec() -> None:
    snapshot_path = _bundled_openapi_path()
    snapshot_spec = load_openapi_spec(snapshot_path)
    snapshot_public = OperationRegistry.from_spec(snapshot_spec).list_operations(
        public_only=True
    )

    assert len(snapshot_public) > 0

    spec_path = default_spec_path()
    assert spec_path.exists()

    registry = OperationRegistry.from_spec(load_openapi_spec(spec_path))
    public_ops = registry.list_operations(public_only=True)

    assert len(public_ops) == len(snapshot_public)
