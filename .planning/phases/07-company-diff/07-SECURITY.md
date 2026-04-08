---
phase: 07-company-diff
plan: "01"
asvs_level: 1
audited: 2026-04-07
status: SECURED
---

# Security Audit — Phase 07: Company Diff Command

## Summary

**Threats Closed:** 6/6
**ASVS Level:** 1
**Auditor:** gsd-security-auditor

---

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|-----------|----------|-------------|--------|----------|
| T-07-01 | Tampering / Input Validation | mitigate | CLOSED | main.ts:5471 `resolve(file)` + 5473 `existsSync(filePath)` guard + 5474-5478 `fail("file_not_found", ...)` with hint |
| T-07-02 | Tampering / Injection | mitigate | CLOSED | main.ts:5493-5500 `parseYaml(raw)` inside try/catch → `fail("invalid_yaml", err.message, hint)`, stack never surfaced |
| T-07-03 | DoS / Resource Exhaustion | accept | CLOSED | Accepted: CLI is local single-user tool; user controls input; no network exposure |
| T-07-04 | Information Disclosure | accept | CLOSED | Accepted: CLI is local; absolute paths in errors are desired for debugging; no multi-tenant context |
| T-07-05 | Tampering / Schema confusion | mitigate | CLOSED | company-io.ts:298-303 `localSchema.schema !== "agenticflow.company.export.v1"` → `CompanyIOError("schema_version_mismatch")` |
| T-07-06 | Repudiation | mitigate | CLOSED | company-io.ts:347 `agents.sort((a, b) => a.name.localeCompare(b.name))`; changedFields uses `JSON.stringify` for stable comparison (line 152); main.ts:5469 documents exit code contract in help text |

---

## Accepted Risks Log

### T-07-03 — DoS / Resource Exhaustion (Oversized YAML file)

- **Rationale:** The `af company diff` command is a local CLI tool. The file being read is always supplied by the invoking user on their own machine. There is no network-exposed endpoint and no multi-tenant context. Memory exhaustion from an oversized file would affect only the user who provided it, with no broader blast radius.
- **Residual risk:** Low. User-controlled local input only.
- **Review trigger:** If the CLI gains a server mode or accepts remote/untrusted input.

### T-07-04 — Information Disclosure (Absolute paths in errors)

- **Rationale:** Absolute filesystem paths appearing in error messages (e.g., `Company file not found: /Users/sean/...`) are intentional and helpful for local CLI debugging. There is no multi-tenant deployment where a path could leak cross-tenant information.
- **Residual risk:** None in current deployment model.
- **Review trigger:** If the CLI output is consumed by a shared logging pipeline or deployed in a multi-user server context.

---

## Threat Flags (from SUMMARY.md)

No `## Threat Flags` section present in 07-01-SUMMARY.md. No unregistered flags to log.

---

## Files Audited

- `packages/cli/src/cli/company-io.ts` — diffCompany() implementation
- `packages/cli/src/cli/main.ts` — diff subcommand handler (lines 5464-5539)
- `.planning/phases/07-company-diff/07-01-PLAN.md` — threat model source
- `.planning/phases/07-company-diff/07-01-SUMMARY.md` — executor summary and deviations
