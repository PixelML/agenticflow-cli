#!/bin/bash
NODE_TLS_REJECT_UNAUTHORIZED=0 node /Users/sean/WIP/Antigravity-Workspace/agenticflow-js-cli/packages/cli/dist/bin/agenticflow.js "$@" 2> >(grep -v "NODE_TLS_REJECT_UNAUTHORIZED" >&2)
