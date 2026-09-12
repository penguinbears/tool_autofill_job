(function () {
  "use strict";

  if (globalThis.__JOB_AUTOFILL_DETAIL_LOADED__) return;
  globalThis.__JOB_AUTOFILL_DETAIL_LOADED__ = true;

  function cleanText(value, maxLength) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength || 30000);
  }

  function visible(element) {
    if (!element || !(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
  }

  function scoreContainer(element) {
    if (!visible(element)) return -1;
    const text = cleanText(element.innerText || element.textContent, 40000);
    if (text.length < 80) return -1;
    let score = Math.min(text.length, 12000) / 100;
    if (/岗位职责|职位描述|工作职责|任职要求|职位要求|招聘要求|岗位要求/.test(text)) score += 100;
    if (element.matches("main,article,[role='main']")) score += 50;
    if (/nav|footer|header/i.test(element.tagName)) score -= 100;
    return score;
  }

  function extract() {
    const selectors = [
      "main",
      "article",
      "[role='main']",
      "[class*='job-detail']",
      "[class*='jobDetail']",
      "[class*='position-detail']",
      "[class*='positionDetail']",
      "[class*='description']",
      "[class*='requirement']"
    ];
    const candidates = Array.from(document.querySelectorAll(selectors.join(",")));
    let best = document.body;
    let bestScore = scoreContainer(best);
    candidates.forEach((element) => {
      const score = scoreContainer(element);
      if (score > bestScore) {
        best = element;
        bestScore = score;
      }
    });
    return {
      ok: true,
      title: cleanText(document.title, 300),
      url: location.href,
      jd: cleanText(best && (best.innerText || best.textContent), 30000)
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "JOB_MATCH_EXTRACT_DETAIL") return false;
    sendResponse(extract());
    return false;
  });
})();
