const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const memory = {};
const alarms = {};
const runtimeListeners = [];
let fetchResponse = { ok: true, status: 200, redirected: false, url: "https://jobs.example.com/apply" };
let fetchOptions = null;

const chrome = {
  storage: {
    local: {
      async get(keys) {
        return Object.fromEntries(keys
          .filter((key) => Object.prototype.hasOwnProperty.call(memory, key))
          .map((key) => [key, memory[key]]));
      },
      async set(values) { Object.assign(memory, values); }
    },
    session: { async get() { return {}; } }
  },
  alarms: {
    async get(name) { return alarms[name]; },
    async create(name, info) { alarms[name] = Object.assign({ name }, info); },
    async clear(name) { const existed = Boolean(alarms[name]); delete alarms[name]; return existed; },
    onAlarm: { addListener() {} }
  },
  runtime: {
    onMessage: { addListener(listener) { runtimeListeners.push(listener); } },
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} }
  },
  permissions: { async contains() { return true; } },
  tabs: {},
  scripting: {}
};

const context = vm.createContext({
  globalThis: {},
  chrome,
  URL,
  AbortController,
  Date,
  Promise,
  setTimeout,
  clearTimeout,
  importScripts() {},
  fetch: async (url, options) => {
    fetchOptions = { url, options };
    return fetchResponse;
  }
});
context.globalThis = context;
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../background.js"), "utf8"),
  context,
  { filename: "background.js" }
);

function send(message) {
  return new Promise((resolve, reject) => {
    const handled = runtimeListeners[0](message, {}, resolve);
    if (!handled) reject(new Error(`message was not handled: ${message.type}`));
  });
}

(async () => {
  const enabled = await send({
    type: "SESSION_KEEPALIVE_ENABLE",
    url: "https://jobs.example.com/apply?token=secret#resume",
    title: "示例招聘"
  });
  assert(enabled.ok && enabled.site.state === "active", "site was not enabled");
  assert(enabled.site.url === "https://jobs.example.com/apply", "query or hash was retained");
  assert(fetchOptions.options.credentials === "include", "credentials were not included");
  assert(fetchOptions.options.method === "GET", "keepalive did not use GET");
  assert(alarms["job-autofill-session-keepalive"].periodInMinutes === 10, "ten-minute alarm was not created");

  const status = await send({ type: "SESSION_KEEPALIVE_STATUS", url: "https://jobs.example.com/other" });
  assert(status.site && status.site.origin === "https://jobs.example.com", "status lookup failed");

  fetchResponse = {
    ok: true,
    status: 200,
    redirected: true,
    url: "https://jobs.example.com/login"
  };
  const pinged = await send({ type: "SESSION_KEEPALIVE_PING_ALL" });
  assert(pinged.sites["https://jobs.example.com"].state === "logged-out", "login redirect was not detected");

  const disabled = await send({ type: "SESSION_KEEPALIVE_DISABLE", url: "https://jobs.example.com/apply" });
  assert(disabled.ok && !memory.sessionKeepaliveSites["https://jobs.example.com"], "site was not disabled");
  assert(!alarms["job-autofill-session-keepalive"], "alarm was not cleared");

  console.log("session keepalive tests passed: 10");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
