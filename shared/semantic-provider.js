(function (root) {
  "use strict";

  // This file defines the extension/model boundary only. It intentionally does
  // not contain an HTTP client, model runtime, endpoint, or enabled provider.
  const CONTRACT_VERSION = "1.0";
  const TASK = "match_fields";
  const MAX_FIELDS = 80;
  const MAX_CANDIDATES = 8;
  const MATCH_STATUSES = new Set(["matched", "ambiguous", "no_match"]);
  const RESPONSE_STATUSES = new Set(["ok", "partial", "error"]);
  const DESCRIPTOR_KEYS = [
    "label",
    "placeholder",
    "name",
    "id",
    "ariaLabel",
    "nearbyText",
    "sectionText",
    "tag",
    "role",
    "inputType",
    "required",
    "multiple"
  ];

  let configuration = {
    enabled: false,
    provider: "",
    timeoutMs: 2500,
    minConfidence: 0.78
  };
  const providers = new Map();

  function text(value, maxLength) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function sanitizeDescriptor(descriptor) {
    const source = descriptor && typeof descriptor === "object" ? descriptor : {};
    const result = {};
    DESCRIPTOR_KEYS.forEach((key) => {
      if (!Object.prototype.hasOwnProperty.call(source, key)) return;
      if (key === "required" || key === "multiple") result[key] = Boolean(source[key]);
      else result[key] = text(source[key], key === "nearbyText" ? 500 : 180);
    });
    return result;
  }

  function sanitizeCandidate(candidate) {
    const source = candidate && typeof candidate === "object" ? candidate : {};
    return {
      path: text(source.path, 160),
      ruleScore: Math.max(0, Math.min(100, finiteNumber(source.ruleScore, 0))),
      reason: text(source.reason, 120)
    };
  }

  function createMatchFieldsRequest(input) {
    const source = input && typeof input === "object" ? input : {};
    const fields = Array.isArray(source.fields) ? source.fields.slice(0, MAX_FIELDS) : [];
    return {
      contractVersion: CONTRACT_VERSION,
      task: TASK,
      requestId: text(source.requestId, 120) || `semantic-${Date.now()}`,
      context: {
        platform: text(source.context && source.context.platform, 80),
        locale: text(source.context && source.context.locale, 40)
      },
      fields: fields.map((field, index) => ({
        id: text(field && field.id, 120) || `field-${index}`,
        descriptor: sanitizeDescriptor(field && field.descriptor),
        candidates: (Array.isArray(field && field.candidates) ? field.candidates : [])
          .slice(0, MAX_CANDIDATES)
          .map(sanitizeCandidate)
          .filter((candidate) => candidate.path)
      }))
    };
  }

  function validateMatchFieldsRequest(request) {
    const errors = [];
    if (!request || typeof request !== "object") return ["request must be an object"];
    if (request.contractVersion !== CONTRACT_VERSION) errors.push("unsupported contractVersion");
    if (request.task !== TASK) errors.push("unsupported task");
    if (!request.requestId) errors.push("requestId is required");
    if (!Array.isArray(request.fields) || !request.fields.length) errors.push("fields must not be empty");
    if (Array.isArray(request.fields) && request.fields.length > MAX_FIELDS) errors.push("too many fields");
    const ids = new Set();
    (request.fields || []).forEach((field, index) => {
      if (!field || !field.id) errors.push(`fields[${index}].id is required`);
      if (field && ids.has(field.id)) errors.push(`duplicate field id: ${field.id}`);
      if (field) ids.add(field.id);
      if (!field || !Array.isArray(field.candidates) || !field.candidates.length) {
        errors.push(`fields[${index}].candidates must not be empty`);
      } else if (field.candidates.length > MAX_CANDIDATES) {
        errors.push(`fields[${index}] has too many candidates`);
      }
    });
    return errors;
  }

  function validateMatchFieldsResponse(request, response) {
    const errors = [];
    if (!response || typeof response !== "object") return ["response must be an object"];
    if (response.contractVersion !== CONTRACT_VERSION) errors.push("unsupported response contractVersion");
    if (response.task !== TASK) errors.push("response task mismatch");
    if (response.requestId !== request.requestId) errors.push("response requestId mismatch");
    if (!RESPONSE_STATUSES.has(response.status)) errors.push("invalid response status");
    if (!Array.isArray(response.matches)) errors.push("response.matches must be an array");

    const requestFields = new Map((request.fields || []).map((field) => [field.id, field]));
    const responseIds = new Set();
    (response.matches || []).forEach((match, index) => {
      const field = match && requestFields.get(match.id);
      if (!field) errors.push(`matches[${index}] has an unknown field id`);
      if (match && responseIds.has(match.id)) errors.push(`duplicate match id: ${match.id}`);
      if (match) responseIds.add(match.id);
      if (!match || !MATCH_STATUSES.has(match.status)) errors.push(`matches[${index}] has invalid status`);
      const confidence = finiteNumber(match && match.confidence, -1);
      if (confidence < 0 || confidence > 1) errors.push(`matches[${index}] has invalid confidence`);
      if (match && match.status === "matched") {
        const allowedPaths = new Set((field && field.candidates || []).map((candidate) => candidate.path));
        if (!match.path || !allowedPaths.has(match.path)) {
          errors.push(`matches[${index}] selected a path outside the candidate set`);
        }
      }
    });
    return errors;
  }

  function configure(next) {
    const source = next && typeof next === "object" ? next : {};
    configuration = {
      enabled: Boolean(source.enabled),
      provider: text(source.provider, 80),
      timeoutMs: Math.max(200, Math.min(15000, finiteNumber(source.timeoutMs, configuration.timeoutMs))),
      minConfidence: Math.max(0.5, Math.min(0.99, finiteNumber(source.minConfidence, configuration.minConfidence)))
    };
    return getConfiguration();
  }

  function getConfiguration() {
    return Object.assign({}, configuration);
  }

  function registerProvider(name, provider) {
    const providerName = text(name, 80);
    if (!providerName) throw new Error("semantic provider name is required");
    if (!provider || typeof provider.matchFields !== "function") {
      throw new Error("semantic provider must implement matchFields(request)");
    }
    providers.set(providerName, provider);
  }

  function unavailable(request, code, message) {
    return {
      contractVersion: CONTRACT_VERSION,
      task: TASK,
      requestId: request && request.requestId || "",
      status: "error",
      matches: [],
      error: { code, message }
    };
  }

  async function matchFields(requestInput) {
    const request = createMatchFieldsRequest(requestInput);
    const requestErrors = validateMatchFieldsRequest(request);
    if (requestErrors.length) throw new Error(`invalid semantic request: ${requestErrors.join("; ")}`);
    if (!configuration.enabled) return unavailable(request, "disabled", "semantic matching is disabled");

    const provider = providers.get(configuration.provider);
    if (!provider) return unavailable(request, "provider-unavailable", "semantic provider is unavailable");

    let timeoutId;
    try {
      const timeout = new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve(unavailable(request, "timeout", "semantic provider timed out")), configuration.timeoutMs);
      });
      const response = await Promise.race([Promise.resolve(provider.matchFields(request)), timeout]);
      const responseErrors = validateMatchFieldsResponse(request, response);
      if (responseErrors.length) {
        return unavailable(request, "invalid-response", responseErrors.join("; "));
      }
      return response;
    } catch (error) {
      return unavailable(request, "provider-error", String(error && error.message || error));
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  root.JobAutofillSemantic = {
    CONTRACT_VERSION,
    TASK,
    MAX_FIELDS,
    MAX_CANDIDATES,
    configure,
    getConfiguration,
    registerProvider,
    createMatchFieldsRequest,
    validateMatchFieldsRequest,
    validateMatchFieldsResponse,
    matchFields
  };
})(globalThis);
