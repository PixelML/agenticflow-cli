import json

from scripts.module import (
    TranslationFailure,
    build_gap_report,
    translate_n8n_template,
    write_gap_report,
)


def test_translator_v2_maps_tooling_and_llm_capabilities() -> None:
    template = {
        "id": 6270,
        "name": "Build Your First AI Agent",
        "node_names": [
            "n8n-nodes-base.httpRequest",
            "@n8n/n8n-nodes-langchain.agent",
            "n8n-nodes-base.googleSheets",
        ],
    }

    result = translate_n8n_template(
        template,
        available_node_types={"llm", "api_call", "mcp_run_action", "send_email"},
        available_mcp_actions={"google_sheets-upsert-row"},
    )

    capability_states = {
        cap["capability"]: cap["state"] for cap in result["required_capabilities"]
    }

    assert capability_states["tooling"] == "equivalent"
    assert capability_states["llm"] == "equivalent"
    assert result["verdict"] == "PASS"
    assert [node["node_type_name"] for node in result["workflow_payload"]["nodes"]] == [
        "api_call",
        "llm",
        "mcp_run_action",
    ]


def test_translator_v2_fails_loud_on_unsupported_tooling_requirement() -> None:
    template = {
        "id": 501,
        "name": "Sheet write and notify",
        "node_names": ["n8n-nodes-base.googleSheets"],
    }

    try:
        translate_n8n_template(
            template,
            available_node_types={"llm", "api_call", "mcp_run_action"},
            available_mcp_actions=set(),
        )
    except TranslationFailure as exc:
        capability_states = {
            cap["capability"]: cap["state"] for cap in exc.artifact["required_capabilities"]
        }
        assert exc.artifact["verdict"] == "BLOCKED"
        assert capability_states["tooling"] == "unsupported"
        assert exc.artifact["blocked"] is True
        return

    raise AssertionError("Expected TranslationFailure for unsupported tooling")


def test_translator_v2_marks_memory_as_non_equivalent() -> None:
    template = {
        "id": 999,
        "name": "Memory required",
        "node_names": ["@n8n/n8n-nodes-langchain.memoryBufferWindow"],
    }

    result = translate_n8n_template(
        template,
        strict=False,
    )

    memory_cap = next(
        cap for cap in result["required_capabilities"] if cap["capability"] == "memory"
    )
    assert memory_cap["state"] in {"partial", "unsupported"}
    assert memory_cap["state"] != "equivalent"


def test_translator_v2_emits_gap_report_artifact(tmp_path):
    template = {
        "id": 720,
        "name": "LLM only",
        "node_names": ["@n8n/n8n-nodes-langchain.agent"],
    }

    result = translate_n8n_template(
        template,
        available_node_types={"llm"},
    )

    report = build_gap_report(result, source_file="/tmp/n8n_workflows_100.json")
    report_path = write_gap_report(result, tmp_path / "gap.json", source_file="/tmp/n8n_workflows_100.json")

    assert report["translator_version"] == "v2"
    assert report["source_template_id"] == 720
    assert report["source_file"] == "/tmp/n8n_workflows_100.json"
    assert report["required_capabilities"] == result["required_capabilities"]

    loaded = json.loads(report_path.read_text(encoding="utf-8"))
    assert loaded == report

