#!/usr/bin/env python3
"""Run read-only public API smoke checks and emit a structured JSON report."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from typing import Any


DEFAULT_ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
DEFAULT_BASE_URL = "https://api.agenticflow.ai/"
DEFAULT_TIMEOUT_SECONDS = 30


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run the Lane 3 public API smoke harness.",
    )
    parser.add_argument(
        "--env-file",
        default=str(DEFAULT_ENV_FILE),
        help="Path to env file containing AGENTICFLOW_PUBLIC_API_KEY.",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("NEXT_PUBLIC_BASE_API_URL", DEFAULT_BASE_URL),
        help="Base URL for API requests.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="Request timeout in seconds.",
    )
    parser.add_argument(
        "--report-path",
        default=None,
        help="Custom path for JSON report output.",
    )
    return parser.parse_args()


@dataclass
class SmokeCheck:
    name: str
    method: str
    path: str
    expected_statuses: list[int]
    query: dict[str, str] | None = None
    status: int | None = None
    body: dict[str, Any] | str | None = None
    passed: bool = False
    error: str | None = None
    duration_ms: float = 0.0
    url: str = ""


def _load_env_file(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
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
        if value.startswith(("'", '"')) and value.endswith(value[0]):
            value = value[1:-1]
        # Keep inline comments from being included when not quoted.
        if value and not (value.startswith("'") or value.startswith('"')):
            value = re.split(r"\s+#", value, maxsplit=1)[0].strip()
        env[name] = value
    return env


def _resolve_token(explicit_token: str | None, env_file_path: Path) -> str:
    file_env = _load_env_file(env_file_path)
    token = file_env.get("AGENTICFLOW_PUBLIC_API_KEY")
    if explicit_token is not None:
        token = explicit_token
    if token is None:
        token = os.getenv("AGENTICFLOW_PUBLIC_API_KEY")
    if not token:
        raise RuntimeError(
            f"Missing AGENTICFLOW_PUBLIC_API_KEY. Set it in env or in {env_file_path}"
        )
    return token


def _normalize_base_url(base_url: str) -> str:
    return base_url.rstrip("/") + "/"


def _coerce_query(query: dict[str, str] | None) -> str:
    if not query:
        return ""
    return "?" + urlencode(query)


def _read_body(payload: Any) -> dict[str, Any] | str:
    if payload is None:
        return None
    if isinstance(payload, (dict, list)):
        return payload
    if payload == b"":
        return ""
    try:
        decoded = payload.decode("utf-8")
    except Exception:
        return None
    try:
        return json.loads(decoded)
    except Exception:
        return decoded[:2000]


def _build_url(base_url: str, path: str, query: dict[str, str] | None) -> str:
    path_part = path if path.startswith("/") else f"/{path}"
    return f"{_normalize_base_url(base_url)}{path_part.lstrip('/')}" + _coerce_query(query)


def _run_request(
    base_url: str,
    method: str,
    path: str,
    token: str,
    query: dict[str, str] | None,
    timeout: int,
) -> tuple[int | None, dict[str, Any] | str | None, str | None]:
    url = _build_url(base_url, path, query)
    request_headers = {"Authorization": f"Bearer {token}"}
    request = Request(url, method=method.upper(), headers=request_headers)
    try:
        with urlopen(request, timeout=timeout) as response:
            status = response.status
            body = _read_body(response.read())
            return status, body, url
    except HTTPError as exc:
        body = _read_body(exc.read())
        return exc.code, body, url
    except URLError as exc:
        return None, None, str(exc)
    except TimeoutError as exc:
        return None, None, str(exc)


def _run_check(
    checks: list[SmokeCheck],
    base_url: str,
    token: str,
    method: str,
    path: str,
    expected_statuses: list[int],
    query: dict[str, str] | None,
    timeout: int,
) -> SmokeCheck:
    check = SmokeCheck(
        name=f"{method.upper()} {path}",
        method=method.upper(),
        path=path,
        expected_statuses=expected_statuses,
        query=query or {},
    )
    started_at = time.perf_counter()
    status, body, detail = _run_request(
        base_url=base_url,
        method=method,
        path=path,
        token=token,
        query=query,
        timeout=timeout,
    )
    check.duration_ms = (time.perf_counter() - started_at) * 1000
    check.status = status
    check.body = body
    if detail and (status is None or detail.startswith("http")):
        check.url = detail
    else:
        check.url = _build_url(base_url, path, query)

    if status is None:
        check.error = str(detail)
        return check

    check.passed = status in expected_statuses
    if check.status is None:
        check.error = "No response"
    return check


def _extract_project_ids_from_templates(body: Any) -> list[str]:
    templates: list[Any]
    if isinstance(body, list):
        templates = body
    elif isinstance(body, dict):
        values = body.get("items") if isinstance(body.get("items"), list) else []
        templates = values if isinstance(values, list) else []
    else:
        return []

    project_ids: list[str] = []
    seen: set[str] = set()
    for template in templates:
        if not isinstance(template, dict):
            continue
        project_id = template.get("project_id")
        if isinstance(project_id, str) and project_id and project_id not in seen:
            seen.add(project_id)
            project_ids.append(project_id)
    return project_ids


def _invalid_project_id(project_id: str) -> str:
    if not project_id:
        return "project_invalid"
    if len(project_id) > 6:
        return f"{project_id[:-6]}invalid"
    return f"invalid_{project_id}"


def main() -> int:
    args = _parse_args()
    base_url = args.base_url
    env_file = Path(args.env_file)
    timeout = args.timeout
    checks: list[SmokeCheck] = []

    try:
        token = _resolve_token(None, env_file)
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 1

    checks.append(
        _run_check(
            checks=checks,
            base_url=base_url,
            token=token,
            method="GET",
            path="/v1/health",
            expected_statuses=[200],
            query=None,
            timeout=timeout,
        )
    )

    templates_check = _run_check(
        checks=checks,
        base_url=base_url,
        token=token,
        method="GET",
        path="/v1/workflow_templates/",
        expected_statuses=[200],
        query=None,
        timeout=timeout,
    )
    checks.append(templates_check)

    checks.append(
        _run_check(
            checks=checks,
            base_url=base_url,
            token=token,
            method="GET",
            path="/v1/users/me",
            expected_statuses=[401, 403],
            query=None,
            timeout=timeout,
        )
    )

    project_ids = _extract_project_ids_from_templates(templates_check.body)
    if project_ids:
        valid_project_id = None
        for candidate in project_ids:
            candidate_check = _run_check(
                checks=checks,
                base_url=base_url,
                token=token,
                method="GET",
                path="/v1/drive/items",
                expected_statuses=[200],
                query={"project_id": candidate},
                timeout=timeout,
            )
            checks.append(candidate_check)
            if candidate_check.status == 200:
                valid_project_id = candidate
                break
        if valid_project_id is not None:
            invalid_project_id = _invalid_project_id(valid_project_id)
            checks.append(
                _run_check(
                    checks=checks,
                    base_url=base_url,
                    token=token,
                    method="GET",
                    path="/v1/drive/items",
                    expected_statuses=[401, 403, 404, 422],
                    query={"project_id": invalid_project_id},
                    timeout=timeout,
                )
            )
        else:
            checks.append(
                SmokeCheck(
                    name="project-scoped check (valid project_id unavailable)",
                    method="GET",
                    path="/v1/drive/items",
                    expected_statuses=[200],
                    query={"project_id": project_ids[0]},
                    status=None,
                    passed=False,
                    error="No project_id from /v1/workflow_templates/ response returned 200 on /v1/drive/items",
                )
            )
    else:
        checks.append(
            SmokeCheck(
                name="project-scoped check (no project_id found)",
                method="GET",
                path="/v1/drive/items",
                expected_statuses=[200],
                query={"project_id": "project_invalid_123"},
                status=None,
                passed=False,
                error="Unable to extract project_id from /v1/workflow_templates/ response",
            )
        )

    passed_checks = [check for check in checks if check.passed]
    failed_checks = [check for check in checks if not check.passed]
    report = {
        "reported_at": datetime.now(tz=timezone.utc).isoformat(),
        "base_url": _normalize_base_url(base_url),
        "env_file": str(env_file),
        "checks": [
            {
                **asdict(check),
                "query": check.query,
                "body": check.body,
            }
            for check in checks
        ],
        "summary": {
            "total": len(checks),
            "passed": len(passed_checks),
            "failed": len(failed_checks),
            "unexpected": [check.name for check in failed_checks],
        },
    }

    report_path = args.report_path
    if report_path is None:
        timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        report_path = f"/tmp/agenticflow_public_api_smoke_{timestamp}.json"
    Path(report_path).parent.mkdir(parents=True, exist_ok=True)
    Path(report_path).write_text(
        json.dumps(report, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print(f"Report written to: {report_path}")
    if not failed_checks:
        print(
            "Public API smoke check summary: PASS "
            f"({len(passed_checks)}/{len(checks)} checks passed)"
        )
        return 0

    print("Public API smoke check summary: FAIL")
    for check in failed_checks:
        status = "N/A" if check.status is None else str(check.status)
        detail = check.error or ""
        if not detail and isinstance(check.body, str):
            detail = check.body[:200]
        if not detail and isinstance(check.body, dict):
            detail = "Response body provided"
        print(f"- {check.name}: status={status}, expected={check.expected_statuses}")
        if detail:
            print(f"  {detail}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
