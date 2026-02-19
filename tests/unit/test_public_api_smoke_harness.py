"""Unit tests for smoke-harness helpers."""

from __future__ import annotations

from pathlib import Path

from scripts.public_api_smoke_harness import (
    _build_url,
    _coerce_query,
    _extract_project_ids_from_templates,
    _invalid_project_id,
    _load_env_file,
    _normalize_base_url,
)


def test_load_env_file_parses_exports_and_inline_comments(tmp_path: Path) -> None:
    env_file = tmp_path / "env"
    env_file.write_text(
        "\n".join(
            [
                "# comment",
                "export AGENTICFLOW_PUBLIC_API_KEY=alpha",
                "NEXT_PUBLIC_BASE_API_URL=https://api.example.com/  # trailing comment",
                "OTHER=ignored",
            ]
        )
    )

    parsed = _load_env_file(env_file)

    assert parsed["AGENTICFLOW_PUBLIC_API_KEY"] == "alpha"
    assert parsed["NEXT_PUBLIC_BASE_API_URL"] == "https://api.example.com/"


def test_normalize_base_url_always_ends_with_single_slash() -> None:
    assert _normalize_base_url("https://api.agenticflow.ai") == "https://api.agenticflow.ai/"
    assert _normalize_base_url("https://api.agenticflow.ai/") == "https://api.agenticflow.ai/"


def test_coerce_query_formats_none_and_params() -> None:
    assert _coerce_query(None) == ""
    assert _coerce_query({"a": "1"}) == "?a=1"


def test_build_url_adds_query_and_normalizes_path() -> None:
    assert (
        _build_url("https://api.agenticflow.ai", "/v1/health", {"a": "1", "b": "2"})
        == "https://api.agenticflow.ai/v1/health?a=1&b=2"
    )


def test_extract_project_ids_from_template_payload() -> None:
    body = {"items": [{"project_id": "alpha"}, {"project_id": "beta"}, {"project_id": "alpha"}]}
    assert _extract_project_ids_from_templates(body) == ["alpha", "beta"]


def test_extract_project_ids_from_non_mapping_payload() -> None:
    assert _extract_project_ids_from_templates("no-data") == []


def test_invalid_project_id_generation() -> None:
    assert _invalid_project_id("1234567") == "1invalid"
    assert _invalid_project_id("abc") == "invalid_abc"
