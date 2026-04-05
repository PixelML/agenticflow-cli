---
phase: 2
reviewers: [gemini, codex]
reviewed_at: 2026-04-05
plans_reviewed: [02-01-PLAN.md, 02-02-PLAN.md, 02-03-PLAN.md]
---

# Cross-AI Plan Review — Phase 2

## Gemini Review

### Summary
The Phase 2 plans are well-structured, prioritizing the developer/AI experience by focusing on "zero-install" (`npx`) and high-quality documentation for the Ishi LLM. The strategy of leveraging the existing `amazon-seller-pack` pattern for new domain packs ensures consistency and speed. By treating the Ishi Skill as the "brain" and the CLI as the "muscle," the plans effectively address the goal of making AgenticFlow the headquarters for AI agents with minimal friction. The inclusion of an end-to-end validation phase (02-03) with a human checkpoint is a critical safeguard for the "one conversation" success metric.

### Strengths
- Zero-Friction Onboarding: The decision to teach Ishi to use `npx @pixelml/agenticflow-cli` aligns perfectly with the "5 minutes to useful output" goal.
- Pattern Consistency: Reusing the `amazon-seller-pack` structure reduces architectural risk.
- Standardized Action Workflows: Formalizing the `LLM -> mcp_run_action` pattern provides a reliable blueprint.
- LLM-Centric Documentation: Updating `SKILL.md` with exact JSON output shapes improves Ishi's reliability.
- Comprehensive Validation: Plan 02-03's 6-step sequence covers the entire lifecycle.

### Concerns
- **MEDIUM**: Cross-Repo Synchronization — Plan 02-01 modifies the `agenticflow-skill` repo. If Ishi's global skill is updated before CLI changes are published or packs merged, Ishi might attempt to use packs/flags that don't exist.
- **LOW**: Generic Agent Roles — Using standard `cmo, engineer, researcher, general, ceo` for Tutor Pack feels slightly mismatched (e.g., "Engineer" for curriculum design).
- **MEDIUM**: Connection Bottlenecks — Action workflows rely on Gmail. If user hasn't configured connections, the "one conversation" flow breaks. Pre-flight check mentioned but Ishi needs clear fix-it instructions.
- **LOW**: Validation Flakiness — Automated tests hitting live AgenticFlow platform subject to network/API latency.

### Suggestions
- Domain-Specific Role Aliasing: Map roles to domain-specific display names in descriptions.
- Graceful Connection Handling: Add "Error Recovery" section in SKILL.md teaching Ishi connection fix flow.
- Version Pinning: Ensure SKILL.md mentions minimum `af` version `1.3.1`.
- Modular Validation: Add "Mock Mode" to validation script for faster local iteration.

### Risk Assessment
**LOW/MEDIUM** — Technical risk is low (standard shell execution, proven YAML patterns). Medium risk from external dependencies: cross-repo timing and API connection requirements during validation.

---

## Codex Review

### Plan 02-01

**Summary:** Appropriately narrow and aligned with ISHI-02. Strong on documentation structure and keeps skill thin. Main weakness: treats skill update as content authoring while success depends on prompt reliability.

**Strengths:**
- Tight scope matching "CLI handles heavy lifting" decision
- Linked reference files for maintainability
- Covers key Phase 1 concepts: bootstrap, connections, action workflows, pack discovery
- Documents structured JSON/bootstrap output for AI-first consumption

**Concerns:**
- **HIGH**: No explicit validation that SKILL.md actually produces intended agent behavior in Ishi. Documentation completeness ≠ prompt effectiveness.
- **HIGH**: No mention of failure modes for auto-install, missing auth, missing connections, or partial bootstrap. These are likely first-run issues.
- **MEDIUM**: Pack catalog may drift from actual available packs without validation step.
- **MEDIUM**: Connection pre-flight check unclear whether Ishi checks before every deployment/workflow.
- **LOW**: Bootstrap output shape may become stale without versioned CLI reference.

**Suggestions:**
- Add explicit first-run recovery guidance (missing API key, failed npx, unauthenticated bootstrap, missing connections)
- Add "decision policy" section telling Ishi when to bootstrap, inspect packs, validate connections, offer Paperclip
- Add consistency check between pack catalog in skill and actual packs in CLI repo
- Include 2-3 canonical command examples for common intents

**Risk: MEDIUM**

### Plan 02-02

**Summary:** Well-scoped and directly addresses PACK-02. Reuses proven pack pattern. Main concern: whether packs are structurally valid vs genuinely useful in the "set up my business" flow.

**Strengths:**
- Clear alignment with D-08, D-09, D-10
- Both LLM-only and action-based workflows for realistic coverage
- 5 agents per pack — complete without being too large
- Bounded, autonomous implementation

**Concerns:**
- **HIGH**: Action workflows assume specific MCP action (gmail-send_email) but no fallback if integration unavailable.
- **MEDIUM**: Generic role labels may not feel domain-authentic for tutoring/freelancing.
- **MEDIUM**: No validation that new packs are discoverable by CLI pack commands and Ishi skill catalog.
- **MEDIUM**: "send-invoice" may overpromise capability if it's really just "draft and email invoice."
- **MEDIUM**: Starter tasks not tuned for good first-run demo.
- **LOW**: Copy-paste risk leading to shallow domain differentiation.

**Suggestions:**
- Add pack-level validation beyond file creation (schema validation, entrypoint integrity, CLI discovery)
- Define required connections per pack with graceful fallback
- Ensure each pack has strong "first user utterance" mapping
- Add at least one negative-path test per pack

**Risk: MEDIUM**

### Plan 02-03

**Summary:** Most important plan for proving ISHI-01. Correctly includes human checkpoint. Concern: automated sequence too shallow relative to success criterion.

**Strengths:**
- Correctly positioned after 01 and 02
- Both automated and human validation
- Covers multiple layers: install, bootstrap, skill discovery, pack validation, agent run, catalog
- Acknowledges prompt-driven integration needs human verification

**Concerns:**
- **HIGH**: Automated sequence doesn't test core success path end-to-end (natural language → pack recommendation → agent creation → task execution).
- **HIGH**: No environment matrix or prerequisites specified (Ishi version, auth state, network, MCP connections, Paperclip).
- **MEDIUM**: Human verification checkpoint underspecified — no script, no pass/fail criteria.
- **MEDIUM**: No explicit test for optional Paperclip deployment (D-12).
- **MEDIUM**: No failure-path verification (missing auth, missing connections).
- **LOW**: External service dependency makes tests flaky.

**Suggestions:**
- Expand to scenario-based validation: tutoring with no install, freelancer with existing install, missing API key, missing connection, Paperclip accepted/declined
- Define exact environment prerequisites and pin versions
- Turn human checkpoint into script with explicit prompts and expected outcomes
- Add acceptance criteria tied to D-11 and D-13
- Capture artifacts: commands issued by Ishi, CLI outputs, selected pack, recovery behavior
- Separate structural from experience validation

**Risk: HIGH**

### Overall Codex Assessment
**MEDIUM-HIGH** — Plans are sensible and not bloated, but optimize more for producing the right files than proving the integrated user experience. The phase can succeed if validation is tightened and first-run/failure-path behavior is made explicit.

---

## Consensus Summary

### Agreed Strengths
- Pattern reuse from amazon-seller-pack reduces implementation risk (Gemini + Codex)
- Shell-out approach (D-01) keeps integration minimal and maintainable (Gemini + Codex)
- Documentation-first approach with linked reference files is well-suited for LLM consumption (Gemini + Codex)
- Wave ordering is correct: skill + packs in parallel, then validation (Gemini + Codex)

### Agreed Concerns
- **HIGH: First-run failure paths underplanned** — Both reviewers flag that missing auth, missing connections, and failed npx install are likely first-run scenarios not adequately covered in skill docs or validation (Gemini: connection bottlenecks, Codex: failure modes)
- **HIGH: Validation plan (02-03) needs strengthening** — Both note the automated test sequence doesn't fully test the end-to-end natural language → orchestration flow. Human checkpoint is underspecified. (Gemini: validation flakiness, Codex: too shallow, no environment matrix)
- **MEDIUM: Connection dependency risk** — Both identify that action workflows assume Gmail MCP is configured, but the skill needs clearer recovery guidance when connections are missing (Gemini: connection bottlenecks, Codex: no fallback behavior)
- **MEDIUM: Pack catalog consistency** — Risk of skill listing packs that don't exist or aren't discoverable by CLI (Gemini: cross-repo sync, Codex: catalog drift)

### Divergent Views
- **Role naming**: Gemini suggests aliasing generic roles to domain-specific names; Codex accepts generic roles if descriptions are strong enough
- **Overall risk**: Gemini rates LOW/MEDIUM; Codex rates MEDIUM-HIGH (Codex puts more weight on prompt effectiveness and validation rigor)
- **Mock testing**: Gemini suggests mock mode for faster iteration; Codex prefers scenario-based real tests with environment prerequisites

---

*Reviewed: 2026-04-05 by Gemini CLI and Codex CLI*
*OpenCode: failed (empty output)*
