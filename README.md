# AgenticFlow CLI

Agent-native CLI for AgenticFlow public APIs.

## Features

- OpenAPI-backed operation discovery and invocation.
- High-level commands for workflows, agents, node types, and connections.
- API-key-based auth profiles (`AGENTICFLOW_PUBLIC_API_KEY`).
- Preflight checks (`doctor`) and capability catalog (`catalog`).
- Local guardrails (`policy`) and audit log support.
- Built-in CLI playbooks (no MCP required).

## Install (Python)

```bash
pip install agenticflow-cli
```

Then run:

```bash
agenticflow --help
```

## Install (from source)

```bash
python -m pip install -e .
agenticflow --help
```

## Auth

Use API key only:

```bash
export AGENTICFLOW_PUBLIC_API_KEY=...
agenticflow doctor --json
```

Or import from env file:

```bash
agenticflow auth import-env --file ./.env --profile default
agenticflow auth whoami --json
```

`--token` bearer override is intentionally unsupported.

## Node Wrapper (npm)

This repo also ships a thin npm wrapper package (`@pixelml/agenticflow-cli`) that invokes the Python CLI.

```bash
npm i -g @pixelml/agenticflow-cli
agenticflow --help
```

The wrapper requires Python 3.10+ with `agenticflow-cli` installed or importable.

## Release Tags

- Python release: `py-vX.Y.Z`
- npm wrapper release: `npm-vX.Y.Z`

## OSS Hygiene

- No hardcoded secrets in CLI code path.
- `.env*` and `.agenticflow/` are ignored.
- Users provide their own `AGENTICFLOW_PUBLIC_API_KEY`.
