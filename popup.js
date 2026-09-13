(function () {
  "use strict";

  const statusNode = document.getElementById("status");
  const historyNode = document.getElementById("history");
  const historyListNode = document.getElementById("history-list");
  const clearHistoryButton = document.getElementById("clear-history");
  const addHistoryButton = document.getElementById("add-history");
  const exportHistoryButton = document.getElementById("export-history");
  const historyAddForm = document.getElementById("history-add-form");
  const historyToolbar = document.getElementById("history-toolbar");
  const historyCategoryFilters = document.getElementById("history-category-filters");
  const historySortNode = document.getElementById("history-sort");
  const historyCountNode = document.getElementById("history-count");
  const historyEmptyNode = document.getElementById("history-empty");
  const matchJobsButton = document.getElementById("match-jobs");
  let allHistory = [];
  let historyFilter = "全部";

  function setStatus(text, isError) {
    statusNode.textContent = text;
    statusNode.style.background = isError ? "#fff1f0" : "#eaf2f3";
    statusNode.style.color = isError ? "#b42318" : "#24575a";
  }

  async function activeTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  async function ensureInjected(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [
        "shared/profile.js",
        "shared/matcher.js",
        "shared/semantic-provider.js",
        "shared/storage.js",
        "content.js"
      ]
    });
  }

  async function ensureJobListInjected(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["job-list.js"]
    });
  }

  async function readJobPlatformContext(tab) {
    if (!tab || !tab.id || !/^https:\/\/app\.mokahr\.com\//i.test(tab.url || "")) return null;
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: () => {
        const data = window.TurboApply && window.TurboApply.data || {};
        const org = data.org || {};
        return {
          provider: "moka",
          siteId: data.siteId || org.siteId || null,
          orgId: org.id || data.orgId || null,
          aesIv: data.aesIv || ""
        };
      }
    });
    return results && results[0] && results[0].result || null;
  }

  function permissionOrigin(rawUrl) {
    const url = new URL(rawUrl);
    if (!/^https?:$/i.test(url.protocol)) throw new Error("仅支持 HTTP 或 HTTPS 地址");
    return `${url.protocol}//${url.hostname}/*`;
  }

  function assertRuntimeHostPermissionsLoaded() {
    const manifest = chrome.runtime.getManifest();
    const optionalHosts = manifest.optional_host_permissions || [];
    const hasHttp = optionalHosts.includes("http://*/*") || optionalHosts.includes("*://*/*");
    const hasHttps = optionalHosts.includes("https://*/*") || optionalHosts.includes("*://*/*");
    if (!hasHttp || !hasHttps) {
      throw new Error("扩展权限配置尚未生效，请到扩展管理页面点击“重新加载”后再试");
    }
  }

  async function startJobMatching() {
    matchJobsButton.disabled = true;
    try {
      const [local, session] = await Promise.all([
        chrome.storage.local.get(["aiSettings"]),
        chrome.storage.session.get(["aiApiKey"])
      ]);
      const settings = local.aiSettings || {};
      if (!settings.baseUrl || !settings.model || !session.aiApiKey) {
        throw new Error("请先打开 AI 页面，填写 Base URL、API Key 和模型名称");
      }
      assertRuntimeHostPermissionsLoaded();
      const tab = await activeTab();
      if (!tab || !tab.id) throw new Error("没有可用的当前网页");
      const platformContext = await readJobPlatformContext(tab);
      if (/^https:\/\/app\.mokahr\.com\//i.test(tab.url || "") && (!platformContext || !platformContext.aesIv)) {
        throw new Error("无法读取 Moka 岗位接口参数，请刷新招聘列表页后重试");
      }
      await ensureJobListInjected(tab.id);
      const discovered = await chrome.tabs.sendMessage(tab.id, { type: "JOB_MATCH_DISCOVER" });
      const jobs = (discovered && discovered.jobs || []).map((job) => (
        job.platform === "moka" ? Object.assign({}, job, { platformContext }) : job
      ));
      if (!jobs.length) throw new Error("当前页面没有识别到岗位详情链接");

      const origins = Array.from(new Set([
        permissionOrigin(settings.baseUrl),
        ...jobs.map((job) => permissionOrigin(job.url))
      ]));
      const granted = await chrome.permissions.request({ origins });
      if (!granted) throw new Error("未获得读取岗位页面或调用模型接口的权限");

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "JOB_MATCH_START",
        jobs
      });
      if (!response || !response.ok) {
        throw new Error(response && response.error || "岗位分析任务没有启动");
      }
      if (!response.count) {
        setStatus(`当前页面 ${response.skipped || jobs.length} 个岗位均已分析完成，无需重复分析。`);
        return;
      }
      setStatus(`已开始分析 ${response.count} 个岗位。结果会直接显示在当前招聘列表中。`);
    } catch (error) {
      const message = String(error && error.message || error);
      const friendlyMessage = /Only permissions specified in the manifest may be requested/i.test(message)
        ? "扩展仍在使用旧的权限清单，请到扩展管理页面点击“重新加载”后再试"
        : message;
      setStatus(`岗位匹配启动失败：${friendlyMessage}`, true);
    } finally {
      matchJobsButton.disabled = false;
    }
  }

  function formatHistoryDate(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "";
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${mm}-${dd}`;
  }

  function historyCategories(history) {
    return Array.from(new Set(
      history.map((item) => item.category || "未分类")
    )).sort((left, right) => left.localeCompare(right, "zh-CN"));
  }

  function renderCategoryFilters(history) {
    const categories = historyCategories(history);
    if (historyFilter !== "全部" && !categories.includes(historyFilter)) {
      historyFilter = "全部";
    }
    historyCategoryFilters.textContent = "";
    ["全部", ...categories].forEach((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `history-filter-button${category === historyFilter ? " active" : ""}`;
      const count = category === "全部"
        ? history.length
        : history.filter((item) => (item.category || "未分类") === category).length;
      button.textContent = `${category} ${count}`;
      button.addEventListener("click", () => {
        historyFilter = category;
        renderHistory();
      });
      historyCategoryFilters.appendChild(button);
    });
  }

  function sortedVisibleHistory() {
    const filtered = historyFilter === "全部"
      ? allHistory.slice()
      : allHistory.filter((item) => (item.category || "未分类") === historyFilter);
    const sortMode = historySortNode.value;
    const textCompare = (field) => (left, right) => (
      String(left[field] || "").localeCompare(String(right[field] || ""), "zh-CN") ||
      String(right.date || "").localeCompare(String(left.date || ""))
    );
    if (sortMode === "date-asc") {
      filtered.sort((left, right) => String(left.date || "").localeCompare(String(right.date || "")));
    } else if (sortMode === "category") {
      filtered.sort(textCompare("category"));
    } else if (sortMode === "company") {
      filtered.sort(textCompare("company"));
    } else if (sortMode === "position") {
      filtered.sort(textCompare("position"));
    } else {
      filtered.sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
    }
    return filtered;
  }

  function renderHistory() {
    historyNode.hidden = false;
    historyListNode.textContent = "";
    renderCategoryFilters(allHistory);
    historyToolbar.hidden = allHistory.length === 0;
    historyEmptyNode.hidden = allHistory.length !== 0;
    exportHistoryButton.disabled = allHistory.length === 0;
    clearHistoryButton.disabled = allHistory.length === 0;
    if (!allHistory.length) {
      historyCountNode.textContent = "";
      return;
    }

    const visibleHistory = sortedVisibleHistory();
    historyCountNode.textContent = historyFilter === "全部"
      ? `共 ${allHistory.length} 条`
      : `显示 ${visibleHistory.length} / ${allHistory.length} 条`;
    visibleHistory.forEach((item) => {
      const li = document.createElement("li");
      li.className = "history-row";

      const info = document.createElement("div");
      info.className = "history-info";
      info.title = item.title || "";

      const company = document.createElement("span");
      company.className = "history-company";
      company.textContent = item.company || "未知公司";

      const positionLine = document.createElement("span");
      positionLine.className = "history-position-line";
      const position = document.createElement("span");
      position.className = "history-position";
      position.textContent = item.position || item.title || "未知职位";
      const category = document.createElement("span");
      category.className = "history-category";
      category.textContent = item.category || "未分类";
      positionLine.append(position, category);
      info.append(company, positionLine);

      const date = document.createElement("span");
      date.className = "history-date";
      date.textContent = formatHistoryDate(item.date);

      const editBtn = document.createElement("button");
      editBtn.className = "history-btn-edit";
      editBtn.textContent = "✎";
      editBtn.title = "编辑";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        editHistoryItem(item, li);
      });

      const delBtn = document.createElement("button");
      delBtn.className = "history-btn-del";
      delBtn.textContent = "✕";
      delBtn.title = "删除";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteHistoryItem(item.id);
      });

      const actions = document.createElement("span");
      actions.className = "history-actions";
      actions.append(editBtn, delBtn);

      li.append(info, date, actions);
      li.addEventListener("click", () => {
        if (item.url) chrome.tabs.create({ url: item.url });
      });
      historyListNode.appendChild(li);
    });
  }

  async function deleteHistoryItem(recordId) {
    const item = allHistory.find((record) => record.id === recordId);
    if (!item) return;
    const label = item.title || `${item.company || "?"} · ${item.position || "?"}`;
    if (!confirm(`确定删除这条记录吗？\n\n${label}`)) return;
    await globalThis.JobAutofillStorage.deleteApplicationRecord(recordId);
    await loadAndRenderHistory();
    setStatus("已删除一条投递记录。");
  }

  function editHistoryItem(item, rowElement) {
    const editForm = document.createElement("div");
    editForm.className = "history-edit-form";

    const companyLabel = document.createElement("label");
    companyLabel.textContent = "公司";
    const companyInput = document.createElement("input");
    companyInput.type = "text";
    companyInput.value = item.company || "";
    companyInput.placeholder = "公司名称";

    const positionLabel = document.createElement("label");
    positionLabel.textContent = "岗位";
    const positionInput = document.createElement("input");
    positionInput.type = "text";
    positionInput.value = item.position || "";
    positionInput.placeholder = "岗位名称";

    const categoryLabel = document.createElement("label");
    categoryLabel.textContent = "职位分类";
    const categoryInput = document.createElement("input");
    categoryInput.type = "text";
    categoryInput.value = item.category || "";
    categoryInput.placeholder = "例如：产品、技术研发";
    categoryInput.setAttribute("list", "position-category-options");

    const urlLabel = document.createElement("label");
    urlLabel.textContent = "投递页面 URL";
    const urlInput = document.createElement("input");
    urlInput.type = "url";
    urlInput.value = item.url || "";
    urlInput.placeholder = "https://...";

    const titleLabel = document.createElement("label");
    titleLabel.textContent = "页面标题";
    const titleInput = document.createElement("input");
    titleInput.type = "text";
    titleInput.value = item.title || "";
    titleInput.placeholder = "可选";

    const btnRow = document.createElement("div");
    btnRow.className = "history-edit-btns";

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "保存";
    saveBtn.className = "history-btn-save";
    saveBtn.addEventListener("click", async () => {
      if (!/^https?:\/\//i.test(urlInput.value.trim())) {
        setStatus("投递记录 URL 必须以 http:// 或 https:// 开头。", true);
        urlInput.focus();
        return;
      }
      await globalThis.JobAutofillStorage.updateApplicationRecord(item.id, {
        title: titleInput.value.trim(),
        company: companyInput.value.trim(),
        position: positionInput.value.trim(),
        category: categoryInput.value.trim(),
        url: urlInput.value.trim()
      });
      await loadAndRenderHistory();
      setStatus("已更新投递记录。");
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "取消";
    cancelBtn.className = "history-btn-cancel";
    cancelBtn.addEventListener("click", () => loadAndRenderHistory());

    btnRow.append(saveBtn, cancelBtn);
    editForm.append(
      companyLabel,
      companyInput,
      positionLabel,
      positionInput,
      categoryLabel,
      categoryInput,
      urlLabel,
      urlInput,
      titleLabel,
      titleInput,
      btnRow
    );

    rowElement.replaceWith(editForm);
  }

  async function loadAndRenderHistory() {
    allHistory = await globalThis.JobAutofillStorage.getApplicationHistory();
    renderHistory();
  }

  function resetHistoryAddForm() {
    historyAddForm.reset();
    historyAddForm.hidden = true;
  }

  async function showHistoryAddForm() {
    historyAddForm.hidden = false;
    const urlInput = document.getElementById("history-add-url");
    if (!urlInput.value) {
      try {
        const tab = await activeTab();
        if (tab && /^https?:\/\//i.test(tab.url || "")) urlInput.value = tab.url;
      } catch (error) {
        // The form remains usable even if the active tab cannot be read.
      }
    }
    urlInput.focus();
  }

  async function saveManualHistory(event) {
    event.preventDefault();
    const urlInput = document.getElementById("history-add-url");
    const companyInput = document.getElementById("history-add-company");
    const positionInput = document.getElementById("history-add-position");
    const categoryInput = document.getElementById("history-add-category");
    const url = urlInput.value.trim();
    if (!/^https?:\/\//i.test(url)) {
      setStatus("URL 必须以 http:// 或 https:// 开头。", true);
      urlInput.focus();
      return;
    }
    let company = companyInput.value.trim();
    if (!company) {
      try {
        company = new URL(url).hostname.replace(/^www\./i, "");
      } catch (error) {
        company = "";
      }
    }
    const position = positionInput.value.trim();
    const beforeCount = allHistory.length;
    const history = await globalThis.JobAutofillStorage.addApplicationRecord({
      title: [company, position].filter(Boolean).join(" - "),
      company,
      position,
      category: categoryInput.value.trim(),
      url,
      date: new Date().toISOString(),
      status: "pending"
    });
    allHistory = history;
    resetHistoryAddForm();
    renderHistory();
    setStatus(history.length > beforeCount
      ? "已手动添加投递 URL。"
      : "相同 URL、公司和职位的记录已经存在。");
  }

  async function exportHistoryWorkbook() {
    allHistory = await globalThis.JobAutofillStorage.getApplicationHistory();
    if (!allHistory.length) {
      setStatus("暂无投递记录，无法导出。", true);
      return;
    }
    const result = globalThis.JobAutofillXlsx.downloadApplicationHistory(allHistory);
    setStatus(`已导出 ${allHistory.length} 条投递记录：${result.fileName}`);
  }

  async function send(type) {
    try {
      const profile = await globalThis.JobAutofillStorage.getProfile();
      const tab = await activeTab();
      if (!tab || !tab.id) throw new Error("没有可用的当前网页");
      await ensureInjected(tab.id);
      const overwrite = document.getElementById("overwrite").checked;
      const response = await chrome.tabs.sendMessage(tab.id, {
        type,
        profile,
        overwrite
      });
      if (!response || !response.ok) throw new Error("网页未响应");
      if (type === "JOB_AUTOFILL_SCAN") {
        setStatus(`已扫描：${response.title || "当前页面"}。`);
      } else {
        const results = response.results || [];
        const filled = results.filter((item) => item.status === "verified-filled").length;
        const missing = results.filter((item) => item.status === "missing-value").length;
        const preserved = results.filter((item) => item.status === "existing-value").length;
        const added = (response.expansion || []).reduce((sum, item) => sum + Math.max(0, item.after - item.before), 0);
        const failed = results.filter((item) => ["verification-failed", "popup-timeout", "date-navigation-failed",
          "invalid-date", "stale-locator", "option-not-found"].includes(item.status)).length;
        setStatus(`已新增 ${added} 个经历区块，验证成功 ${filled} 项；保留原值 ${preserved} 项；验证失败 ${failed} 项；缺资料 ${missing} 项。`, failed > 0);
      }
    } catch (error) {
      setStatus(`${error.message || error}。请刷新网页后重试。`, true);
    }
  }

  document.getElementById("scan").addEventListener("click", () => send("JOB_AUTOFILL_SCAN"));
  document.getElementById("fill").addEventListener("click", () => send("JOB_AUTOFILL_FILL"));
  matchJobsButton.addEventListener("click", startJobMatching);
  addHistoryButton.addEventListener("click", showHistoryAddForm);
  exportHistoryButton.addEventListener("click", exportHistoryWorkbook);
  historyAddForm.addEventListener("submit", saveManualHistory);
  document.getElementById("cancel-add-history").addEventListener("click", resetHistoryAddForm);
  historySortNode.addEventListener("change", renderHistory);
  document.getElementById("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());
  document.getElementById("open-ai").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("ai.html") });
  });
  clearHistoryButton.addEventListener("click", async () => {
    if (!allHistory.length) return;
    if (!confirm(`确定清空全部 ${allHistory.length} 条投递记录吗？此操作无法撤销。`)) return;
    await globalThis.JobAutofillStorage.clearApplicationHistory();
    allHistory = [];
    historyFilter = "全部";
    renderHistory();
    setStatus("投递历史已清除。");
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "JOB_AUTOFILL_RECORD") {
      loadAndRenderHistory();
    } else if (message && message.type === "JOB_MATCH_PROGRESS") {
      if (message.error) {
        setStatus(`岗位分析失败：${message.error}`, true);
      } else if (message.done) {
        setStatus(`岗位匹配分析完成：${message.completed}/${message.total}。`);
      } else {
        setStatus(`岗位匹配分析中：${message.completed}/${message.total}。`);
      }
    }
  });

  globalThis.JobAutofillStorage.getProfile().then(async (profile) => {
    const hasIdentity = Boolean(profile.personal.full_name || profile.personal.email || profile.personal.phone);
    setStatus(hasIdentity ? "档案已加载，请扫描当前页。" : "请先打开“档案”导入标准 JSON。");
    await loadAndRenderHistory();
  });
})();
