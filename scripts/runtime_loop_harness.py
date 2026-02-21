#!/usr/bin/env python3
"""Reusable runtime-loop harness for workflow create/update/run/poll/fix cycles.

This harness is designed for AgenticFlow API key-backed execution and writes
structured JSON + Markdown artifacts for each run.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
DEFAULT_BASE_URL = "https://api.agenticflow.ai/"
DEFAULT_WORKSPACE_ID = os.getenv("AGENTICFLOW_WORKSPACE_ID", "")
DEFAULT_PROJECT_ID = os.getenv("AGENTICFLOW_PROJECT_ID", "")
DEFAULT_TEMPLATE_ID = os.getenv("AGENTICFLOW_TEMPLATE_ID", "")
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_POLL_INTERVAL_SECONDS = 2
DEFAULT_POLL_TIMEOUT_SECONDS = 120
DEFAULT_ARTIFACT_DIR = Path("/tmp/agenticflow_runtime_loop")


ALLOWED_WORKFLOW_NODE_KEYS = {
    "name",
    "title",
    "description",
    "node_type_name",
    "input_config",
    "output_mapping",
    "connection",
}


@dataclass
class Hint:
    source: str
    scope: str
    message: str
    evidence: dict[str, Any] = field(default_factory=dict)


@dataclass
class Attempt:
    attempt_index: int
    seed_payload: dict[str, Any]
    validate: dict[str, Any] = field(default_factory=dict)
    create: dict[str, Any] = field(default_factory=dict)
    update: dict[str, Any] = field(default_factory=dict)
    run: dict[str, Any] = field(default_factory=dict)
    run_status: dict[str, Any] = field(default_factory=dict)
    hints: list[Hint] = field(default_factory=list)
    fixes: list[dict[str, Any]] = field(default_factory=list)
    result: str = ""


def _normalize_base_url(value: str) -> str:
    return value.rstrip("/") + "/"


def _coerce_json_text(payload: Any) -> str:
    if payload is None:
        return ""
    if isinstance(payload, (dict, list)):
        return json.dumps(payload)
    return str(payload)


def _safe_read_json(raw: bytes) -> Any:
    try:
        text = raw.decode("utf-8")
    except Exception:
        return None
    try:
        return json.loads(text)
    except Exception:
        return text


def _load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].strip()
        if "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip()
        value = value.strip()
        if not name:
            continue
        if value and value[0] in ('"', "'") and value[-1] == value[0]:
            value = value[1:-1]
        values[name] = value

    return values


def _resolve_token(explicit_token: str | None, env_file: Path) -> str:
    if explicit_token:
        return explicit_token

    values = _load_env_file(env_file)
    token = values.get("AGENTICFLOW_PUBLIC_API_KEY")
    if token:
        return token

    token = os.getenv("AGENTICFLOW_PUBLIC_API_KEY")
    if token:
        return token

    raise RuntimeError(
        f"Missing AGENTICFLOW_PUBLIC_API_KEY (env file: {env_file}, current env)"
    )


def _request(
    base_url: str,
    method: str,
    path: str,
    token: str,
    payload: Any = None,
    query: dict[str, Any] | None = None,
    timeout_seconds: int = 30,
) -> tuple[int | None, Any, str]:
    url = _normalize_base_url(base_url) + path.lstrip("/")
    if query:
        safe_query = {
            str(key): str(value)
            for key, value in query.items()
            if value is not None and str(value) != ""
        }
        if safe_query:
            url = f"{url}?{urlencode(safe_query)}"

    data: bytes | None = None
    headers: dict[str, str] = {
        "Authorization": f"Bearer {token}",
        "User-Agent": "agenticflow-runtime-loop/1.0",
        "Accept": "application/json",
    }
    if payload is not None:
        data = _coerce_json_text(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = Request(url, data=data, method=method.upper(), headers=headers)
    try:
        with urlopen(request, timeout=timeout_seconds) as response:
            status = int(response.status)
            raw = response.read()
            body = _safe_read_json(raw)
            return status, body, ""
    except HTTPError as exc:
        raw = exc.read()
        body = _safe_read_json(raw)
        return int(exc.code), body, str(exc)
    except URLError as exc:
        return None, None, f"Request failed: {exc}"
    except Exception as exc:  # noqa: BLE001
        return None, None, f"Request failed: {exc}"


def _extract_template_payload(response_body: Any) -> dict[str, Any]:
    if not isinstance(response_body, dict):
        return {}

    if "body" in response_body and isinstance(response_body["body"], dict):
        return response_body["body"]
    for key in ("template", "data", "item", "payload", "content", "result"):
        candidate = response_body.get(key)
        if isinstance(candidate, dict):
            return candidate
    return response_body


def _looks_like_workflow_payload(candidate: dict[str, Any]) -> bool:
    if not isinstance(candidate, dict):
        return False

    workflow_keys = {
        "nodes",
        "output_mapping",
        "input_schema",
        "project_id",
        "public_runnable",
        "name",
        "description",
    }
    return any(key in candidate for key in workflow_keys)


def _normalize_node_list(raw_nodes: Any) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    if isinstance(raw_nodes, list):
        candidates = raw_nodes
    elif isinstance(raw_nodes, dict):
        if isinstance(raw_nodes.get("nodes"), list):
            candidates = raw_nodes.get("nodes")
        elif isinstance(raw_nodes.get("items"), list):
            candidates = raw_nodes.get("items")
        elif isinstance(raw_nodes.get("elements"), list):
            candidates = raw_nodes.get("elements")
        else:
            candidates = []
    else:
        candidates = []

    for node in candidates:
        if not isinstance(node, dict):
            continue
        normalized = {
            key: node[key] for key in ALLOWED_WORKFLOW_NODE_KEYS if key in node
        }
        if normalized:
            nodes.append(normalized)
    return nodes


def _resolve_workflow_payload(template_body: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(template_body, dict):
        return {}

    if isinstance(template_body.get("workflow"), dict):
        return template_body["workflow"]

    for key in ("template", "data", "item", "payload", "content", "result"):
        candidate = template_body.get(key)
        if isinstance(candidate, dict):
            if isinstance(candidate.get("workflow"), dict):
                return candidate["workflow"]
            if _looks_like_workflow_payload(candidate):
                return candidate

    return template_body


def _extract_workflow_payload_from_template(template_body: dict[str, Any]) -> dict[str, Any]:
    if "workflow" in template_body and isinstance(template_body["workflow"], dict):
        return _extract_workflow_payload_from_template(template_body["workflow"])

    workflow = _resolve_workflow_payload(template_body)

    if not isinstance(workflow, dict):
        workflow = {}

    workflow_payload = {
        "name": workflow.get("name") or "runtime-loop-workflow",
        "description": workflow.get("description"),
        "nodes": [],
        "output_mapping": workflow.get("output_mapping")
        if isinstance(workflow.get("output_mapping"), dict)
        else {},
        "input_schema": workflow.get("input_schema")
        if isinstance(workflow.get("input_schema"), dict)
        else {"type": "object", "title": "workflow_input", "properties": {}},
        "project_id": workflow.get("project_id"),
    }

    raw_nodes = workflow.get("nodes")
    workflow_payload["nodes"] = _normalize_node_list(raw_nodes)
    if not workflow_payload["nodes"] and isinstance(raw_nodes, dict):
        nested_nodes = raw_nodes.get("nodes")
        if nested_nodes is not None:
            workflow_payload["nodes"] = _normalize_node_list(nested_nodes)

    if not workflow_payload["nodes"] and isinstance(workflow.get("workflow"), dict):
        workflow_payload["nodes"] = _normalize_node_list(workflow["workflow"].get("nodes"))

    # Defensive fallback for non-standard live schemas.
    if not workflow_payload["nodes"]:
        fallback_nodes = _normalize_node_list(template_body.get("nodes"))
        workflow_payload["nodes"] = fallback_nodes

        if not workflow_payload["nodes"]:
            fallback_nodes = _normalize_node_list(
                template_body.get("workflow", {}).get("nodes")
            )
            workflow_payload["nodes"] = fallback_nodes

    return workflow_payload


def _normalize_attempt_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = {
        "name": payload.get("name") or "runtime-loop-workflow",
        "description": payload.get("description")
        if isinstance(payload.get("description"), str)
        else None,
        "nodes": [],
        "output_mapping": payload.get("output_mapping", {}),
        "input_schema": payload.get("input_schema", {}),
        "project_id": payload.get("project_id"),
        "public_runnable": payload.get("public_runnable", False),
    }

    if not isinstance(normalized["output_mapping"], dict):
        normalized["output_mapping"] = {}
    if not isinstance(normalized["input_schema"], dict):
        normalized["input_schema"] = {"type": "object", "title": "workflow_input", "properties": {}}
    if not isinstance(normalized["nodes"], list):
        normalized["nodes"] = []

    raw_nodes = payload.get("nodes") if isinstance(payload, dict) else None
    if isinstance(raw_nodes, list):
        normalized_nodes: list[dict[str, Any]] = []
        for node in raw_nodes:
            if not isinstance(node, dict):
                continue
            normalized_nodes.append(
                {
                    key: value
                    for key, value in node.items()
                    if key in ALLOWED_WORKFLOW_NODE_KEYS
                }
            )
        normalized["nodes"] = normalized_nodes

    return normalized


def _is_success_status(status: int | None) -> bool:
    return status is not None and 200 <= status <= 399


def _flatten_validation_hints(response_body: Any, stage: str) -> list[Hint]:
    hints: list[Hint] = []
    if not isinstance(response_body, dict):
        return hints

    details = response_body.get("detail")
    if isinstance(details, list):
        for detail in details:
            if not isinstance(detail, dict):
                continue
            message = detail.get("msg") or detail.get("message") or "validation error"
            scope = detail.get("loc")
            scope_value = "::".join(str(item) for item in (scope or []))
            hints.append(
                Hint(
                    source="validation",
                    scope=scope_value,
                    message=str(message),
                    evidence={"path": scope_value, "type": detail.get("type")},
                )
            )
        return hints

    if "message" in response_body:
        hints.append(
            Hint(
                source=stage,
                scope="response.message",
                message=str(response_body.get("message")),
                evidence={"body": response_body},
            )
        )

    return hints


def _flatten_runtime_hints(response_body: Any, stage: str) -> list[Hint]:
    hints: list[Hint] = []
    if not isinstance(response_body, dict):
        return hints

    state = response_body.get("state")
    run_error = response_body.get("error") if isinstance(response_body.get("error"), dict) else None
    if isinstance(state, dict):
        top_error = state.get("error")
        if isinstance(top_error, dict):
            hints.append(
                Hint(
                    source=stage,
                    scope="state.error",
                    message=f"{top_error.get('code', '')} {top_error.get('message', '')}".strip(),
                    evidence={
                        "failed_node": top_error.get("failed_node"),
                        "code": top_error.get("code"),
                        "message": top_error.get("message"),
                    },
                )
            )

        nodes_state = state.get("nodes_state")
        if isinstance(nodes_state, list):
            for node_state in nodes_state:
                if not isinstance(node_state, dict):
                    continue
                if node_state.get("status") != "failed":
                    continue
                node_error = node_state.get("error")
                if not isinstance(node_error, dict):
                    continue
                hints.append(
                    Hint(
                        source=stage,
                        scope=f"node:{node_state.get('node_name')}",
                        message=f"{node_error.get('code', '')} {node_error.get('message', '')}".strip(),
                        evidence={
                            "node_name": node_state.get("node_name"),
                            "code": node_error.get("code"),
                            "message": node_error.get("message"),
                            "details": node_error.get("details"),
                        },
                    )
                )

    return hints


def _find_node_index(payload: dict[str, Any], node_name: str | None) -> int | None:
    if not node_name:
        return None
    nodes = payload.get("nodes")
    if not isinstance(nodes, list):
        return None
    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            continue
        if node.get("name") == node_name:
            return index
    return None


def _apply_fixes(payload: dict[str, Any], hints: list[Hint]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    working = deepcopy(payload)
    fixes: list[dict[str, Any]] = []

    nodes = working.get("nodes")
    if not isinstance(nodes, list):
        nodes = []
        working["nodes"] = nodes

    for hint in hints:
        msg = (hint.message or "").lower()
        scope = hint.scope.lower()

        if hint.source == "validation":
            if "extra" in msg and "forbidden" in msg and "nodes" in scope:
                parts = scope.split("::")
                for i in range(len(parts)):
                    if parts[i] == "nodes" and i + 1 < len(parts):
                        try:
                            node_index = int(parts[i + 1])
                        except Exception:
                            break
                        if 0 <= node_index < len(nodes):
                            field = parts[i + 2] if i + 2 < len(parts) else None
                            if field and isinstance(nodes[node_index], dict):
                                removed = nodes[node_index].pop(field, None)
                                if removed is not None:
                                    fixes.append(
                                        {
                                            "kind": "remove_node_field",
                                            "field": field,
                                            "node_index": node_index,
                                            "reason": hint.message,
                                        }
                                    )
            elif "required" in msg and "nodes" in scope:
                parts = scope.split("::")
                for i in range(len(parts)):
                    if parts[i] == "nodes" and i + 1 < len(parts):
                        try:
                            node_index = int(parts[i + 1])
                        except Exception:
                            break
                        if 0 <= node_index < len(nodes):
                            removed = nodes.pop(node_index)
                            fixes.append(
                                {
                                    "kind": "remove_invalid_node",
                                    "node_index": node_index,
                                    "reason": hint.message,
                                    "node_name": removed.get("name") if isinstance(removed, dict) else None,
                                }
                            )

        if "connection" in msg or "credential" in msg or "not found" in msg:
            if "node:" in hint.scope:
                failed_node = hint.scope.split(":", 1)[1].strip()
                node_index = _find_node_index(working, failed_node)
            else:
                failed_node = hint.evidence.get("failed_node") if isinstance(hint.evidence, dict) else None
                node_index = _find_node_index(working, failed_node)

            if node_index is not None and 0 <= node_index < len(nodes):
                failed = nodes[node_index]
                if isinstance(failed, dict) and failed.get("connection") is not None:
                    failed.pop("connection")
                    fixes.append(
                        {
                            "kind": "remove_connection_hint",
                            "node_index": node_index,
                            "reason": hint.message,
                            "node_name": failed.get("name"),
                        }
                    )

    working["nodes"] = nodes
    return working, fixes


def _poll_run_status(
    client: dict[str, Any],
    token: str,
    base_url: str,
    run_id: str,
    interval_seconds: int,
    timeout_seconds: int,
) -> tuple[dict[str, Any], list[Hint]]:
    deadline = time.perf_counter() + timeout_seconds
    last_snapshot: dict[str, Any] = {
        "status": "unknown",
        "status_code": None,
        "error": "",
        "body": None,
        "notes": [],
    }

    while True:
        status, body, error = _request(
            base_url=base_url,
            method="GET",
            path=f"/v1/workflow_runs/{run_id}",
            token=token,
            timeout_seconds=30,
        )
        if status is None:
            last_snapshot.update(
                {
                    "status_code": None,
                    "status": "network_error",
                    "error": error,
                    "body": body,
                }
            )
            return last_snapshot, []

        run_status = None
        if isinstance(body, dict):
            run_status = body.get("status")
        run_status = str(run_status or "").lower()

        last_snapshot.update(
            {
                "status_code": status,
                "body": body,
                "status": run_status or "empty",
            }
        )
        if run_status in {"success", "failed", "cancelled"}:
            return last_snapshot, _flatten_runtime_hints(body, "run_status")

        if run_status in {"created", "queued", "running"}:
            if time.perf_counter() >= deadline:
                last_snapshot["status"] = "timeout"
                last_snapshot["error"] = (
                    f"Run status poll timeout after {timeout_seconds} seconds"
                )
                return last_snapshot, []
            time.sleep(interval_seconds)
            continue

        # Any other status -> treat as failure with stop.
        last_snapshot["status"] = run_status or "unknown"
        last_snapshot["error"] = (
            f"Unexpected workflow run status '{run_status or 'unknown'}' during polling"
        )
        return last_snapshot, _flatten_runtime_hints(body, "run_status")


def _write_json_artifact(path: Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")


def _serialize_hints(hints: list[Hint]) -> list[dict[str, Any]]:
    return [hint.__dict__ for hint in hints]


def _build_markdown_report(report: dict[str, Any]) -> str:
    template_id = report.get("template_id", "<unknown>")
    runtime = report.get("runtime", {})
    semantic = report.get("semantic", {})
    attempts = report.get("attempts", [])

    lines = [
        "# Runtime Loop Harness Report",
        f"Template: {template_id}",
        f"Workspace: {report.get('workspace_id', '<none>')}",
        f"Project: {report.get('project_id', '<none>')}",
        f"Timestamp: {report.get('reported_at')}",
        "",
        f"- Runtime verdict: **{runtime.get('verdict', 'UNKNOWN')}**",
        f"  - Reason: {runtime.get('reason', 'n/a')}",
        f"- Semantic verdict: **{semantic.get('verdict', 'UNKNOWN')}**",
        f"  - Evidence: {semantic.get('evidence', 'n/a')}",
        "",
        "## Iteration summary",
    ]

    for attempt in attempts:
        lines.extend(
            [
                f"### Attempt {attempt.get('attempt_index')}",
                f"- result: {attempt.get('result', 'unknown')}",
                f"- workflow_id: {attempt.get('workflow_id', 'n/a')}",
                f"- run_id: {attempt.get('run_id', 'n/a')}",
            ]
        )
        if attempt.get("hints"):
            lines.append("- hints:")
            for hint in attempt.get("hints", []):
                lines.append(
                    f"  - [{hint.get('source')}] {hint.get('scope')}: {hint.get('message')}"
                )
        if attempt.get("fixes"):
            lines.append("- fixes:")
            for fix in attempt.get("fixes", []):
                lines.append(f"  - {fix.get('kind')}: {fix.get('reason')}")
        if attempt.get("validate"):
            lines.append(
                f"- validate_status: {attempt.get('validate', {}).get('status_code', 'n/a')}"
            )
        if attempt.get("run_status"):
            lines.append(
                f"- poll_status: {attempt.get('run_status', {}).get('status', 'n/a')}"
            )

    lines.append("")
    lines.append("## Artifacts")
    lines.append(f"JSON report: {report.get('artifacts', {}).get('json')}")
    lines.append(f"Markdown report: {report.get('artifacts', {}).get('markdown')}")
    return "\n".join(lines)


def _coerce_hint_for_json(hints: list[Hint]) -> list[dict[str, Any]]:
    return [
        {
            "source": hint.source,
            "scope": hint.scope,
            "message": hint.message,
            "evidence": hint.evidence,
        }
        for hint in hints
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Closed-loop harness: create/update/run/fix workflow against a real template.",
    )
    parser.add_argument(
        "--template-id",
        default=DEFAULT_TEMPLATE_ID,
        help="Workflow template UUID (or set AGENTICFLOW_TEMPLATE_ID).",
    )
    parser.add_argument(
        "--workspace-id",
        default=DEFAULT_WORKSPACE_ID,
        help="Workspace UUID used for workflow create/update calls (or set AGENTICFLOW_WORKSPACE_ID).",
    )
    parser.add_argument(
        "--project-id",
        default=DEFAULT_PROJECT_ID,
        help="Project ID for created workflow payloads (or set AGENTICFLOW_PROJECT_ID).",
    )
    parser.add_argument("--api-key")
    parser.add_argument("--env-file", default=str(DEFAULT_ENV_FILE))
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--max-attempts", type=int, default=DEFAULT_MAX_ATTEMPTS)
    parser.add_argument("--poll-interval", type=int, default=DEFAULT_POLL_INTERVAL_SECONDS)
    parser.add_argument("--poll-timeout", type=int, default=DEFAULT_POLL_TIMEOUT_SECONDS)
    parser.add_argument("--artifact-dir", default=str(DEFAULT_ARTIFACT_DIR))
    parser.add_argument("--artifact-prefix", default=None)
    parser.add_argument("--run-input", default="{}")
    return parser.parse_args()


def run_harness(args: argparse.Namespace) -> int:
    args_env_file = Path(args.env_file).expanduser()
    token = _resolve_token(args.api_key, args_env_file)
    base_url = _normalize_base_url(args.base_url)

    artifact_dir = Path(args.artifact_dir).expanduser()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    if args.artifact_prefix:
        json_artifact = artifact_dir / f"{args.artifact_prefix}_{timestamp}.json"
        md_artifact = artifact_dir / f"{args.artifact_prefix}_{timestamp}.md"
    else:
        json_artifact = artifact_dir / f"runtime_loop_harness_{timestamp}.json"
        md_artifact = artifact_dir / f"runtime_loop_harness_{timestamp}.md"

    report: dict[str, Any] = {
        "reported_at": datetime.now(timezone.utc).isoformat(),
        "template_id": args.template_id,
        "workspace_id": args.workspace_id,
        "project_id": args.project_id,
        "base_url": base_url,
        "env_file": str(args_env_file),
        "max_attempts": args.max_attempts,
        "poll_interval_seconds": args.poll_interval,
        "poll_timeout_seconds": args.poll_timeout,
        "attempts": [],
        "artifacts": {
            "json": str(json_artifact),
            "markdown": str(md_artifact),
        },
    }

    run_input = {}
    try:
        parsed_run_input = json.loads(args.run_input)
        if isinstance(parsed_run_input, dict):
            run_input = parsed_run_input
    except Exception:
        run_input = {}

    runtime_verdict = "BLOCKED"
    semantic_verdict = "BLOCKED"
    semantic_reason = "Not executed"

    missing_required: list[str] = []
    if not str(args.template_id or "").strip():
        missing_required.append("--template-id / AGENTICFLOW_TEMPLATE_ID")
    if not str(args.workspace_id or "").strip():
        missing_required.append("--workspace-id / AGENTICFLOW_WORKSPACE_ID")
    if not str(args.project_id or "").strip():
        missing_required.append("--project-id / AGENTICFLOW_PROJECT_ID")

    if missing_required:
        semantic_reason = "Missing required runtime-loop identifiers: " + ", ".join(missing_required)
        report.update(
            {
                "runtime": {
                    "verdict": runtime_verdict,
                    "reason": semantic_reason,
                    "last_stage": "arg-validate",
                },
                "semantic": {
                    "verdict": semantic_verdict,
                    "evidence": semantic_reason,
                },
            }
        )
        _write_json_artifact(json_artifact, report)
        md_artifact.write_text(_build_markdown_report(report), encoding="utf-8")
        print(f"Report written to: {json_artifact}")
        print(f"Report written to: {md_artifact}")
        return 1

    # 1) Load template source.
    template_status, template_body, template_error = _request(
        base_url=base_url,
        method="GET",
        path=f"/v1/workflow_templates/{args.template_id}",
        token=token,
        timeout_seconds=30,
    )

    if template_status is None:
        runtime_verdict = "BLOCKED"
        semantic_reason = template_error
        report.update(
            {
                "runtime": {
                    "verdict": runtime_verdict,
                    "reason": semantic_reason,
                    "last_stage": "template-fetch",
                },
                "semantic": {
                    "verdict": semantic_verdict,
                    "evidence": semantic_reason,
                },
            }
        )
        _write_json_artifact(json_artifact, report)
        md_artifact.write_text(_build_markdown_report(report), encoding="utf-8")
        print(f"Report written to: {json_artifact}")
        print(f"Report written to: {md_artifact}")
        return 1

    template_payload = _extract_template_payload(template_body)
    source_workflow = _extract_workflow_payload_from_template(template_payload)
    source_workflow["project_id"] = source_workflow.get("project_id") or args.project_id
    if not source_workflow.get("nodes"):
        runtime_verdict = "BLOCKED"
        semantic_reason = (
            "Template extraction produced an empty workflow node list. "
            "Expected nodes in workflow payload; found no nodes after schema normalization."
        )
        report["attempts"] = [
            {
                "attempt_index": 1,
                "seed_payload": source_workflow,
                "result": "blocked_extraction",
                "hints": [
                    {
                        "source": "template_extraction",
                        "scope": "workflow.nodes",
                        "message": semantic_reason,
                        "evidence": {"template_payload_keys": sorted(source_workflow.keys())},
                    }
                ],
                "fixes": [],
            }
        ]
        report.update(
            {
                "runtime": {
                    "verdict": runtime_verdict,
                    "reason": semantic_reason,
                    "last_stage": "template-extract",
                },
                "semantic": {
                    "verdict": semantic_verdict,
                    "evidence": semantic_reason,
                },
            }
        )
        _write_json_artifact(json_artifact, report)
        md_artifact.write_text(_build_markdown_report(report), encoding="utf-8")
        print(f"Report written to: {json_artifact}")
        print(f"Report written to: {md_artifact}")
        return 1

    attempts = []
    workflow_id = None

    payload = _normalize_attempt_payload(source_workflow)

    for attempt_index in range(1, args.max_attempts + 1):
        attempt = Attempt(attempt_index=attempt_index, seed_payload=deepcopy(payload))

        normalized_payload = _normalize_attempt_payload(payload)

        # Validate
        validate_status, validate_body, validate_error = _request(
            base_url=base_url,
            method="POST",
            path="/v1/workflows/utils/validate_create_workflow_model",
            token=token,
            payload=normalized_payload,
            timeout_seconds=30,
        )

        attempt.validate = {
            "status_code": validate_status,
            "error": validate_error,
            "body": validate_body if isinstance(validate_body, (dict, list)) else str(validate_body),
        }

        attempt.hints.extend(_flatten_validation_hints(validate_body, "validate"))

        if validate_status is None:
            attempt.result = "blocked_network"
            attempts.append(
                {
                    "attempt_index": attempt.attempt_index,
                    "seed_payload": attempt.seed_payload,
                    "validate": attempt.validate,
                    "result": attempt.result,
                    "hints": _coerce_hint_for_json(attempt.hints),
                    "fixes": attempt.fixes,
                }
            )
            report["attempts"] = attempts
            runtime_verdict = "BLOCKED"
            semantic_reason = validate_error
            break

        if not _is_success_status(validate_status):
            attempt.result = "failed_validate"
            patch_payload, fixes = _apply_fixes(normalized_payload, attempt.hints)
            attempt.fixes.extend(fixes)
            payload = patch_payload
            if fixes and attempt_index < args.max_attempts:
                attempts.append(
                    {
                        "attempt_index": attempt.attempt_index,
                        "seed_payload": attempt.seed_payload,
                        "validate": attempt.validate,
                        "result": attempt.result,
                        "hints": _coerce_hint_for_json(attempt.hints),
                        "fixes": attempt.fixes,
                    }
                )
                time.sleep(1)
                continue
            attempts.append(
                {
                    "attempt_index": attempt.attempt_index,
                    "seed_payload": attempt.seed_payload,
                    "validate": attempt.validate,
                    "result": attempt.result,
                    "hints": _coerce_hint_for_json(attempt.hints),
                    "fixes": attempt.fixes,
                }
            )
            report["attempts"] = attempts
            runtime_verdict = "FAIL"
            semantic_reason = "Validation failed"
            break

        if workflow_id is None:
            create_status, create_body, create_error = _request(
                base_url=base_url,
                method="POST",
                path=f"/v1/workspaces/{args.workspace_id}/workflows",
                token=token,
                payload=normalized_payload,
                timeout_seconds=30,
            )

            attempt.create = {
                "status_code": create_status,
                "error": create_error,
                "body": create_body if isinstance(create_body, (dict, list)) else str(create_body),
            }

            if create_status is None:
                attempt.result = "blocked_network"
                attempts.append(
                    {
                        "attempt_index": attempt.attempt_index,
                        "seed_payload": attempt.seed_payload,
                        "validate": attempt.validate,
                        "create": attempt.create,
                        "result": attempt.result,
                        "hints": _coerce_hint_for_json(attempt.hints),
                        "fixes": attempt.fixes,
                    }
                )
                report["attempts"] = attempts
                runtime_verdict = "BLOCKED"
                semantic_reason = create_error
                break

            if _is_success_status(create_status) and isinstance(create_body, dict):
                workflow_id = create_body.get("id") or create_body.get("workflow_id")
                if not workflow_id:
                    attempt.result = "blocked"
                    attempt.hints.extend(_flatten_validation_hints(create_body, "create"))
                    attempts.append(
                        {
                            "attempt_index": attempt.attempt_index,
                            "seed_payload": attempt.seed_payload,
                            "validate": attempt.validate,
                            "create": attempt.create,
                            "result": attempt.result,
                            "hints": _coerce_hint_for_json(attempt.hints),
                            "fixes": attempt.fixes,
                        }
                    )
                    runtime_verdict = "BLOCKED"
                    semantic_reason = "Create response missing workflow id"
                    break
            else:
                attempt.result = "failed_create"
                attempt.hints.extend(_flatten_runtime_hints(create_body, "create"))
                patch_payload, fixes = _apply_fixes(normalized_payload, attempt.hints)
                attempt.fixes.extend(fixes)
                payload = patch_payload
                if attempt_index < args.max_attempts and fixes:
                    attempts.append(
                        {
                            "attempt_index": attempt.attempt_index,
                            "seed_payload": attempt.seed_payload,
                            "validate": attempt.validate,
                            "create": attempt.create,
                            "result": attempt.result,
                            "hints": _coerce_hint_for_json(attempt.hints),
                            "fixes": attempt.fixes,
                        }
                    )
                    continue
                attempts.append(
                    {
                        "attempt_index": attempt.attempt_index,
                        "seed_payload": attempt.seed_payload,
                        "validate": attempt.validate,
                        "create": attempt.create,
                        "result": attempt.result,
                        "hints": _coerce_hint_for_json(attempt.hints),
                        "fixes": attempt.fixes,
                    }
                )
                report["attempts"] = attempts
                runtime_verdict = "FAIL"
                semantic_reason = "Create failed"
                break

        if workflow_id is not None:
            update_status, update_body, update_error = _request(
                base_url=base_url,
                method="PUT",
                path=f"/v1/workspaces/{args.workspace_id}/workflows/{workflow_id}",
                token=token,
                payload=normalized_payload,
                timeout_seconds=30,
            )

            attempt.update = {
                "status_code": update_status,
                "error": update_error,
                "body": update_body if isinstance(update_body, (dict, list)) else str(update_body),
            }
            if update_status is None:
                attempt.result = "blocked_network"
                attempts.append(
                    {
                        "attempt_index": attempt.attempt_index,
                        "seed_payload": attempt.seed_payload,
                        "validate": attempt.validate,
                        "create": attempt.create,
                        "update": attempt.update,
                        "workflow_id": workflow_id,
                        "result": attempt.result,
                        "hints": _coerce_hint_for_json(attempt.hints),
                        "fixes": attempt.fixes,
                    }
                )
                report["attempts"] = attempts
                runtime_verdict = "BLOCKED"
                semantic_reason = update_error
                break

            if not _is_success_status(update_status):
                attempt.result = "failed_update"
                attempt.hints.extend(_flatten_runtime_hints(update_body, "update"))
                patch_payload, fixes = _apply_fixes(normalized_payload, attempt.hints)
                attempt.fixes.extend(fixes)
                payload = patch_payload
                if attempt_index < args.max_attempts and fixes:
                    attempts.append(
                        {
                            "attempt_index": attempt.attempt_index,
                            "seed_payload": attempt.seed_payload,
                            "validate": attempt.validate,
                            "create": attempt.create,
                            "update": attempt.update,
                            "workflow_id": workflow_id,
                            "result": attempt.result,
                            "hints": _coerce_hint_for_json(attempt.hints),
                            "fixes": attempt.fixes,
                        }
                    )
                    continue
                attempts.append(
                    {
                        "attempt_index": attempt.attempt_index,
                        "seed_payload": attempt.seed_payload,
                        "validate": attempt.validate,
                        "create": attempt.create,
                        "update": attempt.update,
                        "workflow_id": workflow_id,
                        "result": attempt.result,
                        "hints": _coerce_hint_for_json(attempt.hints),
                        "fixes": attempt.fixes,
                    }
                )
                report["attempts"] = attempts
                runtime_verdict = "FAIL"
                semantic_reason = "Update failed"
                break

        run_payload = {
            "workflow_id": workflow_id,
            "input": run_input,
        }
        run_status_code, run_body, run_error = _request(
            base_url=base_url,
            method="POST",
            path="/v1/workflow_runs/",
            token=token,
            payload=run_payload,
            timeout_seconds=30,
        )

        attempt.run = {
            "status_code": run_status_code,
            "error": run_error,
            "body": run_body if isinstance(run_body, (dict, list)) else str(run_body),
        }

        if run_status_code is None:
            attempt.result = "blocked_network"
            attempts.append(
                {
                    "attempt_index": attempt.attempt_index,
                    "seed_payload": attempt.seed_payload,
                    "validate": attempt.validate,
                    "create": attempt.create,
                    "update": attempt.update,
                    "run": attempt.run,
                    "workflow_id": workflow_id,
                    "result": attempt.result,
                    "hints": _coerce_hint_for_json(attempt.hints),
                    "fixes": attempt.fixes,
                }
            )
            report["attempts"] = attempts
            runtime_verdict = "BLOCKED"
            semantic_reason = run_error
            break

        run_id = run_body.get("id") if isinstance(run_body, dict) else None
        if not _is_success_status(run_status_code) or not run_id:
            attempt.result = "failed_run"
            attempt.hints.extend(_flatten_runtime_hints(run_body, "run"))
            patch_payload, fixes = _apply_fixes(normalized_payload, attempt.hints)
            attempt.fixes.extend(fixes)
            payload = patch_payload
            attempts.append(
                {
                    "attempt_index": attempt.attempt_index,
                    "seed_payload": attempt.seed_payload,
                    "validate": attempt.validate,
                    "create": attempt.create,
                    "update": attempt.update,
                    "run": attempt.run,
                    "workflow_id": workflow_id,
                    "result": attempt.result,
                    "hints": _coerce_hint_for_json(attempt.hints),
                    "fixes": attempt.fixes,
                }
            )
            runtime_verdict = "FAIL"
            semantic_reason = "Run request failed"
            break

        run_status, run_status_hints = _poll_run_status(
            client={},
            token=token,
            base_url=base_url,
            run_id=run_id,
            interval_seconds=args.poll_interval,
            timeout_seconds=args.poll_timeout,
        )
        attempt.run_status = {
            "status_code": run_status.get("status_code"),
            "status": run_status.get("status"),
            "error": run_status.get("error"),
            "body": run_status.get("body")
            if isinstance(run_status.get("body"), (dict, list))
            else str(run_status.get("body")),
        }
        attempt.hints.extend(run_status_hints)
        attempts.append(
            {
                "attempt_index": attempt.attempt_index,
                "seed_payload": attempt.seed_payload,
                "validate": attempt.validate,
                "create": attempt.create,
                "update": attempt.update,
                "run": attempt.run,
                "run_status": attempt.run_status,
                "workflow_id": workflow_id,
                "run_id": run_id,
                "result": attempt.result or "running_complete",
                "hints": _coerce_hint_for_json(attempt.hints),
                "fixes": attempt.fixes,
            }
        )

        run_status_value = run_status.get("status")
        if run_status_value == "success":
            attempt.result = "success"
            runtime_verdict = "PASS"
            semantic_verdict = "PASS"
            semantic_reason = "Workflow executed successfully and reached terminal status"
            break

        if run_status_value in {"failed", "cancelled"}:
            attempt.result = "failed_run_runtime"
            patch_payload, fixes = _apply_fixes(normalized_payload, attempt.hints)
            attempt.fixes.extend(fixes)
            payload = patch_payload
            if attempt_index < args.max_attempts and fixes:
                continue
            runtime_verdict = "FAIL"
            semantic_verdict = "FAIL"
            semantic_reason = "Run ended in non-success terminal state"
            break

        if run_status_value == "timeout":
            attempt.result = "timeout"
            runtime_verdict = "FAIL"
            semantic_verdict = "FAIL"
            semantic_reason = "Run polling timed out"
            break

        runtime_verdict = "FAIL"
        semantic_verdict = "FAIL"
        semantic_reason = "Unexpected run state"
        break

        
    report["attempts"] = attempts
    if report["attempts"]:
        report["runtime"] = {
            "verdict": runtime_verdict,
            "reason": semantic_reason,
            "last_status": attempts[-1].get("run_status", {}).get("status")
            if isinstance(attempts[-1], dict)
            else None,
        }
    else:
        report["runtime"] = {
            "verdict": runtime_verdict,
            "reason": semantic_reason,
            "last_status": None,
        }

    report["semantic"] = {
        "verdict": semantic_verdict,
        "evidence": semantic_reason,
    }

    _write_json_artifact(json_artifact, report)
    md_artifact.write_text(_build_markdown_report(report), encoding="utf-8")
    print(f"Artifacts:")
    print(f"  JSON: {json_artifact}")
    print(f"  Markdown: {md_artifact}")

    if runtime_verdict == "PASS" and semantic_verdict == "PASS":
        return 0
    return 1


def main() -> None:
    args = parse_args()
    raise SystemExit(run_harness(args))


if __name__ == "__main__":
    main()
