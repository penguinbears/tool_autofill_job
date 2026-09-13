(function () {
  "use strict";

  if (globalThis.__JOB_AUTOFILL_LIST_LOADED__) return;
  globalThis.__JOB_AUTOFILL_LIST_LOADED__ = true;

  const BADGE_PREFIX = "job-autofill-match-";
  let running = false;
  let activeTaskId = "";
  let activeTaskUrl = "";
  let pinnedBadge = null;
  let hideDetailTimer = null;

  function cleanText(value, maxLength) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength || 3000);
  }

  function visible(element) {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function idFor(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function cardFor(anchor) {
    const selectors = "article,li,[role='listitem'],[class*='job-item'],[class*='jobItem'],[class*='position-item'],[class*='positionItem'],[class*='card']";
    return anchor.closest(selectors) || anchor.parentElement;
  }

  function isMokaListPage() {
    return location.hostname === "app.mokahr.com" && /#\/jobs(?:[/?]|$)/i.test(location.hash);
  }

  function discoverMokaJobs() {
    if (!isMokaListPage()) return [];
    const seen = new Set();
    const jobs = [];
    Array.from(document.querySelectorAll("[class*='card-content-']")).forEach((card) => {
      if (!visible(card)) return;
      const titleNode = card.querySelector("[class*='title-'].target-color-container, .target-color-container");
      const anchor = card.closest("a[href]") || card.querySelector("a[href]");
      if (!titleNode || !anchor) return;
      let url;
      try {
        url = new URL(anchor.getAttribute("href") || anchor.href, location.href);
      } catch (error) {
        return;
      }
      if (!/^#\/job\/[a-z0-9-]+(?:[/?]|$)/i.test(url.hash)) return;
      const normalized = url.href;
      if (seen.has(normalized)) return;
      const title = cleanText(titleNode.innerText || titleNode.textContent, 120);
      if (!title) return;
      seen.add(normalized);
      jobs.push({
        id: idFor(normalized),
        title,
        url: normalized,
        excerpt: cleanText(card.innerText || card.textContent, 3000),
        score: 100,
        platform: "moka",
        anchor,
        target: titleNode
      });
    });
    return jobs;
  }

  function candidateScore(anchor, card, url) {
    const title = cleanText(anchor.innerText || anchor.textContent, 120);
    const cardText = cleanText(card && (card.innerText || card.textContent), 3000);
    if (title.length < 2 || title.length > 120) return -100;
    if (/首页|登录|注册|隐私|帮助|更多|返回|上一页|下一页|联系我们|公司官网/.test(title)) return -100;
    let score = 0;
    if (/(?:job|jobs|position|recruit|career|campus|post|detail|apply)/i.test(`${url.pathname}${url.hash}`)) score += 3;
    if (/岗位职责|职位描述|工作职责|任职要求|职位要求|岗位要求|招聘类别|工作地点|更新于/.test(cardText)) score += 4;
    if (/工程师|经理|产品|运营|设计|开发|算法|销售|采购|实习|校招|招聘/.test(title)) score += 2;
    if (cardText.length >= 20 && cardText.length <= 3000) score += 1;
    return score;
  }

  function discoverJobs() {
    if (isMokaListPage()) return discoverMokaJobs();
    const seen = new Set();
    const candidates = [];
    Array.from(document.querySelectorAll("a[href]")).forEach((anchor) => {
      if (!visible(anchor)) return;
      let url;
      try {
        url = new URL(anchor.href, location.href);
      } catch (error) {
        return;
      }
      if (!/^https?:$/i.test(url.protocol)) return;
      url.hash = "";
      const normalized = url.href;
      if (seen.has(normalized) || normalized === location.href.split("#")[0]) return;
      const card = cardFor(anchor);
      const score = candidateScore(anchor, card, url);
      if (score < 3) return;
      seen.add(normalized);
      candidates.push({
        id: idFor(normalized),
        title: cleanText(anchor.innerText || anchor.textContent, 120),
        url: normalized,
        excerpt: cleanText(card && (card.innerText || card.textContent), 3000),
        score,
        anchor,
        target: anchor
      });
    });
    return candidates.sort((left, right) => right.score - left.score);
  }

  function ensureStyles() {
    if (document.getElementById("job-autofill-match-style")) return;
    const style = document.createElement("style");
    style.id = "job-autofill-match-style";
    style.textContent = `
      .job-autofill-match-badge{position:relative;display:inline-flex;align-items:center;margin-left:8px;padding:3px 8px;border:1px solid #b8c5d1;border-radius:999px;background:#f5f7f9;color:#536273;font:600 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;cursor:pointer;vertical-align:middle;z-index:2147483000}
      .job-autofill-match-badge[data-level="非常匹配"]{border-color:#16845b;background:#e8f7f0;color:#0b6845}
      .job-autofill-match-badge[data-level="匹配"]{border-color:#258a95;background:#e8f5f6;color:#17636c}
      .job-autofill-match-badge[data-level="部分匹配"]{border-color:#c58a23;background:#fff6df;color:#875b0e}
      .job-autofill-match-badge[data-level="不匹配"],.job-autofill-match-badge[data-state="error"]{border-color:#c85b57;background:#fff0ef;color:#963d39}
      .job-autofill-match-floating-detail{display:none;position:fixed;width:min(380px,calc(100vw - 24px));max-height:min(420px,calc(100vh - 24px));overflow:auto;box-sizing:border-box;padding:14px;border:1px solid #cbd5df;border-radius:12px;background:#fff;color:#25313d;box-shadow:0 16px 40px rgba(22,34,46,.24);white-space:normal;font:13px/1.58 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;text-align:left;z-index:2147483647}
      .job-autofill-match-floating-detail[data-visible="true"]{display:block}
      .job-autofill-match-detail-content strong{display:block;margin:8px 0 2px}.job-autofill-match-detail-content ul{margin:2px 0 7px;padding-left:18px}
      .job-autofill-match-detail-title{display:block;margin-bottom:7px;font-weight:700;color:#17212b}
      .job-autofill-match-detail-error{color:#963d39;white-space:pre-wrap}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function floatingDetail() {
    ensureStyles();
    let detail = document.getElementById("job-autofill-match-floating-detail");
    if (detail) return detail;
    detail = document.createElement("div");
    detail.id = "job-autofill-match-floating-detail";
    detail.className = "job-autofill-match-floating-detail";
    detail.dataset.visible = "false";
    detail.addEventListener("mouseenter", () => clearTimeout(hideDetailTimer));
    detail.addEventListener("mouseleave", () => {
      if (!pinnedBadge) hideFloatingDetail();
    });
    document.body.appendChild(detail);
    return detail;
  }

  function positionFloatingDetail(badge, detail) {
    const badgeRect = badge.getBoundingClientRect();
    detail.style.left = "12px";
    detail.style.top = `${Math.max(12, badgeRect.bottom + 8)}px`;
    const detailRect = detail.getBoundingClientRect();
    const left = Math.min(Math.max(12, badgeRect.left), Math.max(12, window.innerWidth - detailRect.width - 12));
    const belowTop = badgeRect.bottom + 8;
    const aboveTop = badgeRect.top - detailRect.height - 8;
    const top = belowTop + detailRect.height <= window.innerHeight - 12
      ? belowTop
      : Math.max(12, aboveTop);
    detail.style.left = `${left}px`;
    detail.style.top = `${top}px`;
  }

  function showFloatingDetail(badge) {
    if (!badge || !badge.__jobAutofillDetail) return;
    clearTimeout(hideDetailTimer);
    const detail = floatingDetail();
    detail.replaceChildren(badge.__jobAutofillDetail);
    detail.dataset.visible = "true";
    positionFloatingDetail(badge, detail);
  }

  function hideFloatingDetail(delayMs) {
    clearTimeout(hideDetailTimer);
    hideDetailTimer = setTimeout(() => {
      if (pinnedBadge) return;
      const detail = document.getElementById("job-autofill-match-floating-detail");
      if (detail) detail.dataset.visible = "false";
    }, delayMs || 0);
  }

  function badgeFor(job) {
    ensureStyles();
    const badgeId = `${BADGE_PREFIX}${job.id}`;
    let badge = document.getElementById(badgeId);
    if (badge) return badge;
    badge = document.createElement("span");
    badge.id = badgeId;
    badge.className = "job-autofill-match-badge";
    badge.dataset.state = "pending";
    badge.textContent = "等待分析";
    badge.addEventListener("mouseenter", () => showFloatingDetail(badge));
    badge.addEventListener("mouseleave", () => hideFloatingDetail(140));
    badge.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      pinnedBadge = pinnedBadge === badge ? null : badge;
      if (pinnedBadge) showFloatingDetail(badge);
      else hideFloatingDetail();
    });
    (job.target || job.anchor).insertAdjacentElement("afterend", badge);
    return badge;
  }

  function appendList(container, title, items) {
    if (!items || !items.length) return;
    const heading = document.createElement("strong");
    heading.textContent = title;
    const list = document.createElement("ul");
    items.forEach((value) => {
      const item = document.createElement("li");
      item.textContent = value;
      list.appendChild(item);
    });
    container.append(heading, list);
  }

  function showResult(job, result) {
    const badge = badgeFor(job);
    badge.textContent = `${result.level} · ${result.score}`;
    badge.dataset.level = result.level;
    badge.dataset.state = "complete";
    const detail = document.createElement("div");
    detail.className = "job-autofill-match-detail-content";
    const title = document.createElement("span");
    title.className = "job-autofill-match-detail-title";
    title.textContent = `${job.title} · ${result.level} · ${result.score}`;
    const summary = document.createElement("span");
    summary.textContent = result.summary || "暂无分析摘要";
    detail.append(title, summary);
    appendList(detail, "匹配优势", result.strengths);
    appendList(detail, "待补足", result.gaps);
    appendList(detail, "硬性阻断", result.hardBlockers);
    appendList(detail, "判断依据", result.evidence);
    badge.__jobAutofillDetail = detail;
    if (pinnedBadge === badge) showFloatingDetail(badge);
  }

  function showError(job, message) {
    const badge = badgeFor(job);
    badge.textContent = "分析失败";
    badge.dataset.state = "error";
    const detail = document.createElement("div");
    detail.className = "job-autofill-match-detail-content";
    const title = document.createElement("span");
    title.className = "job-autofill-match-detail-title";
    title.textContent = `${job.title} · 分析失败`;
    const reason = document.createElement("span");
    reason.className = "job-autofill-match-detail-error";
    reason.textContent = cleanText(message, 1000) || "未知错误";
    detail.append(title, reason);
    badge.__jobAutofillDetail = detail;
    if (pinnedBadge === badge) showFloatingDetail(badge);
  }

  function notifyProgress(payload) {
    chrome.runtime.sendMessage(Object.assign({ type: "JOB_MATCH_PROGRESS" }, payload)).catch(() => {});
  }

  function cancelActiveTask() {
    if (!activeTaskId) return;
    const taskId = activeTaskId;
    activeTaskId = "";
    activeTaskUrl = "";
    running = false;
    chrome.runtime.sendMessage({ type: "JOB_MATCH_CANCEL_TASK", taskId }).catch(() => {});
  }

  async function runBatch(inputJobs) {
    if (running) return;
    running = true;
    const taskId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const pageUrl = location.href;
    activeTaskId = taskId;
    activeTaskUrl = pageUrl;
    const currentById = new Map(discoverJobs().map((job) => [job.id, job]));
    const jobs = (inputJobs || discoverJobs()).map((job) => {
      const current = currentById.get(job.id);
      return current ? Object.assign({}, current, { platformContext: job.platformContext || null }) : job;
    });
    jobs.forEach((job) => badgeFor(job));
    let completed = 0;
    await Promise.all(jobs.map(async (job) => {
      const badge = badgeFor(job);
      badge.textContent = "分析中…";
      badge.dataset.state = "running";
      badge.__jobAutofillDetail = null;
      try {
        const response = await chrome.runtime.sendMessage({
          type: "JOB_MATCH_ANALYZE_ONE",
          taskId,
          pageUrl,
          job: {
            id: job.id,
            title: job.title,
            url: job.url,
            excerpt: job.excerpt,
            platform: job.platform || "generic",
            platformContext: job.platformContext || null
          }
        });
        if (activeTaskId !== taskId || activeTaskUrl !== location.href) return;
        if (!response || !response.ok) throw new Error(response && response.error || "后台没有返回结果");
        showResult(job, response.result);
      } catch (error) {
        if (activeTaskId !== taskId || activeTaskUrl !== location.href) return;
        showError(job, error && error.message || error);
      }
      completed += 1;
      notifyProgress({ completed, total: jobs.length, done: completed === jobs.length });
    }));
    if (activeTaskId === taskId) {
      activeTaskId = "";
      activeTaskUrl = "";
      running = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return false;
    if (message.type === "JOB_MATCH_DISCOVER") {
      const jobs = discoverJobs();
      sendResponse({ ok: true, jobs: jobs.map(({ anchor, target, ...job }) => job) });
      return false;
    }
    if (message.type === "JOB_MATCH_START") {
      if (running) {
        sendResponse({ ok: false, error: "岗位匹配任务正在运行" });
        return false;
      }
      const discovered = discoverJobs();
      const byId = new Map(discovered.map((job) => [job.id, job]));
      const jobs = (message.jobs || []).map((job) => {
        const current = byId.get(job.id);
        return current ? Object.assign({}, current, { platformContext: job.platformContext || null }) : null;
      }).filter(Boolean);
      const pending = jobs.filter((job) => {
        const badge = document.getElementById(`${BADGE_PREFIX}${job.id}`);
        return !badge || (badge.dataset.state !== "complete" && badge.dataset.state !== "running");
      });
      jobs.forEach((job) => badgeFor(job));
      sendResponse({ ok: true, count: pending.length, skipped: jobs.length - pending.length });
      if (pending.length) {
        runBatch(pending).catch((error) => notifyProgress({ done: true, error: String(error && error.message || error) }));
      }
      return false;
    }
    return false;
  });

  function cancelIfPageChanged() {
    if (activeTaskId && location.href !== activeTaskUrl) cancelActiveTask();
  }

  window.addEventListener("pagehide", cancelActiveTask);
  window.addEventListener("hashchange", cancelIfPageChanged);
  window.addEventListener("popstate", cancelIfPageChanged);
  window.addEventListener("scroll", () => {
    if (pinnedBadge) showFloatingDetail(pinnedBadge);
  }, true);
  window.addEventListener("resize", () => {
    if (pinnedBadge) showFloatingDetail(pinnedBadge);
  });
})();
