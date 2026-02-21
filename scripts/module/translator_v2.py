"""n8n → AgenticFlow translator (v2).

This module replaces ad-hoc mapping with explicit capability states:
`equivalent`, `partial`, and `unsupported`.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any, Literal, Mapping


CapabilityState = Literal["equivalent", "partial", "unsupported"]


_NODE_STATE_ORDER = {"equivalent": 0, "partial": 1, "unsupported": 2}
_CRITICAL_CAPABILITIES = {"tooling", "memory"}


KNOWN_LLM_NODES = {
    "@n8n/n8n-nodes-langchain.agent",
    "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
    "@n8n/n8n-nodes-langchain.lmChatOpenAi",
    "@n8n/n8n-nodes-langchain.lmChatAnthropic",
    "@n8n/n8n-nodes-langchain.lmChatGroq",
    "@n8n/n8n-nodes-langchain.lmChatOllama",
    "@n8n/n8n-nodes-langchain.chainLlm",
    "@n8n/n8n-nodes-langchain.openAi",
    "@n8n/n8n-nodes-langchain.googleGemini",
}


KNOWN_TOOL_PATTERNS = {
    "n8n-nodes-base.httpRequest": {"node_type": "api_call", "action": None},
    "n8n-nodes-base.emailSend": {"node_type": "send_email", "action": None},
    "n8n-nodes-base.googleSheets": {
        "node_type": "mcp_run_action",
        "action": "google_sheets-upsert-row",
    },
    "n8n-nodes-base.gmail": {
        "node_type": "mcp_run_action",
        "action": "gmail-send-email",
    },
    "n8n-nodes-base.googleDocs": {
        "node_type": "mcp_run_action",
        "action": "google_docs-insert-text",
    },
    "n8n-nodes-base.linkedIn": {
        "node_type": "mcp_run_action",
        "action": "linkedin-create-text-post-user",
    },
}


SKIPPABLE_N8N_NODES = {
    "@n8n/n8n-nodes-langchain.outputParserStructured",
    "@n8n/n8n-nodes-langchain.documentDefaultDataLoader",
    "@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter",
    "@n8n/n8n-nodes-langchain.outputParserAutofixing",
    "@n8n/n8n-nodes-langchain.toolThink",
}


MEMORY_NODE_TYPES = {"@n8n/n8n-nodes-langchain.memoryBufferWindow"}


@dataclass(frozen=True)
class CapabilityGap:
    """Capability-level summary for source requirements and mapping quality."""

    capability: str
    state: CapabilityState
    source_nodes: list[str]
    mapped_nodes: list[str]
    reasons: list[str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "capability": self.capability,
            "state": self.state,
            "source_nodes": list(self.source_nodes),
            "mapped_nodes": list(self.mapped_nodes),
            "reasons": list(self.reasons),
        }


class TranslationFailure(RuntimeError):
    """Raised when strict mode blocks a silent-degradation translation."""

    def __init__(self, artifact: dict[str, Any]) -> None:
        super().__init__("translation blocked due to unsupported or degraded critical capabilities")
        self.artifact = artifact


def _state_rank(state: str) -> int:
    return _NODE_STATE_ORDER.get(state, -1)


def _merge_state(existing: CapabilityState, new: CapabilityState) -> CapabilityState:
    if _state_rank(new) > _state_rank(existing):
        return new
    return existing


def _extract_node_types(source_template: Mapping[str, Any]) -> list[str]:
    node_names = source_template.get("node_names")
    if isinstance(node_names, list):
        return [str(node) for node in node_names if isinstance(node, str)]

    workflow = source_template.get("workflow")
    if isinstance(workflow, Mapping):
        nodes = workflow.get("nodes")
        if isinstance(nodes, Mapping):
            nodes = nodes.get("nodes")
    else:
        nodes = source_template.get("nodes")

    if not isinstance(nodes, list):
        return []

    extracted: list[str] = []
    for node in nodes:
        if not isinstance(node, Mapping):
            continue
        node_type = node.get("type") or node.get("node_type_name") or node.get("node")
        if isinstance(node_type, str):
            extracted.append(node_type)
    return extracted


def _name_step(index: int) -> str:
    return f"step_{index:02d}"


def _build_llm_node(index: int) -> dict[str, Any]:
    name = _name_step(index)
    return {
        "name": name,
        "title": f"{name} llm",
        "description": "Mapped from source LLM-capable node",
        "node_type_name": "llm",
        "input_config": {
            "model": "agenticflow/gpt-4o-mini",
            "temperature": 0.2,
            "system_message": "You are a reliable automation assistant.",
            "human_message": "{{user_prompt}}",
            "chat_history_id": "",
        },
    }


def _build_api_call_node(index: int) -> dict[str, Any]:
    name = _name_step(index)
    return {
        "name": name,
        "title": f"{name} api_call",
        "description": "Mapped from n8n httpRequest",
        "node_type_name": "api_call",
        "input_config": {
            "method": "GET",
            "url": "{{source_url}}",
            "headers": {},
            "query": {},
            "body": {},
        },
    }


def _build_send_email_node(index: int) -> dict[str, Any]:
    name = _name_step(index)
    return {
        "name": name,
        "title": f"{name} send_email",
        "description": "Mapped from n8n emailSend",
        "node_type_name": "send_email",
        "input_config": {
            "to": "{{email_to}}",
            "subject": "{{email_subject}}",
            "content": "{{user_prompt}}",
        },
    }


def _build_mcp_node(index: int, action: str) -> dict[str, Any]:
    name = _name_step(index)
    return {
        "name": name,
        "title": f"{name} mcp_run_action",
        "description": "Mapped from known MCP-capable n8n node",
        "node_type_name": "mcp_run_action",
        "input_config": {
            "action": action,
            "input_params": {
                "instruction": "{{user_prompt}}",
            },
        },
        "connection": "{{__app_connections__[\"default\"]}}",
    }


def _output_mapping(mapped_nodes: list[dict[str, Any]]) -> dict[str, str]:
    if not mapped_nodes:
        return {"result": "{{user_prompt}}"}
    last_node = mapped_nodes[-1]
    value_key = "content" if last_node.get("node_type_name") == "llm" else "result"
    return {"result": f"{{{{{last_node['name']}.{value_key}}}}}"}


def _build_payload(source_template: Mapping[str, Any], mapped_nodes: list[dict[str, Any]]) -> dict[str, Any]:
    source_id = source_template.get("id", "unknown")
    name = source_template.get("name") or "Translated workflow"
    return {
        "name": f"n8n-translated-{source_id} - {name}",
        "description": f"Translated from n8n template {source_id}: {name}",
        "nodes": mapped_nodes,
        "output_mapping": _output_mapping(mapped_nodes),
        "input_schema": {
            "type": "object",
            "required": ["user_prompt"],
            "properties": {
                "user_prompt": {"type": "string", "title": "Prompt"},
                "source_url": {"type": "string", "title": "Source URL"},
                "email_to": {"type": "string", "title": "Email To"},
                "email_subject": {"type": "string", "title": "Email Subject"},
            },
        },
    }


def _record_capability(
    capabilities: dict[str, CapabilityGap],
    *,
    capability: str,
    state: CapabilityState,
    source_node: str,
    mapped_node: str | None,
    reason: str,
) -> None:
    existing = capabilities.get(capability)
    if existing is None:
        capabilities[capability] = CapabilityGap(
            capability=capability,
            state=state,
            source_nodes=[source_node],
            mapped_nodes=[] if mapped_node is None else [mapped_node],
            reasons=[reason],
        )
        return

    capabilities[capability] = CapabilityGap(
        capability=existing.capability,
        state=_merge_state(existing.state, state),
        source_nodes=sorted(set(existing.source_nodes + [source_node])),
        mapped_nodes=sorted(set(existing.mapped_nodes + ([] if mapped_node is None else [mapped_node]))),
        reasons=existing.reasons + [reason],
    )


def _is_blocking(capability: str, state: CapabilityState) -> bool:
    if state == "unsupported":
        return True
    if capability in _CRITICAL_CAPABILITIES and state == "partial":
        return True
    return False


def _map_node(
    *,
    source_node: str,
    index: int,
    available_node_types: set[str],
    available_mcp_actions: set[str],
) -> dict[str, Any]:
    if source_node in KNOWN_LLM_NODES:
        if "llm" not in available_node_types:
            return {
                "status": "unsupported",
                "capability": "llm",
                "mapped_node": None,
                "reason": "AF llm node type is not available",
            }
        return {
            "status": "equivalent",
            "capability": "llm",
            "mapped_node": _build_llm_node(index),
            "reason": "Mapped n8n LLM-capable node to AgenticFlow llm",
        }

    if source_node in MEMORY_NODE_TYPES:
        return {
            "status": "unsupported",
            "capability": "memory",
            "mapped_node": None,
            "reason": "n8n memory node has no direct AgenticFlow equivalent",
        }

    if source_node in KNOWN_TOOL_PATTERNS:
        mapping = KNOWN_TOOL_PATTERNS[source_node]
        target = mapping["node_type"]
        action = mapping["action"]

        if target not in available_node_types:
            return {
                "status": "unsupported",
                "capability": "tooling",
                "mapped_node": None,
                "reason": f"AF node type {target} is unavailable",
            }

        if target == "mcp_run_action":
            if action is None or action not in available_mcp_actions:
                return {
                    "status": "unsupported",
                    "capability": "tooling",
                    "mapped_node": None,
                    "reason": f"No mapped AF MCP action for source node {source_node}",
                }
            return {
                "status": "equivalent",
                "capability": "tooling",
                "mapped_node": _build_mcp_node(index, action),
                "reason": f"Mapped source MCP-compatible node {source_node} using action {action}",
            }

        if target == "api_call":
            return {
                "status": "equivalent",
                "capability": "tooling",
                "mapped_node": _build_api_call_node(index),
                "reason": "Mapped n8n httpRequest to AgenticFlow api_call",
            }

        if target == "send_email":
            return {
                "status": "equivalent",
                "capability": "tooling",
                "mapped_node": _build_send_email_node(index),
                "reason": "Mapped n8n emailSend to AgenticFlow send_email",
            }

    if source_node in SKIPPABLE_N8N_NODES:
        return {
            "status": "skipped",
            "capability": None,
            "mapped_node": None,
            "reason": "Known non-semantic parser/config node skipped in v2",
        }

    return {
        "status": "unsupported",
        "capability": f"node:{source_node}",
        "mapped_node": None,
        "reason": f"No v2 mapping rule for source node '{source_node}'",
    }


def translate_n8n_template(
    source_template: Mapping[str, Any],
    *,
    strict: bool = True,
    available_node_types: set[str] | None = None,
    available_mcp_actions: set[str] | None = None,
) -> dict[str, Any]:
    """Translate one n8n template into AF nodes with explicit capability states.

    Args:
        source_template: Raw n8n source template.
        strict: If True, raise `TranslationFailure` on critical blocked capability state.
        available_node_types: Override set of AF node types to map against.
        available_mcp_actions: Override AF MCP action set to map against.
    """

    if available_node_types is None:
        available_node_types = {
            "llm",
            "api_call",
            "mcp_run_action",
            "send_email",
        }
    else:
        available_node_types = set(available_node_types)

    if available_mcp_actions is None:
        available_mcp_actions = {
            "google_sheets-upsert-row",
            "gmail-send-email",
            "gmail-create-draft",
            "google_docs-insert-text",
            "linkedin-create-text-post-user",
        }
    else:
        available_mcp_actions = set(available_mcp_actions)

    source_nodes = _extract_node_types(source_template)
    source_id = source_template.get("id")
    source_name = source_template.get("name") or "unnamed workflow"

    mapped_nodes: list[dict[str, Any]] = []
    capability_state: dict[str, CapabilityGap] = {}
    node_results: list[dict[str, Any]] = []

    for index, source_node in enumerate(source_nodes, start=1):
        mapped = _map_node(
            source_node=source_node,
            index=index,
            available_node_types=available_node_types,
            available_mcp_actions=available_mcp_actions,
        )

        mapped_node = mapped["mapped_node"]
        status = mapped["status"]
        capability = mapped["capability"]
        reason = mapped["reason"]

        node_record = {
            "source_index": index,
            "source_node": source_node,
            "status": status,
            "capability": capability,
            "mapped_node_name": mapped_node["name"] if isinstance(mapped_node, Mapping) else None,
            "mapped_node_type": mapped_node["node_type_name"] if isinstance(mapped_node, Mapping) else None,
            "reason": reason,
        }
        node_results.append(node_record)

        if isinstance(mapped_node, Mapping):
            mapped_nodes.append(dict(mapped_node))
            mapped_node_name = str(mapped_node.get("name"))
        else:
            mapped_node_name = None

        if capability and status in {"equivalent", "partial", "unsupported"}:
            _record_capability(
                capability_state,
                capability=capability,
                state=status,
                source_node=source_node,
                mapped_node=mapped_node_name,
                reason=reason,
            )

    required_capabilities = [
        capability_state[name].as_dict() for name in sorted(capability_state.keys())
    ]

    blocked = any(
        capability_state[name].capability and _is_blocking(
            capability_state[name].capability,
            capability_state[name].state,
        )
        for name in capability_state
    )

    result: dict[str, Any] = {
        "source_template_id": source_id,
        "source_template_name": source_name,
        "source_node_count": len(source_nodes),
        "node_results": node_results,
        "required_capabilities": required_capabilities,
        "workflow_payload": _build_payload(source_template, mapped_nodes),
        "verdict": "BLOCKED" if blocked else "PASS",
        "strict": strict,
        "blocked": blocked,
    }

    if strict and blocked:
        raise TranslationFailure(result)

    return result


def build_gap_report(
    result: Mapping[str, Any],
    *,
    source_file: str | None = None,
) -> dict[str, Any]:
    """Build a QA-oriented gap artifact for a single translation result."""

    return {
        "translator_version": "v2",
        "source_file": source_file,
        "source_template_id": result.get("source_template_id"),
        "source_template_name": result.get("source_template_name"),
        "source_node_count": result.get("source_node_count"),
        "verdict": result.get("verdict", "UNKNOWN"),
        "required_capabilities": list(result.get("required_capabilities", [])),
        "node_results": list(result.get("node_results", [])),
        "workflow_payload": result.get("workflow_payload"),
    }


def write_gap_report(
    result: Mapping[str, Any],
    path: str | Path,
    *,
    source_file: str | None = None,
) -> Path:
    """Write a translation gap report artifact in JSON format."""

    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    artifact = build_gap_report(result, source_file=source_file)
    output_path.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    return output_path
