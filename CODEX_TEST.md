# AgenticFlow CLI — Full Feature Test Plan

You are testing the AgenticFlow CLI (`af`). The binary is at:
```
node /Users/sean/WIP/Antigravity-Workspace/agenticflow-js-cli/packages/cli/dist/bin/agenticflow.js
```

Create a shell alias first:
```bash
alias af='node /Users/sean/WIP/Antigravity-Workspace/agenticflow-js-cli/packages/cli/dist/bin/agenticflow.js'
```

## Services Running
- AgenticFlow API: https://api.agenticflow.ai (authenticated via ~/.agenticflow/auth.json)
- Paperclip: http://localhost:3100
- Gateway: http://localhost:4100 (channels: paperclip, webhook)

## Test Plan — Execute All Steps In Order

### Phase 1: CLI Basics
1. `af --version` — should print 1.0.6
2. `af --help` — should list all commands including paperclip and gateway
3. `af doctor --json` — should show all checks passing
4. `af whoami --json` — should show authenticated user
5. `af discover --json` — should list all CLI capabilities
6. `af playbook --list` — should list 10 playbooks including quickstart, gateway-setup, deploy-to-paperclip

### Phase 2: Playbooks
7. `af playbook quickstart` — read and verify it has 5 steps
8. `af playbook gateway-setup` — verify it covers webhook, paperclip, linear channels
9. `af playbook deploy-to-paperclip` — verify it has full step-by-step guide
10. `af playbook agent-channels` — verify it covers all 3 channel types

### Phase 3: Agent Operations
11. `af agent list --limit 3 --json` — should return array of agents
12. Pick the first agent ID, then: `af agent get --agent-id <ID> --json` — should return full agent details
13. Note the agent name and model from the response

### Phase 4: Gateway
14. `af gateway channels` — should list paperclip, linear, webhook
15. `curl -s http://localhost:4100/health` — should show gateway healthy with connectors
16. Test generic webhook: Send a simple task to the first agent from Phase 3:
```bash
curl -s -X POST http://localhost:4100/webhook/webhook \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "<AGENT_ID>", "message": "Write a one-paragraph summary of what you can do", "task_id": "test-001"}'
```
Verify: response has `status: "completed"` and `response_length > 0`

### Phase 5: Paperclip Company Setup
17. `af paperclip company create --name "Codex Test Corp" --budget 50000` — note the company ID
18. `af paperclip company list` — verify the company appears
19. `af paperclip company get --company-id <ID>` — verify details

### Phase 6: Deploy Agents to Paperclip
20. Deploy the first agent: `af paperclip deploy --agent-id <AF_AGENT_ID> --company-id <COMPANY_ID> --role engineer`
21. Note the Paperclip agent ID from the response
22. `af paperclip agent list --company-id <COMPANY_ID>` — verify agent is listed
23. `af paperclip connect --company-id <COMPANY_ID>` — connect to gateway

### Phase 7: Goals and Tasks
24. `af paperclip goal create --company-id <COMPANY_ID> --title "Test all CLI features" --level company --status active` — note goal ID
25. `af paperclip goal list --company-id <COMPANY_ID>` — verify goal appears
26. `af paperclip issue create --company-id <COMPANY_ID> --title "Write a test report" --description "Summarize all test results" --priority high --assignee <PC_AGENT_ID> --goal-id <GOAL_ID>` — note issue ID
27. `af paperclip issue list --company-id <COMPANY_ID>` — verify issue appears
28. `af paperclip issue comment --id <ISSUE_ID> --body "Please be thorough in your report"` — add a comment

### Phase 8: Agent Execution via Gateway
29. Trigger the agent via the Paperclip channel:
```bash
curl -s -X POST http://localhost:4100/webhook/paperclip \
  -H "Content-Type: application/json" \
  -d '{"agentId": "<PC_AGENT_ID>", "runId": "<generate-uuid>", "context": {"issueId": "<ISSUE_ID>", "taskKey": "<IDENTIFIER>", "wakeReason": "Work on your assigned task", "wakeSource": "on_demand"}}'
```
Use `uuidgen` or any UUID for runId. Wait for response (may take 30-60s).
Verify: response has `status: "completed"`

30. `af paperclip issue comments --id <ISSUE_ID>` — verify agent posted a response comment
31. `af paperclip dashboard --company-id <COMPANY_ID>` — check dashboard stats

### Phase 9: Approval & Lifecycle
32. `af paperclip approval list --company-id <COMPANY_ID>` — list approvals (may be empty)
33. `af paperclip agent pause --id <PC_AGENT_ID>` — pause the agent
34. `af paperclip agent get --id <PC_AGENT_ID>` — verify status is "paused"
35. `af paperclip agent resume --id <PC_AGENT_ID>` — resume the agent
36. `af paperclip agent get --id <PC_AGENT_ID>` — verify status is back

### Phase 10: Cleanup
37. `af paperclip issue delete --id <ISSUE_ID>` — delete the issue
38. `af paperclip goal delete --id <GOAL_ID>` — delete the goal
39. `af paperclip company delete --company-id <COMPANY_ID>` — delete the company
40. `af paperclip company list` — verify company is gone

## Reporting
After completing all steps, write a test report to /tmp/af-test-report.md with:
- Total tests: 40
- Passed / Failed count
- Any errors encountered
- Summary of what works and what doesn't

## Important Notes
- Always add `2>/dev/null` to suppress TLS warnings in output
- Use `--json` flag where available for parseable output
- UUIDs from previous steps are needed in later steps — save them
- The gateway is already running on port 4100
- Paperclip is running on port 3100
