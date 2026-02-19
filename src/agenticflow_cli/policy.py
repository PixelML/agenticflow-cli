"""Policy and audit helpers for AgenticFlow CLI runtime guardrails."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping

from agenticflow_cli.spec import Operation

POLICY_FILE_NAME = "policy.json"
AUDIT_LOG_FILE_NAME = "agenticflow-audit.log"
DEFAULT_POLICY_VERSION = 1
CONFIG_DIR_ENV_VAR = "AGENTICFLOW_CLI_DIR"
POLICY_FILE_ENV_VAR = "AGENTICFLOW_POLICY_FILE"
AUDIT_LOG_ENV_VAR = "AGENTICFLOW_AUDIT_LOG_FILE"


class PolicyConfigError(ValueError):
    """Raised when policy JSON cannot be loaded or written."""

    code: str
    retryable: bool
    detail: str

    def __init__(self, code: str, detail: str, retryable: bool = False) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.retryable = retryable


@dataclass(frozen=True)
class PolicyConfig:
    spend_ceiling: float | None = None
    allowlist: tuple[str, ...] = ()
    blocklist: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "spend_ceiling": self.spend_ceiling,
            "allowlist": list(self.allowlist),
            "blocklist": list(self.blocklist),
        }


@dataclass(frozen=True)
class PolicyViolation:
    code: str
    detail: str
    retryable: bool = False


def _resolve_cli_dir(config_dir: Path | None = None) -> Path:
    if config_dir is not None:
        return config_dir.expanduser()
    env_dir = os.getenv(CONFIG_DIR_ENV_VAR)
    if env_dir:
        return Path(env_dir).expanduser()
    return (Path.home() / ".agenticflow").expanduser()


def policy_file_path(
    *,
    policy_file: Path | None = None,
    config_dir: Path | None = None,
) -> Path:
    if policy_file is not None:
        return policy_file.expanduser()
    env_path = os.getenv(POLICY_FILE_ENV_VAR)
    if env_path:
        return Path(env_path).expanduser()
    return _resolve_cli_dir(config_dir) / POLICY_FILE_NAME


def audit_log_path(
    *,
    audit_log: Path | None = None,
    config_dir: Path | None = None,
    policy_file: Path | None = None,
) -> Path:
    if audit_log is not None:
        return audit_log.expanduser()
    env_path = os.getenv(AUDIT_LOG_ENV_VAR)
    if env_path:
        return Path(env_path).expanduser()
    resolved_config_dir: Path | None = None
    if config_dir is not None:
        resolved_config_dir = _resolve_cli_dir(config_dir)
    elif policy_file is not None:
        resolved_config_dir = Path(policy_file).expanduser().parent
    else:
        resolved_config_dir = _resolve_cli_dir(None)
    return resolved_config_dir / AUDIT_LOG_FILE_NAME


def _coerce_spend_value(value: Any, *, field_name: str) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError as exc:
            raise PolicyConfigError(
                "policy.invalid_spend_ceiling",
                f"Invalid value for {field_name}: {value}",
            ) from exc
    raise PolicyConfigError(
        "policy.invalid_spend_ceiling",
        f"Invalid value for {field_name}: {value}",
    )


def _coerce_operations(value: Any, *, field_name: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if not isinstance(value, list):
        raise PolicyConfigError(
            "policy.invalid_operation_list",
            f"{field_name} must be a JSON array of strings.",
        )
    operations: list[str] = []
    for item in value:
        if not isinstance(item, str):
            raise PolicyConfigError(
                "policy.invalid_operation_list",
                f"{field_name} must contain only strings.",
            )
        operations.append(item)
    return tuple(operations)


def _coerce_policy_payload(payload: Mapping[str, Any]) -> PolicyConfig:
    spend_ceiling = _coerce_spend_value(
        payload.get("spend_ceiling"),
        field_name="spend_ceiling",
    )
    allowlist = _coerce_operations(payload.get("allowlist"), field_name="allowlist")
    blocklist = _coerce_operations(payload.get("blocklist"), field_name="blocklist")
    return PolicyConfig(
        spend_ceiling=spend_ceiling,
        allowlist=allowlist,
        blocklist=blocklist,
    )


def load_policy(
    *,
    policy_file: Path | None = None,
    config_dir: Path | None = None,
) -> PolicyConfig:
    path = policy_file_path(policy_file=policy_file, config_dir=config_dir)
    if not path.exists():
        return PolicyConfig()
    try:
        raw_text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise PolicyConfigError(
            "policy.load_failed",
            f"Failed to read policy file: {path}",
        ) from exc

    try:
        payload = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise PolicyConfigError(
            "policy.load_failed",
            f"Policy file is not valid JSON: {path}",
        ) from exc
    if not isinstance(payload, Mapping):
        raise PolicyConfigError(
            "policy.load_failed",
            f"Policy file payload must be an object: {path}",
        )
    try:
        return _coerce_policy_payload(payload)
    except PolicyConfigError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise PolicyConfigError(
            "policy.load_failed",
            f"Invalid policy file format: {path}",
        ) from exc


def write_default_policy(
    *,
    policy_file: Path | None = None,
    config_dir: Path | None = None,
    spend_ceiling: float | None = None,
    allowlist: tuple[str, ...] = (),
    blocklist: tuple[str, ...] = (),
    force: bool = False,
) -> tuple[Path, PolicyConfig]:
    path = policy_file_path(policy_file=policy_file, config_dir=config_dir)
    if path.exists() and not force:
        raise PolicyConfigError(
            "policy.already_exists",
            f"Policy file already exists: {path}",
        )
    config = PolicyConfig(
        spend_ceiling=spend_ceiling,
        allowlist=allowlist,
        blocklist=blocklist,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": DEFAULT_POLICY_VERSION,
        "spend_ceiling": config.spend_ceiling,
        "allowlist": list(config.allowlist),
        "blocklist": list(config.blocklist),
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path, config


def _first_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def estimate_operation_cost(operation: Operation) -> float | None:
    raw = operation.raw
    if not isinstance(raw, Mapping):
        return None
    for key in (
        "x-cost",
        "x-cost-estimate",
        "x-spend",
        "x-spend-estimate",
        "estimated_cost",
    ):
        candidate = _first_float(raw.get(key))
        if candidate is not None:
            return candidate
    return None


def evaluate_policy(
    policy_config: PolicyConfig,
    operation: Operation,
    *,
    estimated_cost: float | None = None,
) -> PolicyViolation | None:
    operation_id = operation.operation_id
    if not operation_id:
        return PolicyViolation(
            code="policy.operation_missing_id",
            detail="Cannot apply policy because the operation has no operation_id.",
        )
    if operation_id in policy_config.blocklist:
        return PolicyViolation(
            code="policy.blocklisted",
            detail=f"Operation '{operation_id}' is blocklisted.",
        )
    if policy_config.allowlist and operation_id not in policy_config.allowlist:
        return PolicyViolation(
            code="policy.not_allowlisted",
            detail=(
                f"Operation '{operation_id}' is not in the allowlist policy."
            ),
        )
    if policy_config.spend_ceiling is None:
        return None

    operation_cost = estimated_cost
    if operation_cost is None:
        operation_cost = estimate_operation_cost(operation)
    if operation_cost is None:
        return None
    if operation_cost > policy_config.spend_ceiling:
        return PolicyViolation(
            code="policy.spend_ceiling_exceeded",
            detail=(
                f"Estimated cost {operation_cost:g} exceeds "
                f"spend ceiling {policy_config.spend_ceiling:g}."
            ),
        )
    return None


def audit_error_payload(
    code: str,
    detail: str,
    *,
    operation_id: str | None = None,
    retryable: bool = False,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "code": code,
        "retryable": retryable,
        "detail": detail,
    }
    if operation_id is not None:
        payload["operation_id"] = operation_id
    return payload


def write_audit_entry(
    *,
    operation_id: str,
    status: str,
    latency_ms: float,
    result_code: str,
    error: str | None = None,
    audit_path: Path | None = None,
    config_dir: Path | None = None,
    policy_file: Path | None = None,
) -> None:
    path = audit_log_path(
        audit_log=audit_path,
        config_dir=config_dir,
        policy_file=policy_file,
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "operation_id": operation_id,
        "status": status,
        "latency_ms": latency_ms,
        "result_code": result_code,
    }
    if error is not None:
        payload["error"] = error
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload) + "\n")
