# WristWise MCP

Ask your AI assistant about your sleep, heart rate, SpO2 and wellness trends
from your smartwatch.

WristWise is a remote MCP server (Streamable HTTP) that reads the health data
your watch already syncs to **Health Connect** on your Android phone. Your AI
assistant asks; WristWise answers.

- **Endpoint:** `https://mcp-wristwise.offsite.ee/mcp`
- **Auth:** OAuth 2.1 — PKCE (S256) + dynamic client registration
- **Registry:** [`ee.offsite/wristwise`](https://registry.modelcontextprotocol.io) (official MCP registry)
- **Android app:** [`app.wristwise.bridge`](https://offsite.ee/wristwise/) on Google Play

## Tools

All three are read-only (`readOnlyHint: true`, `destructiveHint: false`,
`idempotentHint: true`, `openWorldHint: false`).

| Tool | What it answers |
|---|---|
| `get_summary` | Overall wellness summary for the last N days |
| `get_sleep` | Per-night sleep duration, deep and REM percentages |
| `get_heart` | Resting heart rate trend |

## Getting started

1. Install the free **WristWise** app from Google Play and connect it to
   Health Connect.
2. In the app, open **Settings → Connect to an AI assistant** and note your
   **Device ID**.
3. Add the connector in your MCP client (for example claude.ai → Settings →
   Connectors → Add custom connector) with the URL above.
4. On the consent page, enter your Device ID.
5. Ask: *"How did I sleep this week?"*

A Claude Desktop extension (`.mcpb`) is also available — see
[offsite.ee/wristwise](https://offsite.ee/wristwise/).

## Example prompts

- How did I sleep this week?
- Is my resting heart rate improving?
- Give me a 30-day wellness summary.

## Privacy

Your health history stays on your phone. There is no WristWise account and no
server-side database of your health data. The connector exchanges your Device ID
for a revocable access token, answers your questions, and forgets them. All
tools are read-only, and you can disconnect at any time from the app.

Full policy: https://offsite.ee/wristwise/privacy/

## Support

support@offsite.ee — WristWise is made by Offsite OÜ (Estonia).
