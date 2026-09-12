(function (root) {
  "use strict";

  const DB_NAME = "job-autofill-files";
  const STORE_NAME = "handles";
  const HANDLE_KEY = "candidate-profile-json";

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function readHandle() {
    const database = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).get(HANDLE_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }

  async function writeHandle(handle) {
    const database = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }

  async function removeHandle() {
    const database = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).delete(HANDLE_KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }

  async function permissionFor(handle, requestPermission) {
    if (!handle) return "missing";
    const permissionOptions = { mode: "readwrite" };
    if (typeof handle.queryPermission !== "function") return "granted";
    let state = await handle.queryPermission(permissionOptions);
    if (state !== "granted" && requestPermission && typeof handle.requestPermission === "function") {
      state = await handle.requestPermission(permissionOptions);
    }
    return state;
  }

  async function syncBoundFile(profile, requestPermission) {
    let handle;
    try {
      handle = await readHandle();
      if (!handle) return { synced: false, reason: "not-bound" };
      const permission = await permissionFor(handle, Boolean(requestPermission));
      if (permission !== "granted") {
        return { synced: false, reason: "permission-required", fileName: handle.name || "" };
      }
      const writable = await handle.createWritable();
      const externalProfile = root.JobAutofillProfile.toExternalProfile(profile);
      await writable.write(JSON.stringify(externalProfile, null, 2));
      await writable.close();
      return { synced: true, reason: "ok", fileName: handle.name || "candidate-profile.json" };
    } catch (error) {
      return {
        synced: false,
        reason: "write-failed",
        fileName: handle && handle.name || "",
        error: String(error && error.message || error)
      };
    }
  }

  async function getProfile() {
    const stored = await chrome.storage.local.get(["candidateProfile"]);
    return root.JobAutofillProfile.migrateLegacyProfile(stored.candidateProfile || {});
  }

  async function saveProfile(profile, options) {
    const settings = options || {};
    const normalized = root.JobAutofillProfile.migrateLegacyProfile(profile || {});
    normalized.meta.updated_at = new Date().toISOString();
    await chrome.storage.local.set({ candidateProfile: normalized });
    const fileSync = settings.skipFileSync
      ? { synced: false, reason: "skipped" }
      : await syncBoundFile(normalized, Boolean(settings.requestFilePermission));
    return { profile: normalized, fileSync };
  }

  async function bindProfileFile() {
    if (typeof root.showOpenFilePicker !== "function") {
      return { ok: false, reason: "file-picker-unavailable" };
    }
    const handles = await root.showOpenFilePicker({
      multiple: false,
      types: [{
        description: "候选人档案 JSON",
        accept: { "application/json": [".json"] }
      }]
    });
    const handle = handles && handles[0];
    if (!handle) return { ok: false, reason: "cancelled" };
    await writeHandle(handle);

    let profile = await getProfile();
    try {
      const file = await handle.getFile();
      const text = await file.text();
      if (text.trim()) {
        const raw = JSON.parse(text);
        const validation = root.JobAutofillProfile.validateProfile(raw);
        if (!validation.valid) {
          return {
            ok: false,
            reason: "invalid-profile",
            fileName: handle.name || "",
            error: validation.errors.join("；")
          };
        }
        profile = root.JobAutofillProfile.migrateLegacyProfile(raw);
      }
    } catch (error) {
      return {
        ok: false,
        reason: "read-failed",
        fileName: handle.name || "",
        error: String(error && error.message || error)
      };
    }

    const saved = await saveProfile(profile, { requestFilePermission: true });
    return {
      ok: saved.fileSync.synced,
      profile: saved.profile,
      fileSync: saved.fileSync,
      fileName: handle.name || "candidate-profile.json"
    };
  }

  async function bindingStatus() {
    try {
      const handle = await readHandle();
      if (!handle) return { bound: false, permission: "missing", fileName: "" };
      return {
        bound: true,
        permission: await permissionFor(handle, false),
        fileName: handle.name || "candidate-profile.json"
      };
    } catch (error) {
      return { bound: false, permission: "error", fileName: "", error: String(error) };
    }
  }

  /* ---- 投递历史 ---- */
  const HISTORY_KEY = "applicationHistory";
  const MAX_HISTORY = 200;
  const POSITION_CATEGORY_RULES = [
    ["产品", /产品|product|pm/i],
    ["技术研发", /研发|开发|工程师|算法|测试|数据|前端|后端|客户端|运维|技术|developer|engineer|software|data|qa/i],
    ["设计", /设计|交互|视觉|用户体验|ui|ux|design/i],
    ["运营", /运营|内容|用户增长|社区|直播|电商|operation/i],
    ["市场销售", /市场|品牌|商务|销售|渠道|客户成功|marketing|sales|business development|bd/i],
    ["职能支持", /财务|会计|审计|人力|招聘|法务|行政|采购|供应链|战略|咨询|finance|hr|legal|admin/i]
  ];

  function inferPositionCategory(position) {
    const text = String(position || "").trim();
    const matched = POSITION_CATEGORY_RULES.find(([, pattern]) => pattern.test(text));
    return matched ? matched[0] : "未分类";
  }

  function stableHistoryId(record) {
    if (record && record.id) return String(record.id);
    const source = [
      record && record.url,
      record && record.company,
      record && record.position,
      record && record.date
    ].join("|");
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `legacy-${(hash >>> 0).toString(16)}`;
  }

  function newHistoryId() {
    if (root.crypto && typeof root.crypto.randomUUID === "function") {
      return root.crypto.randomUUID();
    }
    return `history-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeApplicationRecord(record) {
    const source = record || {};
    const position = String(source.position || "").trim().slice(0, 120);
    return {
      id: stableHistoryId(source),
      title: String(source.title || "").trim().slice(0, 200),
      company: String(source.company || "").trim().slice(0, 120),
      position,
      category: String(source.category || inferPositionCategory(position) || "未分类")
        .trim()
        .slice(0, 60) || "未分类",
      url: String(source.url || "").trim().slice(0, 800),
      date: source.date || new Date().toISOString(),
      status: String(source.status || "filled").trim().slice(0, 40)
    };
  }

  async function getApplicationHistory() {
    const stored = await chrome.storage.local.get([HISTORY_KEY]);
    return (stored[HISTORY_KEY] || []).map(normalizeApplicationRecord);
  }

  async function addApplicationRecord(record) {
    if (!record || !record.url) return [];
    const normalized = normalizeApplicationRecord(Object.assign({}, record, {
      id: record.id || newHistoryId()
    }));
    const history = await getApplicationHistory();
    const exists = history.some((item) => (
      item.url === normalized.url &&
      item.company === normalized.company &&
      item.position === normalized.position
    ));
    if (exists) return history;
    history.unshift(normalized);
    if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
    await chrome.storage.local.set({ [HISTORY_KEY]: history });
    return history;
  }

  async function clearApplicationHistory() {
    await chrome.storage.local.set({ [HISTORY_KEY]: [] });
  }

  function historyIndex(history, idOrIndex) {
    if (typeof idOrIndex === "number") return idOrIndex;
    return history.findIndex((item) => stableHistoryId(item) === String(idOrIndex));
  }

  async function deleteApplicationRecord(idOrIndex) {
    const history = await getApplicationHistory();
    const index = historyIndex(history, idOrIndex);
    if (index < 0 || index >= history.length) return history;
    history.splice(index, 1);
    await chrome.storage.local.set({ [HISTORY_KEY]: history });
    return history;
  }

  async function updateApplicationRecord(idOrIndex, updates) {
    const history = await getApplicationHistory();
    const index = historyIndex(history, idOrIndex);
    if (index < 0 || index >= history.length) return history;
    const item = history[index];
    if (updates.company !== undefined) item.company = String(updates.company || "").trim().slice(0, 120);
    if (updates.position !== undefined) item.position = String(updates.position || "").trim().slice(0, 120);
    if (updates.title !== undefined) item.title = String(updates.title || "").trim().slice(0, 200);
    if (updates.url !== undefined) item.url = String(updates.url || "").trim().slice(0, 800);
    if (updates.category !== undefined) {
      item.category = String(updates.category || "").trim().slice(0, 60) || inferPositionCategory(item.position);
    } else if (updates.position !== undefined) {
      item.category = inferPositionCategory(item.position);
    }
    if (updates.status !== undefined) item.status = String(updates.status || "filled").trim().slice(0, 40);
    await chrome.storage.local.set({ [HISTORY_KEY]: history });
    return history;
  }

  root.JobAutofillStorage = {
    getProfile,
    saveProfile,
    syncBoundFile,
    bindProfileFile,
    bindingStatus,
    removeHandle,
    getApplicationHistory,
    addApplicationRecord,
    clearApplicationHistory,
    deleteApplicationRecord,
    updateApplicationRecord,
    inferPositionCategory,
    normalizeApplicationRecord
  };
})(globalThis);
