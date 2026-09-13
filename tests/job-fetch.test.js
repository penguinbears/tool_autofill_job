const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const context = vm.createContext({
  URL,
  TextEncoder,
  TextDecoder,
  atob,
  globalThis: {}
});
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../shared/job-fetch.js"), "utf8"),
  context,
  { filename: "job-fetch.js" }
);
const helper = context.globalThis.JobAutofillJobFetch;

(async () => {
  const jobUrl = "https://app.mokahr.com/campus-recruitment/example/45602?recommendCode=test-code#/job/035adb3e-207f-4317-a189-9548ba242b51";
  assert(helper.extractMokaJobId(jobUrl) === "035adb3e-207f-4317-a189-9548ba242b51", "Moka job ID was not extracted");

  const request = helper.mokaRequest({ url: jobUrl }, { siteId: 45602, orgId: 123 });
  assert(request.endpoint.endsWith("/api/outer/ats-apply/website/job"), "Moka endpoint is incorrect");
  assert(request.body.siteId === 45602 && request.body.orgId === 123, "Moka public context was not included");
  assert(request.body.recommendCode === "test-code", "Moka recommendation code was not preserved for the same-site request");

  const pageText = helper.htmlToText("<header>导航</header><main><h1>产品经理</h1><p>负责产品规划&amp;需求分析</p></main><script>secret()</script>");
  assert(pageText.includes("产品经理") && pageText.includes("产品规划&需求分析"), "HTML job text was not extracted");
  assert(!pageText.includes("导航") && !pageText.includes("secret"), "HTML chrome or scripts leaked into JD text");

  const mokaText = helper.mokaJobText({
    name: "产品经理",
    jobDescription: "<p>负责产品路线规划、市场研究和跨团队交付。</p>",
    requirement: "本科及以上学历，具备三年以上产品经验。",
    id: "private-internal-id"
  });
  assert(mokaText.includes("产品路线规划") && mokaText.includes("本科及以上"), "Moka JD fields were not normalized");
  assert(!mokaText.includes("private-internal-id"), "irrelevant Moka identifiers leaked into JD text");

  const keyText = "624844be764fdf30";
  const ivText = "1234567890abcdef";
  const encoder = new TextEncoder();
  const key = await webcrypto.subtle.importKey("raw", encoder.encode(keyText), { name: "AES-CBC" }, false, ["encrypt"]);
  const encrypted = await webcrypto.subtle.encrypt(
    { name: "AES-CBC", iv: encoder.encode(ivText) },
    key,
    encoder.encode(JSON.stringify({ name: "市场开发", jobDescription: "负责市场与客户需求分析" }))
  );
  const envelope = {
    data: Buffer.from(encrypted).toString("base64"),
    necromancer: keyText
  };
  const decrypted = await helper.decryptMokaEnvelope(envelope, ivText, webcrypto);
  assert(decrypted.name === "市场开发", "Moka AES response was not decrypted");

  console.log("Job fetch tests passed: 9");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
