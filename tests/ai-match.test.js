const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ globalThis: {}, URL });
const source = fs.readFileSync(path.join(__dirname, "../shared/ai-match.js"), "utf8");
vm.runInContext(source, context, { filename: "ai-match.js" });
const ai = context.globalThis.JobAutofillAiMatch;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const safeProfile = ai.sanitizeProfile({
  personal: { full_name: "测试用户", phone: "13800138000", email: "private@example.com" },
  education: [{ school: "示例大学", major: "软件工程" }],
  work_experience: [{ company: "示例公司", position: "产品经理", description: "联系 private@example.com 或 13800138000" }],
  application: { desired_role: "产品经理", referral_code: "SECRET" },
  sensitive: { id_number: "123456" }
});

assert(!JSON.stringify(safeProfile).includes("测试用户"), "personal name leaked into AI profile");
assert(!JSON.stringify(safeProfile).includes("13800138000"), "phone leaked into AI profile");
assert(!JSON.stringify(safeProfile).includes("SECRET"), "referral code leaked into AI profile");
assert(!JSON.stringify(safeProfile).includes("private@example.com"), "email inside a description was not redacted");
assert(JSON.stringify(safeProfile).includes("示例大学"), "education was unexpectedly removed");

const result = ai.normalizeResult("```json\n{\"score\":88,\"summary\":\"较匹配\",\"strengths\":[\"产品经验\"],\"gaps\":[],\"hard_blockers\":[],\"evidence\":[\"经历相关\"]}\n```");
assert(result.level === "非常匹配", "score threshold is incorrect");
assert(ai.levelFor(92, ["学历不满足"]) === "不匹配", "hard blocker should cap the level");
assert(ai.chatEndpoint("https://api.example.com/v1/") === "https://api.example.com/v1/chat/completions", "endpoint normalization failed");
assert(ai.responseContent({ choices: [{ message: { content: "ok" } }] }) === "ok", "response extraction failed");
assert(ai.validateSettingsInput({ baseUrl: "", apiKey: "key", model: "model" }).field === "baseUrl", "missing Base URL was not detected");
assert(ai.validateSettingsInput({ baseUrl: "https://api.example.com/v1", apiKey: "", model: "model" }).field === "apiKey", "missing API key was not detected");
assert(ai.validateSettingsInput({ baseUrl: "https://api.example.com/v1", apiKey: "key", model: "" }).field === "model", "missing model was not detected");
assert(ai.validateSettingsInput({ baseUrl: "https://api.example.com/v1", apiKey: "key", model: "model" }).ok, "valid settings were rejected");

const messages = ai.buildMessages({ prompt: "关注产品经验", skillContent: "按证据评分" }, safeProfile, {
  title: "产品经理",
  url: "https://jobs.example.com/1?token=private#section",
  jd: "负责产品规划"
});
assert(messages.length === 2 && messages[0].content.includes("按证据评分"), "skill content was not included");
assert(!messages[1].content.includes("token=private"), "job URL query was sent to the model");

console.log("AI match tests passed: 15");
