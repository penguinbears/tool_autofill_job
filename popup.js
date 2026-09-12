(function () {
  "use strict";

  const statusNode = document.getElementById("status");
  const summaryNode = document.getElementById("summary");
  const listNode = document.getElementById("field-list");
  const missingEditorNode = document.getElementById("missing-editor");
  const missingListNode = document.getElementById("missing-list");
  const syncStateNode = document.getElementById("sync-state");
  const attentionNode = document.getElementById("attention");
  const attentionListNode = document.getElementById("attention-list");
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
  let currentProfile = null;
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

  function permissionOrigin(rawUrl) {
    const url = new URL(rawUrl);
    if (!/^https?:$/i.test(url.protocol)) throw new Error("仅支持 HTTP 或 HTTPS 地址");
    return `${url.protocol}//${url.hostname}/*`;
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
      const tab = await activeTab();
      if (!tab || !tab.id) throw new Error("没有可用的当前网页");
      await ensureJobListInjected(tab.id);
      const discovered = await chrome.tabs.sendMessage(tab.id, { type: "JOB_MATCH_DISCOVER" });
      const jobs = discovered && discovered.jobs || [];
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
      if (!response || !response.ok || !response.count) {
        throw new Error(response && response.error || "岗位分析任务没有启动");
      }
      setStatus(`已开始分析 ${response.count} 个岗位。结果会直接显示在当前招聘列表中。`);
    } catch (error) {
      setStatus(`岗位匹配启动失败：${error.message || error}`, true);
    } finally {
      matchJobsButton.disabled = false;
    }
  }

  function labelFor(field) {
    const base = field.descriptor.label ||
      field.descriptor.ariaLabel ||
      field.descriptor.placeholder ||
      field.descriptor.name ||
      field.descriptor.id ||
      "未命名字段";
    return field.match.path && field.match.path.includes("[]")
      ? `${base}（${field.recordMatch?.identity ? field.recordMatch.identity + "，" : ""}网页第 ${Number(field.repeatPosition || 0) + 1} 段）`
      : base;
  }

  function fieldIdentity(field) {
    if (field.customKey) return `custom:${field.customKey}`;
    return `${field.match.path || "unmatched"}:${field.arrayIndex || 0}:${labelFor(field)}`;
  }

  function describeFileSync(fileSync) {
    if (!fileSync) return "档案已保存到扩展；尚未绑定磁盘 JSON 文件。";
    if (fileSync.synced) return `已自动同步：${fileSync.fileName || "candidate-profile.json"}`;
    if (fileSync.reason === "not-bound") return "已保存到扩展；点击“绑定 JSON”后可自动同步磁盘文件。";
    if (fileSync.reason === "permission-required") {
      return `已保存到扩展；${fileSync.fileName || "JSON 文件"}需要重新授权写入。`;
    }
    if (fileSync.reason === "write-failed") return `扩展已保存，但 JSON 写入失败：${fileSync.error || "未知错误"}`;
    return "档案已保存到扩展。";
  }

  async function refreshBindingStatus() {
    const binding = await globalThis.JobAutofillStorage.bindingStatus();
    if (!binding.bound) {
      syncStateNode.textContent = "磁盘 JSON：未绑定。浏览器安全要求首次手动选择文件。";
    } else if (binding.permission === "granted") {
      syncStateNode.textContent = `磁盘 JSON：已绑定 ${binding.fileName}，修改会自动同步。`;
    } else {
      syncStateNode.textContent = `磁盘 JSON：已绑定 ${binding.fileName}，但需要重新授权。`;
    }
  }

  function missingCandidates(fields) {
    const seen = new Set();
    return fields.filter((field) => {
      if (field.match.sensitive) return false;
      if (field.recordMatch?.profileIndex < 0) return false;
      const needsValue = field.match.path
        ? !field.hasValue
        : Boolean(field.descriptor.required);
      if (!needsValue) return false;
      const identity = fieldIdentity(field);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }

  function updateProfileFromField(field, value) {
    if (field.recordMatch?.profileIndex < 0) return;
    if (field.customKey) {
      if (!currentProfile.additional) currentProfile.additional = {};
      if (!currentProfile.additional.custom_answers) currentProfile.additional.custom_answers = {};
      currentProfile.additional.custom_answers[field.customKey] = value;
      return;
    }
    if (field.match.path) {
      globalThis.JobAutofillProfile.setValue(
        currentProfile,
        field.match.path,
        field.arrayIndex || 0,
        value
      );
    }
  }

  async function persistField(field, input, stateNode) {
    updateProfileFromField(field, input.value);
    stateNode.textContent = "正在保存…";
    try {
      const saved = await globalThis.JobAutofillStorage.saveProfile(currentProfile);
      currentProfile = saved.profile;
      field.hasValue = Boolean(input.value);
      field.previewValue = input.value;
      stateNode.textContent = describeFileSync(saved.fileSync);
      syncStateNode.textContent = describeFileSync(saved.fileSync);
    } catch (error) {
      stateNode.textContent = `保存失败：${error.message || error}`;
      stateNode.className = "field-save-state warn";
    }
  }

  function createEditor(field) {
    const row = document.createElement("div");
    row.className = "missing-row";
    const label = document.createElement("label");
    label.textContent = labelFor(field);

    const longAnswer = field.descriptor.tag === "textarea" ||
      /描述|职责|说明|评价|补充|经历|项目/i.test(label.textContent);
    const input = document.createElement(longAnswer ? "textarea" : "input");
    if (!longAnswer) {
      input.type = /date|时间|日期/i.test(`${field.descriptor.type} ${label.textContent}`)
        ? "text"
        : "text";
    }
    input.value = field.previewValue || "";
    input.placeholder = field.customKey ? "填写后作为该网页字段的自定义答案" : "请输入并自动保存";
    input.setAttribute("aria-label", label.textContent);

    const state = document.createElement("span");
    state.className = "field-save-state";
    let rowSaveTimer = null;

    input.addEventListener("input", () => {
      state.textContent = "等待保存…";
      clearTimeout(rowSaveTimer);
      rowSaveTimer = setTimeout(() => persistField(field, input, state), 450);
    });
    input.addEventListener("change", () => {
      clearTimeout(rowSaveTimer);
      persistField(field, input, state);
    });

    row.append(label, input, state);
    return row;
  }

  function renderMissingEditor(fields) {
    const missing = missingCandidates(fields);
    missingListNode.textContent = "";
    missing.forEach((field) => missingListNode.appendChild(createEditor(field)));
    missingEditorNode.hidden = missing.length === 0;
    if (!missingEditorNode.hidden) refreshBindingStatus();
  }

  function renderAttention(fields, results, expansion) {
    const messages = [];
    fields.forEach((field) => {
      if (field.recordMatch?.profileIndex < 0) {
        messages.push(`${labelFor(field)}：未找到唯一对应的档案记录，无法覆盖这段经历，请核对学校或公司名称。`);
      } else if (field.match.sensitive) {
        messages.push(`${labelFor(field)}：敏感字段，默认不自动填写。`);
      } else if (!field.match.path && field.descriptor.required) {
        messages.push(`${labelFor(field)}：未识别，请在“需要补填”中提供自定义答案。`);
      } else if (field.descriptor.type === "file") {
        messages.push(`${labelFor(field)}：浏览器限制，需手动选择文件。`);
      }
      const currentValue = String(field.descriptor.currentValue || "").trim();
      const profileValue = String(field.previewValue || "").trim();
      const comparable = field.match.path &&
        field.hasValue &&
        currentValue &&
        profileValue &&
        field.descriptor.tag !== "textarea" &&
        field.descriptor.type !== "file" &&
        field.match.path !== "application.first_choice_location";
      if (comparable && (
        globalThis.JobAutofillMatcher.normalize(currentValue) !==
        globalThis.JobAutofillMatcher.normalize(profileValue)
      )) {
        messages.push(
          `${labelFor(field)}：网页为“${currentValue.slice(0, 40)}”，档案为“${profileValue.slice(0, 40)}”，请确认后手动修改或勾选覆盖。`
        );
      }
    });
    (results || []).forEach((field) => {
      if (field.status === "identity-not-found" || field.status === "identity-ambiguous") {
        messages.push(`${labelFor(field)}：当前经历“${field.recordMatch?.identity || "未命名"}”${field.status === "identity-ambiguous" ? "对应多条档案" : "未找到对应档案"}，已跳过覆盖，请核对学校或公司名称。`);
      } else if (field.status === "invalid-date-range") {
        messages.push(`${labelFor(field)}：档案中这段经历的结束时间早于开始时间，已跳过日期填写，请先修正档案。`);
      } else if (field.status === "verification-failed") {
        messages.push(`${labelFor(field)}：${field.dateFailure || "网页回读值与档案不一致，请检查该控件是否接受了填写"}。`);
      } else if (field.status === "option-not-found") {
        messages.push(`${labelFor(field)}：${field.dateFailure || "下拉框没有找到匹配选项，请提供展开后的选项截图"}。`);
      } else if (field.status === "disabled") {
        messages.push(`${labelFor(field)}：网页控件被禁用，可能需先完成前置字段。`);
      } else if (field.status === "value-not-matched") {
        messages.push(`${labelFor(field)}：单选/多选值不匹配，请告诉我网页选项。`);
      } else if (field.status === "manual-required") {
        messages.push(`${labelFor(field)}：需要手动操作。`);
      }
    });
    (expansion || []).forEach((item) => {
      if (item.status !== "complete") {
        messages.push(`${item.label}：需要 ${item.target} 段，仅发现 ${item.after} 段；${item.message}`);
      }
    });

    const unique = Array.from(new Set(messages));
    attentionListNode.textContent = "";
    unique.forEach((message) => {
      const item = document.createElement("li");
      item.textContent = message;
      attentionListNode.appendChild(item);
    });
    attentionNode.hidden = unique.length === 0;
  }

  function render(fields, results, expansion) {
    const matched = fields.filter((field) => field.match.path);
    const ready = matched.filter((field) => field.hasValue);
    const missing = missingCandidates(fields);

    document.getElementById("matched").textContent = String(matched.length);
    document.getElementById("ready").textContent = String(ready.length);
    document.getElementById("missing").textContent = String(missing.length);
    listNode.textContent = "";

    fields
      .filter((field) => field.match.path || field.descriptor.required)
      .slice(0, 80)
      .forEach((field) => {
        const li = document.createElement("li");
        const name = document.createElement("span");
        const state = document.createElement("span");
        name.textContent = labelFor(field);

        if (field.match.sensitive) {
          state.textContent = "敏感项已跳过";
          state.className = "warn";
        } else if (!field.match.path) {
          state.textContent = "需自定义";
          state.className = "warn";
        } else if (field.recordMatch?.profileIndex < 0) {
          state.textContent = "经历对应关系待确认";
          state.className = "warn";
        } else if (!field.hasValue) {
          state.textContent = "缺资料，可在下方填写";
          state.className = "warn";
        } else if (field.descriptor.type === "file") {
          state.textContent = "需手动上传";
          state.className = "warn";
        } else {
          state.textContent = field.match.path;
          state.className = "ok";
        }
        li.append(name, state);
        listNode.appendChild(li);
      });
    summaryNode.hidden = false;
    renderMissingEditor(fields);
    renderAttention(fields, results, expansion);
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
      currentProfile = await globalThis.JobAutofillStorage.getProfile();
      const tab = await activeTab();
      if (!tab || !tab.id) throw new Error("没有可用的当前网页");
      await ensureInjected(tab.id);
      const overwrite = document.getElementById("overwrite").checked;
      const response = await chrome.tabs.sendMessage(tab.id, {
        type,
        profile: currentProfile,
        overwrite
      });
      if (!response || !response.ok) throw new Error("网页未响应");
      if (type === "JOB_AUTOFILL_SCAN") {
        render(response.fields || [], [], []);
        setStatus(`已扫描：${response.title || "当前页面"}。缺失资料可直接在下方填写。`);
      } else {
        const results = response.results || [];
        const filled = results.filter((item) => item.status === "verified-filled").length;
        const missing = results.filter((item) => item.status === "missing-value").length;
        const preserved = results.filter((item) => item.status === "existing-value").length;
        render(results, results, response.expansion || []);
        const added = (response.expansion || []).reduce((sum, item) => sum + Math.max(0, item.after - item.before), 0);
        const failed = results.filter((item) => item.status === "verification-failed").length;
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
  document.getElementById("bind-json").addEventListener("click", async () => {
    try {
      const bound = await globalThis.JobAutofillStorage.bindProfileFile();
      if (!bound.ok) {
        if (bound.reason === "file-picker-unavailable") {
          setStatus("当前 Edge 页面不支持直接绑定，请在“档案”页面操作。", true);
        } else {
          setStatus(`JSON 绑定失败：${bound.error || bound.reason}`, true);
        }
        return;
      }
      currentProfile = bound.profile;
      syncStateNode.textContent = `已绑定并同步：${bound.fileName}`;
      setStatus("JSON 文件已绑定，后续补填会自动同步。");
    } catch (error) {
      if (error && error.name === "AbortError") return;
      setStatus(`JSON 绑定失败：${error.message || error}`, true);
    }
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
    currentProfile = profile;
    const hasIdentity = Boolean(profile.personal.full_name || profile.personal.email || profile.personal.phone);
    setStatus(hasIdentity ? "档案已加载，请扫描当前页。" : "请先打开“档案”导入标准 JSON。");
    await refreshBindingStatus();
    await loadAndRenderHistory();
  });
})();
