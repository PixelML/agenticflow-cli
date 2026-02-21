# Release Guide

## Preflight Gate (required)

Run before creating tags:

```bash
bash scripts/release_readiness.sh
```

Optional live coverage check for public manifest scope (requires API key env):

```bash
bash scripts/release_readiness.sh --live-ops-gate --env-file /path/to/.env
```

CI automation:
- `release-python` and `release-node` workflows run the same live gate when `AGENTICFLOW_PUBLIC_API_KEY` secret is set.
- Optional `AGENTICFLOW_BASE_URL` secret can override the default API base URL.

## Python (PyPI + GitHub Release)

1. Bump `pyproject.toml` version.
2. Create tag:
   - `git tag py-vX.Y.Z`
   - `git push origin py-vX.Y.Z`
3. Workflow: `.github/workflows/release-python.yaml`

## Node Wrapper (npm + GitHub Release)

1. Create tag:
   - `git tag npm-vX.Y.Z`
   - `git push origin npm-vX.Y.Z`
2. Workflow: `.github/workflows/release-node.yaml`

Notes:
- Node workflow syncs `package.json` version from tag at release time.
- Python publish requires `PYPI_API_TOKEN` secret.
- npm publish uses Trusted Publishing (OIDC), no `NPM_TOKEN` needed.
- If Node is unavailable locally, run `bash scripts/release_readiness.sh --skip-node` and rely on CI for wrapper verification.
