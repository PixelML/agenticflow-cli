# Release Guide

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
