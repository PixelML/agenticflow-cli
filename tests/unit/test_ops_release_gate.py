from __future__ import annotations

import json
from pathlib import Path

from scripts.ops_release_gate import (
    _derive_expected_counts_from_manifest,
    validate_report,
)


def _row(
    operation_id: str,
    scope: str,
    status: str,
    classification: str,
) -> dict[str, str]:
    return {
        "operation_id": operation_id,
        "support_scope": scope,
        "status": status,
        "classification": classification,
    }


def _baseline_report() -> dict[str, object]:
    results = [
        _row("op.executed.ok", "executed", "pass", "ok"),
        _row("op.executed.validation", "executed", "fail", "validation"),
        _row("op.blocked", "blocked-by-policy", "blocked", "blocked-by-policy"),
        _row("op.unsupported", "unsupported", "unsupported", "unsupported"),
    ]
    return {
        "totals": {"total": 4},
        "support_scope_counts": {
            "executed": 2,
            "blocked-by-policy": 1,
            "unsupported": 1,
        },
        "results": results,
    }


def _write_manifest(path: Path, items: list[dict[str, object]]) -> Path:
    path.write_text(json.dumps(items), encoding="utf-8")
    return path


def test_validate_report_accepts_expected_policy_mix() -> None:
    errors, metrics = validate_report(
        _baseline_report(),
        expected_total=4,
        expected_executed=2,
        expected_blocked=1,
        expected_unsupported=1,
        allowed_executed_classifications={"ok", "validation", "semantic"},
        min_executed_pass=1,
    )

    assert errors == []
    assert metrics["executed_pass"] == 1
    assert metrics["executed_fail"] == 1


def test_derive_expected_counts_from_manifest_normalizes_support_scope(tmp_path: Path) -> None:
    manifest_path = _write_manifest(
        tmp_path / "public_ops_manifest.json",
        [
            {"operation_id": "op.executed.1", "support_scope": "supported-executed"},
            {"operation_id": "op.executed.2", "support_scope": "executed"},
            {"operation_id": "op.blocked.1", "support_scope": "supported-blocked-policy"},
            {"operation_id": "op.blocked.2", "support_scope": "blocked-by-policy"},
            {
                "operation_id": "op.unsupported.1",
                "support_scope": "out-of-scope",
            },
            {"operation_id": "op.unsupported.2", "support_scope": "unsupported"},
            {"operation_id": "op.unsupported.3", "support_scope": "custom"},
        ],
    )

    assert _derive_expected_counts_from_manifest(manifest_path) == {
        "total": 7,
        "executed": 2,
        "blocked": 2,
        "unsupported": 3,
    }


def test_derive_expected_counts_from_manifest_prefers_ci_policy_flags(tmp_path: Path) -> None:
    manifest_path = _write_manifest(
        tmp_path / "public_ops_manifest.json",
        [
            {
                "operation_id": "op.execute.runtime",
                "support_scope": "supported-blocked-policy",
                "exposed_to_end_user": True,
                "ci_live_execute": True,
            },
            {
                "operation_id": "op.block.runtime",
                "support_scope": "supported-executed",
                "exposed_to_end_user": True,
                "ci_live_execute": False,
            },
            {
                "operation_id": "op.hidden",
                "support_scope": "supported-executed",
                "exposed_to_end_user": False,
                "ci_live_execute": True,
            },
        ],
    )

    assert _derive_expected_counts_from_manifest(manifest_path) == {
        "total": 3,
        "executed": 1,
        "blocked": 1,
        "unsupported": 1,
    }


def test_validate_report_rejects_total_mismatch() -> None:
    errors, _ = validate_report(
        _baseline_report(),
        expected_total=5,
        expected_executed=2,
        expected_blocked=1,
        expected_unsupported=1,
        allowed_executed_classifications={"ok", "validation", "semantic"},
        min_executed_pass=1,
    )

    assert any("total mismatch" in issue for issue in errors)


def test_validate_report_rejects_infra_or_auth_on_executed() -> None:
    report = _baseline_report()
    report["results"] = [
        _row("op.executed.infra", "executed", "fail", "infra"),
        _row("op.blocked", "blocked-by-policy", "blocked", "blocked-by-policy"),
        _row("op.unsupported", "unsupported", "unsupported", "unsupported"),
    ]
    report["totals"] = {"total": 3}
    report["support_scope_counts"] = {
        "executed": 1,
        "blocked-by-policy": 1,
        "unsupported": 1,
    }

    errors, metrics = validate_report(
        report,
        expected_total=3,
        expected_executed=1,
        expected_blocked=1,
        expected_unsupported=1,
        allowed_executed_classifications={"ok", "validation", "semantic"},
        min_executed_pass=0,
    )

    assert metrics["executed_auth_infra"] == 1
    assert any("classified as infra" in issue for issue in errors)


def test_validate_report_rejects_bad_blocked_row_shape() -> None:
    report = _baseline_report()
    report["results"] = [
        _row("op.executed.ok", "executed", "pass", "ok"),
        _row("op.blocked.bad", "blocked-by-policy", "pass", "ok"),
        _row("op.unsupported", "unsupported", "unsupported", "unsupported"),
    ]
    report["totals"] = {"total": 3}
    report["support_scope_counts"] = {
        "executed": 1,
        "blocked-by-policy": 1,
        "unsupported": 1,
    }

    errors, _ = validate_report(
        report,
        expected_total=3,
        expected_executed=1,
        expected_blocked=1,
        expected_unsupported=1,
        allowed_executed_classifications={"ok", "validation", "semantic"},
        min_executed_pass=1,
    )

    assert any("blocked scope must be status=blocked" in issue for issue in errors)
