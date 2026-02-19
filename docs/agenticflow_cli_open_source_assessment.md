# AgenticFlow CLI Open Source Assessment

Date: 2026-02-19  
Scope: `src/agenticflow_cli`, `scripts/agenticflow_cli.py`, CLI docs/release workflow

## Recommendation

Yes, the CLI can be open sourced, with basic hygiene controls.

## Sensitive Data Review

Current CLI code paths do **not** include hardcoded API keys or secrets.

Auth model:
- Uses `AGENTICFLOW_PUBLIC_API_KEY` from environment/profile.
- `--token` bearer override is intentionally unsupported.
- `auth whoami` reports key presence only (`has_api_key`), not raw key content.

## Risks To Control Before Public Release

1. License is not yet defined in repo root.
   - Add `LICENSE` (Apache-2.0 recommended for enterprise adoption).
2. Keep `.env` files and local auth config out of version control.
   - Ensure `.gitignore` covers `.env*` and `.agenticflow/`.
3. Public docs should avoid internal-only endpoints or operational details that are not part of the intended public surface.
4. Release workflow should only run from trusted branches/tags.
   - Implemented tag guards: `py-vX.Y.Z` and `npm-vX.Y.Z`.

## Open Source Readiness Checklist

- [ ] License file added.
- [ ] README includes API-key-only auth instructions.
- [ ] Security policy/contact documented (optional but recommended).
- [ ] Release tags and artifact checksums validated in CI.
- [ ] No secrets in repo history (run secret scanner before publish).
