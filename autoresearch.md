# Autoresearch: AgenticFlow → Paperclip Integration

## Objective
Make AgenticFlow agents actually WORK on Paperclip — not just deploy, but receive tasks, execute, and report results.

## Key Finding: Protocol Mismatch

### What Paperclip sends (HTTP adapter heartbeat POST):
```json
{
  "agentId": "pc-agent-id",
  "runId": "run-id",
  "context": {
    "issueId": "issue-uuid",
    "taskKey": "AGE-1",
    "wakeReason": "issue_assigned",
    "wakeSource": "assignment",
    "paperclipWorkspace": { "cwd": "...", "repoUrl": "..." }
  },
  ...payloadTemplate
}
```

### What AgenticFlow stream expects:
```json
{
  "id": "thread-id-uuid",
  "messages": [
    { "role": "user", "content": "task description here" }
  ]
}
```

### The Gap
- Paperclip sends context (issueId, wakeReason, workspace) as structured JSON
- AgenticFlow only reads `messages[].content` as text — ignores extra fields
- No system message injection at request time
- Thread ID enables conversation continuity

## Solution: Bridge Webhook (`af paperclip serve`)

A lightweight HTTP server in the CLI that:
1. Receives Paperclip heartbeat POST → extracts context
2. Fetches issue details from Paperclip API (title, description, comments)
3. Constructs a rich message with full task context
4. Calls AgenticFlow stream endpoint with proper format
5. Returns 200 to Paperclip

```
Paperclip heartbeat → Bridge webhook → AgenticFlow stream
        │                    │                    │
        ├─ agentId          ├─ fetch issue       ├─ messages[0].content =
        ├─ runId            ├─ fetch comments        full task context
        ├─ context.issueId  ├─ build message     ├─ id = thread for continuity
        └─ context.*        └─ map AF agent ID   └─ returns streamed response
```

## Experiments
| # | What | Status | Result |
|---|------|--------|--------|
| 1 | deploy + list + companies | KEEP | 2 agents deployed |
| 2 | Full CRUD: company/agent/goal/issue/approval/dashboard | KEEP | All 30+ commands work |
| 3 | Bridge webhook (`af paperclip serve`) | CURRENT | Building |

## Architecture: Serve Mode

```
af paperclip serve --port 4100

Paperclip agent adapterConfig:
  url: http://localhost:4100/heartbeat
  method: POST

Bridge logic:
  1. POST /heartbeat receives Paperclip payload
  2. Extract: metadata.af_agent_id, metadata.af_stream_url from agent
  3. Fetch Paperclip issue details (if context.issueId present)
  4. Build AF stream message with task context
  5. POST to AF stream endpoint
  6. Return 200 to Paperclip
```

## Message Template (Issue → AF Message)

```
You are working as a Paperclip agent. You have been assigned a task.

## Task: {issue.identifier} — {issue.title}
Priority: {issue.priority}
Status: {issue.status}

## Description
{issue.description}

## Recent Comments
{comments formatted}

## Wake Reason
{context.wakeReason}

## Instructions
Complete this task. When done, summarize your work.
```
