# n8n → AgenticFlow Translator v2

This repository ships a v2 translator implementation in `scripts/module/translator_v2.py`.
It enforces explicit capability-state tracking to prevent silent degradations.

## Behavior

- The translator maps known source patterns to AgenticFlow node types with a
  `capability` status for each required source capability:
  - `equivalent` — required behavior is represented in translated nodes.
  - `partial` — translated output includes related behavior but not full parity.
  - `unsupported` — translation cannot represent the behavior.
- Hard failure is enabled by default.
  - If any required critical capability (`tooling`, `memory`, plus any unsupported mapping)
    resolves to `unsupported` (or non-equivalent for critical capabilities),
    `translate_n8n_template(..., strict=True)` raises `TranslationFailure`.
- Fail-loud is explicit in the returned/raised artifact:
  - `required_capabilities` includes each required capability and its state.
  - `node_results` tracks per-node mapping decisions.
  - `workflow_payload` contains the synthesized AgenticFlow workflow payload.

## Known tool-aware mappings

- LLM patterns
  - `@n8n/n8n-nodes-langchain.agent`
  - `@n8n/n8n-nodes-langchain.lmChat*`
  - `@n8n/n8n-nodes-langchain.chainLlm`
  - `@n8n/n8n-nodes-langchain.openAi`
  - `@n8n/n8n-nodes-langchain.googleGemini`
  to `llm`.

- Tool-like patterns
  - `n8n-nodes-base.httpRequest` → `api_call`
  - `n8n-nodes-base.gmail` → `mcp_run_action` (`gmail-send-email`)
  - `n8n-nodes-base.googleSheets` → `mcp_run_action` (`google_sheets-upsert-row`)
  - `n8n-nodes-base.googleDocs` → `mcp_run_action` (`google_docs-insert-text`)
  - `n8n-nodes-base.linkedIn` → `mcp_run_action` (`linkedin-create-text-post-user`)
  - `n8n-nodes-base.emailSend` → `send_email`

- Memory
  - `@n8n/n8n-nodes-langchain.memoryBufferWindow` is marked non-equivalent because
    there is no automatic AgenticFlow equivalent mapping in v2.

## Gap artifact format

`build_gap_report()` and `write_gap_report()` produce a QA-friendly JSON object with:

- `translator_version`
- `source_template_id`
- `required_capabilities`
- `node_results`
- `workflow_payload`

This is intentionally similar to the translation payload summaries previously produced
for quick-win translation artifacts.

## Limits

- Non-semantic parser-style nodes are skipped when known non-essential patterns are
  encountered.
- Unknown nodes are marked unsupported (`node:<node_type>` capability) so they are
  visible in gaps and never silently dropped.
- No claim of semantic equivalence is made for tooling/memory omissions.

