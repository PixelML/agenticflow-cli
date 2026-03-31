# Autoresearch: Make the Best AgenticFlow CLI for AI Agents

You are Codex. Your job is to use the AgenticFlow CLI binary and iteratively improve it through experimentation.

## Binary Location
```bash
alias af='node /Users/sean/WIP/Antigravity-Workspace/agenticflow-js-cli/packages/cli/dist/bin/agenticflow.js'
```

## Your Mission
Test the CLI as an AI agent would. Find friction, gaps, confusing output, and missing features. For each issue found, log it. After testing, write a prioritized improvement report.

## Autoresearch Method
For each experiment:
1. Try something
2. Measure: did it work? Was it clear? Did you need to guess?
3. Log: what worked, what didn't, what was confusing
4. Move on to next experiment

## Experiments to Run

### Experiment 1: Cold Start Discovery
Pretend you know NOTHING about this CLI. Run:
```bash
af --help
```
Can you figure out what to do next? Follow the breadcrumbs. Log every step.

### Experiment 2: AI Context Bootstrap
```bash
af context --json
```
Does the bootstrap_sequence make sense? Follow it step by step. Log friction.

### Experiment 3: Schema-Driven Payload Construction
Use `af schema agent` to construct a valid agent create payload WITHOUT reading any docs.
Then dry-run it:
```bash
af agent create --body '<your-payload>' --dry-run
```
Log: could you construct a valid payload from schema alone?

### Experiment 4: Fields Filter Effectiveness
Compare token usage:
```bash
af agent list --json | wc -c
af agent list --fields id,name,model --json | wc -c
```
Log the reduction ratio.

### Experiment 5: End-to-End Agent Interaction
```bash
af agent list --fields id,name --json
# Pick an agent
af agent stream --agent-id <id> --body '{"messages":[{"content":"What are you?"}]}'
```
Log: was the streaming response parseable?

### Experiment 6: Gateway Webhook (Simplest Integration)
```bash
af gateway channels
# Send a task
curl -s -X POST http://localhost:4100/webhook/webhook \
  -H "Content-Type: application/json" \
  -d '{"agent_id":"<id-from-exp-5>","message":"Write a haiku about coding"}'
```
Log: did it work? Was the response structured?

### Experiment 7: Paperclip Full Lifecycle
```bash
af paperclip company create --name "Codex Research Co" --budget 10000
af paperclip deploy --agent-id <id> --role engineer
af paperclip connect
af paperclip goal create --title "Research CLI UX" --level company
af paperclip issue create --title "Find 3 UX improvements" --assignee <pc-agent-id>
af paperclip dashboard
```
Log: how many commands to get a working setup? Any errors?

### Experiment 8: Error Handling
Try intentionally wrong things:
```bash
af agent get --agent-id nonexistent-id --json
af schema nonexistent --json
af agent create --body '{"invalid": true}' --dry-run
af paperclip company get --company-id bad-uuid
```
Log: are errors structured? Do hints help? Can you recover programmatically?

### Experiment 9: Playbook Quality
```bash
af playbook quickstart
af playbook gateway-setup
```
Log: could you follow the playbook without external docs?

### Experiment 10: What's Missing?
After all experiments, list:
- Features you wished existed
- Commands that should exist but don't
- Output that was confusing or too verbose
- Things that required too many steps

## Output
Write your findings to `/tmp/af-autoresearch-report.md` with this structure:

```markdown
# AgenticFlow CLI Autoresearch Report

## Summary
- Experiments run: X/10
- Issues found: X
- Strengths: ...
- Critical gaps: ...

## Experiment Results
### Exp 1: Cold Start
- Steps taken: ...
- Friction points: ...
- Score: X/10

[repeat for each]

## Prioritized Improvements
1. [CRITICAL] ...
2. [HIGH] ...
3. [MEDIUM] ...
4. [LOW] ...

## Raw Logs
[paste command outputs]
```
