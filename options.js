(function () {
  "use strict";

  const editor = document.getElementById("editor");
  const statusNode = document.getElementById("status");
  const fileStatusNode = document.getElementById("file-status");
  const summaryNode = document.getElementById("profile-summary");
  let dirty = false;
  let summaryTimer = null;

  function showStatus(text, error) {
    statusNode.textContent = text;
    statusNode.style.color = error ? "#b42318" : "#087f5b";
  }

  function format(profile) {
    return JSON.stringify(globalThis.JobAutofillProfile.toExternalProfile(profile), null, 2);
  }

  function parseEditor() {
    const raw = JSON.parse(editor.value);
    const validation = globalThis.JobAutofillProfile.validateProfile(raw);
    if (!validation.valid) {
      throw new Error(validation.errors.join("；"));
    }
    return globalThis.JobAutofillProfile.migrateLegacyProfile(raw);
  }

  function renderSummary(profile) {
    const validation = globalThis.JobAutofillProfile.validateProfile(profile);
    const items = [
      ["身份资料", profile.personal && profile.personal.full_name ? "已填写姓名" : "缺少姓名"],
      ["教育经历", `${Array.isArray(profile.education) ? profile.education.length : 0} 段`],
      ["工作经历", `${Array.isArray(profile.work_experience) ? profile.work_experience.length : 0} 段`],
      ["档案提示", validation.warnings.length ? `${validation.warnings.length} 项` : "完整"]
    ];
    summaryNode.textContent = "";
    items.forEach(([title, value], index) => {
      const item = document.createElement("div");
      item.className = `summary-item${index === 3 && validation.warnings.length ? " warn" : ""}`;
      const strong = document.createElement("strong");
      strong.textContent = value;
      const label = document.createElement("span");
      label.textContent = title;
      item.append(strong, label);
      if (index === 3 && validation.warnings.length) {
        item.title = validation.warnings.join("\n");
      }
      summaryNode.appendChild(item);
    });
  }

  function refreshSummaryFromEditor() {
    clearTimeout(summaryTimer);
    summaryTimer = setTimeout(() => {
      try {
        renderSummary(globalThis.JobAutofillProfile.migrateLegacyProfile(JSON.parse(editor.value)));
      } catch (error) {
        summaryNode.textContent = "";
        const item = document.createElement("div");
        item.className = "summary-item warn";
        item.textContent = `JSON 尚未完成：${error.message || error}`;
        summaryNode.appendChild(item);
      }
    }, 250);
  }

  function describeFileSync(fileSync) {
    if (fileSync && fileSync.synced) return `已同步到 ${fileSync.fileName}`;
    if (!fileSync || fileSync.reason === "not-bound") return "扩展已保存；磁盘 JSON 尚未绑定。";
    if (fileSync.reason === "permission-required") return "扩展已保存；磁盘 JSON 需要重新授权。";
    return `扩展已保存；磁盘同步失败：${fileSync.error || fileSync.reason}`;
  }

  async function refreshBindingStatus() {
    const binding = await globalThis.JobAutofillStorage.bindingStatus();
    if (!binding.bound) {
      fileStatusNode.textContent = "磁盘 JSON 尚未绑定。首次绑定需要你选择文件。";
    } else if (binding.permission === "granted") {
      fileStatusNode.textContent = `已绑定 ${binding.fileName}，后续修改会自动同步。`;
    } else {
      fileStatusNode.textContent = `已绑定 ${binding.fileName}，下次保存时会请求写入权限。`;
    }
  }

  async function load() {
    const stored = await chrome.storage.local.get(["candidateProfile"]);
    const profile = globalThis.JobAutofillProfile.migrateLegacyProfile(
      stored.candidateProfile || globalThis.JobAutofillProfile.DEFAULT_PROFILE
    );
    editor.value = format(profile);
    renderSummary(profile);
    dirty = false;
    showStatus(stored.candidateProfile ? "已加载扩展档案" : "当前为空白模板");
    await refreshBindingStatus();
  }

  document.getElementById("save").addEventListener("click", async () => {
    try {
      const profile = parseEditor();
      const saved = await globalThis.JobAutofillStorage.saveProfile(profile, {
        requestFilePermission: true
      });
      editor.value = format(saved.profile);
      renderSummary(saved.profile);
      dirty = false;
      showStatus("档案已校验并保存");
      fileStatusNode.textContent = describeFileSync(saved.fileSync);
    } catch (error) {
      showStatus(`JSON 格式或保存错误：${error.message || error}`, true);
    }
  });

  document.getElementById("bind-json").addEventListener("click", async () => {
    try {
      const bound = await globalThis.JobAutofillStorage.bindProfileFile();
      if (!bound.ok) {
        showStatus(`绑定失败：${bound.error || bound.reason}`, true);
        return;
      }
      editor.value = format(bound.profile);
      renderSummary(bound.profile);
      dirty = false;
      showStatus("JSON 已绑定，内容已载入并同步");
      fileStatusNode.textContent = `已绑定 ${bound.fileName}，后续补填会自动同步。`;
    } catch (error) {
      if (error && error.name === "AbortError") return;
      showStatus(`绑定失败：${error.message || error}`, true);
    }
  });

  document.getElementById("reset").addEventListener("click", () => {
    if (!confirm("确定把编辑器恢复为空白模板吗？必须再点击保存才会覆盖当前档案。")) return;
    editor.value = format(globalThis.JobAutofillProfile.DEFAULT_PROFILE);
    renderSummary(globalThis.JobAutofillProfile.DEFAULT_PROFILE);
    dirty = true;
    showStatus("已恢复空白模板，点击保存后生效");
  });

  document.getElementById("import-file").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text());
      const validation = globalThis.JobAutofillProfile.validateProfile(raw);
      if (!validation.valid) throw new Error(validation.errors.join("；"));
      const profile = globalThis.JobAutofillProfile.migrateLegacyProfile(raw);
      editor.value = format(profile);
      renderSummary(profile);
      dirty = true;
      showStatus("已导入副本，请检查后点击保存；如需自动同步请使用“绑定”");
    } catch (error) {
      showStatus(`导入失败：${error.message || error}`, true);
    } finally {
      event.target.value = "";
    }
  });

  document.getElementById("export").addEventListener("click", () => {
    try {
      const profile = parseEditor();
      const blob = new Blob([format(profile)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "candidate-profile.json";
      anchor.click();
      URL.revokeObjectURL(url);
      showStatus("已导出 JSON 备份");
    } catch (error) {
      showStatus(`导出失败：${error.message || error}`, true);
    }
  });

  editor.addEventListener("input", () => {
    dirty = true;
    showStatus("有未保存修改");
    refreshSummaryFromEditor();
  });

  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  load();
})();
