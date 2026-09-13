"use strict";

importScripts("shared/ai-match.js", "shared/job-fetch.js");

const CACHE_KEY = "jobMatchCache";
const CACHE_LIMIT = 100;
const activeTasks = new Map();
let cacheWriteQueue = Promise.resolve();

function cancellationError() {
  const error = new Error("任务已取消：当前页面已刷新、关闭或跳转");
  error.name = "AbortError";
  return error;
}

async function withTimeout(parentSignal, timeoutMs, label, operation) {
  if (parentSignal && parentSignal.aborted) throw cancellationError();
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (parentSignal) parentSignal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (parentSignal && parentSignal.aborted) throw cancellationError();
    if (timedOut) throw new Error(`${label}超过 ${Math.ceil(timeoutMs / 1000)} 秒，已取消`);
    throw error;
  } finally {
    clearTimeout(timer);
    if (parentSignal) parentSignal.removeEventListener("abort", cancel);
  }
}

async function extractMokaJobDetail(job, signal) {
  const helper = globalThis.JobAutofillJobFetch;
  const request = helper.mokaRequest(job, job.platformContext || {});
  const envelope = await withTimeout(signal, 20000, "Moka JD 请求", async (requestSignal) => {
    const response = await fetch(request.endpoint, {
      method: "POST",
      credentials: "include",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request.body),
      signal: requestSignal
    });
    if (!response.ok) throw new Error(`Moka JD 接口返回 ${response.status}`);
    return response.json();
  });
  const payload = await helper.decryptMokaEnvelope(
    envelope,
    job.platformContext && job.platformContext.aesIv
  );
  const jd = helper.mokaJobText(payload);
  if (jd.length < 80) {
    const message = payload && payload.message ? `：${helper.cleanText(payload.message, 300)}` : "";
    throw new Error(`Moka JD 接口没有返回足够的岗位内容${message}`);
  }
  const data = payload && payload.data && typeof payload.data === "object" ? payload.data : payload;
  return {
    title: data && (data.name || data.title || data.jobName) || job.title,
    url: job.url,
    jd
  };
}

async function extractGenericJobDetail(job, signal) {
  const helper = globalThis.JobAutofillJobFetch;
  const loaded = await withTimeout(signal, 20000, "JD 后台请求", async (requestSignal) => {
    const response = await fetch(job.url, {
      method: "GET",
      credentials: "include",
      redirect: "follow",
      headers: { "Accept": "text/html,application/xhtml+xml,application/json" },
      signal: requestSignal
    });
    if (!response.ok) throw new Error(`岗位详情请求返回 ${response.status}`);
    return { source: await response.text(), url: response.url };
  });
  const source = loaded.source;
  const jd = helper.htmlToText(source, 30000);
  if (jd.length < 80) throw new Error("后台请求没有取得足够的 JD 内容；该网站可能需要专用适配器");
  return { title: job.title, url: loaded.url || job.url, jd };
}

async function extractJobDetail(job, signal) {
  try {
    return job.platform === "moka"
      ? await extractMokaJobDetail(job, signal)
      : await extractGenericJobDetail(job, signal);
  } catch (error) {
    if (signal && signal.aborted) throw cancellationError();
    if (job.excerpt && job.excerpt.length >= 80) {
      return { title: job.title, url: job.url, jd: job.excerpt };
    }
    throw error;
  }
}

async function loadAiState() {
  const [local, session] = await Promise.all([
    chrome.storage.local.get(["aiSettings", "candidateProfile"]),
    chrome.storage.session.get(["aiApiKey"])
  ]);
  const settings = local.aiSettings || {};
  const apiKey = String(session.aiApiKey || "").trim();
  if (!settings.baseUrl) throw new Error("请先在 AI 页面填写 Base URL");
  if (!settings.model) throw new Error("请先在 AI 页面填写模型名称");
  if (!apiKey) throw new Error("API Key 未设置或浏览器已经重启，请在 AI 页面重新填写");
  return { settings, apiKey, profile: local.candidateProfile || {} };
}

function cacheWrite(key, result) {
  const write = cacheWriteQueue.then(async () => {
    const stored = await chrome.storage.local.get([CACHE_KEY]);
    const cache = stored[CACHE_KEY] || {};
    cache[key] = { result, updatedAt: new Date().toISOString() };
    const entries = Object.entries(cache).sort((left, right) => (
      String(right[1].updatedAt).localeCompare(String(left[1].updatedAt))
    ));
    await chrome.storage.local.set({ [CACHE_KEY]: Object.fromEntries(entries.slice(0, CACHE_LIMIT)) });
  });
  cacheWriteQueue = write.catch(() => {});
  return write;
}

async function callModel(settings, apiKey, profile, job, signal) {
  const helper = globalThis.JobAutofillAiMatch;
  const payload = await withTimeout(signal, 25000, "模型请求", async (requestSignal) => {
    const response = await fetch(helper.chatEndpoint(settings.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        messages: helper.buildMessages(settings, profile, job),
        temperature: 0.2
      }),
      signal: requestSignal
    });
    if (!response.ok) {
      const message = String(await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 500);
      throw new Error(`模型接口返回 ${response.status}${message ? `：${message}` : ""}`);
    }
    return response.json();
  });
  const content = helper.responseContent(payload);
  if (!content) throw new Error("模型接口没有返回对话内容");
  return helper.normalizeResult(content);
}

async function analyzeJob(job, signal) {
  const helper = globalThis.JobAutofillAiMatch;
  const { settings, apiKey, profile } = await loadAiState();
  if (signal && signal.aborted) throw cancellationError();
  const detail = await extractJobDetail(job, signal);
  const cacheKey = helper.stableHash(JSON.stringify({
    url: detail.url,
    jd: detail.jd,
    profile: helper.sanitizeProfile(profile),
    prompt: settings.prompt,
    skill: settings.skillContent,
    model: settings.model,
    baseUrl: settings.baseUrl
  }));
  const result = await callModel(settings, apiKey, profile, detail, signal);
  if (signal && signal.aborted) throw cancellationError();
  await cacheWrite(cacheKey, result);
  return result;
}

function abortTask(taskId) {
  const task = activeTasks.get(taskId);
  if (!task) return false;
  activeTasks.delete(taskId);
  task.controllers.forEach((controller) => controller.abort());
  return true;
}

function abortTasksForTab(tabId) {
  Array.from(activeTasks.entries()).forEach(([taskId, task]) => {
    if (task.tabId === tabId) abortTask(taskId);
  });
}

function registerTaskRequest(message, sender) {
  const taskId = String(message.taskId || "");
  const tabId = sender && sender.tab && sender.tab.id;
  if (!taskId || !Number.isInteger(tabId)) throw new Error("岗位分析任务缺少页面标识");
  let task = activeTasks.get(taskId);
  if (!task) {
    task = {
      tabId,
      pageUrl: String(message.pageUrl || sender.tab.url || ""),
      controllers: new Set()
    };
    activeTasks.set(taskId, task);
  }
  if (task.tabId !== tabId) throw new Error("岗位分析任务页面不一致");
  const controller = new AbortController();
  task.controllers.add(controller);
  return {
    controller,
    release() {
      task.controllers.delete(controller);
      if (!task.controllers.size && activeTasks.get(taskId) === task) activeTasks.delete(taskId);
    }
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;
  if (message.type === "JOB_MATCH_CANCEL_TASK") {
    sendResponse({ ok: true, cancelled: abortTask(String(message.taskId || "")) });
    return false;
  }
  if (message.type !== "JOB_MATCH_ANALYZE_ONE") return false;
  let request;
  try {
    request = registerTaskRequest(message, sender);
  } catch (error) {
    sendResponse({ ok: false, error: String(error && error.message || error) });
    return false;
  }
  analyzeJob(message.job || {}, request.controller.signal)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: String(error && error.message || error) }))
    .finally(() => request.release());
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" || changeInfo.url) abortTasksForTab(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => abortTasksForTab(tabId));
