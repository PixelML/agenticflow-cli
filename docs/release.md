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

## SDK and CLI (npm staging, then approval)

1. Create and push `sdk-vX.Y.Z` for `@pixelml/agenticflow-sdk`, or `cli-vX.Y.Z`
   for `@pixelml/agenticflow-cli`.
2. `.github/workflows/release-node.yaml` builds and tests the selected package,
   sets its version from the tag, then runs `npm stage publish` with npm 11.15.0.
   The repository's `NPM_TOKEN` secret must have permission to stage that package.
3. Review the package in npmjs.com → **Staged Packages**, then approve with 2FA.
   A green staging workflow means the package is awaiting approval, not live.
4. Verify the exact version is available before creating its GitHub Release:

   ```bash
   npm view @pixelml/agenticflow-sdk@1.7.0 version
   gh release create sdk-v1.7.0 --repo PixelML/agenticflow-cli --verify-tag --generate-notes
   ```

   Substitute the CLI package and tag for CLI releases. Approve the SDK version
   required by a CLI release before releasing that CLI version.

### Retry an existing tag after fixing the workflow

Once the updated workflow is on the default branch, use Actions → Release &
Publish → **Run workflow**, select the updated branch and enter `sdk-v1.7.0`
(or another existing tag) as `release_tag`. This uses the updated workflow while
building the source from the selected tag. Re-running an old run uses its old
workflow and will repeat the original failure.

Do not stage a version that is already staged or published. Review and approve
the existing staged package instead. GitHub Releases are created manually after
npm approval; the staging workflow has no repository write permission.

Reference: https://docs.npmjs.com/staged-publishing/

Python publishing still requires the `PYPI_API_TOKEN` secret.
