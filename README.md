# WristWise for Claude Desktop

Ask Claude about your sleep, heart rate, exercise and wellness trends from your
smartwatch. WristWise reads the data your watch already syncs to Health Connect
on your Android phone and answers through six read-only tools (`get_summary`,
`get_sleep`, `get_heart`, `get_exercise`, `search`, `fetch`).

## Setup

1. Install the **WristWise** app from Google Play (`app.wristwise.bridge`) and
   connect it to Health Connect.
2. In the app open **Settings → Connect to an AI assistant → Claude Desktop** and
   tap **Create connection key**. Copy the key (it starts with `wwk_`).
3. Install this extension in Claude Desktop and paste the key when asked.
4. Ask Claude: *"How did I sleep this week?"*

## Example prompts

- How did I sleep this week?
- Is my resting heart rate improving?
- Give me a 30-day wellness summary.

## How it works and security

This extension is a small stdio proxy (`server/index.js`, Node built-ins only, no
dependencies) between Claude Desktop and the WristWise service at
`https://mcp-wristwise.offsite.ee/mcp`.

- The connection key is created by the WristWise app on your phone and is the only
  credential. Claude Desktop stores it as a sensitive setting. The extension trades it
  for a one-hour access token and keeps that token in memory only.
- The key only works while the app that created it is installed and linked. Revoking
  the key in the app, disconnecting in the app, or uninstalling the app stops access.
- This code contains no keys, no Device IDs and no health data. Having this code does
  not give access to anyone's data.
- The extension writes nothing to disk. All tools are read-only.

## Development

```bash
npm test                       # node >= 18, runs test/bridge.test.js against a local mock
npx @anthropic-ai/mcpb pack .  # builds wristwise.mcpb
```

## Privacy Policy

Our full privacy policy: https://offsite.ee/wristwise/privacy/

Summary: your health history stays on your phone. There is no WristWise account
and no server-side database of your health data. The service answers each
question and forgets it. You can disconnect at any time in the WristWise app.
The policy covers collection, use, storage, third-party sharing and retention.
Contact: support@offsite.ee.

## Support

Email support@offsite.ee. WristWise is made by Offsite OÜ (Estonia).

## License

MIT, see [LICENSE](LICENSE).
