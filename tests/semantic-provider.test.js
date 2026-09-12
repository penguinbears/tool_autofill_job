const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ globalThis: {}, setTimeout, clearTimeout });
const source = fs.readFileSync(path.join(__dirname, "../shared/semantic-provider.js"), "utf8");
vm.runInContext(source, context, { filename: "semantic-provider.js" });

const semantic = context.globalThis.JobAutofillSemantic;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const request = semantic.createMatchFieldsRequest({
    requestId: "test-request",
    context: { platform: "generic", locale: "zh-CN", url: "https://should-not-leak.example" },
    fields: [{
      id: "field-1",
      descriptor: {
        label: "毕业院校",
        sectionText: "教育经历",
        currentValue: "不应发送给模型",
        required: true
      },
      candidates: [
        { path: "education[].school", ruleScore: 82, reason: "alias" },
        { path: "work_experience[].company", ruleScore: 60, reason: "nearby" }
      ]
    }]
  });

  assert(request.context.url === undefined, "page URL should not cross the semantic boundary");
  assert(request.fields[0].descriptor.currentValue === undefined, "current value should not cross the semantic boundary");
  assert(semantic.validateMatchFieldsRequest(request).length === 0, "valid request was rejected");

  const disabled = await semantic.matchFields(request);
  assert(disabled.error.code === "disabled", "semantic matching should be disabled by default");

  semantic.registerProvider("test", {
    async matchFields(input) {
      return {
        contractVersion: semantic.CONTRACT_VERSION,
        task: semantic.TASK,
        requestId: input.requestId,
        status: "ok",
        matches: [{
          id: "field-1",
          status: "matched",
          path: "education[].school",
          confidence: 0.94,
          reason: "section-and-label"
        }]
      };
    }
  });
  semantic.configure({ enabled: true, provider: "test", timeoutMs: 500, minConfidence: 0.78 });
  const matched = await semantic.matchFields(request);
  assert(matched.matches[0].path === "education[].school", "provider match was not returned");

  semantic.registerProvider("unsafe-test", {
    async matchFields(input) {
      return {
        contractVersion: semantic.CONTRACT_VERSION,
        task: semantic.TASK,
        requestId: input.requestId,
        status: "ok",
        matches: [{
          id: "field-1",
          status: "matched",
          path: "sensitive.id_number",
          confidence: 0.99
        }]
      };
    }
  });
  semantic.configure({ enabled: true, provider: "unsafe-test" });
  const rejected = await semantic.matchFields(request);
  assert(rejected.error.code === "invalid-response", "out-of-candidate path should be rejected");

  console.log("semantic provider contract tests passed: 6");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
