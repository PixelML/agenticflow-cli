# Jev AI Decision and AI Switch blueprints

These CLI blueprints are examples for typed support triage. They keep all child
workflows draft-only and leave a human responsible for approval. Jev is used as
the decision provider through the PixelML workspace connection. The examples do
not make a benchmark or quality claim about Jev; thresholds are starting points
that require evaluation on the operator's own labeled cases.

## Included blueprints

| ID | Kind | Pattern |
| --- | --- | --- |
| `jev-ordered-exception-routing` | workflow | One `ai_decision` with independent noul questions, reused by an `ai_switch` in `ordered_conditions` mode. The first matching regulated, payment, or security route wins; fallback creates a manual-triage draft. |
| `jev-score-quality-gate` | workflow | One score decision reused by `ai_switch` in `score_threshold` mode. Scores at least 3 take the ready-for-review path, scores at least 1 take revision, and uncertainty or lower scores use manual review. |
| `jev-review-assistant` | agent | A supported plugin composition with `ai_decision` followed by `ai_switch`. The assistant is instructed to present review artifacts only. |
| `jev-review-workforce` | workforce | A supported MAS composition: coordinator, reviewer, and synthesizer slots. The coordinator and reviewer use the AI node plugins; the synthesizer writes the human handoff. |

List and inspect them with:

```bash
af blueprints list --json
af blueprints get --id jev-ordered-exception-routing --json
af blueprints get --id jev-score-quality-gate --json
```

Deploy the workflow examples after a PixelML connection is available:

```bash
af workflow init --blueprint jev-ordered-exception-routing --name "Support exception review" --json
af workflow init --blueprint jev-score-quality-gate --name "Support draft quality gate" --json
```

The exact connection identifier is resolved by the CLI at deploy time. Do not
paste a private connection ID into a blueprint file. A missing PixelML
connection should be reported as a deploy-time requirement.

## Decision reuse

The workflow pattern is:

1. Run `ai_decision` once with `model: "jev-1.13.0"`,
   `billing_mode: "pixelml"`, and a typed `questions` object.
2. Configure `ai_switch` with `decision_source: "existing"` and
   `existing_decision: "{{evaluate_request}}"` (or
   `{{evaluate_quality}}`).
3. Keep `decision_config` in the switch payload. The server requires the
   configuration shape even when the switch consumes an existing decision.
4. Map each child to the same `review_packet` field so the parent workflow has
   one stable output.

This avoids a second inference request for the same decision. A switch runs one
selected destination; skipped branches do not run in the background. Provider
errors, invalid answers, permission failures, and timeouts remain visible errors.

## Choosing thresholds

The quality gate uses a four-level score rubric as an executable example. It is
not a universal calibration. Collect representative reviewed cases, compare
the Jev score with the review outcome, then adjust the threshold and minimum
confidence for the workflow's cost of false positives and false negatives.

For ordered exception routing, branch order is policy: regulated requests are
checked before payment disputes, then account security in this example. Change
the order only when the escalation policy changes. Each noul question is
independent; no synthetic confidence is added to the noul answer.

## Agent and workforce composition

The agent blueprint attaches the two supported AI node plugins with
`connectionCategory: "pixelml"`. The workforce blueprint uses the existing
agent-slot and synthesizer surfaces. It does not invent a MAS node type: the
CLI creates regular agents and wires them through the supported workforce graph.

Keep the human boundary explicit in prompts and review UX:

- return a **Customer reply draft** and **Internal notes**;
- use only supplied support knowledge for policy, pricing, deadlines, or
  guarantees;
- do not request passwords, OTPs, CVVs, or full card numbers;
- never send, refund, change accounts, or create tickets automatically.

The benchmark and leaderboard context belongs in explanatory material, not in a
runtime decision prompt. Evaluate this blueprint with your own support cases
before treating a threshold as production policy.
