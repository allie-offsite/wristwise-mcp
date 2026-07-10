# WristWise for Claude Desktop

Ask Claude about your sleep, heart rate, SpO2 and wellness trends from your
smartwatch. WristWise reads the data your watch already syncs to Health Connect
on your Android phone — and answers your questions through three read-only
tools (`get_summary`, `get_sleep`, `get_heart`).

## Setup

1. Install the free **WristWise** app from Google Play (`app.wristwise.bridge`)
   and connect it to Health Connect.
2. In the app, open **Settings → Connect to an AI assistant** and note your
   **Device ID**.
3. Install this extension in Claude Desktop and enter the Device ID when asked.
4. Ask Claude: *"How did I sleep this week?"*

## Example prompts

- How did I sleep this week?
- Is my resting heart rate improving?
- Give me a 30-day wellness summary.

## Privacy Policy

Our full privacy policy: https://offsite.ee/wristwise/privacy/

Summary: your health history stays on your phone. There is no WristWise
account and no server-side database of your health data. This extension
exchanges your Device ID for a revocable access token and forwards your
questions to the WristWise service, which answers them and forgets them.
All tools are read-only. You can disconnect at any time by removing the
extension and revoking the connection in the WristWise app. Data handled is
described in the policy above (collection, use, storage, third-party sharing,
retention). Contact: support@offsite.ee.

## Support

Email support@offsite.ee — WristWise is made by Offsite OÜ (Estonia).
