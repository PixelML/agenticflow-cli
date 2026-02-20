# AgenticFlow Python SDK

The Python SDK is distributed in the same package as the CLI and is importable as `agenticflow_sdk`.

## Install

```bash
pip install agenticflow-cli
```

## Quick start

```python
from agenticflow_sdk import AgenticFlowSDK

sdk = AgenticFlowSDK(api_key="AGENTICFLOW_PUBLIC_API_KEY")

health = sdk.call("public.health.get")
workflow = sdk.workflows.get(workflow_id="wf_public_id")
agent = sdk.agents.get(agent_id="agent-id")
node_types = sdk.node_types.list()
```

## Auth

```python
from os import getenv

sdk = AgenticFlowSDK(
    api_key=getenv("AGENTICFLOW_PUBLIC_API_KEY")
)
```

`AGENTICFLOW_PUBLIC_API_KEY` is the same environment variable used by the CLI.

## Running a direct operation

```python
result = sdk.call("public.health.get")
```

Use direct operation calls for endpoints that are not exposed by the typed resource objects yet.
