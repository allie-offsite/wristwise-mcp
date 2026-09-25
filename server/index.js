#!/usr/bin/env node
/* WristWise MCP desktop bridge v0.3.1
 * Thin stdio proxy: Claude Desktop (stdio JSON-RPC) -> https://mcp-wristwise.offsite.ee/mcp
 * Auth: the WristWise app on the user's phone creates a connection key (wwk_...). The bridge
 * exchanges it for a 1-hour access token. The key works only while that app is installed and
 * linked; revoking it in the app, unlinking or uninstalling stops access. Tokens live in memory
 * only; no health data is ever written to disk by this bridge.
 */
"use strict";

const readline = require("node:readline");

const VERSION = "0.3.1";
const BASE = (process.env.WRISTWISE_BASE_URL || "https://mcp-wristwise.offsite.ee").replace(/\/+$/, "");
const KEY = (process.env.WRISTWISE_CONNECTION_KEY || "").trim();
const UA = "wristwise-mcpb/" + VERSION + " (node)";
const SUPPORT = "support@offsite.ee";
const KEY_HELP = "In the WristWise app open Settings → Connect to an AI assistant → Claude Desktop, create a connection key and paste it into the extension settings.";

// Protocol versions the remote service speaks; anything else is answered with the newest of these.
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
// Tools taking a look-back window. Bounded to 1..365 days; outside that it used to fail
// with a bare HTTP 500, so the bridge validates first and advertises the bounds in the schema.
const DAYS_TOOLS = new Set(["get_summary", "get_sleep", "get_heart", "get_exercise"]);
const MAX_DAYS = 365;

let token = null;       // current access token (memory only)
let authPromise = null; // de-dupes concurrent auth attempts
let pending = 0;        // in-flight requests; stdin close waits for these
let stdinClosed = false;

function maybeExit() {
  if (stdinClosed && pending === 0) process.exit(0);
}

function http(path, opts = {}) {
  return fetch(BASE + path, {
    redirect: "manual",
    ...opts,
    headers: { "user-agent": UA, ...(opts.headers || {}) },
  });
}

function negotiateProtocol(requested) {
  return SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0];
}

/** Returns an actionable error string, or null when the call may go to the service. Mutates
 *  string-typed days ("7") into numbers so the service never sees a type it rejects. */
function validateToolCall(params) {
  const name = params && params.name;
  if (!DAYS_TOOLS.has(name)) return null;
  const args = params.arguments || {};
  if (args.days === undefined || args.days === null) return null;
  const n = typeof args.days === "string" && args.days.trim() !== "" ? Number(args.days) : args.days;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_DAYS) {
    return "Invalid 'days' value " + JSON.stringify(args.days) + ": use a whole number from 1 to " + MAX_DAYS + ".";
  }
  params.arguments = { ...args, days: n };
  return null;
}

/** Adds 1..MAX_DAYS bounds to the `days` input of look-back tools (keeps server values if set). */
function annotateTools(result) {
  if (!result || !Array.isArray(result.tools)) return result;
  for (const t of result.tools) {
    const days = DAYS_TOOLS.has(t.name) && t.inputSchema && t.inputSchema.properties && t.inputSchema.properties.days;
    if (!days) continue;
    if (days.minimum === undefined) days.minimum = 1;
    if (days.maximum === undefined) days.maximum = MAX_DAYS;
    if (!days.description) days.description = "Number of past days to cover (1-" + MAX_DAYS + ").";
  }
  return result;
}

function serviceError(status) {
  if (status >= 500) {
    return "The WristWise service had a problem answering (HTTP " + status + "). Try again in a minute; if it keeps happening, contact " + SUPPORT + ".";
  }
  return "The WristWise service rejected the request (HTTP " + status + "). If this persists, contact " + SUPPORT + ".";
}

/** Exchanges the connection key for a short-lived access token. */
async function exchangeKey() {
  if (!KEY) throw new Error("No connection key set. " + KEY_HELP);
  if (!KEY.startsWith("wwk_")) throw new Error("That is not a WristWise connection key (it starts with wwk_). " + KEY_HELP);
  const r = await http("/bridge/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: KEY }),
  });
  const body = await r.json().catch(() => ({}));
  if (r.status === 200 && body.access_token) { token = body.access_token; return; }
  if (r.status === 401 && body.error === "app_inactive") throw new Error(body.message);
  if (r.status === 401) throw new Error("The connection key was not accepted (revoked or mistyped). " + KEY_HELP);
  if (r.status === 429) throw new Error("Too many sign-in attempts. Wait 10 minutes and try again.");
  throw new Error(serviceError(r.status));
}

function ensureAuth() {
  if (token) return Promise.resolve();
  if (!authPromise) authPromise = exchangeKey().finally(() => { authPromise = null; });
  return authPromise;
}

async function remote(payload) {
  await ensureAuth();
  const send = () => http("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: "Bearer " + token,
    },
    body: JSON.stringify(payload),
  });
  let r = await send();
  if (r.status === 401) { token = null; await ensureAuth(); r = await send(); }
  if (r.status !== 200) throw new Error(serviceError(r.status));
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("text/event-stream")) {
    const raw = await r.text();
    for (const line of raw.split("\n")) {
      if (line.startsWith("data:")) {
        try { return JSON.parse(line.slice(5).trim()); } catch (_) {}
      }
    }
    throw new Error("Could not read the WristWise service response. Try again.");
  }
  return r.json();
}

const out = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const rpcError = (id, code, message) => out({ jsonrpc: "2.0", id, error: { code, message } });
const toolError = (id, text) => out({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } });

async function handle(req) {
  const { id, method } = req;
  if (method === "initialize") {
    return out({
      jsonrpc: "2.0", id,
      result: {
        protocolVersion: negotiateProtocol(req.params && req.params.protocolVersion),
        capabilities: { tools: {} },
        serverInfo: { name: "WristWise", version: VERSION },
      },
    });
  }
  if (method === "ping") return out({ jsonrpc: "2.0", id, result: {} });
  if (!("id" in req) || id === undefined) return; // notification: no response
  if (method === "tools/list" || method === "tools/call") {
    if (method === "tools/call") {
      const bad = validateToolCall(req.params);
      if (bad) return toolError(id, bad);
    }
    try {
      const resp = await remote(req);
      if (resp.error) return out({ jsonrpc: "2.0", id, error: resp.error });
      const result = method === "tools/list" ? annotateTools(resp.result) : resp.result;
      return out({ jsonrpc: "2.0", id, result });
    } catch (e) {
      if (method === "tools/call") return toolError(id, String(e.message || e));
      return rpcError(id, -32000, String(e.message || e));
    }
  }
  return rpcError(id, -32601, "method " + method + " not found");
}

function main() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on("line", (line) => {
    line = line.trim();
    if (!line) return;
    let req;
    try { req = JSON.parse(line); } catch { return rpcError(null, -32700, "parse error"); }
    pending += 1;
    handle(req)
      .catch((e) => { if (req && "id" in req) rpcError(req.id, -32000, String(e.message || e)); })
      .finally(() => { pending -= 1; maybeExit(); });
  });
  rl.on("close", () => { stdinClosed = true; maybeExit(); });
}

if (require.main === module) main();

module.exports = { negotiateProtocol, validateToolCall, annotateTools, serviceError, VERSION, MAX_DAYS };
