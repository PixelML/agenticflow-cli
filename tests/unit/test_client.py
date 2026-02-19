import json
from pathlib import Path

import pytest

from agenticflow_cli.client import (
    build_request_spec,
    load_json_payload,
    parse_key_value_pairs,
    resolve_bearer_token,
)
from agenticflow_cli.spec import Operation


def _sample_operation() -> Operation:
    return Operation(
        operation_id="get_item",
        method="GET",
        path="/v1/items/{item_id}",
        tags=("items",),
        security=(),
        parameters=(
            {"name": "item_id", "in": "path", "required": True},
            {"name": "limit", "in": "query", "required": False},
        ),
        request_body=None,
        summary=None,
        description=None,
        raw={},
    )


def _sample_post_operation() -> Operation:
    return Operation(
        operation_id="create_item",
        method="POST",
        path="/v1/workspaces/{workspace_id}/items/{item_id}",
        tags=("items",),
        security=(),
        parameters=(
            {"name": "workspace_id", "in": "path", "required": True},
            {"name": "item_id", "in": "path", "required": True},
            {"name": "dryRun", "in": "query", "required": False},
        ),
        request_body={
            "description": "Item payload",
            "required": True,
            "content": {"application/json": {"schema": {"type": "object"}}},
        },
        summary=None,
        description=None,
        raw={},
    )


def test_parse_key_value_pairs_parses_equals_syntax() -> None:
    parsed = parse_key_value_pairs(["a=1", "name=test"])
    assert parsed == {"a": "1", "name": "test"}


def test_parse_key_value_pairs_preserves_equals_in_value() -> None:
    parsed = parse_key_value_pairs(["payload=a=b=c", "note=first=second"])
    assert parsed["payload"] == "a=b=c"
    assert parsed["note"] == "first=second"


def test_parse_key_value_pairs_rejects_invalid_input() -> None:
    with pytest.raises(ValueError):
        parse_key_value_pairs(["bad"])


def test_load_json_payload_from_inline_and_file(tmp_path: Path) -> None:
    inline = load_json_payload('{"a": 1}')
    assert inline == {"a": 1}

    body_file = tmp_path / "payload.json"
    body_file.write_text(json.dumps({"b": 2}))
    from_file = load_json_payload(f"@{body_file}")
    assert from_file == {"b": 2}


def test_load_json_payload_rejects_invalid_json() -> None:
    with pytest.raises(ValueError, match="Invalid JSON payload"):
        load_json_payload("{not-json}")


def test_resolve_bearer_token_prefers_explicit_token() -> None:
    token = resolve_bearer_token("explicit-token", {"AGENTICFLOW_PUBLIC_API_KEY": "env-token"})
    assert token == "explicit-token"


def test_resolve_bearer_token_falls_back_to_environment() -> None:
    token = resolve_bearer_token(None, {"AGENTICFLOW_PUBLIC_API_KEY": "env-token"})
    assert token == "env-token"


def test_resolve_bearer_token_returns_none_when_unresolved() -> None:
    assert resolve_bearer_token(None, {}) is None


def test_build_request_spec_formats_url_and_injects_auth() -> None:
    req = build_request_spec(
        operation=_sample_operation(),
        base_url="https://api.agenticflow.ai/",
        path_params={"item_id": "abc123"},
        query_params={"limit": "10"},
        extra_headers={"x-test": "1"},
        token="tok-123",
    )

    assert req.method == "GET"
    assert req.url == "https://api.agenticflow.ai/v1/items/abc123"
    assert req.params == {"limit": "10"}
    assert req.headers["Authorization"] == "Bearer tok-123"
    assert req.headers["x-test"] == "1"


def test_build_request_spec_normalizes_base_url_and_skips_auth_without_token() -> None:
    req = build_request_spec(
        operation=_sample_post_operation(),
        base_url="https://api.agenticflow.ai",
        path_params={"workspace_id": "ws-1", "item_id": "item-1"},
        query_params={"dryRun": "true"},
        extra_headers={"x-test": "1"},
        token=None,
    )

    assert req.url == "https://api.agenticflow.ai/v1/workspaces/ws-1/items/item-1"
    assert req.params == {"dryRun": "true"}
    assert req.headers["x-test"] == "1"
    assert "Authorization" not in req.headers


def test_build_request_spec_adds_json_content_type_for_body() -> None:
    req = build_request_spec(
        operation=_sample_post_operation(),
        base_url="https://api.agenticflow.ai",
        path_params={"workspace_id": "ws 01", "item_id": "item/1"},
        query_params={},
        extra_headers={},
        token=None,
        body={"a": 1, "b": 2},
    )

    assert req.body == {"a": 1, "b": 2}
    assert req.json == {"a": 1, "b": 2}
    assert req.headers["Content-Type"] == "application/json"


def test_build_request_spec_preserves_content_type_header() -> None:
    req = build_request_spec(
        operation=_sample_post_operation(),
        base_url="https://api.agenticflow.ai",
        path_params={"workspace_id": "ws-1", "item_id": "item-1"},
        query_params={},
        extra_headers={"Content-Type": "text/plain"},
        token=None,
        body="payload",
    )

    assert req.headers["Content-Type"] == "text/plain"


def test_build_request_spec_encodes_path_parameters() -> None:
    req = build_request_spec(
        operation=_sample_operation(),
        base_url="https://api.agenticflow.ai/",
        path_params={"item_id": "a b/c"},
        query_params={},
        extra_headers={},
        token=None,
    )

    assert req.url == "https://api.agenticflow.ai/v1/items/a%20b%2Fc"


def test_build_request_spec_rejects_missing_path_params() -> None:
    with pytest.raises(ValueError):
        build_request_spec(
            operation=_sample_operation(),
            base_url="https://api.agenticflow.ai/",
            path_params={},
            query_params={},
            extra_headers={},
            token=None,
        )
