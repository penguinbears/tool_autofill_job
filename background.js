"use strict";

importScripts("shared/ai-match.js");

const CACHE_KEY = "jobMatchCache";
const CACHE_LIMIT = 100;
const SESSION_SITES_KEY = "sessionKeepaliveSites";
const SESSION_ALARM = "job-autofill-session-keepalive";
const SESSION_INTERVAL_MINUTES = 10;
const LOGIN_URL_PATTERN = /(?:^|[\/_-])(login|signin|passport|auth)(?:[\/_-]|$)/i;

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

function normalizedSessionUrl(rawUrl) {
  const url = new URL(String(rawUrl || ""));
  if (!/^https?:$/i.test(url.protocol)) throw new Error("仅支持 HTTP 或 HTTPS 招聘网站");
  if (LOGIN_URL_PATTERN.test(url.pathname)) throw new Error("登录页面不能作为保活地址");
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.href;
}

async function loadSessionSites() {
  const stored = await chrome.storage.local.get([SESSION_SITES_KEY]);
  const sites = stored[SESSION_SITES_KEY];
  return sites && typeof sites === "object" ? sites : {};
}

async function saveSessionSites(sites) {
  await chrome.storage.local.set({ [SESSION_SITES_KEY]: sites });
}

async function syncSessionAlarm(sites) {
  const activeSites = Object.values(sites || {}).some((site) => site && site.enabled);
  if (!activeSites) {
    await chrome.alarms.clear(SESSION_ALARM);
    return;
  }
  const existing = await chrome.alarms.get(SESSION_ALARM);
  if (!existing || existing.periodInMinutes !== SESSION_INTERVAL_MINUTES) {
    await chrome.alarms.create(SESSION_ALARM, { periodInMinutes: SESSION_INTERVAL_MINUTES });
  }
}

function classifySessionResponse(response) {
  let finalUrl;
  try {
    finalUrl = new URL(response.url);
  } catch (error) {
    finalUrl = null;
  }
  if (response.status === 401) {
    return { state: "logged-out", reason: "网站返回 401，需要重新登录" };
  }
  if (response.redirected && finalUrl && LOGIN_URL_PATTERN.test(finalUrl.pathname)) {
    return { state: "logged-out", reason: "请求已跳转到登录页面" };
  }
  if (response.status === 403) {
    return { state: "unknown", reason: "网站拒绝访问，可能是登录失效或风控" };
  }
  if (response.ok) {
    return { state: "active", reason: "后台请求成功" };
  }
  return { state: "error", reason: `网站返回 HTTP ${response.status}` };
}

async function pingSessionSite(site) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(site.url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });
    return Object.assign(classifySessionResponse(response), {
      lastAttemptAt: new Date().toISOString(),
      lastSuccessAt: response.ok ? new Date().toISOString() : site.lastSuccessAt || ""
    });
  } catch (error) {
    return {
      state: "error",
      reason: error && error.name === "AbortError" ? "后台请求超时" : "网络请求失败",
      lastAttemptAt: new Date().toISOString(),
      lastSuccessAt: site.lastSuccessAt || ""
    };
  } finally {
    clearTimeout(timer);
  }
}

async function pingAllSessionSites() {
  const snapshot = await loadSessionSites();
  const entries = Object.entries(snapshot).filter(([, site]) => site && site.enabled);
  const updates = await Promise.all(entries.map(async ([origin, site]) => {
    const result = await pingSessionSite(site);
    return [origin, site.url, result];
  }));
  const sites = await loadSessionSites();
  updates.forEach(([origin, requestedUrl, result]) => {
    if (sites[origin] && sites[origin].enabled && sites[origin].url === requestedUrl) {
      sites[origin] = Object.assign({}, sites[origin], result);
    }
  });
  if (updates.length) await saveSessionSites(sites);
  return sites;
}

async function sessionStatus(rawUrl) {
  const url = new URL(String(rawUrl || ""));
  const sites = await loadSessionSites();
  return sites[url.origin] || null;
}

async function enableSessionKeepalive(message) {
  const url = normalizedSessionUrl(message.url);
  const parsed = new URL(url);
  const permissionOrigin = `${parsed.origin}/*`;
  const permitted = await chrome.permissions.contains({ origins: [permissionOrigin] });
  if (!permitted) throw new Error("尚未获得当前招聘网站的后台访问权限");
  const sites = await loadSessionSites();
  const previous = sites[parsed.origin] || {};
  sites[parsed.origin] = Object.assign({}, previous, {
    origin: parsed.origin,
    url,
    title: String(message.title || previous.title || parsed.hostname).slice(0, 120),
    enabled: true,
    state: "checking",
    reason: "正在执行首次后台请求",
    updatedAt: new Date().toISOString()
  });
  const pingResult = await pingSessionSite(sites[parsed.origin]);
  sites[parsed.origin] = Object.assign({}, sites[parsed.origin], pingResult);
  await saveSessionSites(sites);
  await syncSessionAlarm(sites);
  return sites[parsed.origin];
}

async function disableSessionKeepalive(rawUrl) {
  const origin = new URL(String(rawUrl || "")).origin;
  const sites = await loadSessionSites();
  delete sites[origin];
  await saveSessionSites(sites);
  await syncSessionAlarm(sites);
  return null;
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === SESSION_ALARM) pingAllSessionSites().catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  loadSessionSites().then(syncSessionAlarm).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  loadSessionSites().then(syncSessionAlarm).catch(() => {});
});

loadSessionSites().then(syncSessionAlarm).catch(() => {});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;
  let action;
  if (message.type === "JOB_MATCH_ANALYZE_ONE") {
    action = analyzeJob(message.job || {}).then((result) => ({ result }));
  } else if (message.type === "SESSION_KEEPALIVE_STATUS") {
    action = sessionStatus(message.url).then((site) => ({ site }));
  } else if (message.type === "SESSION_KEEPALIVE_ENABLE") {
    action = enableSessionKeepalive(message).then((site) => ({ site }));
  } else if (message.type === "SESSION_KEEPALIVE_DISABLE") {
    action = disableSessionKeepalive(message.url).then((site) => ({ site }));
  } else if (message.type === "SESSION_KEEPALIVE_PING_ALL") {
    action = pingAllSessionSites().then((sites) => ({ sites }));
  } else {
    return false;
  }
  action
    .then((payload) => sendResponse(Object.assign({ ok: true }, payload)))
    .catch((error) => sendResponse({ ok: false, error: String(error && error.message || error) }));
  return true;
});
