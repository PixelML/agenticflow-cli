# Contributing

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Test

```bash
pytest -q tests/unit
```

## Standards

- Keep CLI output machine-readable where `--json` is supported.
- Never print secrets in logs or command output.
- Keep auth model API-key/profile based (`AGENTICFLOW_PUBLIC_API_KEY`).
