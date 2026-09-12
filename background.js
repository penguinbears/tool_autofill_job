"use strict";

importScripts("shared/ai-match.js");

const CACHE_KEY = "jobMatchCache";
const CACHE_LIMIT = 100;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForTabComplete(tabId, timeoutMs) {
  const current = await chrome.tabs.get(tabId).catch(() => null);
  if (current && current.status === "complete") return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("岗位详情页加载超时"));
    }, timeoutMs || 20000);
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function extractJobDetail(job) {
  let tabId;
  try {
    const tab = await chrome.tabs.create({ url: job.url, active: false });
    tabId = tab.id;
    if (!tabId) throw new Error("无法创建岗位详情标签页");
    await waitForTabComplete(tabId, 20000);
    await delay(900);
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["job-detail.js"]
    });
    const response = await chrome.tabs.sendMessage(tabId, { type: "JOB_MATCH_EXTRACT_DETAIL" });
    if (!response || !response.ok || !response.jd || response.jd.length < 80) {
      throw new Error("没有从详情页识别到足够的 JD 内容");
    }
    return {
      title: response.title || job.title,
      url: response.url || job.url,
      jd: response.jd
    };
  } catch (error) {
    if (job.excerpt && job.excerpt.length >= 80) {
      return { title: job.title, url: job.url, jd: job.excerpt };
    }
    throw error;
  } finally {
    if (tabId) await chrome.tabs.remove(tabId).catch(() => {});
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

async function cacheRead(key) {
  const stored = await chrome.storage.local.get([CACHE_KEY]);
  const cache = stored[CACHE_KEY] || {};
  return cache[key] && cache[key].result;
}

async function cacheWrite(key, result) {
  const stored = await chrome.storage.local.get([CACHE_KEY]);
  const cache = stored[CACHE_KEY] || {};
  cache[key] = { result, updatedAt: new Date().toISOString() };
  const entries = Object.entries(cache).sort((left, right) => (
    String(right[1].updatedAt).localeCompare(String(left[1].updatedAt))
  ));
  await chrome.storage.local.set({ [CACHE_KEY]: Object.fromEntries(entries.slice(0, CACHE_LIMIT)) });
}

async function callModel(settings, apiKey, profile, job) {
  const helper = globalThis.JobAutofillAiMatch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  let response;
  try {
    response = await fetch(helper.chatEndpoint(settings.baseUrl), {
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
      signal: controller.signal
    });
  } catch (error) {
    if (error && error.name === "AbortError") throw new Error("模型请求超过 25 秒，已取消");
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const message = String(await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 500);
    throw new Error(`模型接口返回 ${response.status}${message ? `：${message}` : ""}`);
  }
  const payload = await response.json();
  const content = helper.responseContent(payload);
  if (!content) throw new Error("模型接口没有返回对话内容");
  return helper.normalizeResult(content);
}

async function analyzeJob(job) {
  const helper = globalThis.JobAutofillAiMatch;
  const { settings, apiKey, profile } = await loadAiState();
  const detail = await extractJobDetail(job);
  const cacheKey = helper.stableHash(JSON.stringify({
    url: detail.url,
    jd: detail.jd,
    profile: helper.sanitizeProfile(profile),
    prompt: settings.prompt,
    skill: settings.skillContent,
    model: settings.model,
    baseUrl: settings.baseUrl
  }));
  const cached = await cacheRead(cacheKey);
  if (cached) return Object.assign({ cached: true }, cached);
  const result = await callModel(settings, apiKey, profile, detail);
  await cacheWrite(cacheKey, result);
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "JOB_MATCH_ANALYZE_ONE") return false;
  analyzeJob(message.job || {})
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: String(error && error.message || error) }));
  return true;
});
