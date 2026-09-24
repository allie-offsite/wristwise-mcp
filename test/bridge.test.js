// Bridge behaviour against a local mock of the WristWise service. Run: npm test (node >= 18, no deps).
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const BRIDGE = path.join(__dirname, "..", "server", "index.js");
const GOOD_KEY = "wwk_test_good";
const TOOLS = ["get_summary", "get_sleep", "get_heart", "get_exercise", "search", "fetch"];

const state = {};
const tool = (name) => ({
  name, title: name, description: name,
  inputSchema: { type: "object", properties: TOOLS.indexOf(name) < 4 ? { days: { type: "integer" } } : { id: { type: "string" } } },
});

const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; });
  req.on("end", () => {
    const send = (status, obj, ctype = "application/json") => {
      res.writeHead(status, { "content-type": ctype });
      res.end(typeof obj === "string" ? obj : JSON.stringify(obj));
    };
    if (req.url === "/bridge/token") {
      const { key } = JSON.parse(body || "{}");
      (state.exchanges = state.exchanges || []).push(key);
      if (state.appInactive) return send(401, { error: "app_inactive", message: "The WristWise app on your phone is not active." });
      if (key !== GOOD_KEY) return send(401, { error: "invalid_key" });
      return send(200, { access_token: "wwa_" + state.exchanges.length, expires_in: 3600 });
    }
    if (req.url === "/mcp") {
      const msg = JSON.parse(body);
      (state.mcp = state.mcp || []).push({ msg, auth: req.headers.authorization });
      if (state.expireOnce) { state.expireOnce = false; return send(401, { error: "expired" }); }
      if (state.fail500) return send(500, "boom", "text/plain");
      const result = msg.method === "tools/list"
        ? { tools: TOOLS.map(tool) }
        : { content: [{ type: "text", text: JSON.stringify(msg.params) }] };
      return send(200, "event: message\ndata: " + JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n\n", "text/event-stream");
    }
    send(404, {});
  });
});

let base;
test.before(() => new Promise((ok) => server.listen(0, "127.0.0.1", () => { base = "http://127.0.0.1:" + server.address().port; ok(); })));
test.after(() => server.close());
test.beforeEach(() => { for (const k of Object.keys(state)) delete state[k]; });

function runBridge(msgs, key = GOOD_KEY) {
  return new Promise((ok, fail) => {
    const env = { ...process.env, WRISTWISE_BASE_URL: base, WRISTWISE_CONNECTION_KEY: key };
    delete env.WRISTWISE_DEVICE_ID;
    const p = spawn(process.execPath, [BRIDGE], { env });
    let out = "";
    p.stdout.on("data", (c) => { out += c; });
    p.on("error", fail);
    p.on("close", () => {
      const byId = {};
      for (const line of out.split("\n").filter(Boolean)) { const m = JSON.parse(line); byId[m.id] = m; }
      ok(byId);
    });
    p.stdin.end(msgs.map((m) => JSON.stringify(m)).join("\n") + "\n");
  });
}
const call = (id, name, args) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });
const text = (r) => r.result.content[0].text;

test("initialize negotiates a supported protocol and reports the package version", async () => {
  const r = await runBridge([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
    { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "2099-01-01" } },
  ]);
  assert.equal(r[1].result.protocolVersion, "2025-03-26");
  assert.equal(r[2].result.protocolVersion, "2025-06-18");
  assert.equal(r[1].result.serverInfo.version, require("../package.json").version);
});

test("the connection key is exchanged once and only the access token reaches /mcp", async () => {
  const r = await runBridge([call(1, "get_sleep", { days: 3 }), call(2, "get_heart", { days: 7 })]);
  assert.ok(!r[1].result.isError && !r[2].result.isError);
  assert.deepEqual(state.exchanges, [GOOD_KEY]);
  for (const m of state.mcp) assert.equal(m.auth, "Bearer wwa_1");
});

test("bad days values get an actionable error without calling the service", async () => {
  const r = await runBridge([call(1, "get_heart", { days: -5 }), call(2, "get_sleep", { days: "abc" }), call(3, "get_summary", { days: 100000 })]);
  for (const i of [1, 2, 3]) {
    assert.equal(r[i].result.isError, true);
    assert.match(text(r[i]), /whole number from 1 to 365/);
  }
  assert.equal(state.mcp, undefined);
});

test("string days are coerced to numbers", async () => {
  const r = await runBridge([call(1, "get_sleep", { days: "7" })]);
  assert.equal(JSON.parse(text(r[1])).arguments.days, 7);
});

test("tools/list gets 1..365 day bounds", async () => {
  const r = await runBridge([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]);
  const t = Object.fromEntries(r[1].result.tools.map((x) => [x.name, x]));
  assert.equal(t.get_sleep.inputSchema.properties.days.minimum, 1);
  assert.equal(t.get_sleep.inputSchema.properties.days.maximum, 365);
  assert.equal(t.fetch.inputSchema.properties.days, undefined);
});

test("missing, malformed and revoked keys are explained without calling /mcp", async () => {
  for (const [key, want] of [["", /No connection key set/], ["ABC123DEF456", /not a WristWise connection key/], ["wwk_revoked", /not accepted/]]) {
    const r = await runBridge([call(1, "get_sleep", { days: 3 })], key);
    assert.equal(r[1].result.isError, true);
    assert.match(text(r[1]), want);
    assert.match(text(r[1]), /WristWise app/);
  }
  assert.equal(state.mcp, undefined);
});

test("an inactive app (uninstalled or unlinked) is reported as such", async () => {
  state.appInactive = true;
  const r = await runBridge([call(1, "get_sleep", { days: 3 })]);
  assert.match(text(r[1]), /app on your phone is not active/);
});

test("an expired access token is re-exchanged once and the call retried", async () => {
  state.expireOnce = true;
  const r = await runBridge([call(1, "get_sleep", { days: 3 })]);
  assert.ok(!r[1].result.isError);
  assert.equal(state.exchanges.length, 2);
});

test("a service 500 gives a retry hint and the support address", async () => {
  state.fail500 = true;
  const r = await runBridge([call(1, "get_sleep", { days: 3 })]);
  assert.match(text(r[1]), /Try again in a minute/);
  assert.match(text(r[1]), /support@offsite\.ee/);
});
