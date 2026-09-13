(function (root) {
  "use strict";

  const MOKA_JOB_ENDPOINT = "/api/outer/ats-apply/website/job";

  function cleanText(value, maxLength) {
    return String(value || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, maxLength || 30000);
  }

  function decodeHtmlEntities(value) {
    const named = {
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      nbsp: " ",
      quot: '"'
    };
    return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
      if (entity[0] === "#") {
        const hex = entity[1].toLowerCase() === "x";
        const valueText = entity.slice(hex ? 2 : 1);
        const codePoint = Number.parseInt(valueText, hex ? 16 : 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
      }
      return Object.hasOwn(named, entity.toLowerCase()) ? named[entity.toLowerCase()] : match;
    });
  }

  function htmlToText(html, maxLength) {
    const source = String(html || "")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|svg|noscript|template|head|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(p|div|section|article|main|li|h[1-6]|tr|table|ul|ol)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " ");
    return cleanText(decodeHtmlEntities(source), maxLength || 30000);
  }

  function extractMokaJobId(rawUrl) {
    try {
      const url = new URL(rawUrl);
      const match = url.hash.match(/^#\/job\/([a-z0-9-]+)(?:[/?]|$)/i);
      return match ? match[1] : "";
    } catch (error) {
      return "";
    }
  }

  function mokaRequest(job, context) {
    const url = new URL(job.url);
    const jobId = extractMokaJobId(job.url);
    if (!jobId) throw new Error("Moka 岗位详情地址：URL 中缺少岗位 ID");
    const siteId = context && context.siteId || url.pathname.split("/").filter(Boolean).at(-1);
    if (!siteId) throw new Error("Moka 岗位详情：无法读取站点 ID");
    const body = {
      siteId,
      jobId,
      isInviteResume: false,
      locale: "zh_cn"
    };
    if (context && context.orgId) body.orgId = context.orgId;
    const recommendCode = url.searchParams.get("recommendCode");
    if (recommendCode) body.recommendCode = recommendCode;
    return { endpoint: `${url.origin}${MOKA_JOB_ENDPOINT}`, body };
  }

  async function decryptMokaEnvelope(envelope, aesIv, cryptoProvider) {
    if (!envelope || !envelope.necromancer) return envelope;
    if (!aesIv) throw new Error("Moka 岗位详情：页面解密参数缺失，请刷新列表页后重试");
    const cryptoApi = cryptoProvider || root.crypto;
    if (!cryptoApi || !cryptoApi.subtle) throw new Error("当前浏览器不支持 Moka 岗位详情解密");
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const key = await cryptoApi.subtle.importKey(
      "raw",
      encoder.encode(String(envelope.necromancer)),
      { name: "AES-CBC" },
      false,
      ["decrypt"]
    );
    const bytes = Uint8Array.from(atob(String(envelope.data || "")), (character) => character.charCodeAt(0));
    let decrypted;
    try {
      decrypted = await cryptoApi.subtle.decrypt({
        name: "AES-CBC",
        iv: encoder.encode(String(aesIv))
      }, key, bytes);
    } catch (error) {
      throw new Error("Moka 岗位详情解密失败，请刷新列表页后重试");
    }
    try {
      return JSON.parse(decoder.decode(decrypted));
    } catch (error) {
      throw new Error("Moka 岗位详情返回了无法解析的数据");
    }
  }

  function mokaJobText(payload) {
    const lines = [];
    const seen = new Set();
    const relevant = /(?:^|\.)(?:name|title|companyName|jobDescription|description|responsibilities?|requirements?|qualifications?|education|experience|location|department|category|jobRankInfo|commitment|salary|customFields?|projectFolder)(?:\.|$)/i;

    function append(label, value) {
      const text = htmlToText(value, 12000);
      if (!text || seen.has(text)) return;
      seen.add(text);
      lines.push(label ? `${label}: ${text}` : text);
    }

    function visit(value, path, depth) {
      if (depth > 6 || value == null) return;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        if (relevant.test(path)) append(path.split(".").at(-1), value);
        return;
      }
      if (Array.isArray(value)) {
        value.slice(0, 100).forEach((item) => visit(item, path, depth + 1));
        return;
      }
      if (typeof value === "object") {
        Object.entries(value).forEach(([key, item]) => visit(item, path ? `${path}.${key}` : key, depth + 1));
      }
    }

    visit(payload && payload.data && typeof payload.data === "object" ? payload.data : payload, "", 0);
    return cleanText(lines.join("\n"), 30000);
  }

  root.JobAutofillJobFetch = {
    cleanText,
    decodeHtmlEntities,
    htmlToText,
    extractMokaJobId,
    mokaRequest,
    decryptMokaEnvelope,
    mokaJobText
  };
})(globalThis);
