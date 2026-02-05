# Project Coordination - OpenClaw Chrome Bridge

## Sub-Agent Assignments

| Component | Agent Label | Model | Status |
|-----------|-------------|-------|--------|
| Protocol/Types | protocol-builder | Sonnet | 🔄 Pending |
| Relay Self-Host | relay-selfhost-builder | Sonnet | 🔄 Pending |
| Relay Cloudflare | relay-cloudflare-builder | Sonnet | 🔄 Pending |
| Agent Connector | agent-connector-builder | Sonnet | 🔄 Pending |
| Chrome Extension | chrome-ext-builder | Sonnet | 🔄 Pending |

## Build Order
1. **Protocol** (first - others depend on it)
2. **Relay Self-Host** + **Agent Connector** (parallel, after protocol)
3. **Relay Cloudflare** (can start after protocol)
4. **Chrome Extension** (can start after protocol)

## Integration Testing Order
1. Protocol types compile
2. Self-host relay + agent connector communicate
3. Chrome extension + self-host relay
4. Cloudflare relay compatibility

## Cost Tracking
Using Sonnet ($0.003/1K input, $0.015/1K output) for all sub-agents.
Opus ($0.015/1K input, $0.075/1K output) for orchestration only.

Target: Keep total build under $10.
