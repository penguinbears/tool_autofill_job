const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let nextId = 0;
const memoryStorage = { applicationHistory: [] };
const context = {
  Blob,
  Date,
  Math,
  Map,
  Array,
  Object,
  String,
  Number,
  RegExp,
  crypto: {
    randomUUID() {
      nextId += 1;
      return `record-${nextId}`;
    }
  },
  chrome: {
    storage: {
      local: {
        async get(keys) {
          const requested = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(
            requested
              .filter((key) => Object.prototype.hasOwnProperty.call(memoryStorage, key))
              .map((key) => [key, memoryStorage[key]])
          );
        },
        async set(values) {
          Object.assign(memoryStorage, values);
        }
      }
    }
  }
};
context.globalThis = context;
vm.createContext(context);
const source = fs.readFileSync(
  path.join(__dirname, "../shared/storage.js"),
  "utf8"
);
vm.runInContext(source, context, { filename: "shared/storage.js" });

(async () => {
  const storage = context.JobAutofillStorage;
  assert(storage, "history storage API was not exposed");

  await storage.addApplicationRecord({
    company: "示例公司",
    position: "产品经理",
    url: "https://jobs.example.com/apply",
    date: "2026-07-26T08:00:00.000Z"
  });
  await storage.addApplicationRecord({
    company: "示例公司",
    position: "前端工程师",
    url: "https://jobs.example.com/apply",
    date: "2026-07-26T09:00:00.000Z"
  });

  let history = await storage.getApplicationHistory();
  assert(history.length === 2, "same company and URL with different positions must both be kept");
  assert(history[0].category === "技术研发", "engineering category inference failed");
  assert(history[1].category === "产品", "product category inference failed");

  await storage.addApplicationRecord({
    company: "示例公司",
    position: "产品经理",
    url: "https://jobs.example.com/apply"
  });
  history = await storage.getApplicationHistory();
  assert(history.length === 2, "exact duplicate should not create another record");

  const engineer = history.find((item) => item.position === "前端工程师");
  await storage.updateApplicationRecord(engineer.id, {
    company: "修改后的公司",
    position: "内容运营",
    category: ""
  });
  history = await storage.getApplicationHistory();
  const updated = history.find((item) => item.id === engineer.id);
  assert(updated.company === "修改后的公司", "company update failed");
  assert(updated.position === "内容运营", "position update failed");
  assert(updated.category === "运营", "category should be inferred after an empty edit");

  await storage.deleteApplicationRecord(engineer.id);
  history = await storage.getApplicationHistory();
  assert(history.length === 1, "delete by stable record id failed");

  console.log("history storage tests passed: 9");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
