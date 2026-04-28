"use strict";
(() => {
  const STORAGE_KEY = "chatMessages";
  const SESSION_ID_KEY = "chatSessionId";
  const WORKFLOWS_KEY = "savedWorkflows";
  const EXEC_RESULTS_KEY = "execResults";
  const AUTH_STATE_KEY = "authState";
  const CUSTOM_APIS_KEY = "customApis";
  const MAX_MESSAGES = 40;
  const GOOGLE_OAUTH_CLIENT_ID = "";
  const GOOGLE_OAUTH_SCOPE = "openid email profile";
  const FIREBASE_WEB_API_KEY = "";
  const AGENT_CHAT_API = "";
  const toastStatusEl = document.getElementById("toastStatus");
  const toggleChatButton = document.getElementById("toggleChat");
  const chatPanelEl = document.getElementById("chatPanel");
  const chatMessagesEl = document.getElementById("chatMessages");
  const chatFormEl = document.getElementById("chatForm");
  const chatInputEl = document.getElementById("chatInput");
  const skillConfirmEl = document.getElementById("skillConfirm");
  const skillUseButton = document.getElementById("skillUse");
  const skillSkipButton = document.getElementById("skillSkip");
  const sendMessageButton = document.getElementById("sendMessage");
  const clearChatButton = document.getElementById("clearChat");
  const authStatusEl = document.getElementById("authStatus");
  const authorizeGoogleButton = document.getElementById("authorizeGoogle");
  const oauthInfoEl = document.getElementById("oauthInfo");
  const toggleWorkflowsButton = document.getElementById("toggleWorkflows");
  const workflowPanelEl = document.getElementById("workflowPanel");
  const toggleCurlParserButton = document.getElementById("toggleCurlParser");
  const curlParserPanelEl = document.getElementById("curlParserPanel");
  const toggleManualApiButton = document.getElementById("toggleManualApi");
  const manualApiPanelEl = document.getElementById("manualApiPanel");
  const apiCandidatesEl = document.getElementById("apiCandidates");
  const manualApiNameEl = document.getElementById("manualApiName");
  const manualApiPathEl = document.getElementById("manualApiPath");
  const manualApiPurposeEl = document.getElementById("manualApiPurpose");
  const manualApiCurlEl = document.getElementById("manualApiCurl");
  const parseCurlButton = document.getElementById("parseCurl");
  const manualApiMethodEl = document.getElementById("manualApiMethod");
  const manualApiHeadersRowsEl = document.getElementById("manualApiHeadersRows");
  const addHeaderRowButton = document.getElementById("addHeaderRow");
  const manualApiBodyEl = document.getElementById("manualApiBody");
  const addManualApiButton = document.getElementById("addManualApi");
  const manualApiActionsEl = document.getElementById("manualApiActions");
  const apiDetailNameEl = document.getElementById("apiDetailName");
  const apiDetailPurposeEl = document.getElementById("apiDetailPurpose");
  const apiDetailParamsEl = document.getElementById("apiDetailParams");
  const addStepButton = document.getElementById("addStep");
  const draftStepsEl = document.getElementById("draftSteps");
  const runWorkflowButton = document.getElementById("runWorkflow");
  const saveWorkflowButton = document.getElementById("saveWorkflow");
  const clearDraftButton = document.getElementById("clearDraft");
  const savedWorkflowsEl = document.getElementById("savedWorkflows");
  const toggleSavedApisButton = document.getElementById("toggleSavedApis");
  const savedApisPanelEl = document.getElementById("savedApisPanel");
  const savedApisListEl = document.getElementById("savedApisList");
  const toggleSavedWorkflowsButton = document.getElementById("toggleSavedWorkflows");
  const savedWorkflowsPanelEl = document.getElementById("savedWorkflowsPanel");
  const executionResultSectionEl = document.getElementById("executionResultSection");
  const toggleExecutionResultButton = document.getElementById("toggleExecutionResult");
  const executionResultPanelEl = document.getElementById("executionResultPanel");
  const executionResultListEl = document.getElementById("executionResultList");
  const clearExecutionResultButton = document.getElementById("clearExecutionResult");
  const MAX_EXEC_RESULTS = 10;
  let execResults = [];
  let messages = [];
  let isAuthorized = false;
  let firebaseIdToken = "";
  let googleAccessToken = "";
  let authExpiresAt = 0;
  let accountEmail = "";
  let chatSessionId = globalThis.crypto?.randomUUID?.() || `session-${Date.now()}`;
  let apiCandidates = [];
  let customApiSpecs = [];
  let savedWorkflows = [];
  let draftSteps = [];
  let selectedApiIndex = -1;
  let chatPanelOpen = true;
  let workflowPanelOpen = true;
  let curlParserOpen = false;
  let manualApiOpen = false;
  let savedWorkflowsOpen = false;
  let savedApisOpen = false;
  let editedDetailSpec = null;
  let editingStepIndex = -1;
  let editingApiIndex = -1;
  let pendingUserMessage = "";
  let currentWorkflowName = "";
  const fallbackStorage = /* @__PURE__ */ new Map();
  const extensionChrome = typeof chrome !== "undefined" ? chrome : void 0;
  function isAuthStateValid(state) {
    return Boolean(
      state.firebaseIdToken &&
      state.googleAccessToken &&
      state.expiresAt &&
      Number.isFinite(state.expiresAt) &&
      Date.now() < state.expiresAt,
    );
  }
  function getCurrentAuthState() {
    if (!firebaseIdToken || !googleAccessToken || !authExpiresAt || Date.now() >= authExpiresAt) return null;
    return {
      firebaseIdToken,
      googleAccessToken,
      expiresAt: authExpiresAt,
      accountEmail,
    };
  }
  function clearAuthStateInMemory() {
    isAuthorized = false;
    firebaseIdToken = "";
    googleAccessToken = "";
    authExpiresAt = 0;
    accountEmail = "";
  }
  function isAuthExpired() {
    if (!isAuthorized || !firebaseIdToken) return true;
    if (authExpiresAt > 0 && Date.now() >= authExpiresAt) return true;
    return false;
  }
  function notifyAuthExpired() {
    clearAuthStateInMemory();
    setChatEnabled(false);
    setAuthStatus(
      "\u6388\u6B0A\u5DF2\u5931\u6548\uFF0C\u8ACB\u91CD\u65B0\u9EDE\u64CA\u300CGoogle \u6388\u6B0A\u300D\u767B\u5165\u3002",
      "error",
    );
    authorizeGoogleButton.classList.add("auth-expired-pulse");
  }
  function setAuthStatus(text, status = "normal") {
    authStatusEl.textContent = text;
    authStatusEl.classList.remove("ok", "error");
    if (status !== "normal") authStatusEl.classList.add(status);
  }
  let toastTimer = null;
  function copyToClipboard(text, btn) {
    const succeed = () => {
      btn.textContent = "\u5DF2\u8907\u88FD \u2713";
      setTimeout(() => {
        btn.textContent = "\u8907\u88FD";
      }, 1500);
    };
    const fail = () =>
      setToast("\u8907\u88FD\u5931\u6557\uFF0C\u8ACB\u624B\u52D5\u9078\u53D6\u6587\u5B57\u3002", "error");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(succeed)
        .catch(() => {
          try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const ok = document.execCommand("copy");
            document.body.removeChild(ta);
            ok ? succeed() : fail();
          } catch {
            fail();
          }
        });
    } else {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        ok ? succeed() : fail();
      } catch {
        fail();
      }
    }
  }
  function setToast(text, status = "normal", autoDismissMs = 4e3) {
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    toastStatusEl.textContent = text;
    toastStatusEl.classList.remove("ok", "error", "hidden");
    if (status !== "normal") toastStatusEl.classList.add(status);
    if (autoDismissMs > 0) {
      toastTimer = setTimeout(() => {
        toastStatusEl.classList.add("hidden");
        toastTimer = null;
      }, autoDismissMs);
    }
  }
  function setOAuthInfo(text) {
    oauthInfoEl.textContent = text;
  }
  function updateWorkflowToggleLabel() {
    toggleWorkflowsButton.textContent = workflowPanelOpen
      ? "\u5E38\u7528\u5DE5\u4F5C\u6D41\u7A0B \u25BE"
      : "\u5E38\u7528\u5DE5\u4F5C\u6D41\u7A0B \u25B8";
  }
  function setCurlParserOpen(open) {
    curlParserOpen = open;
    curlParserPanelEl.classList.toggle("collapsed", !open);
    toggleCurlParserButton.textContent = open ? "\u89E3\u6790 Curl \u25BE" : "\u89E3\u6790 Curl \u25B8";
  }
  function setManualApiOpen(open) {
    manualApiOpen = open;
    manualApiPanelEl.classList.toggle("collapsed", !open);
    toggleManualApiButton.textContent = open ? "\u81EA\u8A02 API \u25BE" : "\u81EA\u8A02 API \u25B8";
  }
  function setSavedWorkflowsOpen(open) {
    savedWorkflowsOpen = open;
    savedWorkflowsPanelEl.classList.toggle("collapsed", !open);
    toggleSavedWorkflowsButton.textContent = open
      ? "\u5DF2\u5132\u5B58\u6D41\u7A0B \u25BE"
      : "\u5DF2\u5132\u5B58\u6D41\u7A0B \u25B8";
  }
  function setSavedApisOpen(open) {
    savedApisOpen = open;
    savedApisPanelEl.classList.toggle("collapsed", !open);
    toggleSavedApisButton.textContent = open
      ? "\u5DF2\u5132\u5B58\u7684 API \u25BE"
      : "\u5DF2\u5132\u5B58\u7684 API \u25B8";
  }
  function setChatPanelOpen(open) {
    chatPanelOpen = open;
    chatPanelEl.classList.toggle("collapsed", !open);
    toggleChatButton.textContent = open ? "AI \u5C0F\u5E6B\u624B \u25BE" : "AI \u5C0F\u5E6B\u624B \u25B8";
  }
  function setWorkflowPanelOpen(open) {
    workflowPanelOpen = open;
    workflowPanelEl.classList.toggle("collapsed", !open);
    updateWorkflowToggleLabel();
  }
  function setChatEnabled(enabled) {
    chatInputEl.disabled = !enabled;
    sendMessageButton.disabled = !enabled;
    skillUseButton.disabled = !enabled;
    skillSkipButton.disabled = !enabled;
    chatInputEl.placeholder = enabled
      ? "\u4F8B\u5982\uFF1A\u696D\u52D9\u96E2\u8077\u4E86\uFF0C\u6211\u8981\u79FB\u9664\u4ED6\u7684 sales \u8207 lineUser \u8EAB\u4EFD"
      : "\u8ACB\u5148\u5B8C\u6210 Google \u6388\u6B0A\u5F8C\uFF0C\u624D\u53EF\u4F7F\u7528\u5C0D\u8A71\u7A97";
  }
  function toggleSkillConfirm(show) {
    skillConfirmEl.classList.toggle("hidden", !show);
  }
  function shouldPromptSkillConfirm(message) {
    if (getAllApiCandidates().length > 0) return true;
    return /(api|權限|流程|查詢|刪除|新增|更新)/i.test(message);
  }
  function buildMessageWithSkillDirective(rawMessage, useSkill) {
    if (!useSkill) return rawMessage;
    return `${rawMessage}

[\u7CFB\u7D71\u6307\u4EE4]
\u82E5\u4F60\u5224\u65B7\u6709\u53EF\u7528 skill \u6216\u5DE5\u5177\uFF0C\u8ACB\u512A\u5148\u4F7F\u7528 skill \u4F86\u56DE\u7B54\uFF0C\u4E26\u5728\u56DE\u8986\u958B\u982D\u7C21\u77ED\u8AAA\u660E\u300C\u5DF2\u4F7F\u7528\u7684 skill \u8207\u539F\u56E0\u300D\u3002
\u82E5\u7121\u5408\u9069 skill\uFF0C\u8ACB\u660E\u78BA\u8AAA\u660E\u300C\u672C\u6B21\u4E0D\u4F7F\u7528 skill\u300D\u4E26\u76F4\u63A5\u7D66\u4E00\u822C\u56DE\u7B54\u3002`;
  }
  function normalizeParams(value) {
    if (Array.isArray(value)) {
      return value.map((v) => String(v).trim()).filter(Boolean);
    }
    if (typeof value === "string") {
      return value
        .split(/[,\n]/)
        .map((v) => v.trim())
        .filter(Boolean);
    }
    return [];
  }
  const HEADER_KEY_CUSTOM = "__custom__";
  const HEADER_KEY_PRESETS = [
    "Authorization",
    "Content-Type",
    "Accept",
    "Accept-Language",
    "x-api-key",
    "X-API-Key",
    "User-Agent",
    "X-Request-Id",
    "Cookie",
  ];
  function buildHeaderKeySelect(selectedKey) {
    const select = document.createElement("select");
    select.className = "header-key-select";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "\u9078\u64C7 Key";
    select.appendChild(empty);
    HEADER_KEY_PRESETS.forEach((preset) => {
      const opt = document.createElement("option");
      opt.value = preset;
      opt.textContent = preset;
      select.appendChild(opt);
    });
    const customOpt = document.createElement("option");
    customOpt.value = HEADER_KEY_CUSTOM;
    customOpt.textContent = "\u81EA\u8A02\u2026";
    select.appendChild(customOpt);
    if (selectedKey && HEADER_KEY_PRESETS.includes(selectedKey)) {
      select.value = selectedKey;
    } else if (selectedKey) {
      select.value = HEADER_KEY_CUSTOM;
    }
    return select;
  }
  function syncHeaderRowCustomVisibility(row) {
    const select = row.querySelector(".header-key-select");
    const custom = row.querySelector(".header-key-custom");
    if (!select || !custom) return;
    const isCustom = select.value === HEADER_KEY_CUSTOM;
    custom.classList.toggle("visible", isCustom);
    if (!isCustom) custom.value = "";
  }
  function appendManualHeaderRow(key = "", value = "") {
    const row = document.createElement("div");
    row.className = "header-row";
    const wrap = document.createElement("div");
    wrap.className = "header-key-wrap";
    const select = buildHeaderKeySelect(key);
    const customKey = document.createElement("input");
    customKey.type = "text";
    customKey.className = "header-key-custom";
    customKey.placeholder = "\u81EA\u8A02 Key";
    if (key && !HEADER_KEY_PRESETS.includes(key)) {
      customKey.value = key;
      customKey.classList.add("visible");
    }
    const valInput = document.createElement("input");
    valInput.type = "text";
    valInput.className = "header-value";
    valInput.placeholder = "Value";
    valInput.value = value;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "header-remove";
    removeBtn.textContent = "\u79FB\u9664";
    removeBtn.addEventListener("click", () => {
      row.remove();
      if (!manualApiHeadersRowsEl.querySelector(".header-row")) appendManualHeaderRow();
    });
    select.addEventListener("change", () => {
      syncHeaderRowCustomVisibility(row);
    });
    wrap.appendChild(select);
    wrap.appendChild(customKey);
    row.appendChild(wrap);
    row.appendChild(valInput);
    row.appendChild(removeBtn);
    manualApiHeadersRowsEl.appendChild(row);
    syncHeaderRowCustomVisibility(row);
  }
  function renderManualHeaderRowsFromObject(headers) {
    manualApiHeadersRowsEl.replaceChildren();
    const entries = Object.entries(headers).filter(([k]) => k.trim());
    if (!entries.length) {
      appendManualHeaderRow();
      return;
    }
    entries.forEach(([k, v]) => appendManualHeaderRow(k, v));
  }
  function collectManualHeaders() {
    const out = {};
    manualApiHeadersRowsEl.querySelectorAll(".header-row").forEach((node) => {
      const row = node;
      const select = row.querySelector(".header-key-select");
      const custom = row.querySelector(".header-key-custom");
      const valInput = row.querySelector(".header-value");
      if (!select || !valInput) return;
      let key = "";
      if (select.value === HEADER_KEY_CUSTOM) key = custom.value.trim();
      else key = select.value.trim();
      const val = valInput.value.trim();
      if (key && val) out[key] = val;
    });
    return out;
  }
  function extractCurlUrl(text) {
    const normalized = text
      .replace(/\\\r?\n/g, " ")
      .replace(/\r/g, " ")
      .trim();
    let m = normalized.match(/\-\-(?:location|url)\s+['"](https?:\/\/[^'"]+)['"]/i);
    if (m?.[1]) return m[1].trim();
    m = normalized.match(/(?:^|\s)\-L\s+['"](https?:\/\/[^'"]+)['"]/i);
    if (m?.[1]) return m[1].trim();
    const quoted = [...normalized.matchAll(/['"](https?:\/\/[^'"]+)['"]/g)];
    if (quoted.length > 0) return quoted[0][1].trim();
    m = normalized.match(/curl(?:\s+[^\s]+)*\s+(https?:\/\/[^\s'"]+)/i);
    if (m?.[1]) return m[1].trim();
    return "";
  }
  function parseCurlHeadersBlock(text) {
    const normalized = text.replace(/\\\r?\n/g, " ").replace(/\r/g, " ");
    const headers = {};
    const singleQuoted = /(?:-H|--header)\s+'([^']*)'/gi;
    let match;
    while ((match = singleQuoted.exec(normalized)) !== null) {
      const line = match[1];
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    const doubleQuoted = /(?:-H|--header)\s+"([^"]*)"/gi;
    while ((match = doubleQuoted.exec(normalized)) !== null) {
      const line = match[1];
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    return headers;
  }
  function inferParamsFromPathAndBody(path, body) {
    const fromPathTemplate = Array.from(path.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)).map((m) => m[1]);
    const fromColonPath = Array.from(path.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)/g)).map((m) => m[1]);
    let fromQuery = [];
    try {
      const qIdx = path.indexOf("?");
      if (qIdx >= 0) {
        fromQuery = Array.from(new URLSearchParams(path.slice(qIdx + 1)).keys());
      }
    } catch {
      fromQuery = [];
    }
    let fromBody = [];
    if (body.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(body);
        fromBody = Object.keys(parsed);
      } catch {
        fromBody = [];
      }
    }
    return Array.from(/* @__PURE__ */ new Set([...fromPathTemplate, ...fromColonPath, ...fromQuery, ...fromBody]));
  }
  function extractCurlBody(normalized) {
    const flags = ["--data-raw", "--data", "-d"];
    for (const flag of flags) {
      const escaped = flag.replace(/-/g, "\\-");
      const singleQ = new RegExp(`${escaped}\\s+'([^']*)'`);
      const doubleQ = new RegExp(`${escaped}\\s+"((?:[^"\\\\]|\\\\.)*)"`);
      let m = normalized.match(singleQ);
      if (m) return m[1];
      m = normalized.match(doubleQ);
      if (m) return m[1].replace(/\\"/g, '"');
    }
    return "";
  }
  function parseCurlCommand(curlText) {
    const text = curlText.trim();
    if (!/^curl\b/i.test(text)) return null;
    const normalized = text.replace(/\\\r?\n/g, " ").replace(/\r/g, " ");
    const methodMatch = normalized.match(/(?:\s|^)-X\s+([A-Z]+)/i);
    const method = (methodMatch?.[1] || "").toUpperCase();
    const rawUrl = extractCurlUrl(text);
    if (!rawUrl) return null;
    const headers = parseCurlHeadersBlock(text);
    const body = extractCurlBody(normalized);
    const bearerRaw = headers.Authorization || headers.authorization || "";
    const bearerToken = /^Bearer\s+/i.test(bearerRaw) ? bearerRaw.replace(/^Bearer\s+/i, "").trim() : "";
    const inferredMethod = method || (body ? "POST" : "GET");
    return {
      method: inferredMethod,
      url: rawUrl,
      headers,
      body,
      bearerToken,
    };
  }
  function getAllApiCandidates() {
    return [...apiCandidates];
  }
  function extractApiCandidatesFromText(text) {
    const specs = /* @__PURE__ */ new Map();
    const upsert = (next) => {
      const key = next.path || next.api;
      const current = specs.get(key);
      if (!current) {
        specs.set(key, {
          ...next,
          params: [...new Set(next.params.map((p) => p.trim()).filter(Boolean))],
        });
        return;
      }
      const mergedParams = Array.from(
        new Set([...current.params, ...next.params].map((p) => p.trim()).filter(Boolean)),
      );
      specs.set(key, {
        ...current,
        ...next,
        api: current.api || next.api,
        path: current.path || next.path,
        requestName: current.requestName || next.requestName,
        purpose: current.purpose !== "\u5F85\u88DC\u5145\u76EE\u7684" ? current.purpose : next.purpose,
        params: mergedParams,
      });
    };
    const jsonBlocks = Array.from(text.matchAll(/```json([\s\S]*?)```/g));
    for (const block of jsonBlocks) {
      const raw = block[1]?.trim();
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed)
          ? parsed
          : parsed && typeof parsed === "object" && Array.isArray(parsed.apis)
            ? parsed.apis
            : [];
        for (const item of list) {
          if (!item || typeof item !== "object") continue;
          const obj = item;
          const api = String(obj.api || obj.name || obj.id || obj.path || "").trim();
          if (!api) continue;
          const purpose = String(obj.purpose || obj.description || "\u5F85\u88DC\u5145\u76EE\u7684").trim();
          const params = normalizeParams(obj.params || obj.requiredParams || obj.arguments);
          const path = String(obj.path || obj.endpoint || "").trim() || void 0;
          const requestName = String(obj.requestName || obj.request || "").trim() || void 0;
          upsert({ api: path || api, path, requestName, purpose, params });
        }
      } catch {}
    }
    const requestMatches = Array.from(text.matchAll(/([A-Za-z][A-Za-z0-9]+Request)\s*\{([\s\S]{0,220}?)\}/g));
    for (const match of requestMatches) {
      const requestName = match[1];
      const fieldBlock = match[2] || "";
      const typedFields = Array.from(fieldBlock.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*:/g)).map((m) => m[1]);
      const nearbyText = text.slice(Math.max(0, (match.index || 0) - 300), (match.index || 0) + 300);
      const pathCandidates = Array.from(nearbyText.matchAll(/`([A-Za-z][\w-]*(?:\/[A-Za-z][\w-]*)+)`/g));
      const path = pathCandidates.length ? pathCandidates[pathCandidates.length - 1][1] : "";
      const bulletFields = Array.from(
        text.slice(match.index || 0, (match.index || 0) + 400).matchAll(/^\s*[-*]\s*`?([A-Za-z_][A-Za-z0-9_]*)`?/gm),
      ).map((m) => m[1]);
      const purpose = path
        ? `\u5C0D\u61C9\u8ACB\u6C42\uFF1A${requestName}`
        : `\u8ACB\u6C42\u6A21\u578B\uFF1A${requestName}`;
      upsert({
        api: path || requestName,
        path: path || void 0,
        requestName,
        purpose,
        params: [...typedFields, ...bulletFields],
      });
    }
    if (!specs.size) {
      const tokenRegex = /\b([a-zA-Z][\w-]*(?:[./][a-zA-Z][\w-]*)+)\b/g;
      let match;
      while ((match = tokenRegex.exec(text)) !== null) {
        const api = match[1];
        if (api.length < 4) continue;
        upsert({ api, path: api.includes("/") ? api : void 0, purpose: "\u5F85\u88DC\u5145\u76EE\u7684", params: [] });
        if (specs.size >= 20) break;
      }
    }
    return Array.from(specs.values()).slice(0, 20);
  }
  function buildDetailSection(label, defaultOpen) {
    const wrap = document.createElement("div");
    wrap.className = "detail-section";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "detail-section-toggle";
    toggle.textContent = `${defaultOpen ? "\u25BE" : "\u25B8"} ${label}`;
    const body = document.createElement("div");
    body.className = "detail-section-body" + (defaultOpen ? "" : " collapsed");
    toggle.addEventListener("click", () => {
      const isCollapsed = body.classList.toggle("collapsed");
      toggle.textContent = `${isCollapsed ? "\u25B8" : "\u25BE"} ${label}`;
    });
    wrap.appendChild(toggle);
    wrap.appendChild(body);
    return { wrap, body };
  }
  function renderApiDetail(spec) {
    if (!spec) {
      apiDetailNameEl.textContent = "\u5C1A\u672A\u9078\u64C7 API";
      apiDetailPurposeEl.textContent = "\u7528\u9014\uFF1A-";
      apiDetailParamsEl.replaceChildren();
      editedDetailSpec = null;
      return;
    }
    editedDetailSpec = { ...spec, params: [...(spec.params ?? [])], headers: { ...(spec.headers ?? {}) } };
    apiDetailNameEl.textContent = spec.requestName ?? spec.api;
    const purposeText = (spec.purpose ?? "").trim();
    apiDetailPurposeEl.textContent = purposeText ? `\u7528\u9014\uFF1A${purposeText}` : "";
    apiDetailPurposeEl.style.display = purposeText ? "" : "none";
    const container = document.createDocumentFragment();
    const urlCode = document.createElement("code");
    urlCode.className = "detail-url-code";
    urlCode.textContent = `${spec.method ?? "GET"} ${spec.path ?? spec.api ?? "-"}`;
    container.appendChild(urlCode);
    const urlParamObj = {};
    try {
      const qIdx = (spec.path ?? spec.api ?? "").indexOf("?");
      if (qIdx >= 0)
        new URLSearchParams((spec.path ?? spec.api ?? "").slice(qIdx + 1)).forEach((v, k) => {
          urlParamObj[k] = v;
        });
    } catch {}
    const allParamKeys = [.../* @__PURE__ */ new Set([...(spec.params ?? []), ...Object.keys(urlParamObj)])];
    if (allParamKeys.length) {
      const sec = buildDetailSection("Params\uFF08URL \u67E5\u8A62\u53C3\u6578\uFF09", true);
      const list = document.createElement("div");
      list.className = "detail-edit-list";
      allParamKeys.forEach((key) => {
        const row = document.createElement("div");
        row.className = "detail-edit-row";
        const label = document.createElement("span");
        label.className = "detail-edit-key";
        label.textContent = key;
        const inp = document.createElement("input");
        inp.type = "text";
        inp.className = "detail-edit-input";
        inp.value = urlParamObj[key] ?? "";
        inp.placeholder = "\uFF08\u503C\uFF09";
        inp.addEventListener("input", () => {
          if (!editedDetailSpec) return;
          try {
            const base = (editedDetailSpec.path ?? editedDetailSpec.api ?? "").split("?")[0];
            const collected = {};
            list.querySelectorAll(".detail-edit-row").forEach((r) => {
              const k = r.querySelector(".detail-edit-key").textContent ?? "";
              const v = r.querySelector(".detail-edit-input").value;
              if (v) collected[k] = v;
            });
            const qs = new URLSearchParams(collected).toString();
            const newPath = qs ? `${base}?${qs}` : base;
            editedDetailSpec.path = newPath;
            urlCode.textContent = `${editedDetailSpec.method ?? "GET"} ${newPath}`;
          } catch {}
        });
        row.appendChild(label);
        row.appendChild(inp);
        list.appendChild(row);
      });
      sec.body.appendChild(list);
      container.appendChild(sec.wrap);
    }
    const visibleHeaders = Object.entries(spec.headers ?? {}).filter(([k]) => k.toLowerCase() !== "authorization");
    const headerSec = buildDetailSection(
      `Headers\uFF08${visibleHeaders.length} \u500B\uFF09`,
      visibleHeaders.length > 0,
    );
    const headerList = document.createElement("div");
    headerList.className = "detail-edit-list";
    const rebuildEditedHeaders = () => {
      if (!editedDetailSpec) return;
      const obj = {};
      headerList.querySelectorAll(".detail-edit-row").forEach((r) => {
        const k = r.querySelector(".detail-edit-key-input").value.trim();
        const v = r.querySelector(".detail-edit-val-input").value;
        if (k) obj[k] = v;
      });
      editedDetailSpec.headers = obj;
    };
    const addEditableHeaderRow = (k, v) => {
      const row = document.createElement("div");
      row.className = "detail-edit-row";
      const keyInp = document.createElement("input");
      keyInp.type = "text";
      keyInp.className = "detail-edit-key-input detail-edit-input";
      keyInp.value = k;
      keyInp.placeholder = "Header key";
      const valInp = document.createElement("input");
      valInp.type = "text";
      valInp.className = "detail-edit-val-input detail-edit-input";
      valInp.value = v;
      valInp.placeholder = "value";
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "header-remove";
      removeBtn.textContent = "\u2715";
      removeBtn.addEventListener("click", () => {
        row.remove();
        rebuildEditedHeaders();
      });
      keyInp.addEventListener("input", rebuildEditedHeaders);
      valInp.addEventListener("input", rebuildEditedHeaders);
      row.appendChild(keyInp);
      row.appendChild(valInp);
      row.appendChild(removeBtn);
      headerList.appendChild(row);
    };
    visibleHeaders.forEach(([k, v]) => addEditableHeaderRow(k, v));
    const addHdrBtn = document.createElement("button");
    addHdrBtn.type = "button";
    addHdrBtn.className = "detail-add-row-btn";
    addHdrBtn.textContent = "\uFF0B \u65B0\u589E Header";
    addHdrBtn.addEventListener("click", () => addEditableHeaderRow("", ""));
    headerSec.body.appendChild(headerList);
    headerSec.body.appendChild(addHdrBtn);
    container.appendChild(headerSec.wrap);
    const bodySec = buildDetailSection("Body\uFF08JSON\uFF09", !!spec.bodyTemplate);
    const bodyTa = document.createElement("textarea");
    bodyTa.className = "detail-edit-body";
    bodyTa.placeholder = "\uFF08\u53EF\u8CBC\u4E0A JSON\uFF09";
    bodyTa.value = spec.bodyTemplate ?? "";
    bodyTa.addEventListener("input", () => {
      if (editedDetailSpec) editedDetailSpec.bodyTemplate = bodyTa.value;
    });
    bodySec.body.appendChild(bodyTa);
    container.appendChild(bodySec.wrap);
    apiDetailParamsEl.replaceChildren(container);
  }
  function refreshApiCandidatesFromLatestAssistant() {
    const latestAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content.trim());
    apiCandidates = latestAssistant ? extractApiCandidatesFromText(latestAssistant.content) : [];
    selectedApiIndex = apiCandidates.length ? 0 : -1;
    renderApiCandidates();
  }
  function isCustomSpec(spec) {
    const key = spec.path || spec.api;
    return customApiSpecs.some((c) => (c.path || c.api) === key);
  }
  function removeCustomSpec(spec) {
    const key = spec.path || spec.api;
    customApiSpecs = customApiSpecs.filter((c) => (c.path || c.api) !== key);
  }
  function renderApiCandidates() {
    const allCandidates = getAllApiCandidates();
    apiCandidatesEl.replaceChildren();
    if (!allCandidates.length) {
      const empty = document.createElement("div");
      empty.className = "workflow-subtitle";
      empty.textContent = "\u5C1A\u672A\u5075\u6E2C\u5230 API\uFF0C\u53EF\u624B\u52D5\u65B0\u589E\u3002";
      apiCandidatesEl.appendChild(empty);
      renderApiDetail(null);
      return;
    }
    if (selectedApiIndex < 0 || selectedApiIndex >= allCandidates.length) {
      selectedApiIndex = 0;
    }
    allCandidates.forEach((spec, index) => {
      const wrap = document.createElement("div");
      wrap.className = "api-candidate-wrap";
      const row = document.createElement("button");
      row.type = "button";
      row.className = "api-candidate";
      row.classList.toggle("active", index === selectedApiIndex);
      const name = document.createElement("div");
      name.className = "api-candidate-name";
      name.textContent = spec.requestName || spec.api;
      row.appendChild(name);
      const purpose = (spec.purpose || "").trim();
      if (purpose) {
        const text = document.createElement("span");
        text.className = "api-candidate-purpose";
        text.textContent = purpose;
        row.appendChild(text);
      }
      row.addEventListener("click", () => {
        selectedApiIndex = index;
        renderApiCandidates();
      });
      wrap.appendChild(row);
      if (isCustomSpec(spec)) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "api-candidate-remove";
        removeBtn.title = "\u79FB\u9664\u6B64 API";
        removeBtn.textContent = "\u2715";
        removeBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          removeCustomSpec(spec);
          if (selectedApiIndex >= allCandidates.length - 1) selectedApiIndex = Math.max(0, selectedApiIndex - 1);
          renderApiCandidates();
          await saveMessages();
        });
        wrap.appendChild(removeBtn);
      }
      apiCandidatesEl.appendChild(wrap);
    });
    renderApiDetail(allCandidates[selectedApiIndex] || null);
  }
  function renderDraftSteps() {
    draftStepsEl.replaceChildren();
    if (!draftSteps.length) {
      const empty = document.createElement("li");
      empty.className = "workflow-subtitle";
      empty.textContent = "\u5C1A\u672A\u52A0\u5165\u6B65\u9A5F\u3002";
      draftStepsEl.appendChild(empty);
      return;
    }
    draftSteps.forEach((step, index) => {
      const item = document.createElement("li");
      item.className = "draft-step-item" + (index === editingStepIndex ? " editing" : "");
      const info = document.createElement("div");
      info.className = "draft-step-info";
      const num = document.createElement("span");
      num.className = "draft-step-num";
      num.textContent = `${index + 1}.`;
      const title = document.createElement("span");
      title.className = "draft-step-title";
      title.textContent = step.requestName || step.api;
      info.appendChild(num);
      info.appendChild(title);
      const purpose = (step.purpose || "").trim();
      if (purpose) {
        const purposeEl = document.createElement("span");
        purposeEl.className = "draft-step-purpose";
        purposeEl.textContent = purpose;
        info.appendChild(purposeEl);
      }
      const actions = document.createElement("div");
      actions.className = "draft-step-actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "draft-step-edit";
      editBtn.textContent = index === editingStepIndex ? "\u7DE8\u8F2F\u4E2D" : "\u7DE8\u8F2F";
      editBtn.disabled = index === editingStepIndex;
      editBtn.addEventListener("click", () => {
        editingStepIndex = index;
        addStepButton.textContent = "\u66F4\u65B0\u6B65\u9A5F";
        addStepButton.classList.add("updating");
        renderApiDetail({ ...step });
        renderDraftSteps();
      });
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "draft-step-delete";
      delBtn.textContent = "\u2715";
      delBtn.title =
        index === editingStepIndex
          ? "\u7DE8\u8F2F\u4E2D\uFF0C\u7121\u6CD5\u522A\u9664"
          : "\u79FB\u9664\u6B64\u6B65\u9A5F";
      delBtn.disabled = index === editingStepIndex;
      delBtn.addEventListener("click", () => {
        draftSteps.splice(index, 1);
        if (editingStepIndex === index) {
          editingStepIndex = -1;
          addStepButton.textContent = "\u52A0\u5165\u6D41\u7A0B\u6B65\u9A5F";
          addStepButton.classList.remove("updating");
          renderApiDetail(getAllApiCandidates()[selectedApiIndex] ?? null);
        } else if (editingStepIndex > index) {
          editingStepIndex--;
        }
        renderDraftSteps();
      });
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      item.appendChild(info);
      item.appendChild(actions);
      draftStepsEl.appendChild(item);
    });
  }
  function renderSavedWorkflows() {
    savedWorkflowsEl.replaceChildren();
    if (!savedWorkflows.length) {
      const empty = document.createElement("div");
      empty.className = "workflow-subtitle";
      empty.textContent = "\u5C1A\u672A\u5EFA\u7ACB\u6D41\u7A0B\u3002";
      savedWorkflowsEl.appendChild(empty);
      return;
    }
    savedWorkflows.forEach((workflow) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "workflow-chip";
      chip.textContent = workflow.name;
      chip.title = workflow.steps.map((step) => step.api).join(", ");
      chip.addEventListener("click", () => {
        draftSteps = workflow.steps.map((step) => ({
          ...step,
          params: [...step.params],
          headers: step.headers ? { ...step.headers } : {},
        }));
        currentWorkflowName = workflow.name;
        renderDraftSteps();
        setWorkflowPanelOpen(true);
        setToast(`\u5DF2\u8F09\u5165\u6D41\u7A0B\uFF1A${workflow.name}`, "ok");
        chatInputEl.focus();
      });
      savedWorkflowsEl.appendChild(chip);
    });
  }
  function renderSavedApis() {
    savedApisListEl.replaceChildren();
    if (!customApiSpecs.length) {
      const empty = document.createElement("div");
      empty.className = "detail-empty";
      empty.textContent = "\u5C1A\u672A\u5132\u5B58\u4EFB\u4F55 API";
      savedApisListEl.appendChild(empty);
      return;
    }
    customApiSpecs.forEach((spec, index) => {
      const card = document.createElement("div");
      card.className = "saved-api-card";
      if (index === editingApiIndex) card.classList.add("editing");
      else if (index === selectedApiIndex) card.classList.add("selected");
      const info = document.createElement("div");
      info.className = "saved-api-info";
      const nameEl = document.createElement("div");
      nameEl.className = "saved-api-name";
      nameEl.textContent = spec.requestName ?? spec.api;
      info.appendChild(nameEl);
      const purpose = (spec.purpose ?? "").trim();
      if (purpose) {
        const purposeEl = document.createElement("div");
        purposeEl.className = "saved-api-purpose";
        purposeEl.textContent = purpose;
        info.appendChild(purposeEl);
      }
      const actions = document.createElement("div");
      actions.className = "saved-api-actions";
      const selectBtn = document.createElement("button");
      selectBtn.type = "button";
      selectBtn.textContent = "\u9078\u64C7";
      if (index === selectedApiIndex) selectBtn.classList.add("active");
      selectBtn.addEventListener("click", () => {
        selectedApiIndex = index;
        renderSavedApis();
        renderApiDetail({ ...spec });
      });
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "\u7DE8\u8F2F";
      if (index === editingApiIndex) editBtn.classList.add("active");
      editBtn.addEventListener("click", () => {
        editingApiIndex = index;
        selectedApiIndex = -1;
        renderSavedApis();
        addManualApiButton.textContent = "\u5132\u5B58";
        manualApiActionsEl.classList.add("hidden");
        manualApiActionsEl.replaceChildren();
        setManualApiOpen(true);
        manualApiNameEl.value = spec.requestName ?? "";
        manualApiMethodEl.value = spec.method ?? "GET";
        manualApiPathEl.value = spec.path ?? spec.api ?? "";
        renderManualHeaderRowsFromObject(spec.headers ?? {});
        manualApiBodyEl.value = spec.bodyTemplate ?? "";
        manualApiPurposeEl.value = spec.purpose ?? "";
        updateManualFormActions();
        setToast(`\u6B63\u5728\u7DE8\u8F2F\uFF1A${spec.requestName ?? spec.api}`, "normal");
      });
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "saved-api-delete";
      deleteBtn.textContent = "\u2715";
      deleteBtn.title = "\u522A\u9664\u6B64 API";
      deleteBtn.addEventListener("click", async () => {
        customApiSpecs.splice(index, 1);
        if (editingApiIndex === index) editingApiIndex = -1;
        if (selectedApiIndex === index) selectedApiIndex = -1;
        renderSavedApis();
        renderApiCandidates();
        await saveMessages();
      });
      actions.appendChild(selectBtn);
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      card.appendChild(info);
      card.appendChild(actions);
      savedApisListEl.appendChild(card);
    });
  }
  function maskToken(token) {
    if (token.length <= 14) return token;
    return `${token.slice(0, 10)}...${token.slice(-4)}`;
  }
  function createOAuthState() {
    if (globalThis.crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  async function fetchGoogleUserInfo(accessToken) {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      throw new Error(`userinfo \u53D6\u5F97\u5931\u6557 (${response.status})`);
    }
    return await response.json();
  }
  async function exchangeGoogleTokenForFirebaseIdToken(googleAccessToken2) {
    const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(
      FIREBASE_WEB_API_KEY,
    )}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postBody: `access_token=${encodeURIComponent(googleAccessToken2)}&providerId=google.com`,
        requestUri: "https://localhost",
        returnIdpCredential: true,
        returnSecureToken: true,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Firebase token \u4EA4\u63DB\u5931\u6557 (${response.status}) ${text}`);
    }
    const data = await response.json();
    if (!data.idToken) throw new Error("Firebase \u56DE\u61C9\u7F3A\u5C11 idToken");
    return data.idToken;
  }
  async function callAgentChatApi(message) {
    if (!firebaseIdToken) {
      throw new Error("\u5C1A\u672A\u53D6\u5F97 Firebase idToken\uFF0C\u8ACB\u5148\u5B8C\u6210 Google \u6388\u6B0A");
    }
    const response = await fetch(AGENT_CHAT_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firebaseIdToken}`,
        "x-page-url": globalThis.location?.href || "",
      },
      body: JSON.stringify({
        message,
        sessionId: chatSessionId,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401 || response.status === 403) {
        notifyAuthExpired();
        await saveMessages();
      }
      throw new Error(`Agent API \u5931\u6557 (${response.status}) ${text}`);
    }
    const data = await response.json();
    return data.reply || data.message || data.data?.reply || data.data?.message || JSON.stringify(data);
  }
  function extractTextFromPayload(payload) {
    if (!payload) return "";
    if (typeof payload === "string") return payload;
    if (typeof payload !== "object") return "";
    const data = payload;
    if (typeof data.reply === "string") return data.reply;
    if (typeof data.message === "string") return data.message;
    if (typeof data.content === "string") return data.content;
    if (data.data && typeof data.data === "object") {
      const nested = data.data;
      if (typeof nested.reply === "string") return nested.reply;
      if (typeof nested.message === "string") return nested.message;
      if (typeof nested.content === "string") return nested.content;
    }
    if (Array.isArray(data.choices)) {
      const first = data.choices[0];
      const delta = first?.delta;
      if (typeof delta?.content === "string") return delta.content;
      if (typeof first?.text === "string") return first.text;
    }
    return "";
  }
  function stripThinkingText(text) {
    if (!text) return "";
    return text
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, "")
      .replace(/^\s*(思考|thinking)\s*[:：].*$/gim, "");
  }
  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function renderAssistantMarkdown(text) {
    const escaped = escapeHtml(text);
    const blocks = escaped.split(/\n{2,}/);
    return blocks
      .map((block) => {
        const trimmed = block.trim();
        if (!trimmed) return "";
        if (trimmed.startsWith("### ")) {
          return `<h4>${trimmed.slice(4)}</h4>`;
        }
        if (trimmed.startsWith("## ")) {
          return `<h3>${trimmed.slice(3)}</h3>`;
        }
        if (trimmed.startsWith("# ")) {
          return `<h2>${trimmed.slice(2)}</h2>`;
        }
        const lines = trimmed.split("\n");
        if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
          const items = lines
            .map((line) => line.replace(/^\s*[-*]\s+/, ""))
            .map((line) => `<li>${line}</li>`)
            .join("");
          return `<ul>${items}</ul>`;
        }
        const paragraph = trimmed
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/`([^`]+?)`/g, "<code>$1</code>")
          .replace(/\n/g, "<br>");
        return `<p>${paragraph}</p>`;
      })
      .filter(Boolean)
      .join("");
  }
  async function callAgentChatApiStream(message, onDelta) {
    if (!firebaseIdToken) {
      throw new Error("\u5C1A\u672A\u53D6\u5F97 Firebase idToken\uFF0C\u8ACB\u5148\u5B8C\u6210 Google \u6388\u6B0A");
    }
    const response = await fetch(AGENT_CHAT_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firebaseIdToken}`,
        "x-page-url": globalThis.location?.href || "",
        Accept: "text/event-stream, application/json, text/plain",
      },
      body: JSON.stringify({
        message,
        sessionId: chatSessionId,
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401 || response.status === 403) {
        notifyAuthExpired();
        await saveMessages();
      }
      throw new Error(`Agent API \u5931\u6557 (${response.status}) ${text}`);
    }
    if (!response.body) {
      return callAgentChatApi(message);
    }
    const contentType = response.headers.get("content-type") || "";
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      if (contentType.includes("text/event-stream")) {
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const event of events) {
          const lines = event
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trim());
          const payloadText = lines.join("\n");
          if (!payloadText || payloadText === "[DONE]") continue;
          let deltaText = "";
          try {
            deltaText = extractTextFromPayload(JSON.parse(payloadText));
          } catch {
            deltaText = payloadText;
          }
          deltaText = stripThinkingText(deltaText);
          if (!deltaText) continue;
          accumulated += deltaText;
          onDelta(deltaText);
        }
      } else {
        if (!buffer) continue;
        accumulated += buffer;
        onDelta(buffer);
        buffer = "";
      }
    }
    if (contentType.includes("text/event-stream")) {
      const rest = buffer.trim();
      if (rest && rest !== "[DONE]") {
        const cleaned = rest.startsWith("data:") ? rest.replace(/^data:\s*/gm, "").trim() : rest;
        let deltaText = "";
        try {
          deltaText = extractTextFromPayload(JSON.parse(cleaned));
        } catch {
          deltaText = cleaned;
        }
        deltaText = stripThinkingText(deltaText);
        if (deltaText) {
          accumulated += deltaText;
          onDelta(deltaText);
        }
      }
    }
    if (!accumulated.trim()) {
      let parsed = {};
      if (buffer.trim()) {
        try {
          parsed = JSON.parse(buffer);
        } catch {
          parsed = buffer;
        }
      }
      const fallbackText = stripThinkingText(extractTextFromPayload(parsed));
      return fallbackText || accumulated;
    }
    return stripThinkingText(accumulated);
  }
  function renderMessages() {
    chatMessagesEl.replaceChildren();
    if (!messages.length) {
      const empty = document.createElement("div");
      empty.className = "empty-tip";
      empty.textContent =
        "\u5148\u8F38\u5165\u9700\u6C42\uFF0C\u4F8B\u5982\uFF1A\u696D\u52D9\u96E2\u8077\u5F8C\u8981\u505C\u7528 sales \u8207 lineUser \u8EAB\u4EFD\u3002";
      chatMessagesEl.appendChild(empty);
      return;
    }
    messages.forEach((message) => {
      const row = document.createElement("div");
      row.className = `message-row ${message.role}`;
      const bubble = document.createElement("div");
      bubble.className = "message-bubble";
      if (message.role === "assistant") {
        bubble.classList.add("markdown");
        bubble.innerHTML = renderAssistantMarkdown(message.content);
      } else {
        bubble.textContent = message.content;
      }
      const meta = document.createElement("div");
      meta.className = "message-meta";
      meta.textContent = `${message.role === "user" ? "\u4F60" : "Agent"} \xB7 ${message.at}`;
      row.appendChild(bubble);
      row.appendChild(meta);
      chatMessagesEl.appendChild(row);
    });
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }
  async function loadMessages() {
    const storageLocal = extensionChrome?.storage?.local;
    const saved = storageLocal
      ? await storageLocal.get([
          STORAGE_KEY,
          SESSION_ID_KEY,
          WORKFLOWS_KEY,
          AUTH_STATE_KEY,
          CUSTOM_APIS_KEY,
          EXEC_RESULTS_KEY,
        ])
      : {
          [STORAGE_KEY]: fallbackStorage.get(STORAGE_KEY),
          [SESSION_ID_KEY]: fallbackStorage.get(SESSION_ID_KEY),
          [WORKFLOWS_KEY]: fallbackStorage.get(WORKFLOWS_KEY),
          [AUTH_STATE_KEY]: fallbackStorage.get(AUTH_STATE_KEY),
          [CUSTOM_APIS_KEY]: fallbackStorage.get(CUSTOM_APIS_KEY),
          [EXEC_RESULTS_KEY]: fallbackStorage.get(EXEC_RESULTS_KEY),
        };
    setAuthStatus("\u5C1A\u672A\u6388\u6B0A\uFF0C\u8ACB\u5148\u6309\u300CGoogle \u6388\u6B0A\u300D\u3002", "normal");
    setChatEnabled(false);
    if (typeof saved[SESSION_ID_KEY] === "string" && saved[SESSION_ID_KEY]) {
      chatSessionId = saved[SESSION_ID_KEY];
    }
    if (saved[STORAGE_KEY]) {
      try {
        const parsed = JSON.parse(saved[STORAGE_KEY]);
        if (Array.isArray(parsed)) {
          messages = parsed.slice(-MAX_MESSAGES).filter((item) => {
            return (
              Boolean(item) &&
              typeof item === "object" &&
              item.role !== void 0 &&
              typeof item.content === "string" &&
              typeof item.at === "string"
            );
          });
        }
      } catch {
        messages = [];
      }
    }
    if (saved[WORKFLOWS_KEY]) {
      try {
        const parsedWorkflows = JSON.parse(saved[WORKFLOWS_KEY]);
        if (Array.isArray(parsedWorkflows)) {
          savedWorkflows = parsedWorkflows
            .filter((item) => Boolean(item) && typeof item === "object")
            .map((item) => {
              const legacySteps = Array.isArray(item.apis)
                ? item.apis
                    .map((api) => String(api || "").trim())
                    .filter(Boolean)
                    .map((api) => ({ api, purpose: "\u5F85\u88DC\u5145\u76EE\u7684", params: [] }))
                : [];
              const steps = Array.isArray(item.steps)
                ? item.steps
                    .filter((step) => step && typeof step.api === "string")
                    .map((step) => ({
                      api: step.api,
                      path: typeof step.path === "string" ? step.path : void 0,
                      requestName: typeof step.requestName === "string" ? step.requestName : void 0,
                      method: typeof step.method === "string" ? step.method : void 0,
                      headers: step.headers && typeof step.headers === "object" ? { ...step.headers } : {},
                      bodyTemplate: typeof step.bodyTemplate === "string" ? step.bodyTemplate : "",
                      bearerToken: typeof step.bearerToken === "string" ? step.bearerToken : "",
                      purpose: typeof step.purpose === "string" ? step.purpose : "\u5F85\u88DC\u5145\u76EE\u7684",
                      params: Array.isArray(step.params) ? step.params.map((p) => String(p)) : [],
                    }))
                : legacySteps;
              return {
                id: typeof item.id === "string" ? item.id : `wf-${Date.now()}`,
                name: typeof item.name === "string" ? item.name : "\u672A\u547D\u540D\u6D41\u7A0B",
                steps,
              };
            });
        }
      } catch {
        savedWorkflows = [];
      }
    }
    if (saved[CUSTOM_APIS_KEY]) {
      try {
        const parsedCustomApis = JSON.parse(saved[CUSTOM_APIS_KEY]);
        if (Array.isArray(parsedCustomApis)) {
          customApiSpecs = parsedCustomApis
            .filter((item) => item && typeof item.api === "string")
            .map((item) => ({
              api: item.api,
              path: typeof item.path === "string" ? item.path : void 0,
              requestName: typeof item.requestName === "string" ? item.requestName : void 0,
              method: typeof item.method === "string" ? item.method : void 0,
              headers: item.headers && typeof item.headers === "object" ? item.headers : {},
              bodyTemplate: typeof item.bodyTemplate === "string" ? item.bodyTemplate : "",
              bearerToken: typeof item.bearerToken === "string" ? item.bearerToken : "",
              purpose: typeof item.purpose === "string" ? item.purpose : "",
              params: Array.isArray(item.params) ? item.params.map((p) => String(p)) : [],
            }));
        }
      } catch {
        customApiSpecs = [];
      }
    }
    renderMessages();
    refreshApiCandidatesFromLatestAssistant();
    renderDraftSteps();
    renderSavedWorkflows();
    try {
      if (typeof saved[EXEC_RESULTS_KEY] === "string" && saved[EXEC_RESULTS_KEY]) {
        const parsed = JSON.parse(saved[EXEC_RESULTS_KEY]);
        if (Array.isArray(parsed)) execResults = parsed.slice(0, MAX_EXEC_RESULTS);
      }
    } catch {
      execResults = [];
    }
    renderExecResults();
    if (typeof saved[AUTH_STATE_KEY] === "string" && saved[AUTH_STATE_KEY]) {
      try {
        const parsed = JSON.parse(saved[AUTH_STATE_KEY]);
        if (isAuthStateValid(parsed)) {
          firebaseIdToken = parsed.firebaseIdToken;
          googleAccessToken = parsed.googleAccessToken;
          authExpiresAt = parsed.expiresAt;
          accountEmail = parsed.accountEmail || "(\u7121\u6CD5\u53D6\u5F97 email)";
          isAuthorized = true;
          setChatEnabled(true);
          setAuthStatus(`\u5DF2\u6388\u6B0A\uFF08${accountEmail}\uFF09`, "ok");
          setOAuthInfo(`account_email: ${accountEmail}`);
          return;
        }
      } catch {}
    }
    const identityInfo = await checkIdentityAuthorization();
    console.log("identityInfo", identityInfo);
    if (identityInfo.authorized) {
      setAuthStatus(
        `${identityInfo.message}\uFF0C\u4F46 Token \u5DF2\u904E\u671F\uFF0C\u8ACB\u91CD\u65B0\u6388\u6B0A\u3002`,
        "normal",
      );
    }
  }
  async function saveMessages() {
    const data = {
      [STORAGE_KEY]: JSON.stringify(messages.slice(-MAX_MESSAGES)),
      [SESSION_ID_KEY]: chatSessionId,
      [WORKFLOWS_KEY]: JSON.stringify(savedWorkflows),
      [AUTH_STATE_KEY]: JSON.stringify(getCurrentAuthState()),
      [CUSTOM_APIS_KEY]: JSON.stringify(customApiSpecs.slice(0, 50)),
      [EXEC_RESULTS_KEY]: JSON.stringify(execResults.slice(0, MAX_EXEC_RESULTS)),
    };
    const storageLocal = extensionChrome?.storage?.local;
    if (storageLocal) return storageLocal.set(data);
    fallbackStorage.set(STORAGE_KEY, data[STORAGE_KEY] ?? "");
    fallbackStorage.set(SESSION_ID_KEY, data[SESSION_ID_KEY] ?? "");
    fallbackStorage.set(WORKFLOWS_KEY, data[WORKFLOWS_KEY] ?? "");
    fallbackStorage.set(AUTH_STATE_KEY, data[AUTH_STATE_KEY] ?? "");
    fallbackStorage.set(CUSTOM_APIS_KEY, data[CUSTOM_APIS_KEY] ?? "");
    fallbackStorage.set(EXEC_RESULTS_KEY, data[EXEC_RESULTS_KEY] ?? "");
  }
  function pushMessage(role, content) {
    messages.push({
      role,
      content,
      at: /* @__PURE__ */ new Date().toLocaleTimeString("zh-Hant-TW", { hour: "2-digit", minute: "2-digit" }),
    });
    messages = messages.slice(-MAX_MESSAGES);
    renderMessages();
    return messages.length - 1;
  }
  function appendToMessage(index, chunk) {
    if (!messages[index]) return;
    messages[index].content += chunk;
    renderMessages();
    refreshApiCandidatesFromLatestAssistant();
  }
  function checkIdentityAuthorization() {
    return new Promise((resolve) => {
      if (!extensionChrome?.identity?.getProfileUserInfo) {
        resolve({ authorized: false, message: "\u76EE\u524D\u74B0\u5883\u4E0D\u652F\u63F4 chrome.identity" });
        return;
      }
      extensionChrome.identity.getProfileUserInfo((userInfo) => {
        const maybeError = extensionChrome?.runtime?.lastError?.message;
        if (maybeError) {
          resolve({ authorized: false, message: maybeError });
          return;
        }
        if (!userInfo?.email) {
          resolve({
            authorized: false,
            message: "\u5C1A\u672A\u5B8C\u6210 OAuth \u6388\u6B0A\uFF0C\u8ACB\u6309\u300CGoogle \u6388\u6B0A\u300D",
          });
          return;
        }
        resolve({ authorized: true, message: `\u5DF2\u5075\u6E2C\u700F\u89BD\u5668\u5E33\u865F ${userInfo.email}` });
      });
    });
  }
  function requestOAuthAuthorization() {
    return new Promise((resolve, reject) => {
      if (!extensionChrome?.identity?.launchWebAuthFlow || !extensionChrome?.identity?.getRedirectURL) {
        reject(new Error("\u76EE\u524D\u74B0\u5883\u4E0D\u652F\u63F4 chrome.identity.launchWebAuthFlow"));
        return;
      }
      const redirectUri = extensionChrome.identity.getRedirectURL("oauth2");
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", GOOGLE_OAUTH_CLIENT_ID);
      authUrl.searchParams.set("response_type", "token");
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", GOOGLE_OAUTH_SCOPE);
      authUrl.searchParams.set("prompt", "select_account");
      const oauthState = createOAuthState();
      authUrl.searchParams.set("state", oauthState);
      extensionChrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true }, (responseUrl) => {
        const maybeError = extensionChrome?.runtime?.lastError?.message;
        if (maybeError) {
          reject(
            new Error(
              `${maybeError}\uFF08\u8ACB\u78BA\u8A8D OAuth client \u5DF2\u5141\u8A31 redirect URI: ${redirectUri}\uFF09`,
            ),
          );
          return;
        }
        if (!responseUrl) {
          reject(new Error("\u6388\u6B0A\u6D41\u7A0B\u672A\u56DE\u50B3 response URL"));
          return;
        }
        const hash = responseUrl.split("#")[1] || "";
        const params = new URLSearchParams(hash);
        const returnedState = params.get("state");
        if (!returnedState || returnedState !== oauthState) {
          reject(
            new Error(
              "OAuth state \u9A57\u8B49\u5931\u6557\uFF0C\u53EF\u80FD\u5B58\u5728\u8ACB\u6C42\u507D\u9020\u98A8\u96AA",
            ),
          );
          return;
        }
        const accessToken = params.get("access_token");
        if (!accessToken) {
          const error = params.get("error");
          const errorDescription = params.get("error_description");
          reject(
            new Error(`OAuth \u672A\u53D6\u5F97 access token: ${error || "unknown"} ${errorDescription || ""}`.trim()),
          );
          return;
        }
        resolve({
          accessToken,
          expiresIn: params.get("expires_in") || "(unknown)",
          scope: params.get("scope") || "(unknown)",
          tokenType: params.get("token_type") || "(unknown)",
          redirectUri,
        });
      });
    });
  }
  async function authorizeNow() {
    setAuthStatus("\u6B63\u5728\u9032\u884C Google OAuth \u6388\u6B0A...", "normal");
    try {
      const grant = await requestOAuthAuthorization();
      googleAccessToken = grant.accessToken;
      firebaseIdToken = await exchangeGoogleTokenForFirebaseIdToken(grant.accessToken);
      accountEmail = "(\u7121\u6CD5\u53D6\u5F97 email)";
      try {
        const userInfo = await fetchGoogleUserInfo(grant.accessToken);
        if (userInfo.email) accountEmail = userInfo.email;
      } catch (error) {
        console.log("[personal-extension] userinfoError", error);
      }
      const expiresInSeconds = Number.parseInt(grant.expiresIn || "", 10);
      const safeTtlMs = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds * 1e3 : 3600 * 1e3;
      authExpiresAt = Date.now() + safeTtlMs - 6e4;
      setAuthStatus("OAuth \u6388\u6B0A\u6210\u529F\u3002", "ok");
      setOAuthInfo(`account_email: ${accountEmail}`);
      setAuthStatus(`OAuth \u6388\u6B0A\u6210\u529F\uFF08${accountEmail}\uFF09`, "ok");
      isAuthorized = true;
      setChatEnabled(true);
      await saveMessages();
      console.log("[personal-extension] oauthGrant", {
        ...grant,
        accountEmail,
        accessToken: maskToken(grant.accessToken),
      });
    } catch (error) {
      clearAuthStateInMemory();
      await saveMessages();
      const message = error instanceof Error ? error.message : "\u672A\u77E5\u932F\u8AA4";
      setAuthStatus(`OAuth \u6388\u6B0A\u5931\u6557\uFF1A${message}`, "error");
      setOAuthInfo(`OAuth \u6388\u6B0A\u5931\u6557\uFF1A${message}`);
      console.log("[personal-extension] oauthAuthorizeError", message);
    }
  }
  const STEP_LETTERS = "abcdefghijklmnopqrstuvwxyz";
  function renderExecResults() {
    executionResultListEl.replaceChildren();
    execResults.forEach((result) => {
      const block = document.createElement("div");
      block.className = "exec-workflow-block";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "exec-workflow-toggle";
      toggle.textContent = `${result.ok ? "\u2705" : "\u274C"} \u25BE  \u3010${result.workflowName}\u3011${result.timestamp}`;
      const stepsWrap = document.createElement("div");
      stepsWrap.className = "exec-workflow-steps collapsed";
      toggle.addEventListener("click", () => {
        const collapsed = stepsWrap.classList.toggle("collapsed");
        toggle.textContent = `${result.ok ? "\u2705" : "\u274C"} ${collapsed ? "\u25B8" : "\u25BE"}  \u3010${result.workflowName}\u3011${result.timestamp}`;
      });
      result.steps.forEach((s) => {
        const row = document.createElement("div");
        row.className = `exec-step-row ${s.ok ? "ok" : "error"}`;
        const left = document.createElement("div");
        left.className = "exec-step-left";
        const icon = document.createElement("span");
        icon.className = "exec-step-icon";
        icon.textContent = s.ok ? "\u2705" : "\u274C";
        const label = document.createElement("span");
        label.className = "exec-step-label";
        label.textContent = `${s.index + 1}. ${s.name}`;
        const statusText = document.createElement("span");
        statusText.className = "exec-step-status-text";
        statusText.textContent = s.statusText;
        left.appendChild(icon);
        left.appendChild(label);
        left.appendChild(statusText);
        const actions = document.createElement("div");
        actions.className = "exec-step-actions";
        if (s.response) {
          const viewBtn = document.createElement("button");
          viewBtn.type = "button";
          viewBtn.className = "exec-view-btn";
          viewBtn.textContent = "\u67E5\u770B\u7D50\u679C";
          const pre = document.createElement("pre");
          pre.className = "exec-step-response hidden";
          pre.textContent = s.response;
          viewBtn.addEventListener("click", () => {
            pre.classList.toggle("hidden");
            viewBtn.textContent = pre.classList.contains("hidden") ? "\u67E5\u770B\u7D50\u679C" : "\u6536\u8D77";
          });
          const copyBtn = document.createElement("button");
          copyBtn.type = "button";
          copyBtn.className = "exec-copy-btn";
          copyBtn.textContent = "\u8907\u88FD";
          copyBtn.addEventListener("click", () => {
            copyToClipboard(s.response ?? "", copyBtn);
          });
          actions.appendChild(copyBtn);
          actions.appendChild(viewBtn);
          row.appendChild(left);
          row.appendChild(actions);
          row.appendChild(pre);
        } else {
          row.appendChild(left);
          row.appendChild(actions);
        }
        stepsWrap.appendChild(row);
      });
      block.appendChild(toggle);
      block.appendChild(stepsWrap);
      executionResultListEl.appendChild(block);
    });
  }
  function createExecStepRow(index, step) {
    const row = document.createElement("div");
    row.className = "exec-step-row";
    const left = document.createElement("div");
    left.className = "exec-step-left";
    const icon = document.createElement("span");
    icon.className = "exec-step-icon running";
    icon.textContent = "\u23F3";
    const label = document.createElement("span");
    label.className = "exec-step-label";
    const letter = STEP_LETTERS[index] ?? String(index + 1);
    label.textContent = `${letter}. ${step.requestName || step.api}`;
    const statusText = document.createElement("span");
    statusText.className = "exec-step-status-text";
    statusText.textContent = "\u7B49\u5F85\u4E2D";
    left.appendChild(icon);
    left.appendChild(label);
    left.appendChild(statusText);
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "exec-view-btn hidden";
    viewBtn.textContent = "\u67E5\u770B\u7D50\u679C";
    const responseBlock = document.createElement("div");
    responseBlock.className = "exec-step-response hidden";
    const responsePre = document.createElement("pre");
    responseBlock.appendChild(responsePre);
    viewBtn.addEventListener("click", () => {
      const isHidden = responseBlock.classList.toggle("hidden");
      viewBtn.textContent = isHidden ? "\u67E5\u770B\u7D50\u679C" : "\u6536\u8D77";
    });
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "exec-copy-btn hidden";
    copyBtn.textContent = "\u8907\u88FD";
    copyBtn.addEventListener("click", () => {
      copyToClipboard(responsePre.textContent ?? "", copyBtn);
    });
    const saveApiBtn = document.createElement("button");
    saveApiBtn.type = "button";
    saveApiBtn.className = "exec-save-api-btn";
    saveApiBtn.textContent = "\u5132\u5B58 API";
    saveApiBtn.addEventListener("click", () => {
      const cleanedHeaders = {};
      for (const [k, v] of Object.entries(step.headers ?? {})) {
        if (k.toLowerCase() !== "authorization") cleanedHeaders[k] = v;
      }
      const alreadyExists = customApiSpecs.some(
        (s) => s.path === (step.path || step.api) && s.requestName === step.requestName,
      );
      if (alreadyExists) {
        setToast(
          `\u300C${step.requestName || step.api}\u300D\u5DF2\u5728\u5DF2\u5132\u5B58\u7684 API \u4E2D\u3002`,
          "error",
        );
        return;
      }
      customApiSpecs.push({
        api: step.api || step.path || "",
        path: step.path,
        requestName: step.requestName,
        method: step.method,
        headers: cleanedHeaders,
        bodyTemplate: step.bodyTemplate,
        purpose: step.purpose ?? "",
        params: [...(step.params ?? [])],
      });
      renderSavedApis();
      renderApiCandidates();
      setSavedApisOpen(true);
      saveApiBtn.textContent = "\u5DF2\u5132\u5B58 \u2713";
      saveApiBtn.disabled = true;
      setToast(`\u5DF2\u5132\u5B58 API\uFF1A${step.requestName || step.api}`, "ok");
      void saveMessages();
    });
    const rowActions = document.createElement("div");
    rowActions.className = "exec-step-actions";
    rowActions.appendChild(saveApiBtn);
    rowActions.appendChild(copyBtn);
    rowActions.appendChild(viewBtn);
    row.appendChild(left);
    row.appendChild(rowActions);
    row.appendChild(responseBlock);
    return { row, icon, statusText, viewBtn, responsePre, copyBtn };
  }
  async function executeDraftWorkflow() {
    if (!draftSteps.length) {
      setToast(
        "\u6D41\u7A0B\u8349\u7A3F\u662F\u7A7A\u7684\uFF0C\u8ACB\u5148\u52A0\u5165 API \u6B65\u9A5F\u3002",
        "error",
      );
      return;
    }
    if (isAuthExpired()) {
      notifyAuthExpired();
      return;
    }
    const workflowName = currentWorkflowName || "\u8349\u7A3F";
    const timestamp = /* @__PURE__ */ new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
    const block = document.createElement("div");
    block.className = "exec-workflow-block";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "exec-workflow-toggle";
    toggle.textContent = `\u25BE  \u3010${workflowName}\u3011${timestamp}`;
    const stepsWrap = document.createElement("div");
    stepsWrap.className = "exec-workflow-steps";
    toggle.addEventListener("click", () => {
      const collapsed = stepsWrap.classList.toggle("collapsed");
      toggle.textContent = `${collapsed ? "\u25B8" : "\u25BE"}  \u3010${workflowName}\u3011${timestamp}`;
    });
    block.appendChild(toggle);
    block.appendChild(stepsWrap);
    const stepUIs = draftSteps.map((step, i) => {
      const ui = createExecStepRow(i, step);
      stepsWrap.appendChild(ui.row);
      return ui;
    });
    setWorkflowPanelOpen(true);
    executionResultListEl.prepend(block);
    while (executionResultListEl.children.length > MAX_EXEC_RESULTS) {
      executionResultListEl.lastElementChild?.remove();
    }
    executionResultPanelEl.classList.remove("collapsed");
    toggleExecutionResultButton.textContent = "\u57F7\u884C\u7D50\u679C \u25BE";
    let allOk = true;
    for (let i = 0; i < draftSteps.length; i += 1) {
      const step = draftSteps[i];
      const ui = stepUIs[i];
      ui.icon.textContent = "\u23F3";
      ui.icon.className = "exec-step-icon running";
      ui.statusText.textContent = "\u57F7\u884C\u4E2D\u2026";
      ui.row.className = "exec-step-row";
      const url = step.path || step.api;
      const method = (step.method || "GET").toUpperCase();
      const baseHeaders = { ...(step.headers || {}) };
      for (const k of Object.keys(baseHeaders)) {
        if (k.toLowerCase() === "authorization") delete baseHeaders[k];
      }
      const contentType = baseHeaders["content-type"] ?? baseHeaders["Content-Type"] ?? "application/json";
      delete baseHeaders["content-type"];
      const headers = {
        ...baseHeaders,
        Authorization: `Bearer ${firebaseIdToken}`,
        "Content-Type": contentType,
      };
      const hasBody = !!step.bodyTemplate && ["POST", "PUT", "PATCH"].includes(method);
      try {
        const resp = await fetch(url, {
          method,
          headers,
          ...(hasBody ? { body: step.bodyTemplate } : {}),
        });
        const ct = resp.headers.get("content-type") ?? "";
        let resultText;
        if (ct.includes("application/json")) {
          const json = await resp.json();
          resultText = JSON.stringify(json, null, 2);
        } else {
          resultText = await resp.text();
        }
        if (resp.ok) {
          ui.icon.textContent = "\u2705";
          ui.icon.className = "exec-step-icon";
          ui.statusText.textContent = `${resp.status}`;
          ui.row.classList.add("ok");
        } else {
          if (resp.status === 401 || resp.status === 403) {
            notifyAuthExpired();
          }
          ui.icon.textContent = "\u274C";
          ui.icon.className = "exec-step-icon";
          ui.statusText.textContent = `${resp.status} \u5931\u6557`;
          ui.row.classList.add("error");
          allOk = false;
        }
        ui.responsePre.textContent = resultText;
        ui.viewBtn.classList.remove("hidden");
        ui.copyBtn.classList.remove("hidden");
      } catch (error) {
        const message = error instanceof Error ? error.message : "\u672A\u77E5\u932F\u8AA4";
        ui.icon.textContent = "\u274C";
        ui.icon.className = "exec-step-icon";
        ui.statusText.textContent = "\u7DB2\u8DEF\u932F\u8AA4";
        ui.row.classList.add("error");
        ui.responsePre.textContent = message;
        ui.viewBtn.classList.remove("hidden");
        ui.copyBtn.classList.remove("hidden");
        allOk = false;
        break;
      }
    }
    toggle.textContent = `${allOk ? "\u2705" : "\u274C"} \u25BE  \u3010${workflowName}\u3011${timestamp}`;
    setToast(
      allOk
        ? "\u6D41\u7A0B\u5DF2\u5168\u90E8\u57F7\u884C\u6210\u529F \u2705"
        : "\u6D41\u7A0B\u57F7\u884C\u5B8C\u6210\uFF0C\u90E8\u5206\u6B65\u9A5F\u5931\u6557 \u274C",
      allOk ? "ok" : "error",
    );
    const resultRecord = {
      workflowName,
      timestamp,
      ok: allOk,
      steps: draftSteps.map((step, i) => ({
        index: i,
        name: step.requestName || step.api || step.path || `\u6B65\u9A5F ${i + 1}`,
        ok: stepUIs[i].row.classList.contains("ok"),
        statusText: stepUIs[i].statusText.textContent || "",
        response: stepUIs[i].responsePre.textContent || "",
      })),
    };
    execResults.unshift(resultRecord);
    if (execResults.length > MAX_EXEC_RESULTS) execResults = execResults.slice(0, MAX_EXEC_RESULTS);
    renderExecResults();
    const firstBlock = executionResultListEl.firstElementChild;
    if (firstBlock) {
      const firstSteps = firstBlock.querySelector(".exec-workflow-steps");
      const firstToggleEl = firstBlock.querySelector(".exec-workflow-toggle");
      if (firstSteps && firstToggleEl) {
        firstSteps.classList.remove("collapsed");
        firstToggleEl.textContent = `${allOk ? "\u2705" : "\u274C"} \u25BE  \u3010${workflowName}\u3011${timestamp}`;
      }
    }
    await saveMessages();
  }
  async function sendChatMessage(rawMessage, useSkill) {
    const value = rawMessage.trim();
    if (!value) return;
    const messageForAgent = buildMessageWithSkillDirective(value, useSkill);
    pushMessage("user", value);
    chatInputEl.value = "";
    const assistantIndex = pushMessage("assistant", "");
    try {
      const fullText = await callAgentChatApiStream(messageForAgent, (chunk) => {
        appendToMessage(assistantIndex, chunk);
      });
      if (!messages[assistantIndex]?.content.trim()) {
        messages[assistantIndex].content = fullText || "(\u7121\u56DE\u61C9\u5167\u5BB9)";
        renderMessages();
        refreshApiCandidatesFromLatestAssistant();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u672A\u77E5\u932F\u8AA4";
      messages[assistantIndex].content = `\u547C\u53EB Agent API \u5931\u6557\uFF1A${message}`;
      renderMessages();
      setToast(`\u547C\u53EB\u5931\u6557\uFF1A${message}`, "error");
    }
    await saveMessages();
  }
  chatFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isAuthExpired()) {
      notifyAuthExpired();
      return;
    }
    const value = chatInputEl.value.trim();
    if (!value) return;
    if (shouldPromptSkillConfirm(value)) {
      pendingUserMessage = value;
      toggleSkillConfirm(true);
      setToast(
        "\u5075\u6E2C\u5230\u53EF\u7528 skill\uFF0C\u8ACB\u5148\u9078\u64C7\u662F\u5426\u4F7F\u7528\u3002",
        "normal",
      );
      return;
    }
    await sendChatMessage(value, false);
  });
  skillUseButton.addEventListener("click", async () => {
    if (!pendingUserMessage.trim()) return;
    const value = pendingUserMessage;
    pendingUserMessage = "";
    toggleSkillConfirm(false);
    await sendChatMessage(value, true);
  });
  skillSkipButton.addEventListener("click", async () => {
    if (!pendingUserMessage.trim()) return;
    const value = pendingUserMessage;
    pendingUserMessage = "";
    toggleSkillConfirm(false);
    await sendChatMessage(value, false);
  });
  clearChatButton.addEventListener("click", () => {
    messages = [];
    pendingUserMessage = "";
    toggleSkillConfirm(false);
    renderMessages();
    void saveMessages();
  });
  toggleChatButton.addEventListener("click", () => {
    setChatPanelOpen(!chatPanelOpen);
  });
  toggleWorkflowsButton.addEventListener("click", () => {
    setWorkflowPanelOpen(!workflowPanelOpen);
  });
  toggleCurlParserButton.addEventListener("click", () => {
    setCurlParserOpen(!curlParserOpen);
  });
  toggleManualApiButton.addEventListener("click", () => {
    setManualApiOpen(!manualApiOpen);
  });
  toggleSavedApisButton.addEventListener("click", () => {
    setSavedApisOpen(!savedApisOpen);
  });
  manualApiNameEl.addEventListener("input", () => {
    clearFieldError(manualApiNameEl);
    updateManualFormActions();
  });
  manualApiPathEl.addEventListener("input", () => {
    clearFieldError(manualApiPathEl);
    updateManualFormActions();
  });
  toggleExecutionResultButton.addEventListener("click", () => {
    const collapsed = executionResultPanelEl.classList.toggle("collapsed");
    toggleExecutionResultButton.textContent = collapsed
      ? "\u57F7\u884C\u7D50\u679C \u25B8"
      : "\u57F7\u884C\u7D50\u679C \u25BE";
  });
  toggleSavedWorkflowsButton.addEventListener("click", () => {
    setSavedWorkflowsOpen(!savedWorkflowsOpen);
  });
  clearExecutionResultButton.addEventListener("click", async () => {
    execResults = [];
    executionResultListEl.replaceChildren();
    await saveMessages();
  });
  addStepButton.addEventListener("click", () => {
    const spec = editedDetailSpec ?? getAllApiCandidates()[selectedApiIndex];
    if (!spec) {
      setToast("\u8ACB\u5148\u9078\u64C7\u4E00\u500B API\u3002", "error");
      return;
    }
    const stepData = {
      api: spec.api || spec.path,
      path: spec.path,
      requestName: spec.requestName,
      method: spec.method,
      headers: spec.headers ? { ...spec.headers } : {},
      bodyTemplate: spec.bodyTemplate,
      bearerToken: spec.bearerToken,
      purpose: spec.purpose || "",
      params: [...(spec.params || [])],
    };
    if (editingStepIndex >= 0 && editingStepIndex < draftSteps.length) {
      draftSteps[editingStepIndex] = stepData;
      editingStepIndex = -1;
      addStepButton.textContent = "\u52A0\u5165\u6D41\u7A0B\u6B65\u9A5F";
      addStepButton.classList.remove("updating");
      setToast(`\u5DF2\u66F4\u65B0\u6B65\u9A5F\uFF1A${stepData.requestName || stepData.api}`, "ok");
    } else {
      draftSteps.push(stepData);
      setToast(`\u5DF2\u52A0\u5165\u6B65\u9A5F\uFF1A${stepData.requestName || stepData.api}`, "ok");
    }
    renderDraftSteps();
  });
  function clearFieldError(el) {
    el.classList.remove("field-error");
    const hint = el.nextElementSibling;
    if (hint && hint.classList.contains("field-error-hint")) hint.remove();
  }
  function clearManualForm() {
    manualApiNameEl.value = "";
    manualApiPathEl.value = "";
    manualApiPurposeEl.value = "";
    manualApiMethodEl.value = "GET";
    renderManualHeaderRowsFromObject({});
    manualApiBodyEl.value = "";
    manualApiCurlEl.value = "";
    addManualApiButton.textContent = "\u52A0\u5165\u81EA\u8A02 API";
    manualApiActionsEl.classList.add("hidden");
    manualApiActionsEl.replaceChildren();
    editingApiIndex = -1;
    addManualApiButton.style.display = "none";
  }
  function buildSpecFromForm() {
    const name = manualApiNameEl.value.trim();
    const path = manualApiPathEl.value.trim();
    const purpose = manualApiPurposeEl.value.trim();
    const method = (manualApiMethodEl.value.trim() || "GET").toUpperCase();
    const headers = collectManualHeaders();
    const bodyTemplate = manualApiBodyEl.value.trim();
    const bearerRaw = headers.Authorization ?? headers.authorization ?? "";
    const bearerToken = bearerRaw.replace(/^Bearer\s+/i, "").trim();
    const params = inferParamsFromPathAndBody(path, bodyTemplate);
    const spec = {
      api: path,
      path,
      requestName: name,
      method,
      headers,
      bodyTemplate,
      bearerToken,
      purpose,
      params,
    };
    return { name, path, spec };
  }
  function showPendingApiActions() {
    manualApiActionsEl.replaceChildren();
    manualApiActionsEl.classList.remove("hidden");
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "pending-api-save";
    saveBtn.textContent = "\u5132\u5B58\u81F3\u5DF2\u5132\u5B58\u7684 API";
    saveBtn.addEventListener("click", async () => {
      const { name, spec } = buildSpecFromForm();
      if (!name || !spec.path) return;
      const isDup = customApiSpecs.some(
        (s) => (s.requestName || s.api) === name && (s.path || s.api) === (spec.path || spec.api),
      );
      let finalName = name;
      if (isDup) {
        finalName = `${name}-copy`;
        spec.requestName = finalName;
        spec.api = finalName;
      }
      customApiSpecs = [spec, ...customApiSpecs].slice(0, 50);
      renderSavedApis();
      setSavedApisOpen(true);
      clearManualForm();
      await saveMessages();
      setToast(
        isDup ? `\u5DF2\u53E6\u5B58\u70BA\u300C${finalName}\u300D` : `\u5DF2\u5132\u5B58 API\uFF1A${finalName}`,
        "ok",
      );
    });
    const addStepBtn = document.createElement("button");
    addStepBtn.type = "button";
    addStepBtn.className = "pending-api-step";
    addStepBtn.textContent = "\u52A0\u5165\u6D41\u7A0B\u6B65\u9A5F";
    addStepBtn.addEventListener("click", () => {
      const { name, spec } = buildSpecFromForm();
      if (!name || !spec.path) return;
      draftSteps.push({ ...spec, params: [...(spec.params ?? [])] });
      renderDraftSteps();
      renderApiDetail(spec);
      clearManualForm();
      setToast(`\u5DF2\u52A0\u5165\u6B65\u9A5F\uFF1A${name}`, "ok");
    });
    manualApiActionsEl.appendChild(saveBtn);
    manualApiActionsEl.appendChild(addStepBtn);
  }
  function updateManualFormActions() {
    const name = manualApiNameEl.value.trim();
    const path = manualApiPathEl.value.trim();
    if (editingApiIndex >= 0) {
      addManualApiButton.style.display = "block";
      manualApiActionsEl.classList.add("hidden");
      manualApiActionsEl.replaceChildren();
      return;
    }
    addManualApiButton.style.display = "none";
    if (name && path) {
      showPendingApiActions();
    } else {
      manualApiActionsEl.classList.add("hidden");
      manualApiActionsEl.replaceChildren();
    }
  }
  addManualApiButton.addEventListener("click", async () => {
    if (editingApiIndex < 0 || editingApiIndex >= customApiSpecs.length) return;
    const { name, path, spec } = buildSpecFromForm();
    if (!name || !path) {
      if (!name) manualApiNameEl.classList.add("field-error");
      if (!path) manualApiPathEl.classList.add("field-error");
      setToast("\u8ACB\u586B\u5BEB\u5FC5\u8981\u6B04\u4F4D\u3002", "error");
      return;
    }
    customApiSpecs[editingApiIndex] = spec;
    clearManualForm();
    renderSavedApis();
    await saveMessages();
    setToast(`\u5DF2\u66F4\u65B0 API\uFF1A${name}`, "ok");
  });
  parseCurlButton.addEventListener("click", () => {
    const raw = manualApiCurlEl.value.trim() || manualApiPathEl.value.trim();
    const parsed = parseCurlCommand(raw);
    if (!parsed) {
      setToast("\u672A\u5075\u6E2C\u5230\u6709\u6548\u7684 curl \u6307\u4EE4\u3002", "error");
      return;
    }
    manualApiMethodEl.value = parsed.method;
    manualApiPathEl.value = parsed.url;
    renderManualHeaderRowsFromObject(parsed.headers);
    manualApiBodyEl.value = parsed.body;
    if (!manualApiNameEl.value.trim()) {
      const tail = parsed.url.split("?")[0].split("/").filter(Boolean).pop() || "CustomApi";
      manualApiNameEl.value = `${tail}Request`;
    }
    setToast(`\u5DF2\u89E3\u6790 curl\uFF08${parsed.method} ${parsed.url}\uFF09`, "ok");
    setManualApiOpen(true);
    updateManualFormActions();
  });
  function showExecutionConfirmDialog() {
    return new Promise((resolve) => {
      const stepsToReview = draftSteps
        .map((step, i) => {
          const urlParams = {};
          try {
            const urlObj = new URL(step.path ?? step.api ?? "");
            urlObj.searchParams.forEach((v, k) => {
              urlParams[k] = v;
            });
          } catch {}
          return {
            step,
            index: i,
            urlParams,
            hasParams: Object.keys(urlParams).length > 0,
            hasBody: !!step.bodyTemplate?.trim(),
          };
        })
        .filter((s) => s.hasParams || s.hasBody);
      if (!stepsToReview.length) {
        resolve(true);
        return;
      }
      const overlay = document.createElement("div");
      overlay.className = "exec-confirm-overlay";
      const dialog = document.createElement("div");
      dialog.className = "exec-confirm-dialog";
      const titleEl = document.createElement("div");
      titleEl.className = "exec-confirm-title";
      titleEl.textContent = "\u57F7\u884C\u524D\u78BA\u8A8D";
      const subtitleEl = document.createElement("div");
      subtitleEl.className = "exec-confirm-subtitle";
      subtitleEl.textContent =
        "\u8ACB\u78BA\u8A8D\u4EE5\u4E0B\u6B65\u9A5F\u7684\u53C3\u6578\uFF0C\u78BA\u8A8D\u7121\u8AA4\u5F8C\u518D\u57F7\u884C\u3002";
      const stepsWrap = document.createElement("div");
      stepsWrap.className = "exec-confirm-steps";
      const stepEditors = [];
      stepsToReview.forEach(({ step, index, urlParams, hasParams, hasBody }) => {
        const card = document.createElement("div");
        card.className = "exec-confirm-step";
        const nameEl = document.createElement("div");
        nameEl.className = "exec-confirm-step-name";
        nameEl.textContent = `${index + 1}. ${step.requestName ?? step.api}`;
        card.appendChild(nameEl);
        const paramInputs = {};
        if (hasParams) {
          const label = document.createElement("div");
          label.className = "exec-confirm-label";
          label.textContent = "Params\uFF08URL \u67E5\u8A62\u53C3\u6578\uFF09";
          card.appendChild(label);
          const grid = document.createElement("div");
          grid.className = "exec-confirm-params";
          for (const [key, val] of Object.entries(urlParams)) {
            const row = document.createElement("div");
            row.className = "exec-confirm-param-row";
            const keyEl = document.createElement("span");
            keyEl.className = "exec-confirm-param-key";
            keyEl.textContent = key;
            const valInput = document.createElement("input");
            valInput.type = "text";
            valInput.value = val;
            valInput.className = "exec-confirm-param-value";
            row.appendChild(keyEl);
            row.appendChild(valInput);
            grid.appendChild(row);
            paramInputs[key] = valInput;
          }
          card.appendChild(grid);
        }
        let bodyInput = null;
        if (hasBody) {
          const label = document.createElement("div");
          label.className = "exec-confirm-label";
          label.textContent = "Body";
          bodyInput = document.createElement("textarea");
          bodyInput.className = "exec-confirm-body";
          bodyInput.value = step.bodyTemplate ?? "";
          card.appendChild(label);
          card.appendChild(bodyInput);
        }
        stepsWrap.appendChild(card);
        const urlBase = (step.path ?? step.api ?? "").split("?")[0];
        stepEditors.push({ index, urlBase, hasParams, paramInputs, hasBody, bodyInput });
      });
      const actions = document.createElement("div");
      actions.className = "exec-confirm-actions";
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "exec-confirm-cancel";
      cancelBtn.textContent = "\u53D6\u6D88";
      cancelBtn.addEventListener("click", () => {
        overlay.remove();
        resolve(false);
      });
      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "exec-confirm-ok";
      confirmBtn.textContent = "\u78BA\u8A8D\u57F7\u884C";
      confirmBtn.addEventListener("click", () => {
        stepEditors.forEach(({ index, urlBase, hasParams, paramInputs, hasBody, bodyInput }) => {
          const updatedStep = { ...draftSteps[index] };
          if (hasParams) {
            const params = new URLSearchParams();
            for (const [key, input] of Object.entries(paramInputs)) {
              params.set(key, input.value.trim());
            }
            const newUrl = params.toString() ? `${urlBase}?${params.toString()}` : urlBase;
            updatedStep.path = newUrl;
            updatedStep.api = newUrl;
          }
          if (hasBody && bodyInput) {
            updatedStep.bodyTemplate = bodyInput.value.trim();
          }
          draftSteps[index] = updatedStep;
        });
        overlay.remove();
        resolve(true);
      });
      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      dialog.appendChild(titleEl);
      dialog.appendChild(subtitleEl);
      dialog.appendChild(stepsWrap);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
    });
  }
  runWorkflowButton.addEventListener("click", async () => {
    if (isAuthExpired()) {
      notifyAuthExpired();
      return;
    }
    const confirmed = await showExecutionConfirmDialog();
    if (confirmed) void executeDraftWorkflow();
  });
  saveWorkflowButton.addEventListener("click", async () => {
    if (!draftSteps.length) {
      setToast("\u6D41\u7A0B\u8349\u7A3F\u662F\u7A7A\u7684\uFF0C\u8ACB\u5148\u52A0\u5165 API\u3002", "error");
      return;
    }
    const defaultName = `\u6D41\u7A0B${savedWorkflows.length + 1}`;
    const name = (globalThis.prompt("\u8ACB\u8F38\u5165\u6D41\u7A0B\u540D\u7A31", defaultName) || "").trim();
    if (!name) return;
    savedWorkflows = [
      {
        id: globalThis.crypto?.randomUUID?.() || `wf-${Date.now()}`,
        name,
        steps: draftSteps.map((step) => ({
          ...step,
          params: [...step.params],
          headers: step.headers ? { ...step.headers } : {},
        })),
      },
      ...savedWorkflows,
    ].slice(0, 20);
    renderSavedWorkflows();
    setSavedWorkflowsOpen(true);
    await saveMessages();
    setToast(`\u5DF2\u5EFA\u7ACB\u6D41\u7A0B\uFF1A${name}`, "ok");
  });
  clearDraftButton.addEventListener("click", () => {
    draftSteps = [];
    renderDraftSteps();
    setToast("\u5DF2\u6E05\u7A7A\u6D41\u7A0B\u8349\u7A3F\u3002", "normal");
  });
  authorizeGoogleButton.addEventListener("click", () => {
    authorizeGoogleButton.classList.remove("auth-expired-pulse");
    void authorizeNow();
  });
  setWorkflowPanelOpen(true);
  renderManualHeaderRowsFromObject({});
  void loadMessages();
  addHeaderRowButton.addEventListener("click", () => {
    appendManualHeaderRow();
  });
  const CHAT_HEIGHT_KEY = "chat_messages_height";
  (function initChatResizeHandle() {
    const handle = document.getElementById("chatResizeHandle");
    if (!handle) return;
    const saved = sessionStorage.getItem(CHAT_HEIGHT_KEY);
    if (saved) chatMessagesEl.style.height = saved;
    let startY = 0;
    let startH = 0;
    function onMouseMove(e) {
      const delta = e.clientY - startY;
      const newH = Math.max(80, startH + delta);
      chatMessagesEl.style.height = newH + "px";
    }
    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      handle.classList.remove("dragging");
      sessionStorage.setItem(CHAT_HEIGHT_KEY, chatMessagesEl.style.height);
    }
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      startY = e.clientY;
      startH = chatMessagesEl.offsetHeight;
      handle.classList.add("dragging");
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  })();
})();
