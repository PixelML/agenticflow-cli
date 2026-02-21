from __future__ import annotations

from scripts.runtime_loop_harness import (
    _extract_template_payload,
    _extract_workflow_payload_from_template,
)


def test_extract_template_payload_prefers_wrapped_body() -> None:
    response = {
        "status": "ok",
        "body": {
            "workflow": {
                "name": "inner",
            }
        },
    }

    assert _extract_template_payload(response) == {"workflow": {"name": "inner"}}


def test_extract_template_payload_falls_back_to_known_keys() -> None:
    response = {"template": {"workflow": {"nodes": []}}}

    assert _extract_template_payload(response) == {"workflow": {"nodes": []}}


def test_extract_workflow_payload_handles_nested_nodes_wrapper() -> None:
    template_body = {
        "workflow": {
            "name": "Build Your First AI Agent",
            "nodes": {
                "nodes": [
                    {
                        "name": "agent",
                        "title": "Agent",
                        "node_type_name": "llm",
                        "input_config": {"model": "gpt-5"},
                        "output_mapping": {"result": "x"},
                    }
                ]
            },
            "output_mapping": {"result": "agent_result"},
            "input_schema": {"type": "object", "properties": {}},
            "project_id": "proj_123",
        }
    }

    payload = _extract_workflow_payload_from_template(template_body)

    assert payload["name"] == "Build Your First AI Agent"
    assert payload["nodes"] == [
        {
            "name": "agent",
            "title": "Agent",
            "node_type_name": "llm",
            "input_config": {"model": "gpt-5"},
            "output_mapping": {"result": "x"},
        }
    ]
    assert payload["output_mapping"] == {"result": "agent_result"}
    assert payload["input_schema"] == {"type": "object", "properties": {}}
    assert payload["project_id"] == "proj_123"


def test_extract_workflow_payload_empty_nodes_returns_empty_when_unrecoverable() -> None:
    template_body = {"workflow": {"name": "broken", "nodes": {"count": 2}}}


    payload = _extract_workflow_payload_from_template(template_body)

    assert payload["nodes"] == []
