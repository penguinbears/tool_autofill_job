const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fakeNode(initialValue) {
  return {
    value: initialValue || "",
    textContent: "",
    hidden: false,
    disabled: false,
    files: [],
    listeners: {},
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      remove(value) { this.values.delete(value); },
      toggle(value, enabled) {
        if (enabled) this.values.add(value);
        else this.values.delete(value);
      }
    },
    addEventListener(type, listener) { this.listeners[type] = listener; },
    focus() { this.focused = true; },
    scrollIntoView() { this.scrolled = true; }
  };
}

const ids = [
  "base-url", "api-key", "model", "prompt", "skill-mode", "skill-file",
  "skill-url", "skill-preview", "skill-meta", "file-panel", "github-panel",
  "status", "save", "load-skill-url", "restore-prompt"
];
const nodes = Object.fromEntries(ids.map((id) => [id, fakeNode()]));
nodes["skill-mode"].value = "none";

let savedLocal;
let savedSession;
const context = vm.createContext({
  globalThis: {},
  URL,
  fetch,
  setTimeout,
  clearTimeout,
  document: { getElementById(id) { return nodes[id]; } },
  chrome: {
    storage: {
      local: {
        async get() { return {}; },
        async set(value) { savedLocal = value; }
      },
      session: {
        async get() { return {}; },
        async set(value) { savedSession = value; }
      }
    },
    permissions: { async request() { return true; } }
  }
});

vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../shared/ai-match.js"), "utf8"),
  context,
  { filename: "ai-match.js" }
);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../ai.js"), "utf8"),
  context,
  { filename: "ai.js" }
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert(typeof nodes.save.listeners.click === "function", "save button has no click handler");

  nodes["base-url"].value = "https://api.example.com/v1";
  nodes["api-key"].value = "test-key";
  nodes.model.value = "test-model";
  nodes.prompt.value = "test prompt";
  await nodes.save.listeners.click();

  assert(savedLocal.aiSettings.baseUrl === "https://api.example.com/v1", "Base URL was not saved");
  assert(savedLocal.aiSettings.model === "test-model", "model was not saved");
  assert(savedSession.aiApiKey === "test-key", "API key was not saved to session storage");
  assert(nodes.status.textContent.includes("已保存"), "success status was not shown");
  assert(nodes.save.disabled === false && nodes.save.textContent === "保存设置", "save button did not recover after saving");

  nodes["base-url"].value = "";
  await nodes.save.listeners.click();
  assert(nodes.status.textContent.includes("保存失败"), "validation failure was not shown");
  assert(nodes["base-url"].focused, "invalid Base URL field was not focused");

  console.log("AI settings save tests passed: 8");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
