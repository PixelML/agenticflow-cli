# AgenticFlow SDK Delegation Plan

Date: 2026-02-19  
Repo: `agenticflow-cli`

## Objective

Create a standalone SDK layer so developers can build programmatically on top of AgenticFlow without shelling out to the CLI.

## Scope

- Python SDK package under `src/agenticflow_sdk/`
- High-level resources:
  - workflows
  - agents
  - node types
  - connections
- Minimal, deterministic unit tests under `tests/unit/sdk/`
- Documentation with examples in `docs/sdk.md` and README updates

## Lanes

### Lane 1: SDK Core
- Files:
  - `src/agenticflow_sdk/__init__.py`
  - `src/agenticflow_sdk/core.py`
  - `src/agenticflow_sdk/http.py`
  - `src/agenticflow_sdk/exceptions.py`
  - `src/agenticflow_sdk/types.py`
- Deliver:
  - base client configuration and request executor
  - API key auth behavior
  - error mapping and response normalization

### Lane 2: Resource Clients
- Files:
  - `src/agenticflow_sdk/resources/workflows.py`
  - `src/agenticflow_sdk/resources/agents.py`
  - `src/agenticflow_sdk/resources/node_types.py`
  - `src/agenticflow_sdk/resources/connections.py`
  - `src/agenticflow_sdk/client.py`
- Deliver:
  - typed high-level methods for key public capabilities
  - generic fallback method for direct operation call

### Lane 3: Unit Tests
- Files:
  - `tests/unit/sdk/test_core.py`
  - `tests/unit/sdk/test_resources.py`
  - `tests/unit/sdk/test_errors.py`
- Deliver:
  - deterministic tests with mocked network calls
  - coverage for auth headers, error cases, and request routing

### Lane 4: Docs + Integration
- Files:
  - `docs/sdk.md`
  - `README.md`
  - `pyproject.toml` (package include/export alignment if needed)
  - `.github/workflows/ci.yaml` (ensure SDK tests are in CI)
- Deliver:
  - install/use examples for SDK
  - CI command updated to include SDK tests

## Acceptance

1. SDK import works:
   - `from agenticflow_sdk import AgenticFlowSDK`
2. Tests pass:
   - `pytest -q tests/unit`
3. README and docs contain working examples for SDK usage.
