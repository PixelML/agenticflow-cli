"""Release-gate checks for local operation-id mapping consistency."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from agenticflow_cli.main import (
    AGENT_OPERATION_IDS,
    CONNECTION_OPERATION_IDS,
    NODE_TYPE_OPERATION_IDS,
    WORKFLOW_OPERATION_IDS,
)
from agenticflow_cli.spec import OperationRegistry, default_spec_path, load_openapi_spec
from agenticflow_sdk.client import _KNOWN_OPERATIONS


def _public_ops_manifest_path() -> Path:
    return Path(__file__).resolve().parent / "public_ops_manifest.json"


def collect_mapped_operation_ids() -> dict[str, str]:
    """Collect operation IDs from all local hardcoded mapping sources."""
    mapped: dict[str, str] = {}
    mapping_buckets = (
        ("cli.workflow", WORKFLOW_OPERATION_IDS),
        ("cli.agent", AGENT_OPERATION_IDS),
        ("cli.node_type", NODE_TYPE_OPERATION_IDS),
        ("cli.connection", CONNECTION_OPERATION_IDS),
    )
    for source, bucket in mapping_buckets:
        for alias, operation_id in bucket.items():
            mapped[f"{source}.{alias}"] = operation_id

    for alias, operation in _KNOWN_OPERATIONS.items():
        if operation.operation_id is not None:
            mapped[f"sdk.{alias}"] = operation.operation_id

    return mapped


def collect_bundled_openapi_operation_ids(spec_file: Path | None = None) -> set[str]:
    """Load operation IDs from local bundled OpenAPI."""
    spec_path = spec_file or default_spec_path()
    spec = load_openapi_spec(spec_path)
    return {
        operation.operation_id
        for operation in OperationRegistry.from_spec(spec).list_operations()
    }


def collect_manifest_operation_ids(manifest_file: Path | None = None) -> set[str]:
    manifest_path = manifest_file or _public_ops_manifest_path()
    raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    if not isinstance(raw, list):
        raise TypeError("public_ops_manifest.json must be a list of operation records")
    operation_ids: set[str] = set()
    for item in raw:
        if isinstance(item, dict):
            value = item.get("operation_id")
            if isinstance(value, str) and value:
                operation_ids.add(value)
    return operation_ids


def find_operation_id_issues(
    *,
    spec_file: Path | None = None,
    manifest_file: Path | None = None,
    mapped_operation_ids: dict[str, str] | None = None,
) -> tuple[list[tuple[str, str]], list[str]]:
    """Return stale mapping IDs and stale manifest IDs."""
    spec_ids = collect_bundled_openapi_operation_ids(spec_file=spec_file)
    manifest_ids = collect_manifest_operation_ids(manifest_file=manifest_file)
    mapped = collect_mapped_operation_ids() if mapped_operation_ids is None else mapped_operation_ids

    stale_mappings = [
        (mapping_name, operation_id)
        for mapping_name, operation_id in mapped.items()
        if operation_id not in spec_ids
    ]
    stale_manifest = sorted(manifest_ids - spec_ids)
    stale_mappings.sort()
    return stale_mappings, stale_manifest


def check_operation_id_mappings(
    *,
    spec_file: Path | None = None,
    manifest_file: Path | None = None,
    mapped_operation_ids: dict[str, str] | None = None,
) -> int:
    """Run the operation-id mapping gate and print findings."""
    stale_mappings, stale_manifest = find_operation_id_issues(
        spec_file=spec_file,
        manifest_file=manifest_file,
        mapped_operation_ids=mapped_operation_ids,
    )

    if not stale_mappings and not stale_manifest:
        print("Operation-id mapping gate passed: CLI/SDK mappings and manifest are current.")
        return 0

    print("Operation-id mapping gate failed:", file=sys.stderr)
    if stale_mappings:
        print("  Stale hardcoded mapping entries:", file=sys.stderr)
        for mapping_name, operation_id in stale_mappings:
            print(f"    {mapping_name}: {operation_id}", file=sys.stderr)
    if stale_manifest:
        print("  Stale public_ops_manifest entries:", file=sys.stderr)
        for operation_id in stale_manifest:
            print(f"    {operation_id}", file=sys.stderr)

    return 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate operation-id mappings against local OpenAPI artifacts.",
    )
    parser.add_argument(
        "--spec-file",
        type=Path,
        default=default_spec_path(),
        help="Path to bundled OpenAPI JSON file.",
    )
    parser.add_argument(
        "--manifest-file",
        type=Path,
        default=_public_ops_manifest_path(),
        help="Path to public_ops_manifest.json.",
    )
    args = parser.parse_args(argv)
    return check_operation_id_mappings(
        spec_file=args.spec_file,
        manifest_file=args.manifest_file,
    )


if __name__ == "__main__":
    raise SystemExit(main())
