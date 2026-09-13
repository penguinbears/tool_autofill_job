const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let runtimeListener;
let tabUpdatedListener;
let tabRemovedListener;
let fetchImpl;
let localState = {
  aiSettings: {
    baseUrl: "https://api.example.com/v1",
    model: "test-model",
    prompt: "分析匹配度",
    skillContent: ""
  },
  candidateProfile: { education: [{ school: "示例大学", major: "软件工程" }] },
  jobMatchCache: {}
};

const context = vm.createContext({
  URL,
  Response,
  AbortController,
  TextEncoder,
  TextDecoder,
  atob,
  crypto: webcrypto,
  setTimeout,
  clearTimeout,
  console,
  fetch(...args) { return fetchImpl(...args); },
  chrome: {
    runtime: { onMessage: { addListener(listener) { runtimeListener = listener; } } },
    tabs: {
      onUpdated: { addListener(listener) { tabUpdatedListener = listener; } },
      onRemoved: { addListener(listener) { tabRemovedListener = listener; } }
    },
    storage: {
      local: {
        async get(keys) {
          return Object.fromEntries((keys || []).map((key) => [key, localState[key]]));
        },
        async set(value) { localState = Object.assign({}, localState, value); }
      },
      session: { async get() { return { aiApiKey: "test-key" }; } }
    }
  }
});

context.importScripts = (...files) => {
  files.forEach((file) => vm.runInContext(
    fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
    context,
    { filename: file }
  ));
};
vm.runInContext(
  fs.readFileSync(path.join(__dirname, "../background.js"), "utf8"),
  context,
  { filename: "background.js" }
);

function send(message, tabId) {
  return new Promise((resolve) => {
    const keepChannel = runtimeListener(message, {
      tab: { id: tabId, url: message.pageUrl }
    }, resolve);
    assert(keepChannel === true, "background message channel was not kept open");
  });
}

(async () => {
  const calls = [];
  fetchImpl = async (url) => {
    calls.push(url);
    if (url === "https://jobs.example.com/position/1") {
      return new Response("<main><h1>产品经理</h1><p>负责产品路线规划、用户研究、需求分析、跨团队协作、版本交付和上线复盘，要求本科及以上学历并有相关项目经验。能够独立撰写产品需求文档，协调设计、研发和测试团队按计划完成高质量交付，并持续依据用户反馈优化产品。</p></main>", {
        status: 200,
        headers: { "Content-Type": "text/html" }
      });
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        score: 82,
        summary: "经验较匹配",
        strengths: ["产品经验"],
        gaps: [],
        hard_blockers: [],
        evidence: ["具备相关项目经验"]
      }) } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await send({
    type: "JOB_MATCH_ANALYZE_ONE",
    taskId: "task-success",
    pageUrl: "https://jobs.example.com/list",
    job: {
      id: "1",
      title: "产品经理",
      url: "https://jobs.example.com/position/1",
      excerpt: "",
      platform: "generic"
    }
  }, 7);
  assert(result.ok && result.result.level === "匹配", `background analysis did not complete: ${JSON.stringify(result)}`);
  assert(calls.length === 2 && calls[0].includes("jobs.example.com") && calls[1].includes("api.example.com"), "JD and model were not requested directly");
  assert(Object.keys(localState.jobMatchCache).length === 1, "completed analysis was not written to extension cache");

  const mokaKeyText = "624844be764fdf30";
  const mokaIvText = "1234567890abcdef";
  const mokaEncoder = new TextEncoder();
  const mokaKey = await webcrypto.subtle.importKey("raw", mokaEncoder.encode(mokaKeyText), { name: "AES-CBC" }, false, ["encrypt"]);
  const mokaEncrypted = await webcrypto.subtle.encrypt(
    { name: "AES-CBC", iv: mokaEncoder.encode(mokaIvText) },
    mokaKey,
    mokaEncoder.encode(JSON.stringify({
      name: "市场开发",
      jobDescription: "负责市场研究、客户需求分析、销售机会识别、业务方案制定以及跨部门项目推进，要求具备良好的行业洞察、沟通表达和项目管理能力，并能够持续跟踪项目落地结果。"
    }))
  );
  fetchImpl = async (url, options) => {
    if (url.includes("app.mokahr.com/api/outer/ats-apply/website/job")) {
      const body = JSON.parse(options.body);
      assert(body.jobId === "035adb3e-207f-4317-a189-9548ba242b51", "Moka job ID was not sent to its background endpoint");
      return new Response(JSON.stringify({
        data: Buffer.from(mokaEncrypted).toString("base64"),
        necromancer: mokaKeyText
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({
        score: 76,
        summary: "岗位方向相关",
        strengths: ["项目推进"],
        gaps: ["销售经验"],
        hard_blockers: [],
        evidence: ["具备跨部门项目经验"]
      }) } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const mokaResult = await send({
    type: "JOB_MATCH_ANALYZE_ONE",
    taskId: "task-moka",
    pageUrl: "https://app.mokahr.com/campus-recruitment/example/45602#/jobs",
    job: {
      id: "moka-1",
      title: "市场开发",
      url: "https://app.mokahr.com/campus-recruitment/example/45602#/job/035adb3e-207f-4317-a189-9548ba242b51",
      excerpt: "",
      platform: "moka",
      platformContext: { siteId: 45602, orgId: 123, aesIv: mokaIvText }
    }
  }, 8);
  assert(mokaResult.ok && mokaResult.result.level === "匹配", "Moka background API pipeline did not complete");

  fetchImpl = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
  const cancelledPromise = send({
    type: "JOB_MATCH_ANALYZE_ONE",
    taskId: "task-cancel",
    pageUrl: "https://jobs.example.com/list",
    job: {
      id: "2",
      title: "运营经理",
      url: "https://jobs.example.com/position/2",
      excerpt: "",
      platform: "generic"
    }
  }, 9);
  await Promise.resolve();
  tabUpdatedListener(9, { url: "https://jobs.example.com/other" });
  const cancelled = await cancelledPromise;
  assert(!cancelled.ok && cancelled.error.includes("任务已取消"), "navigation did not cancel the background request");
  assert(typeof tabRemovedListener === "function", "tab close cancellation listener was not registered");

  console.log("Background job-match tests passed: 8");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
