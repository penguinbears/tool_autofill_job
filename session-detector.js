(function () {
  "use strict";

  const LOGIN_PATTERN = /(?:登录|登入|登录\s*[\/|｜]\s*注册|注册\s*[\/|｜]\s*登录)/;
  const ACCOUNT_TEXT_PATTERN = /(?:个人中心|用户中心|我的(?:投递|应聘|申请|简历)|(?:投递|应聘|申请)(?:记录|进度))/;
  const HEADER_TOKEN_PATTERN = /(?:^|[-_\s])(header|head|navbar|nav-bar|topbar|top-bar|navigation)(?:$|[-_\s])/i;
  const ACCOUNT_TOKEN_PATTERN = /(?:^|[-_\s])(account|user|avatar|profile|member|login)(?:$|[-_\s])/i;
  const EXCLUDED_TOKEN_PATTERN = /(?:^|[-_\s])(footer|sidebar|modal|dialog|drawer|cookie|banner-ad)(?:$|[-_\s])/i;

  function rendered(element) {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    if (element.closest("[hidden],[aria-hidden='true']")) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function normalizedText(element) {
    return String(element && element.innerText || "").replace(/\s+/g, " ").trim();
  }

  function identityText(element) {
    if (!element) return "";
    return `${element.tagName || ""} ${element.id || ""} ${String(element.className || "")}`;
  }

  function candidateElements() {
    const selectors = [
      "header",
      "nav",
      "[role='banner']",
      "[role='navigation']",
      "[class*='header' i]",
      "[class*='navbar' i]",
      "[class*='topbar' i]",
      "[class*='top-bar' i]"
    ];
    const candidates = new Set(document.querySelectorAll(selectors.join(",")));
    document.querySelectorAll([
      "[class*='account' i]",
      "[class*='user' i]",
      "[class*='avatar' i]",
      "[class*='login' i]"
    ].join(",")).forEach((seed) => {
      let current = seed.parentElement;
      for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
        candidates.add(current);
      }
    });
    return [...candidates];
  }

  function headerScore(element) {
    if (!rendered(element) || element === document.body || element === document.documentElement) return -Infinity;
    const rect = element.getBoundingClientRect();
    const tokens = identityText(element);
    if (EXCLUDED_TOKEN_PATTERN.test(tokens)) return -Infinity;
    let score = 0;
    if (/^(HEADER|NAV)$/i.test(element.tagName) || /^(banner|navigation)$/i.test(element.getAttribute("role") || "")) score += 5;
    if (HEADER_TOKEN_PATTERN.test(tokens)) score += 5;
    if (rect.width >= window.innerWidth * 0.7) score += 3;
    if (rect.height >= 32 && rect.height <= 180) score += 2;
    if (rect.top <= 200 && rect.bottom >= 0) score += 4;
    if (element.querySelectorAll("a[href]").length >= 2) score += 2;
    if (element.querySelector("img,[class*='logo' i],a[title*='首页']")) score += 2;
    if (element.querySelector("[class*='account' i],[class*='user' i],[class*='avatar' i],[class*='login' i]")) score += 4;
    if (rect.height > window.innerHeight * 0.35) score -= 6;
    return score;
  }

  function findHeader() {
    return candidateElements()
      .map((element) => ({ element, score: headerScore(element) }))
      .filter((item) => item.score >= 8)
      .sort((left, right) => right.score - left.score ||
        left.element.getBoundingClientRect().height - right.element.getBoundingClientRect().height)[0] || null;
  }

  function accountElements(header) {
    const headerRect = header.getBoundingClientRect();
    const rightBoundary = headerRect.left + headerRect.width * 0.6;
    const selector = [
      "a",
      "button",
      "[role='button']",
      "[class*='account' i]",
      "[class*='user' i]",
      "[class*='avatar' i]",
      "[class*='login' i]"
    ].join(",");
    return [...header.querySelectorAll(selector)].filter((element) => {
      if (!rendered(element)) return false;
      const rect = element.getBoundingClientRect();
      return rect.left + rect.width / 2 >= rightBoundary;
    });
  }

  function detect() {
    const headerMatch = findHeader();
    if (!headerMatch) {
      return { state: "unknown", confidence: 0, reason: "未识别到已渲染的顶部导航栏" };
    }
    const header = headerMatch.element;
    const accounts = accountElements(header);
    const actionText = accounts
      .filter((element) => /^(A|BUTTON)$/i.test(element.tagName) || element.getAttribute("role") === "button")
      .map(normalizedText)
      .join(" ");
    if (LOGIN_PATTERN.test(actionText)) {
      return { state: "logged-out", confidence: 0.98, reason: "顶部账户入口显示登录" };
    }

    const accountMarkers = accounts.filter((element) => ACCOUNT_TOKEN_PATTERN.test(identityText(element)));
    const accountText = accountMarkers.map(normalizedText).join(" ").trim();
    if (LOGIN_PATTERN.test(accountText)) {
      return { state: "logged-out", confidence: 0.98, reason: "顶部账户区域显示登录" };
    }
    if (accountMarkers.length && (accountText || accountMarkers.some((element) => /avatar/i.test(identityText(element))))) {
      return { state: "logged-in", confidence: 0.96, reason: "顶部账户区域已渲染且未显示登录" };
    }

    const rightText = accounts.map(normalizedText).join(" ");
    if (!LOGIN_PATTERN.test(rightText) && ACCOUNT_TEXT_PATTERN.test(rightText)) {
      return { state: "logged-in", confidence: 0.9, reason: "顶部区域显示个人入口且未显示登录" };
    }
    return { state: "unknown", confidence: 0.35, reason: "顶部导航栏已渲染，但没有可靠的账户入口" };
  }

  async function detectAfterRender(timeoutMs) {
    const immediate = detect();
    if (immediate.state !== "unknown") return immediate;
    const deadline = Date.now() + Math.max(0, Number(timeoutMs) || 0);
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const result = detect();
      if (result.state !== "unknown") return result;
    }
    return detect();
  }

  globalThis.JobAutofillSessionDetector = { detect, detectAfterRender };

  if (globalThis.chrome && chrome.runtime && chrome.runtime.onMessage &&
      !globalThis.__jobAutofillSessionDetectorListener) {
    globalThis.__jobAutofillSessionDetectorListener = true;
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || message.type !== "SESSION_DETECT_LOGIN") return false;
      detectAfterRender(message.timeoutMs || 3000)
        .then((result) => sendResponse({ ok: true, result, url: location.href, title: document.title }))
        .catch((error) => sendResponse({ ok: false, error: String(error && error.message || error) }));
      return true;
    });
  }
})();
