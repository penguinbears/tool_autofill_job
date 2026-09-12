(function () {
  "use strict";

  const baseUrlNode = document.getElementById("base-url");
  const apiKeyNode = document.getElementById("api-key");
  const modelNode = document.getElementById("model");
  const promptNode = document.getElementById("prompt");
  const skillModeNode = document.getElementById("skill-mode");
  const skillFileNode = document.getElementById("skill-file");
  const skillUrlNode = document.getElementById("skill-url");
  const skillPreviewNode = document.getElementById("skill-preview");
  const skillMetaNode = document.getElementById("skill-meta");
  const filePanelNode = document.getElementById("file-panel");
  const githubPanelNode = document.getElementById("github-panel");
  const statusNode = document.getElementById("status");
  let skillContent = "";
  let skillName = "";

  function setStatus(message, isError) {
    statusNode.textContent = message;
    statusNode.classList.toggle("error", Boolean(isError));
  }

  function updateSkillPanels() {
    filePanelNode.hidden = skillModeNode.value !== "file";
    githubPanelNode.hidden = skillModeNode.value !== "github";
  }

  function setSkill(content, name) {
    skillContent = String(content || "").slice(0, 100000);
    skillName = String(name || "").slice(0, 300);
    skillPreviewNode.value = skillContent;
    skillMetaNode.textContent = skillContent
      ? `已载入：${skillName || "未命名 Skill"}，${skillContent.length} 个字符。`
      : "";
  }

  function githubRawUrls(value) {
    const url = new URL(value);
    if (url.hostname === "raw.githubusercontent.com") return [url.href];
    if (url.hostname !== "github.com") throw new Error("请填写 github.com 或 raw.githubusercontent.com 链接");
    const parts = url.pathname.split("/").filter(Boolean);
    const blobIndex = parts.indexOf("blob");
    if (blobIndex === 2 && parts.length > 4) {
      return [`https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts.slice(3).join("/")}`];
    }
    if (parts[2] === "tree" && parts.length >= 4) {
      const folder = parts.slice(4).join("/");
      const suffix = folder ? `${folder}/SKILL.md` : "SKILL.md";
      return [`https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts[3]}/${suffix}`];
    }
    if (parts.length === 2) {
      return [
        `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/main/SKILL.md`,
        `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/master/SKILL.md`
      ];
    }
    throw new Error("请填写 GitHub 仓库、目录、具体文件或 raw 链接");
  }

  async function requestOrigin(urlValue) {
    const url = new URL(urlValue);
    const origin = `${url.origin}/*`;
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) throw new Error(`未获得读取 ${url.hostname} 的权限`);
  }

  async function loadGithubSkill() {
    try {
      const rawUrls = githubRawUrls(skillUrlNode.value.trim());
      await requestOrigin(rawUrls[0]);
      setStatus("正在读取 GitHub Skill…");
      let response;
      let loadedUrl = "";
      for (const rawUrl of rawUrls) {
        response = await fetch(rawUrl);
        if (response.ok) {
          loadedUrl = rawUrl;
          break;
        }
      }
      if (!response || !response.ok) throw new Error(`GitHub 返回 ${response ? response.status : "读取失败"}`);
      const text = await response.text();
      if (!text.trim()) throw new Error("Skill 文件为空");
      setSkill(text, loadedUrl);
      setStatus("GitHub Skill 已载入，点击“保存设置”后生效。");
    } catch (error) {
      setStatus(`读取失败：${error.message || error}`, true);
    }
  }

  async function loadSettings() {
    const [local, session] = await Promise.all([
      chrome.storage.local.get(["aiSettings"]),
      chrome.storage.session.get(["aiApiKey"])
    ]);
    const settings = local.aiSettings || {};
    baseUrlNode.value = settings.baseUrl || "";
    apiKeyNode.value = session.aiApiKey || "";
    modelNode.value = settings.model || "";
    promptNode.value = settings.prompt || globalThis.JobAutofillAiMatch.DEFAULT_PROMPT;
    skillModeNode.value = settings.skillMode || "none";
    skillUrlNode.value = settings.skillUrl || "";
    setSkill(settings.skillContent || "", settings.skillName || "");
    updateSkillPanels();
    setStatus(settings.baseUrl ? "已加载 AI 设置。" : "请填写接口信息并保存。");
  }

  async function saveSettings() {
    try {
      const baseUrl = baseUrlNode.value.trim();
      const apiKey = apiKeyNode.value.trim();
      const model = modelNode.value.trim();
      globalThis.JobAutofillAiMatch.chatEndpoint(baseUrl);
      if (!apiKey) throw new Error("请填写 API Key");
      if (!model) throw new Error("请填写模型名称");
      const mode = skillModeNode.value;
      if (mode !== "none" && !skillContent) throw new Error("已选择 Skill 来源，但尚未载入内容");
      const settings = {
        baseUrl,
        model,
        prompt: promptNode.value.trim() || globalThis.JobAutofillAiMatch.DEFAULT_PROMPT,
        skillMode: mode,
        skillUrl: mode === "github" ? skillUrlNode.value.trim() : "",
        skillName: mode === "none" ? "" : skillName,
        skillContent: mode === "none" ? "" : skillContent
      };
      await Promise.all([
        chrome.storage.local.set({ aiSettings: settings }),
        chrome.storage.session.set({ aiApiKey: apiKey })
      ]);
      setStatus("AI 设置已保存。API Key 仅在当前浏览器会话内有效。");
    } catch (error) {
      setStatus(`保存失败：${error.message || error}`, true);
    }
  }

  skillModeNode.addEventListener("change", () => {
    setSkill("", "");
    updateSkillPanels();
  });
  skillUrlNode.addEventListener("change", () => {
    if (skillModeNode.value === "github") setSkill("", "");
  });
  skillFileNode.addEventListener("change", async () => {
    const file = skillFileNode.files && skillFileNode.files[0];
    if (!file) return;
    if (file.size > 200000) {
      setStatus("Skill 文档不能超过 200 KB。", true);
      return;
    }
    try {
      setSkill(await file.text(), file.name);
      setStatus("本地 Skill 已载入，点击“保存设置”后生效。");
    } catch (error) {
      setStatus(`读取文档失败：${error.message || error}`, true);
    }
  });
  document.getElementById("load-skill-url").addEventListener("click", loadGithubSkill);
  document.getElementById("restore-prompt").addEventListener("click", () => {
    promptNode.value = globalThis.JobAutofillAiMatch.DEFAULT_PROMPT;
    setStatus("已恢复默认 Prompt，保存后生效。");
  });
  document.getElementById("save").addEventListener("click", saveSettings);
  loadSettings().catch((error) => setStatus(`加载失败：${error.message || error}`, true));
})();
