#!/usr/bin/env python3
"""Validate ops coverage report for release readiness."""

from __future__ import annotations

import argparse
from collections import Counter
import json
import sys
from pathlib import Path
from typing import Any, Mapping


SUPPORT_SCOPE_EXECUTED = "executed"
SUPPORT_SCOPE_BLOCKED = "blocked-by-policy"
SUPPORT_SCOPE_UNSUPPORTED = "unsupported"
DEFAULT_MANIFEST_PATH = (
    Path(__file__).resolve().parent.parent / "src/agenticflow_cli/public_ops_manifest.json"
)
SUPPORT_SCOPE_ALIASES = {
    SUPPORT_SCOPE_EXECUTED: SUPPORT_SCOPE_EXECUTED,
    "executed": SUPPORT_SCOPE_EXECUTED,
    "supported-executed": SUPPORT_SCOPE_EXECUTED,
    "supported_executed": SUPPORT_SCOPE_EXECUTED,
    SUPPORT_SCOPE_BLOCKED: SUPPORT_SCOPE_BLOCKED,
    "supported-blocked-policy": SUPPORT_SCOPE_BLOCKED,
    "supported-blocked_policy": SUPPORT_SCOPE_BLOCKED,
    "supported_blocked_policy": SUPPORT_SCOPE_BLOCKED,
    "blocked-by-policy": SUPPORT_SCOPE_BLOCKED,
    "blocked_by_policy": SUPPORT_SCOPE_BLOCKED,
    "blocked_policy": SUPPORT_SCOPE_BLOCKED,
    "blocked": SUPPORT_SCOPE_BLOCKED,
    SUPPORT_SCOPE_UNSUPPORTED: SUPPORT_SCOPE_UNSUPPORTED,
    "supported-unsupported": SUPPORT_SCOPE_UNSUPPORTED,
    "out-of-scope": SUPPORT_SCOPE_UNSUPPORTED,
    "out_of_scope": SUPPORT_SCOPE_UNSUPPORTED,
    "unsupported": SUPPORT_SCOPE_UNSUPPORTED,
}


def _parse_csv_values(raw: str) -> set[str]:
    values: set[str] = set()
    for value in raw.split(","):
        cleaned = value.strip()
        if cleaned:
            values.add(cleaned)
    return values


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Validate scripts/ops_coverage_harness.py JSON report against release "
            "expectations derived from the public ops manifest by default."
        )
    )
    parser.add_argument(
        "--report-json",
        required=True,
        help="Path to JSON report from scripts/ops_coverage_harness.py",
    )
    parser.add_argument(
        "--manifest-file",
        type=Path,
        default=DEFAULT_MANIFEST_PATH,
        help="Path to public ops manifest used when expected counts are not provided.",
    )
    parser.add_argument("--expected-total", type=int)
    parser.add_argument("--expected-executed", type=int)
    parser.add_argument("--expected-blocked", type=int)
    parser.add_argument("--expected-unsupported", type=int)
    parser.add_argument(
        "--allowed-executed-classifications",
        default="ok,validation,semantic",
        help=(
            "Comma-separated allowed classifications for executed ops. "
            "Default: ok,validation,semantic"
        ),
    )
    parser.add_argument(
        "--min-executed-pass",
        type=int,
        default=1,
        help="Require at least this many executed ops to classify as pass.",
    )
    return parser.parse_args()


def _as_mapping(value: Any) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return value
    return {}


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    return []


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:  # noqa: BLE001
        return default


def _normalize_support_scope(value: Any) -> str:
    normalized = str(value).strip().lower() if isinstance(value, str) else ""
    return SUPPORT_SCOPE_ALIASES.get(normalized, SUPPORT_SCOPE_UNSUPPORTED)


def _load_manifest(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise TypeError(f"Manifest must be a JSON list: {path}")
    records: list[dict[str, Any]] = []
    for item in payload:
        if isinstance(item, Mapping):
            records.append(dict(item))
    return records


def _derive_expected_counts_from_manifest(path: Path) -> dict[str, int]:
    records = _load_manifest(path)
    scope_counts: Counter[str] = Counter()
    for record in records:
        scope_counts[_normalize_support_scope(record.get("support_scope"))] += 1
    return {
        "total": len(records),
        "executed": scope_counts[SUPPORT_SCOPE_EXECUTED],
        "blocked": scope_counts[SUPPORT_SCOPE_BLOCKED],
        "unsupported": scope_counts[SUPPORT_SCOPE_UNSUPPORTED],
    }


def _load_report(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise TypeError("ops coverage report must be a JSON object")
    return payload


def validate_report(
    report: Mapping[str, Any],
    *,
    expected_total: int,
    expected_executed: int,
    expected_blocked: int,
    expected_unsupported: int,
    allowed_executed_classifications: set[str],
    min_executed_pass: int,
) -> tuple[list[str], dict[str, int]]:
    errors: list[str] = []
    totals = _as_mapping(report.get("totals"))
    support_scope_counts = _as_mapping(report.get("support_scope_counts"))
    results = _as_list(report.get("results"))

    actual_total = _safe_int(totals.get("total"), len(results))
    actual_executed = _safe_int(support_scope_counts.get(SUPPORT_SCOPE_EXECUTED))
    actual_blocked = _safe_int(support_scope_counts.get(SUPPORT_SCOPE_BLOCKED))
    actual_unsupported = _safe_int(support_scope_counts.get(SUPPORT_SCOPE_UNSUPPORTED))

    if actual_total != expected_total:
        errors.append(f"total mismatch: expected {expected_total}, got {actual_total}")
    if len(results) != expected_total:
        errors.append(
            f"results length mismatch: expected {expected_total}, got {len(results)}"
        )
    if actual_executed != expected_executed:
        errors.append(
            f"executed scope mismatch: expected {expected_executed}, got {actual_executed}"
        )
    if actual_blocked != expected_blocked:
        errors.append(
            f"blocked scope mismatch: expected {expected_blocked}, got {actual_blocked}"
        )
    if actual_unsupported != expected_unsupported:
        errors.append(
            f"unsupported scope mismatch: expected {expected_unsupported}, got {actual_unsupported}"
        )

    executed_pass = 0
    executed_fail = 0
    executed_auth_infra = 0

    for item in results:
        row = _as_mapping(item)
        operation_id = str(row.get("operation_id") or "<missing-operation-id>")
        scope = str(row.get("support_scope") or "")
        status = str(row.get("status") or "")
        classification = str(row.get("classification") or "")

        if scope == SUPPORT_SCOPE_EXECUTED:
            if status == "pass":
                executed_pass += 1
            elif status == "fail":
                executed_fail += 1
            if classification not in allowed_executed_classifications:
                errors.append(
                    f"{operation_id}: executed classification '{classification}' not allowed"
                )
            if classification in {"auth", "infra"}:
                executed_auth_infra += 1
                errors.append(
                    f"{operation_id}: executed op classified as {classification}"
                )
        elif scope == SUPPORT_SCOPE_BLOCKED:
            if status != "blocked" or classification != "blocked-by-policy":
                errors.append(
                    f"{operation_id}: blocked scope must be status=blocked and classification=blocked-by-policy"
                )
        elif scope == SUPPORT_SCOPE_UNSUPPORTED:
            if status != "unsupported" or classification != "unsupported":
                errors.append(
                    f"{operation_id}: unsupported scope must be status=unsupported and classification=unsupported"
                )
        else:
            errors.append(f"{operation_id}: unknown support_scope '{scope}'")

    if executed_pass < min_executed_pass:
        errors.append(
            f"executed pass count below minimum: expected >= {min_executed_pass}, got {executed_pass}"
        )

    metrics = {
        "total": actual_total,
        "executed": actual_executed,
        "blocked": actual_blocked,
        "unsupported": actual_unsupported,
        "executed_pass": executed_pass,
        "executed_fail": executed_fail,
        "executed_auth_infra": executed_auth_infra,
    }
    return errors, metrics


def main() -> int:
    args = _parse_args()
    report_path = Path(args.report_json)
    if not report_path.exists():
        print(f"Report JSON not found: {report_path}", file=sys.stderr)
        return 2

    try:
        report = _load_report(report_path)
    except Exception as exc:  # noqa: BLE001
        print(f"Failed to read report JSON: {exc}", file=sys.stderr)
        return 2

    expected_total = args.expected_total
    expected_executed = args.expected_executed
    expected_blocked = args.expected_blocked
    expected_unsupported = args.expected_unsupported

    if any(
        value is None
        for value in (
            expected_total,
            expected_executed,
            expected_blocked,
            expected_unsupported,
        )
    ):
        manifest_path = Path(args.manifest_file)
        if not manifest_path.exists():
            print(f"Manifest file not found: {manifest_path}", file=sys.stderr)
            return 2
        try:
            expected = _derive_expected_counts_from_manifest(manifest_path)
        except Exception as exc:  # noqa: BLE001
            print(f"Failed to read manifest JSON: {exc}", file=sys.stderr)
            return 2
        if expected_total is None:
            expected_total = expected["total"]
        if expected_executed is None:
            expected_executed = expected["executed"]
        if expected_blocked is None:
            expected_blocked = expected["blocked"]
        if expected_unsupported is None:
            expected_unsupported = expected["unsupported"]

    errors, metrics = validate_report(
        report,
        expected_total=expected_total,
        expected_executed=expected_executed,
        expected_blocked=expected_blocked,
        expected_unsupported=expected_unsupported,
        allowed_executed_classifications=_parse_csv_values(
            args.allowed_executed_classifications
        ),
        min_executed_pass=args.min_executed_pass,
    )

    print(
        "Release ops gate metrics:",
        json.dumps(metrics, sort_keys=True),
    )
    if errors:
        print("Release ops gate: FAIL", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("Release ops gate: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
