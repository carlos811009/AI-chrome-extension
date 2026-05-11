"use strict";
(() => {
  // src/panel/constants.ts
  var STORAGE_KEY = "chatMessages";
  var SESSION_ID_KEY = "chatSessionId";
  var WORKFLOWS_KEY = "savedWorkflows";
  var WORKFLOW_EXPORT_FORMAT = "personal-extension-workflow";
  var WORKFLOW_EXPORT_VERSION = 1;
  var EXEC_RESULTS_KEY = "execResults";
  var AUTH_STATE_KEY = "authState";
  var CUSTOM_APIS_KEY = "customApis";
  var MAX_MESSAGES = 40;
  var GOOGLE_OAUTH_SCOPE = "openid email profile";
  var ALLOWED_GOOGLE_EMAIL_SUFFIX = "";
  var RUNTIME_ENV_SETTINGS_KEY = "personalExtRuntimeEnvSettings";
  var LEGACY_FALLBACK_AGENT_CHAT_URL = "";
  var MAX_EXEC_RESULTS = 10;

  // src/env-injected.ts
  function normalizeDefaultEnv(raw) {
    return raw === "production" ? "production" : "staging";
  }
  function getBuildTimeEnv() {
    return {
      stagingAgentChatUrl: "",
      productionAgentChatUrl: "",
      stagingFirebaseWebApiKey: "",
      productionFirebaseWebApiKey: "",
      stagingGoogleOAuthClientId: "",
      productionGoogleOAuthClientId: "",
      defaultActiveEnv: normalizeDefaultEnv("staging")
    };
  }

  // src/panel/env-runtime.ts
  var emptyOverrides = () => ({
    firebaseWebApiKey: "",
    googleOAuthClientId: ""
  });
  function defaultSettings() {
    return {
      version: 1,
      activeEnv: getBuildTimeEnv().defaultActiveEnv,
      overrides: {
        staging: emptyOverrides(),
        production: emptyOverrides()
      }
    };
  }
  var cached = defaultSettings();
  function buildDefaultForEnv(env) {
    const b = getBuildTimeEnv();
    if (env === "staging") {
      return {
        firebaseWebApiKey: b.stagingFirebaseWebApiKey,
        googleOAuthClientId: b.stagingGoogleOAuthClientId
      };
    }
    return {
      firebaseWebApiKey: b.productionFirebaseWebApiKey,
      googleOAuthClientId: b.productionGoogleOAuthClientId
    };
  }
  function coerceSaved(raw) {
    const base = defaultSettings();
    if (!raw || typeof raw !== "object") return base;
    const o = raw;
    if (o.version !== 1) return base;
    const ae = o.activeEnv === "production" ? "production" : "staging";
    const ov = o.overrides;
    if (!ov || typeof ov !== "object") return { ...base, activeEnv: ae };
    const s = ov.staging;
    const p = ov.production;
    const readPair = (x) => {
      if (!x || typeof x !== "object") return emptyOverrides();
      const r = x;
      return {
        firebaseWebApiKey: typeof r.firebaseWebApiKey === "string" ? r.firebaseWebApiKey : "",
        googleOAuthClientId: typeof r.googleOAuthClientId === "string" ? r.googleOAuthClientId : ""
      };
    };
    return {
      version: 1,
      activeEnv: ae,
      overrides: {
        staging: readPair(s),
        production: readPair(p)
      }
    };
  }
  function hydrateRuntimeEnvFromSaved(raw) {
    cached = coerceSaved(raw);
  }
  function getActiveEnv() {
    return cached.activeEnv;
  }
  function setActiveEnv(env) {
    cached = { ...cached, activeEnv: env };
  }
  function getEffectiveAgentChatUrl() {
    const b = getBuildTimeEnv();
    const url = cached.activeEnv === "staging" ? b.stagingAgentChatUrl.trim() : b.productionAgentChatUrl.trim();
    if (url) return url;
    return LEGACY_FALLBACK_AGENT_CHAT_URL.trim();
  }
  function getEffectiveFirebaseWebApiKey() {
    const env = cached.activeEnv;
    const trimmed = cached.overrides[env].firebaseWebApiKey.trim();
    if (trimmed) return trimmed;
    return buildDefaultForEnv(env).firebaseWebApiKey.trim();
  }
  function getEffectiveGoogleOAuthClientId() {
    const env = cached.activeEnv;
    const trimmed = cached.overrides[env].googleOAuthClientId.trim();
    if (trimmed) return trimmed;
    return buildDefaultForEnv(env).googleOAuthClientId.trim();
  }
  function getOverrideFieldsForActiveEnv() {
    return { ...cached.overrides[cached.activeEnv] };
  }
  function updateOverridesForActiveEnv(patch) {
    cached = {
      ...cached,
      overrides: {
        ...cached.overrides,
        [cached.activeEnv]: { ...patch }
      }
    };
  }
  function snapshotRuntimeEnvSettings() {
    return {
      version: 1,
      activeEnv: cached.activeEnv,
      overrides: {
        staging: { ...cached.overrides.staging },
        production: { ...cached.overrides.production }
      }
    };
  }
  function runtimeEnvSettingsToJson() {
    return JSON.stringify(snapshotRuntimeEnvSettings());
  }

  // src/panel/api-extraction.ts
  function normalizeCurlSmartQuotes(text) {
    return text.replace(/\u2018/g, "'").replace(/\u2019/g, "'").replace(/\u201a/g, "'").replace(/\u201b/g, "'").replace(/\u201c/g, '"').replace(/\u201d/g, '"').replace(/\u201e/g, '"').replace(/\u2032/g, "'").replace(/\uff07/g, "'").replace(/\uff02/g, '"').replace(/\u00a0/g, " ");
  }
  function inferParamEntries(path, body) {
    const map = /* @__PURE__ */ new Map();
    try {
      const qIdx = path.indexOf("?");
      if (qIdx >= 0) {
        new URLSearchParams(path.slice(qIdx + 1)).forEach((v, k) => {
          map.set(k, v);
        });
      }
    } catch {
    }
    if (body.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(body);
        Object.entries(parsed).forEach(([k, v]) => {
          if (map.has(k)) return;
          if (typeof v === "string") map.set(k, v);
          else if (typeof v === "number" || typeof v === "boolean") map.set(k, String(v));
          else map.set(k, "");
        });
      } catch {
      }
    }
    return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
  }
  function looksLikeCurlUrlCandidate(s) {
    const t = s.trim();
    if (!t) return false;
    if (/^\s*\{[^{]/.test(t)) return false;
    if (/^\s*\[\s*['"{[]/.test(t) || /^\s*\[\s*\]/.test(t)) return false;
    if (/^[A-Za-z0-9._-]+\s*:\s*\S/.test(t)) return false;
    if (/^[a-z][a-z0-9+.-]*\/[a-z0-9+._-]+$/i.test(t)) return false;
    if (/^https?:\/\//i.test(t)) return true;
    if (t.includes("{{") && t.includes("/")) return true;
    if (t.startsWith("/")) return true;
    if (/[/]/.test(t) && t.length >= 2) return true;
    return false;
  }
  function extractCurlUrl(text) {
    const normalized = text.replace(/\\\r?\n/g, " ").replace(/\r/g, " ").trim();
    let m = normalized.match(/--(?:location|url)\s+['"](https?:\/\/[^'"]+)['"]/i);
    if (m?.[1]) return m[1].trim();
    m = normalized.match(/(?:^|\s)-L\s+['"](https?:\/\/[^'"]+)['"]/i);
    if (m?.[1]) return m[1].trim();
    m = normalized.match(/--request\s+[A-Za-z]+\s+'([^']*)'/i);
    if (m?.[1] && looksLikeCurlUrlCandidate(m[1])) return m[1].trim();
    m = normalized.match(/--request\s+[A-Za-z]+\s+"((?:[^"\\\\]|\\\\.)*)"/i);
    if (m?.[1] && looksLikeCurlUrlCandidate(m[1])) return m[1].replace(/\\"/g, '"').trim();
    m = normalized.match(/(?:^|\s)-X\s+[A-Za-z]+\s+'([^']*)'/i);
    if (m?.[1] && looksLikeCurlUrlCandidate(m[1])) return m[1].trim();
    m = normalized.match(/(?:^|\s)-X\s+[A-Za-z]+\s+"((?:[^"\\\\]|\\\\.)*)"/i);
    if (m?.[1] && looksLikeCurlUrlCandidate(m[1])) return m[1].replace(/\\"/g, '"').trim();
    m = normalized.match(/--url\s+'([^']*)'/i);
    if (m?.[1] && looksLikeCurlUrlCandidate(m[1])) return m[1].trim();
    m = normalized.match(/--url\s+"((?:[^"\\\\]|\\\\.)*)"/i);
    if (m?.[1] && looksLikeCurlUrlCandidate(m[1])) return m[1].replace(/\\"/g, '"').trim();
    const quotedHttp = [...normalized.matchAll(/['"](https?:\/\/[^'"]+)['"]/g)];
    if (quotedHttp.length > 0) return quotedHttp[0][1].trim();
    m = normalized.match(/curl(?:\s+[^\s]+)*\s+(https?:\/\/[^\s'"]+)/i);
    if (m?.[1]) return m[1].trim();
    const sq = /'([^']*)'/g;
    let sm;
    while ((sm = sq.exec(normalized)) !== null) {
      const inner = sm[1]?.trim() ?? "";
      if (looksLikeCurlUrlCandidate(inner)) return inner;
    }
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
        const sp = new URLSearchParams(path.slice(qIdx + 1));
        const qKeys = [];
        sp.forEach((_v, k) => {
          qKeys.push(k);
        });
        fromQuery = Array.from(new Set(qKeys));
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
    const flags = ["--data-raw", "--data-binary", "--data", "-d"];
    for (const flag of flags) {
      const escaped = flag.replace(/-/g, "\\-");
      const tries = [
        { re: new RegExp(`${escaped}\\s+'([^']*)'`), unescapeDouble: false },
        { re: new RegExp(`${escaped}\\s+"((?:[^"\\\\]|\\\\.)*)"`), unescapeDouble: true },
        { re: new RegExp(`${escaped}\\s*=\\s*'([^']*)'`), unescapeDouble: false },
        { re: new RegExp(`${escaped}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`), unescapeDouble: true }
      ];
      for (const { re, unescapeDouble } of tries) {
        const m = normalized.match(re);
        if (m?.[1] != null) {
          let s = m[1];
          if (unescapeDouble) s = s.replace(/\\"/g, '"');
          return s;
        }
      }
    }
    return "";
  }
  function parseCurlCommand(curlText) {
    const text = normalizeCurlSmartQuotes(curlText.trim());
    if (!/^curl\b/i.test(text)) return null;
    const normalized = text.replace(/\\\r?\n/g, " ").replace(/\r/g, " ");
    const methodMatch = normalized.match(/(?:\s|^)-X\s+([A-Z]+)(?=\s|$)/i) || normalized.match(/(?:\s|^)--request\s+([A-Z]+)(?=\s|$)/i);
    const method = (methodMatch?.[1] || "").toUpperCase();
    const rawUrl = extractCurlUrl(normalized);
    if (!rawUrl) return null;
    const headers = parseCurlHeadersBlock(normalized);
    const body = extractCurlBody(normalized);
    const bearerRaw = headers.Authorization || headers.authorization || "";
    const bearerToken = /^Bearer\s+/i.test(bearerRaw) ? bearerRaw.replace(/^Bearer\s+/i, "").trim() : "";
    const inferredMethod = method || (body ? "POST" : "GET");
    return {
      method: inferredMethod,
      url: rawUrl,
      headers,
      body,
      bearerToken
    };
  }
  function collectCurlSnippetsFromText(text) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    const add = (raw) => {
      const t = raw.trim();
      if (t.length < 10 || !/^curl\b/i.test(t)) return;
      if (!parseCurlCommand(t)) return;
      if (seen.has(t)) return;
      seen.add(t);
      out.push(t);
    };
    for (const m of text.matchAll(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g)) {
      const inner = m[1] ?? "";
      for (const piece of inner.split(/(?=^\s*curl\s)/im)) {
        if (/^\s*curl\s/im.test(piece)) add(piece);
      }
    }
    const unfenced = text.replace(/```[\s\S]*?```/g, "\n");
    let search = 0;
    while (search < unfenced.length) {
      const tail = unfenced.slice(search);
      const rel = tail.search(/\bcurl\s/i);
      if (rel < 0) break;
      const idx = search + rel;
      const atLineStart = idx === 0 || unfenced[idx - 1] === "\n";
      if (!atLineStart) {
        search = idx + 4;
        continue;
      }
      const rest = unfenced.slice(idx + 4);
      const nextRel = rest.search(/\n\s*curl\s/i);
      const end = nextRel < 0 ? unfenced.length : idx + 4 + nextRel;
      add(unfenced.slice(idx, end));
      search = end;
    }
    return out;
  }
  function apiSpecFromParsedCurl(p) {
    const path = p.url.trim();
    const headers = {};
    for (const [k, v] of Object.entries(p.headers)) {
      if (k.toLowerCase() === "authorization") continue;
      headers[k] = v;
    }
    return {
      api: path,
      path,
      method: p.method,
      headers,
      bodyTemplate: p.body.trim() ? p.body : void 0,
      bearerToken: p.bearerToken || void 0,
      purpose: "\u5F9E\u5C0D\u8A71\u4E2D\u7684 curl \u5075\u6E2C",
      params: inferParamsFromPathAndBody(path, p.body)
    };
  }
  function preferRicherPath(a, b) {
    const x = (a ?? "").trim();
    const y = (b ?? "").trim();
    if (!x) return y || void 0;
    if (!y) return x || void 0;
    if (/^https?:\/\//i.test(x) && !/^https?:\/\//i.test(y)) return x;
    if (/^https?:\/\//i.test(y) && !/^https?:\/\//i.test(x)) return y;
    return x.length >= y.length ? x : y;
  }
  function endpointKey(raw) {
    const t = raw.trim();
    if (!t) return "";
    try {
      if (/^https?:\/\//i.test(t)) {
        const u = new URL(t);
        return (u.pathname.replace(/\/+$/, "") || "/") + u.search;
      }
    } catch {
    }
    return t.replace(/^\/+/, "");
  }
  function pathTail2(pathKey) {
    return pathKey.split("/").filter(Boolean).slice(-2).join("/");
  }
  function findExistingMergeKey(map, next) {
    const nk = endpointKey(next.path || next.api);
    const nTail = pathTail2(nk);
    if (!nTail) return void 0;
    for (const [mapKey, spec] of map) {
      const ek = endpointKey(spec.path || spec.api);
      if (pathTail2(ek) === nTail) return mapKey;
    }
    return void 0;
  }
  function extractApiCandidatesFromText(text) {
    const specs = /* @__PURE__ */ new Map();
    const upsert = (next) => {
      const rawKey = (next.path || next.api).trim();
      if (!rawKey) return;
      const existingKey = findExistingMergeKey(specs, next);
      const nk = endpointKey(rawKey);
      const key = existingKey ?? (nk || rawKey);
      const current = specs.get(key);
      if (!current) {
        specs.set(key, {
          ...next,
          params: [...new Set(next.params.map((p) => p.trim()).filter(Boolean))]
        });
        return;
      }
      const mergedParams = Array.from(new Set([...current.params, ...next.params].map((p) => p.trim()).filter(Boolean)));
      const mergedPath = preferRicherPath(current.path, next.path);
      const mergedApi = preferRicherPath(current.api, next.api);
      specs.set(key, {
        ...current,
        ...next,
        api: mergedApi || current.api || next.api,
        path: mergedPath || current.path || next.path,
        requestName: current.requestName || next.requestName,
        method: next.method || current.method,
        bodyTemplate: next.bodyTemplate || current.bodyTemplate,
        headers: { ...current.headers || {}, ...next.headers || {} },
        purpose: current.purpose !== "\u5F85\u88DC\u5145\u76EE\u7684" ? current.purpose : next.purpose,
        params: mergedParams
      });
    };
    for (const snippet of collectCurlSnippetsFromText(text)) {
      const parsed = parseCurlCommand(snippet);
      if (parsed) upsert(apiSpecFromParsedCurl(parsed));
    }
    return Array.from(specs.values()).slice(0, 20);
  }

  // src/messages.ts
  var CLOSE_HELLO_DOCK = "CLOSE_HELLO_DOCK";
  var PANEL_TO_HOST_SOURCE = "personalExtDockPanel";

  // src/panel.ts
  function isEmailDomainRestrictionActive() {
    return ALLOWED_GOOGLE_EMAIL_SUFFIX.trim().length > 0;
  }
  function isAllowedAiiiEmail(email) {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) return false;
    if (!isEmailDomainRestrictionActive()) return true;
    return normalized.endsWith(ALLOWED_GOOGLE_EMAIL_SUFFIX.trim().toLowerCase());
  }
  var toastStatusEl = document.getElementById("toastStatus");
  var toggleChatButton = document.getElementById("toggleChat");
  var chatPanelEl = document.getElementById("chatPanel");
  var chatMessagesEl = document.getElementById("chatMessages");
  var chatFormEl = document.getElementById("chatForm");
  var chatInputEl = document.getElementById("chatInput");
  var sendMessageButton = document.getElementById("sendMessage");
  var clearChatButton = document.getElementById("clearChat");
  var authStatusEl = document.getElementById("authStatus");
  var authorizeGoogleButton = document.getElementById("authorizeGoogle");
  var closeDockButton = document.getElementById("closeDock");
  var dockShellDragGripEl = document.getElementById("dockShellDragGrip");
  var minimizeDockButton = document.getElementById("minimizeDock");
  var openPanelSettingsButton = document.getElementById("openPanelSettings");
  var panelSettingsOverlayEl = document.getElementById("panelSettingsOverlay");
  var closePanelSettingsButton = document.getElementById("closePanelSettings");
  var envToggleStagingButton = document.getElementById("envToggleStaging");
  var envToggleProductionButton = document.getElementById("envToggleProduction");
  var envEffectiveSummaryEl = document.getElementById("envEffectiveSummary");
  var settingsFirebaseWebApiKeyEl = document.getElementById("settingsFirebaseWebApiKey");
  var settingsGoogleOAuthClientIdEl = document.getElementById("settingsGoogleOAuthClientId");
  var saveEnvOverridesButton = document.getElementById("saveEnvOverridesButton");
  var clearEnvOverridesButton = document.getElementById("clearEnvOverridesButton");
  var oauthInfoEl = document.getElementById("oauthInfo");
  var toggleWorkflowsButton = document.getElementById("toggleWorkflows");
  var workflowPanelEl = document.getElementById("workflowPanel");
  var toggleCurlParserButton = document.getElementById("toggleCurlParser");
  var curlParserPanelEl = document.getElementById("curlParserPanel");
  var toggleManualApiButton = document.getElementById("toggleManualApi");
  var manualApiPanelEl = document.getElementById("manualApiPanel");
  var apiCandidatesEl = document.getElementById("apiCandidates");
  var manualApiNameEl = document.getElementById("manualApiName");
  var manualApiPathEl = document.getElementById("manualApiPath");
  var manualApiPurposeEl = document.getElementById("manualApiPurpose");
  var manualApiCurlEl = document.getElementById("manualApiCurl");
  var parseCurlButton = document.getElementById("parseCurl");
  var manualApiMethodEl = document.getElementById("manualApiMethod");
  var manualApiParamsRowsEl = document.getElementById("manualApiParamsRows");
  var addParamRowButton = document.getElementById("addParamRow");
  var manualApiHeadersRowsEl = document.getElementById("manualApiHeadersRows");
  var addHeaderRowButton = document.getElementById("addHeaderRow");
  var manualApiBodyEl = document.getElementById("manualApiBody");
  var addManualApiButton = document.getElementById("addManualApi");
  var manualApiActionsEl = document.getElementById("manualApiActions");
  var clearManualApiButton = document.getElementById("clearManualApi");
  var apiDetailNameEl = document.getElementById("apiDetailName");
  var apiDetailPurposeEl = document.getElementById("apiDetailPurpose");
  var apiDetailParamsEl = document.getElementById("apiDetailParams");
  var cancelApiDetailButton = document.getElementById("cancelApiDetail");
  var apiDetailActionsEl = document.getElementById("apiDetailActions");
  var addStepButton = document.getElementById("addStep");
  var saveDetailApiButton = document.getElementById("saveDetailApi");
  var updateDetailApiButton = document.getElementById("updateDetailApi");
  var draftStepsEl = document.getElementById("draftSteps");
  var runWorkflowButton = document.getElementById("runWorkflow");
  var saveWorkflowButton = document.getElementById("saveWorkflow");
  var clearDraftButton = document.getElementById("clearDraft");
  var draftWorkflowNameInputEl = document.getElementById("draftWorkflowName");
  var savedWorkflowsEl = document.getElementById("savedWorkflows");
  var toggleSavedApisButton = document.getElementById("toggleSavedApis");
  var savedApisPanelEl = document.getElementById("savedApisPanel");
  var savedApisListEl = document.getElementById("savedApisList");
  var toggleSavedWorkflowsButton = document.getElementById("toggleSavedWorkflows");
  var savedWorkflowsPanelEl = document.getElementById("savedWorkflowsPanel");
  var toggleExecutionResultButton = document.getElementById("toggleExecutionResult");
  var executionResultPanelEl = document.getElementById("executionResultPanel");
  var executionResultListEl = document.getElementById("executionResultList");
  var clearExecutionResultButton = document.getElementById("clearExecutionResult");
  var panelBodyEl = document.querySelector(".panel-body");
  var backendApiHintEl = document.getElementById("backendApiHint");
  var exportDraftWorkflowJsonButton = document.getElementById("exportDraftWorkflowJson");
  var copyDraftWorkflowJsonButton = document.getElementById("copyDraftWorkflowJson");
  var importWorkflowJsonInputEl = document.getElementById("importWorkflowJsonInput");
  var importWorkflowToDraftButton = document.getElementById("importWorkflowToDraft");
  var execResults = [];
  var messages = [];
  var streamingAssistantIndex = null;
  var streamJustFinishedIndex = null;
  var streamJustFinishedClearTimer = null;
  function clearStreamJustFinishedTimer() {
    if (streamJustFinishedClearTimer !== null) {
      clearTimeout(streamJustFinishedClearTimer);
      streamJustFinishedClearTimer = null;
    }
  }
  var persistenceReady = false;
  var isAuthorized = false;
  var firebaseIdToken = "";
  var googleAccessToken = "";
  var authExpiresAt = 0;
  var accountEmail = "";
  var chatSessionId = globalThis.crypto?.randomUUID?.() || `session-${Date.now()}`;
  var apiCandidates = [];
  var customApiSpecs = [];
  var savedWorkflows = [];
  var draftSteps = [];
  var selectedApiIndex = -1;
  var pinnedDetailSpec = null;
  var pinnedSavedApiIndex = -1;
  var chatPanelOpen = true;
  var workflowPanelOpen = true;
  var curlParserOpen = false;
  var manualApiOpen = false;
  var savedWorkflowsOpen = false;
  var savedApisOpen = false;
  var editedDetailSpec = null;
  var editingStepIndex = -1;
  var editingApiIndex = -1;
  var currentWorkflowName = "";
  var draftNameFromImport = false;
  var lastBackendApiAuthHint = null;
  var fallbackStorage = /* @__PURE__ */ new Map();
  var extensionChrome = typeof chrome !== "undefined" ? chrome : void 0;
  function isAuthStateValid(state) {
    return Boolean(
      state.firebaseIdToken && state.googleAccessToken && state.expiresAt && Number.isFinite(state.expiresAt) && Date.now() < state.expiresAt
    );
  }
  function getCurrentAuthState() {
    if (!firebaseIdToken || !googleAccessToken || !authExpiresAt || Date.now() >= authExpiresAt) return null;
    return {
      firebaseIdToken,
      googleAccessToken,
      expiresAt: authExpiresAt,
      accountEmail
    };
  }
  function isAuthExpired() {
    if (!isAuthorized || !firebaseIdToken) return true;
    if (authExpiresAt > 0 && Date.now() >= authExpiresAt) return true;
    return false;
  }
  function canUseAuthenticatedFeatures() {
    return Boolean(
      isAuthorized && firebaseIdToken && authExpiresAt > 0 && Date.now() < authExpiresAt && isAllowedAiiiEmail(accountEmail)
    );
  }
  function updateBackendApiHintDisplay() {
    if (!backendApiHintEl) return;
    if (lastBackendApiAuthHint) {
      backendApiHintEl.textContent = lastBackendApiAuthHint;
      backendApiHintEl.classList.remove("hidden");
    } else {
      backendApiHintEl.textContent = "";
      backendApiHintEl.classList.add("hidden");
    }
  }
  function clearBackendApiAuthHint() {
    lastBackendApiAuthHint = null;
    updateBackendApiHintDisplay();
  }
  function reportBackendApiAuthRejection(httpStatus) {
    lastBackendApiAuthHint = `\u5F8C\u7AEF\u56DE\u50B3 HTTP ${httpStatus}\uFF08\u8207 Google \u6388\u6B0A\u72C0\u614B\u5206\u958B\uFF09\u3002\u767B\u5165\u4ECD\u6709\u6548\uFF1B\u8ACB\u78BA\u8A8D\u5F8C\u7AEF\u6B0A\u9650\u6216\u7A0D\u5F8C\u91CD\u8A66\u3002`;
    updateBackendApiHintDisplay();
    setToast(
      `\u5F8C\u7AEF\u62D2\u7D55\u8ACB\u6C42\uFF08${httpStatus}\uFF09\u3002\u672A\u6E05\u9664 Google \u6388\u6B0A\uFF0C\u8ACB\u78BA\u8A8D\u6B0A\u9650\u6216\u7A0D\u5F8C\u91CD\u8A66\u3002`,
      "error",
      7e3
    );
  }
  function syncPanelBodyAuthLock() {
    const locked = !canUseAuthenticatedFeatures();
    if (panelBodyEl) panelBodyEl.classList.toggle("panel-body--auth-locked", locked);
  }
  function clearAuthStateInMemory() {
    isAuthorized = false;
    firebaseIdToken = "";
    googleAccessToken = "";
    authExpiresAt = 0;
    accountEmail = "";
    clearBackendApiAuthHint();
    syncPanelBodyAuthLock();
  }
  function notifyAuthExpired() {
    clearAuthStateInMemory();
    setChatEnabled(false);
    const msg = "\u6388\u6B0A\u5DF2\u5931\u6548\uFF0C\u8ACB\u91CD\u65B0\u9EDE\u64CA\u300CGoogle \u6388\u6B0A\u300D\u767B\u5165\u3002";
    setAuthStatus(msg, "error");
    setToast(msg, "error", 5e3);
    authorizeGoogleButton.classList.add("auth-expired-pulse");
  }
  function setAuthStatus(text, status = "normal") {
    authStatusEl.textContent = text;
    authStatusEl.classList.remove("ok", "error");
    if (status !== "normal") authStatusEl.classList.add(status);
  }
  var toastTimer = null;
  function copyToClipboard(text, btn) {
    const succeed = () => {
      btn.textContent = "\u5DF2\u8907\u88FD \u2713";
      setTimeout(() => {
        btn.textContent = "\u8907\u88FD";
      }, 1500);
    };
    const fail = () => setToast("\u8907\u88FD\u5931\u6557\uFF0C\u8ACB\u624B\u52D5\u9078\u53D6\u6587\u5B57\u3002", "error");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(succeed).catch(() => {
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
  function bindChatMarkdownCopyOnce() {
    const g = globalThis;
    if (g.__personalExtMdCopy) return;
    g.__personalExtMdCopy = true;
    chatMessagesEl.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button.md-code-copy");
      if (!btn || !chatMessagesEl.contains(btn)) return;
      const id = btn.getAttribute("data-copy");
      const el = id ? document.getElementById(id) : null;
      const txt = el?.textContent ?? "";
      if (!txt.trim()) {
        setToast("\u6B64\u5340\u584A\u6C92\u6709\u53EF\u8907\u88FD\u6587\u5B57", "error");
        return;
      }
      void navigator.clipboard.writeText(txt).then(
        () => setToast("\u5DF2\u8907\u88FD\u5230\u526A\u8CBC\u7C3F", "ok", 2200),
        () => setToast("\u8907\u88FD\u5931\u6557\uFF0C\u8ACB\u624B\u52D5\u9078\u53D6\u5167\u5BB9", "error")
      );
    });
  }
  function setOAuthInfo(text) {
    oauthInfoEl.textContent = text;
  }
  function updateWorkflowToggleLabel() {
    toggleWorkflowsButton.textContent = workflowPanelOpen ? "\u5E38\u7528\u5DE5\u4F5C\u6D41\u7A0B \u25BE" : "\u5E38\u7528\u5DE5\u4F5C\u6D41\u7A0B \u25B8";
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
    toggleSavedWorkflowsButton.textContent = open ? "\u5DF2\u5132\u5B58\u6D41\u7A0B \u25BE" : "\u5DF2\u5132\u5B58\u6D41\u7A0B \u25B8";
  }
  function setSavedApisOpen(open) {
    savedApisOpen = open;
    savedApisPanelEl.classList.toggle("collapsed", !open);
    toggleSavedApisButton.textContent = open ? "\u5DF2\u5132\u5B58\u7684 API \u25BE" : "\u5DF2\u5132\u5B58\u7684 API \u25B8";
  }
  function setChatPanelOpen(open) {
    chatPanelOpen = open;
    chatPanelEl.classList.toggle("collapsed", !open);
    toggleChatButton.textContent = open ? "AI \u5C0F\u5E6B\u624B \u25BE" : "AI \u5C0F\u5E6B\u624B \u25B8";
    chatPanelEl.closest("section.chat-section")?.classList.toggle("is-section-collapsed", !open);
  }
  function setWorkflowPanelOpen(open) {
    workflowPanelOpen = open;
    workflowPanelEl.classList.toggle("collapsed", !open);
    updateWorkflowToggleLabel();
    workflowPanelEl.closest("section.workflow-section")?.classList.toggle("is-section-collapsed", !open);
  }
  function setChatEnabled(enabled) {
    chatInputEl.disabled = !enabled;
    sendMessageButton.disabled = !enabled;
    chatInputEl.placeholder = enabled ? "\u4F8B\u5982\uFF1A\u696D\u52D9\u96E2\u8077\u4E86\uFF0C\u6211\u8981\u79FB\u9664\u4ED6\u7684 sales \u8207 lineUser \u8EAB\u4EFD" : "\u8ACB\u5148\u5B8C\u6210 Google \u6388\u6B0A\u5F8C\uFF0C\u624D\u53EF\u4F7F\u7528\u5C0D\u8A71\u7A97";
    syncPanelBodyAuthLock();
  }
  function buildMessageWithSkillDirective(rawMessage, useSkill) {
    if (!useSkill) return rawMessage;
    return `${rawMessage}

[\u7CFB\u7D71\u6307\u4EE4]
\u82E5\u4F60\u5224\u65B7\u6709\u53EF\u7528 skill \u6216\u5DE5\u5177\uFF0C\u8ACB\u512A\u5148\u4F7F\u7528 skill \u4F86\u56DE\u7B54\uFF0C\u4E26\u5728\u56DE\u8986\u958B\u982D\u7C21\u77ED\u8AAA\u660E\u300C\u5DF2\u4F7F\u7528\u7684 skill \u8207\u539F\u56E0\u300D\u3002
\u82E5\u7121\u5408\u9069 skill\uFF0C\u8ACB\u660E\u78BA\u8AAA\u660E\u300C\u672C\u6B21\u4E0D\u4F7F\u7528 skill\u300D\u4E26\u76F4\u63A5\u7D66\u4E00\u822C\u56DE\u7B54\u3002`;
  }
  var HEADER_KEY_CUSTOM = "__custom__";
  var HEADER_KEY_PRESETS = [
    "Authorization",
    "Content-Type",
    "Accept",
    "Accept-Language",
    "x-api-key",
    "X-API-Key",
    "User-Agent",
    "X-Request-Id",
    "Cookie"
  ];
  var MANUAL_API_PARAM_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  var MANUAL_HTTP_HEADER_NAME_RE = /^[-0-9A-Za-z!#$%&'*+.^_`|~]+$/;
  function isManualApiPathWellFormed(path) {
    const t = path.trim();
    if (!t) return false;
    try {
      const u = new URL(t);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }
  function isManualApiBodyWellFormed(body) {
    const t = body.trim();
    if (!t) return true;
    try {
      JSON.parse(body);
      return true;
    } catch {
      return false;
    }
  }
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
  function appendManualParamRow(key = "", value = "") {
    const row = document.createElement("div");
    row.className = "header-row";
    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = "header-value";
    keyInput.placeholder = "Param key";
    keyInput.value = key;
    const valInput = document.createElement("input");
    valInput.type = "text";
    valInput.className = "header-value";
    valInput.placeholder = "Value\uFF08\u53EF\u7A7A\uFF09";
    valInput.value = value;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "header-remove";
    removeBtn.textContent = "\u79FB\u9664";
    removeBtn.addEventListener("click", () => {
      row.remove();
      if (!manualApiParamsRowsEl.querySelector(".header-row")) appendManualParamRow();
    });
    row.appendChild(keyInput);
    row.appendChild(valInput);
    row.appendChild(removeBtn);
    manualApiParamsRowsEl.appendChild(row);
  }
  function renderManualParamsRows(params) {
    manualApiParamsRowsEl.replaceChildren();
    const clean = params.filter((p) => p.key.trim());
    if (!clean.length) {
      appendManualParamRow();
      return;
    }
    clean.forEach((p) => appendManualParamRow(p.key, p.value));
  }
  function collectManualParams() {
    const keys = [];
    manualApiParamsRowsEl.querySelectorAll(".header-row").forEach((node) => {
      const row = node;
      const inputs = row.querySelectorAll("input");
      const key = inputs[0]?.value.trim() ?? "";
      if (key) keys.push(key);
    });
    return Array.from(new Set(keys));
  }
  function getAllApiCandidates() {
    return [...apiCandidates];
  }
  function refreshApiDetailActions(spec) {
    const hasSpec = !!spec;
    const savedIndex = pinnedSavedApiIndex;
    addStepButton.disabled = !hasSpec;
    saveDetailApiButton.disabled = !hasSpec;
    updateDetailApiButton.disabled = !hasSpec || savedIndex < 0;
    updateDetailApiButton.style.display = savedIndex >= 0 ? "block" : "none";
    apiDetailActionsEl.classList.toggle("hidden", !hasSpec);
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
  function resetApiDetail() {
    apiDetailNameEl.textContent = "\u5C1A\u672A\u9078\u64C7 API";
    apiDetailPurposeEl.replaceChildren();
    apiDetailParamsEl.replaceChildren();
    addStepButton.textContent = "\u52A0\u5165\u6D41\u7A0B\u6B65\u9A5F";
    addStepButton.classList.remove("updating");
    editedDetailSpec = null;
    editingStepIndex = -1;
    refreshApiDetailActions(null);
    renderDraftSteps();
  }
  function renderApiDetail(spec) {
    if (!spec) {
      resetApiDetail();
      return;
    }
    editedDetailSpec = { ...spec, params: [...spec.params ?? []], headers: { ...spec.headers ?? {} } };
    apiDetailNameEl.textContent = spec.requestName ?? spec.api;
    apiDetailPurposeEl.replaceChildren();
    const nameWrap = document.createElement("div");
    nameWrap.className = "api-detail-purpose-edit";
    const nameLabel = document.createElement("label");
    nameLabel.className = "api-detail-purpose-label";
    nameLabel.setAttribute("for", "apiDetailNameInput");
    nameLabel.textContent = "API \u540D\u7A31";
    const nameInput = document.createElement("input");
    nameInput.id = "apiDetailNameInput";
    nameInput.type = "text";
    nameInput.className = "api-detail-purpose-input";
    nameInput.placeholder = "\u986F\u793A\u540D\u7A31\uFF08\u4F8B\u5982\uFF1AMedSalesRollbackRequest\uFF09";
    nameInput.value = (spec.requestName ?? spec.api ?? "").trim();
    nameInput.autocomplete = "off";
    nameInput.addEventListener("input", () => {
      if (!editedDetailSpec) return;
      const nextName = nameInput.value.trim();
      editedDetailSpec.requestName = nextName || void 0;
      apiDetailNameEl.textContent = nextName || editedDetailSpec.api || "\u5C1A\u672A\u547D\u540D API";
    });
    nameWrap.appendChild(nameLabel);
    nameWrap.appendChild(nameInput);
    apiDetailPurposeEl.appendChild(nameWrap);
    const purposeWrap = document.createElement("div");
    purposeWrap.className = "api-detail-purpose-edit";
    const purposeLabel = document.createElement("label");
    purposeLabel.className = "api-detail-purpose-label";
    purposeLabel.setAttribute("for", "apiDetailPurposeInput");
    purposeLabel.textContent = "\u7528\u9014";
    const purposeInput = document.createElement("input");
    purposeInput.id = "apiDetailPurposeInput";
    purposeInput.type = "text";
    purposeInput.className = "api-detail-purpose-input";
    purposeInput.placeholder = "\u7C21\u77ED\u8AAA\u660E\u6B64 API \u7684\u7528\u9014\uFF08\u53EF\u9078\uFF09";
    purposeInput.value = (spec.purpose ?? "").trim();
    purposeInput.autocomplete = "off";
    purposeInput.addEventListener("input", () => {
      if (editedDetailSpec) editedDetailSpec.purpose = purposeInput.value;
    });
    purposeWrap.appendChild(purposeLabel);
    purposeWrap.appendChild(purposeInput);
    apiDetailPurposeEl.appendChild(purposeWrap);
    const container = document.createDocumentFragment();
    const requestCard = document.createElement("div");
    requestCard.className = "api-detail-request-card";
    const rqTitle = document.createElement("div");
    rqTitle.className = "api-detail-request-title";
    rqTitle.textContent = "\u9023\u7DDA\u8207\u7AEF\u9EDE";
    requestCard.appendChild(rqTitle);
    const initialTarget = (spec.path ?? spec.api ?? "").trim();
    const pathSplit = splitRequestTargetForEditor(initialTarget);
    const methodRow = document.createElement("div");
    methodRow.className = "api-detail-request-row";
    const methodLabel = document.createElement("label");
    methodLabel.className = "api-detail-purpose-label";
    methodLabel.setAttribute("for", "apiDetailMethodSelect");
    methodLabel.textContent = "HTTP \u65B9\u6CD5";
    const methodSelect = document.createElement("select");
    methodSelect.id = "apiDetailMethodSelect";
    methodSelect.className = "api-detail-method-select";
    const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
    const methodUpper = (spec.method || "GET").toUpperCase();
    allowedMethods.forEach((m) => {
      const o = document.createElement("option");
      o.value = m;
      o.textContent = m;
      methodSelect.appendChild(o);
    });
    if (!allowedMethods.includes(methodUpper)) {
      const o = document.createElement("option");
      o.value = methodUpper;
      o.textContent = methodUpper;
      methodSelect.appendChild(o);
    }
    methodSelect.value = methodUpper;
    methodRow.appendChild(methodLabel);
    methodRow.appendChild(methodSelect);
    requestCard.appendChild(methodRow);
    const baseRow = document.createElement("div");
    baseRow.className = "api-detail-request-row";
    const baseLabel = document.createElement("label");
    baseLabel.className = "api-detail-purpose-label";
    baseLabel.setAttribute("for", "apiDetailBaseUrlInput");
    baseLabel.textContent = "\u7DB2\u57DF\uFF0F\u57FA\u5E95 URL";
    const baseInput = document.createElement("input");
    baseInput.id = "apiDetailBaseUrlInput";
    baseInput.type = "text";
    baseInput.className = "api-detail-purpose-input";
    baseInput.placeholder = "https://api.example.com\uFF08\u76F8\u5C0D\u8DEF\u5F91\u53EF\u7559\u7A7A\uFF09";
    baseInput.value = pathSplit.base;
    baseInput.autocomplete = "off";
    baseRow.appendChild(baseLabel);
    baseRow.appendChild(baseInput);
    requestCard.appendChild(baseRow);
    const pathRow = document.createElement("div");
    pathRow.className = "api-detail-request-row";
    const pathLabel = document.createElement("label");
    pathLabel.className = "api-detail-purpose-label";
    pathLabel.setAttribute("for", "apiDetailPathInput");
    pathLabel.textContent = "\u8DEF\u5F91\u8207\u67E5\u8A62";
    const pathInput = document.createElement("input");
    pathInput.id = "apiDetailPathInput";
    pathInput.type = "text";
    pathInput.className = "api-detail-purpose-input";
    pathInput.placeholder = "\u4F8B\u5982 /v1/foo\u3001siteId/med-sales \u6216 ?a=1&b=2";
    pathInput.value = pathSplit.pathAndQuery;
    pathInput.autocomplete = "off";
    pathRow.appendChild(pathLabel);
    pathRow.appendChild(pathInput);
    requestCard.appendChild(pathRow);
    const urlCode = document.createElement("code");
    urlCode.className = "detail-url-code detail-url-code--preview";
    const refreshRequestPreview = () => {
      if (!editedDetailSpec) return;
      editedDetailSpec.method = methodSelect.value;
      const joined = joinRequestTargetFromEditor(baseInput.value, pathInput.value);
      editedDetailSpec.path = joined;
      urlCode.textContent = `${(methodSelect.value || "GET").toUpperCase()} ${joined || "-"}`;
    };
    methodSelect.addEventListener("change", refreshRequestPreview);
    baseInput.addEventListener("input", refreshRequestPreview);
    pathInput.addEventListener("input", refreshRequestPreview);
    refreshRequestPreview();
    const previewLabel = document.createElement("div");
    previewLabel.className = "api-detail-preview-label";
    previewLabel.textContent = "\u5BE6\u969B\u8ACB\u6C42\uFF08\u9810\u89BD\uFF09";
    requestCard.appendChild(previewLabel);
    requestCard.appendChild(urlCode);
    container.appendChild(requestCard);
    const urlParamObj = {};
    try {
      const { queryString: initialQs } = getPathNoQueryAndSearchFromCombined(initialTarget);
      new URLSearchParams(initialQs).forEach((v, k) => {
        if (k) urlParamObj[k] = v;
      });
    } catch {
    }
    const urlParamKeys = [...new Set(Object.keys(urlParamObj))];
    const urlParamsSec = buildDetailSection(`Params\uFF08URL \u67E5\u8A62\u53C3\u6578\uFF0C${urlParamKeys.length} \u500B\uFF09`, true);
    const urlParamsList = document.createElement("div");
    urlParamsList.className = "detail-edit-list";
    const rebuildUrlParams = () => {
      if (!editedDetailSpec) return;
      try {
        const combined = (editedDetailSpec.path ?? editedDetailSpec.api ?? "").trim();
        const { pathNoQuery, queryString } = getPathNoQueryAndSearchFromCombined(combined);
        const collected = {};
        try {
          new URLSearchParams(queryString).forEach((v, k) => {
            if (k) collected[k] = v;
          });
        } catch {
        }
        urlParamsList.querySelectorAll(".detail-edit-row").forEach((r) => {
          const key = r.querySelector(".detail-edit-key-input")?.value.trim() ?? "";
          const val = r.querySelector(".detail-edit-val-input")?.value ?? "";
          if (key && val) collected[key] = val;
        });
        const qs = new URLSearchParams(collected).toString();
        const newPath = qs ? `${pathNoQuery}?${qs}` : pathNoQuery;
        editedDetailSpec.path = newPath;
        editedDetailSpec.params = Array.from(/* @__PURE__ */ new Set([...editedDetailSpec.params ?? [], ...Object.keys(collected)]));
        urlCode.textContent = `${(methodSelect.value || editedDetailSpec.method || "GET").toString().toUpperCase()} ${newPath}`;
        const sp = splitRequestTargetForEditor(newPath);
        baseInput.value = sp.base;
        pathInput.value = sp.pathAndQuery;
      } catch {
      }
    };
    const addEditableUrlParamRow = (key, value) => {
      const row = document.createElement("div");
      row.className = "detail-edit-row";
      const keyInput = document.createElement("input");
      keyInput.type = "text";
      keyInput.className = "detail-edit-key-input detail-edit-input";
      keyInput.value = key;
      keyInput.placeholder = "Param key";
      const valInput = document.createElement("input");
      valInput.type = "text";
      valInput.className = "detail-edit-val-input detail-edit-input";
      valInput.value = value;
      valInput.placeholder = "value";
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "header-remove";
      removeBtn.textContent = "\u2715";
      removeBtn.addEventListener("click", () => {
        row.remove();
        rebuildUrlParams();
      });
      keyInput.addEventListener("input", rebuildUrlParams);
      valInput.addEventListener("input", rebuildUrlParams);
      row.appendChild(keyInput);
      row.appendChild(valInput);
      row.appendChild(removeBtn);
      urlParamsList.appendChild(row);
    };
    urlParamKeys.forEach((key) => addEditableUrlParamRow(key, urlParamObj[key] ?? ""));
    const addParamBtn = document.createElement("button");
    addParamBtn.type = "button";
    addParamBtn.className = "detail-add-row-btn";
    addParamBtn.textContent = "\uFF0B \u65B0\u589E Param";
    addParamBtn.addEventListener("click", () => addEditableUrlParamRow("", ""));
    urlParamsSec.body.appendChild(urlParamsList);
    urlParamsSec.body.appendChild(addParamBtn);
    container.appendChild(urlParamsSec.wrap);
    const visibleHeaders = Object.entries(spec.headers ?? {}).filter(([k]) => k.toLowerCase() !== "authorization");
    const headerSec = buildDetailSection(`Headers\uFF08${visibleHeaders.length} \u500B\uFF09`, visibleHeaders.length > 0);
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
    refreshApiDetailActions(spec);
  }
  function refreshApiCandidatesFromLatestAssistant() {
    const latestAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content.trim());
    apiCandidates = latestAssistant ? extractApiCandidatesFromText(latestAssistant.content) : [];
    selectedApiIndex = -1;
    pinnedDetailSpec = null;
    pinnedSavedApiIndex = -1;
    renderApiCandidates();
  }
  function isCustomSpec(spec) {
    const key = spec.path || spec.api;
    return customApiSpecs.some((c) => (c.path || c.api) === key);
  }
  function removeCustomSpec(spec) {
    const key = spec.path || spec.api;
    customApiSpecs = customApiSpecs.filter((c) => (c.path || c.api) !== key);
    const pinnedKey = pinnedDetailSpec ? pinnedDetailSpec.path || pinnedDetailSpec.api : "";
    if (pinnedKey && pinnedKey === key) {
      pinnedDetailSpec = null;
      pinnedSavedApiIndex = -1;
    }
  }
  function renderApiCandidates() {
    const allCandidates = getAllApiCandidates();
    apiCandidatesEl.replaceChildren();
    if (!allCandidates.length) {
      selectedApiIndex = -1;
      const empty = document.createElement("div");
      empty.className = "workflow-subtitle";
      empty.textContent = "\u5C1A\u672A\u5075\u6E2C\u5230 API\uFF0C\u53EF\u624B\u52D5\u65B0\u589E\u3002";
      apiCandidatesEl.appendChild(empty);
      renderApiDetail(pinnedDetailSpec || null);
      return;
    }
    if (selectedApiIndex >= allCandidates.length) {
      selectedApiIndex = allCandidates.length - 1;
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
        pinnedDetailSpec = null;
        pinnedSavedApiIndex = -1;
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
    const selectedSpec = selectedApiIndex >= 0 ? allCandidates[selectedApiIndex] || null : pinnedDetailSpec;
    renderApiDetail(selectedSpec || null);
  }
  function isSensitiveShareHeaderKey(key) {
    const k = key.trim().toLowerCase();
    if (k === "authorization" || k === "cookie") return true;
    if (k === "x-api-key" || k.endsWith("api-key")) return true;
    return false;
  }
  function sanitizeHeadersForShare(headers) {
    if (!headers) return {};
    const out = {};
    for (const [k, v] of Object.entries(headers)) {
      if (isSensitiveShareHeaderKey(k)) continue;
      out[k] = v;
    }
    return out;
  }
  function sanitizeStepForShare(step) {
    return {
      ...step,
      params: [...step.params ?? []],
      headers: sanitizeHeadersForShare(step.headers),
      bearerToken: ""
    };
  }
  function normalizeWorkflowRequestTarget(raw) {
    const t = raw.trim();
    if (!t) return "";
    if (/^https?:\/\//i.test(t)) {
      try {
        const u = new URL(t);
        const p = u.pathname.replace(/\/+$/, "") || "/";
        return p.toLowerCase();
      } catch {
        return t.toLowerCase();
      }
    }
    return t.replace(/^\/+/, "").replace(/\/+$/, "").toLowerCase();
  }
  function workflowStepSignature(step) {
    const method = (step.method || "GET").toUpperCase();
    const raw = step.path && step.path.trim() || (step.api || "").trim();
    return `${method}:${normalizeWorkflowRequestTarget(raw)}`;
  }
  function findSavedWorkflowWithSameSignature(steps) {
    if (!steps.length) return null;
    const sig = steps.map(workflowStepSignature).join("\n");
    for (const w of savedWorkflows) {
      if (!w.steps.length) continue;
      if (w.steps.map(workflowStepSignature).join("\n") === sig) return w;
    }
    return null;
  }
  function workflowStepsHaveAbsoluteUrl(steps) {
    return steps.some((s) => {
      const t = s.path && s.path.trim() || (s.api || "").trim();
      return /^https?:\/\//i.test(t);
    });
  }
  function buildWorkflowExportJson(workflowName, steps) {
    const envelope = {
      format: WORKFLOW_EXPORT_FORMAT,
      version: WORKFLOW_EXPORT_VERSION,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      workflow: {
        name: workflowName.trim() || "\u672A\u547D\u540D\u6D41\u7A0B",
        steps: steps.map(sanitizeStepForShare)
      }
    };
    return `${JSON.stringify(envelope, null, 2)}
`;
  }
  async function copyWorkflowJsonToClipboard(json) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
        return true;
      }
    } catch {
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = json;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
  function downloadWorkflowJsonFile(filename, json) {
    const safe = filename.replace(/[^\w\u4e00-\u9fff.-]+/g, "_").slice(0, 80) || "workflow";
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safe}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function parseWorkflowStepFromImport(raw) {
    if (!raw || typeof raw !== "object") return null;
    const o = raw;
    const apiRaw = typeof o.api === "string" ? o.api.trim() : "";
    const pathRaw = typeof o.path === "string" ? o.path.trim() : "";
    const target = pathRaw || apiRaw;
    if (!target) return null;
    const purpose = typeof o.purpose === "string" ? o.purpose.trim() : "\u532F\u5165\u6D41\u7A0B\u6B65\u9A5F";
    const params = Array.isArray(o.params) ? o.params.map((p) => String(p).trim()).filter(Boolean) : [];
    const methodRaw = typeof o.method === "string" ? o.method.trim().toUpperCase() : "";
    const method = methodRaw || "GET";
    let headers = {};
    if (o.headers && typeof o.headers === "object" && !Array.isArray(o.headers)) {
      for (const [k, v] of Object.entries(o.headers)) {
        if (typeof v === "string") headers[k] = v;
      }
    }
    headers = sanitizeHeadersForShare(headers);
    const bodyTemplate = typeof o.bodyTemplate === "string" ? o.bodyTemplate : "";
    const requestName = typeof o.requestName === "string" ? o.requestName.trim() : void 0;
    return {
      api: apiRaw || pathRaw,
      path: pathRaw || void 0,
      requestName,
      method: method || "GET",
      headers,
      bodyTemplate,
      bearerToken: "",
      purpose: purpose || "\u532F\u5165\u6D41\u7A0B\u6B65\u9A5F",
      params
    };
  }
  function parseWorkflowImportJson(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: "\u4E0D\u662F\u6709\u6548\u7684 JSON\u3002" };
    }
    if (!parsed || typeof parsed !== "object") {
      return { ok: false, error: "JSON \u6839\u7BC0\u9EDE\u5FC5\u9808\u70BA\u7269\u4EF6\u3002" };
    }
    const root = parsed;
    if (root.format !== WORKFLOW_EXPORT_FORMAT) {
      return { ok: false, error: `\u7F3A\u5C11\u6216\u7121\u6548\u7684 format\uFF08\u9808\u70BA\u300C${WORKFLOW_EXPORT_FORMAT}\u300D\uFF09\u3002` };
    }
    const version = typeof root.version === "number" ? root.version : Number(root.version);
    if (version !== WORKFLOW_EXPORT_VERSION) {
      return { ok: false, error: `\u4E0D\u652F\u63F4\u7684\u7248\u672C\uFF1A${String(root.version)}\uFF08\u76EE\u524D\u50C5\u652F\u63F4 ${WORKFLOW_EXPORT_VERSION}\uFF09\u3002` };
    }
    const wf = root.workflow;
    if (!wf || typeof wf !== "object") {
      return { ok: false, error: "\u7F3A\u5C11 workflow \u7269\u4EF6\u3002" };
    }
    const wfo = wf;
    const name = typeof wfo.name === "string" ? wfo.name.trim() : "";
    const stepsRaw = wfo.steps;
    if (!Array.isArray(stepsRaw) || !stepsRaw.length) {
      return { ok: false, error: "workflow.steps \u5FC5\u9808\u70BA\u975E\u7A7A\u9663\u5217\u3002" };
    }
    const steps = [];
    for (let i = 0; i < stepsRaw.length; i += 1) {
      const step = parseWorkflowStepFromImport(stepsRaw[i]);
      if (!step) return { ok: false, error: `\u7B2C ${i + 1} \u6B65\u683C\u5F0F\u4E0D\u6B63\u78BA\uFF08\u9700\u6709 path \u6216 api\uFF09\u3002` };
      steps.push(step);
    }
    return { ok: true, steps, name };
  }
  function defaultImportedWorkflowName(suggested) {
    const base = suggested.trim();
    if (base) return base;
    const ts = (/* @__PURE__ */ new Date()).toLocaleString("zh-Hant-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
    return `\u532F\u5165\u6D41\u7A0B ${ts}`;
  }
  function findSavedWorkflowWithDuplicateName(name) {
    const n = name.trim();
    if (!n) return null;
    return savedWorkflows.find((w) => w.name.trim() === n) ?? null;
  }
  function showWorkflowImportConfirmDialog(info) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "exec-confirm-overlay";
      const dialog = document.createElement("div");
      dialog.className = "exec-confirm-dialog";
      const titleEl = document.createElement("div");
      titleEl.className = "exec-confirm-title";
      titleEl.textContent = "\u532F\u5165\u6D41\u7A0B\u81F3\u8349\u7A3F";
      const intro = document.createElement("div");
      intro.className = "exec-confirm-subtitle";
      intro.textContent = `\u5C07\u8F09\u5165\u300C${info.draftName}\u300D\uFF0C\u5171 ${info.stepCount} \u500B\u6B65\u9A5F\uFF0C\u4E26\u8986\u5BEB\u76EE\u524D\u8349\u7A3F\u3002`;
      const showProminentAlerts = Boolean(info.duplicateName || info.similar);
      let alertBanner = null;
      if (showProminentAlerts) {
        alertBanner = document.createElement("div");
        alertBanner.className = "workflow-import-alert-banner";
        const bannerTitle = document.createElement("div");
        bannerTitle.className = "workflow-import-alert-title";
        bannerTitle.textContent = "\u8ACB\u7559\u610F\uFF1A\u8207\u73FE\u6709\u6D41\u7A0B\u91CD\u758A";
        alertBanner.appendChild(bannerTitle);
        if (info.duplicateName && info.similar && info.duplicateName.id === info.similar.id) {
          const row = document.createElement("div");
          row.className = "workflow-import-alert-item workflow-import-alert-item--both";
          row.textContent = `\u8207\u5DF2\u5132\u5B58\u6D41\u7A0B\u300C${info.similar.name}\u300D\u540C\u540D\uFF0C\u4E14\u6BCF\u6B65 HTTP \u65B9\u6CD5 + \u6B63\u898F\u5316\u8DEF\u5F91\u5E8F\u5217\u5B8C\u5168\u76F8\u540C\uFF0C\u6975\u53EF\u80FD\u70BA\u540C\u4E00\u689D\u6D41\u7A0B\u3002`;
          alertBanner.appendChild(row);
        } else {
          if (info.duplicateName) {
            const row = document.createElement("div");
            row.className = "workflow-import-alert-item workflow-import-alert-item--duplicate";
            row.textContent = `\u5DF2\u6709\u5DF2\u5132\u5B58\u6D41\u7A0B\u4F7F\u7528\u76F8\u540C\u540D\u7A31\u300C${info.draftName}\u300D\uFF08\u8207\u300C${info.duplicateName.name}\u300D\u540C\u540D\uFF09\uFF0C\u532F\u5165\u5F8C\u8349\u7A3F\u540D\u7A31\u4E5F\u6703\u76F8\u540C\uFF0C\u5EFA\u8B70\u532F\u5165\u5F8C\u6539\u540D\u518D\u5132\u5B58\u3002`;
            alertBanner.appendChild(row);
          }
          if (info.similar) {
            const row = document.createElement("div");
            row.className = "workflow-import-alert-item workflow-import-alert-item--similar";
            row.textContent = `\u6B65\u9A5F\u8DEF\u5F91\u8207\u300C${info.similar.name}\u300D\u5B8C\u5168\u76F8\u540C\uFF08\u6BCF\u6B65 HTTP \u65B9\u6CD5 + \u6B63\u898F\u5316\u8DEF\u5F91\u5E8F\u5217\u4E00\u81F4\uFF09\uFF0C\u53EF\u80FD\u8207\u8A72\u6D41\u7A0B\u91CD\u8907\u3002`;
            alertBanner.appendChild(row);
          }
        }
      }
      const list = document.createElement("ul");
      list.className = "workflow-import-confirm-list";
      const liAuth = document.createElement("li");
      liAuth.textContent = "\u6B64 JSON \u4E0D\u542B Authorization\u3001API Key\u3001Cookie \u7B49\u654F\u611F Header\uFF1B\u82E5 API \u9700\u8981\uFF0C\u8ACB\u532F\u5165\u5F8C\u5728\u5404\u6B65\u9A5F\u7684 API \u8A2D\u5B9A\u4E2D\u81EA\u884C\u88DC\u4E0A\u3002";
      list.appendChild(liAuth);
      if (info.hasAbsoluteUrl) {
        const liUrl = document.createElement("li");
        liUrl.textContent = "\u5075\u6E2C\u5230\u5B8C\u6574 URL\uFF08\u542B http/https\uFF09\uFF1A\u8ACB\u78BA\u8A8D\u8207\u4F60\u76EE\u524D\u7684\u74B0\u5883\u4E00\u81F4\uFF0C\u5FC5\u8981\u6642\u8ACB\u6539\u70BA\u76F8\u5C0D path \u6216\u6B63\u78BA\u7684\u7DB2\u5740\u3002";
        list.appendChild(liUrl);
      }
      const actions = document.createElement("div");
      actions.className = "exec-confirm-actions";
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.className = "exec-confirm-cancel";
      cancelBtn.textContent = "\u53D6\u6D88";
      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "exec-confirm-ok";
      okBtn.textContent = "\u4ECD\u532F\u5165";
      function close(ok) {
        overlay.remove();
        resolve(ok);
      }
      cancelBtn.addEventListener("click", () => close(false));
      okBtn.addEventListener("click", () => close(true));
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) close(false);
      });
      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      dialog.appendChild(titleEl);
      dialog.appendChild(intro);
      if (alertBanner) dialog.appendChild(alertBanner);
      dialog.appendChild(list);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
    });
  }
  function getDraftWorkflowDisplayName() {
    const fromInput = draftWorkflowNameInputEl.value.trim();
    if (fromInput) return fromInput;
    return (currentWorkflowName || "").trim() || "\u8349\u7A3F";
  }
  function syncDraftWorkflowNameInputFromState() {
    draftWorkflowNameInputEl.value = currentWorkflowName;
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
      delBtn.title = index === editingStepIndex ? "\u7DE8\u8F2F\u4E2D\uFF0C\u7121\u6CD5\u522A\u9664" : "\u79FB\u9664\u6B64\u6B65\u9A5F";
      delBtn.disabled = index === editingStepIndex;
      delBtn.addEventListener("click", () => {
        const stepTitle = step.requestName || step.api;
        if (!confirmDelete(`\u78BA\u5B9A\u8981\u522A\u9664\u6B65\u9A5F\u300C${stepTitle}\u300D\u55CE\uFF1F`)) return;
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
    savedWorkflows.forEach((workflow, index) => {
      const card = document.createElement("div");
      card.className = "workflow-card";
      const nameEl = document.createElement("div");
      nameEl.className = "workflow-card-name";
      nameEl.textContent = workflow.name;
      nameEl.title = workflow.steps.map((step) => step.api).join(", ");
      const stepsEl = document.createElement("div");
      stepsEl.className = "workflow-card-steps";
      stepsEl.textContent = `${workflow.steps.length} \u6B65`;
      const actions = document.createElement("div");
      actions.className = "workflow-card-actions";
      const loadBtn = document.createElement("button");
      loadBtn.type = "button";
      loadBtn.textContent = "\u8F09\u5165";
      loadBtn.addEventListener("click", () => {
        draftSteps = workflow.steps.map((step) => ({
          ...step,
          params: [...step.params],
          headers: step.headers ? { ...step.headers } : {}
        }));
        currentWorkflowName = workflow.name;
        syncDraftWorkflowNameInputFromState();
        draftNameFromImport = false;
        renderDraftSteps();
        setWorkflowPanelOpen(true);
        setToast(`\u5DF2\u8F09\u5165\u6D41\u7A0B\uFF1A${workflow.name}`, "ok");
        chatInputEl.focus();
      });
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "workflow-card-delete";
      deleteBtn.textContent = "\u522A\u9664";
      deleteBtn.addEventListener("click", async () => {
        if (!confirmDelete(`\u78BA\u5B9A\u8981\u522A\u9664\u5DF2\u5132\u5B58\u6D41\u7A0B\u300C${workflow.name}\u300D\u55CE\uFF1F`)) return;
        savedWorkflows.splice(index, 1);
        renderSavedWorkflows();
        await saveMessages();
        setToast(`\u5DF2\u522A\u9664\u6D41\u7A0B\uFF1A${workflow.name}`, "ok");
      });
      actions.appendChild(loadBtn);
      actions.appendChild(deleteBtn);
      card.appendChild(nameEl);
      card.appendChild(stepsEl);
      card.appendChild(actions);
      savedWorkflowsEl.appendChild(card);
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
      if (index === pinnedSavedApiIndex) card.classList.add("selected");
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
      if (index === pinnedSavedApiIndex) selectBtn.classList.add("active");
      selectBtn.addEventListener("click", () => {
        selectedApiIndex = -1;
        pinnedSavedApiIndex = index;
        pinnedDetailSpec = { ...spec, params: [...spec.params ?? []], headers: { ...spec.headers ?? {} } };
        renderSavedApis();
        renderApiCandidates();
      });
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "saved-api-delete";
      deleteBtn.textContent = "\u2715";
      deleteBtn.title = "\u522A\u9664\u6B64 API";
      deleteBtn.addEventListener("click", async () => {
        const apiTitle = spec.requestName || spec.api;
        if (!confirmDelete(`\u78BA\u5B9A\u8981\u522A\u9664\u5DF2\u5132\u5B58 API\u300C${apiTitle}\u300D\u55CE\uFF1F`)) return;
        customApiSpecs.splice(index, 1);
        if (editingApiIndex === index) editingApiIndex = -1;
        if (pinnedSavedApiIndex === index) {
          pinnedSavedApiIndex = -1;
          pinnedDetailSpec = null;
        } else if (pinnedSavedApiIndex > index) {
          pinnedSavedApiIndex--;
        }
        renderSavedApis();
        renderApiCandidates();
        await saveMessages();
      });
      actions.appendChild(selectBtn);
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
  function confirmDelete(message) {
    return globalThis.confirm(message);
  }
  function createOAuthState() {
    if (globalThis.crypto?.getRandomValues) {
      const bytes = new Uint8Array(16);
      globalThis.crypto.getRandomValues(bytes);
      return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  async function fetchGoogleUserInfo(accessToken) {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      throw new Error(`userinfo \u53D6\u5F97\u5931\u6557 (${response.status})`);
    }
    return await response.json();
  }
  async function exchangeGoogleTokenForFirebaseIdToken(googleAccessToken2) {
    const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(
      getEffectiveFirebaseWebApiKey()
    )}`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postBody: `access_token=${encodeURIComponent(googleAccessToken2)}&providerId=google.com`,
        requestUri: "https://localhost",
        returnIdpCredential: true,
        returnSecureToken: true
      })
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
    const response = await fetch(getEffectiveAgentChatUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firebaseIdToken}`,
        "x-page-url": globalThis.location?.href || ""
      },
      body: JSON.stringify({
        message,
        sessionId: chatSessionId
      })
    });
    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401 || response.status === 403) {
        reportBackendApiAuthRejection(response.status);
        await saveMessages();
      }
      throw new Error(`Agent API \u5931\u6557 (${response.status}) ${text}`);
    }
    clearBackendApiAuthHint();
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
    return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, "").replace(/^\s*(思考|thinking)\s*[:：].*$/gim, "");
  }
  function parseSseBlock(block) {
    let eventType = null;
    const dataParts = [];
    for (const raw of block.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim().toLowerCase();
      } else if (line.startsWith("data:")) {
        dataParts.push(line.slice(5).trim());
      }
    }
    return { eventType, payloadText: dataParts.join("\n") };
  }
  function shouldEmitSseDelta(eventType) {
    if (eventType === null) return true;
    return eventType === "delta";
  }
  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function splitRequestTargetForEditor(raw) {
    const s = (raw || "").trim();
    if (!s) return { base: "", pathAndQuery: "" };
    if (/^https?:\/\//i.test(s)) {
      try {
        const u = new URL(s);
        return { base: u.origin, pathAndQuery: `${u.pathname}${u.search}` || "/" };
      } catch {
        return { base: "", pathAndQuery: s };
      }
    }
    return { base: "", pathAndQuery: s };
  }
  function joinRequestTargetFromEditor(base, pathAndQuery) {
    const b = (base || "").trim();
    const p = (pathAndQuery || "").trim();
    if (!b) return p;
    if (!p) return b;
    const baseClean = b.replace(/\/+$/, "");
    let pathPart = p;
    if (pathPart.startsWith("?")) {
      pathPart = `/${pathPart}`;
    } else {
      pathPart = pathPart.replace(/^\/+/, "");
    }
    if (/^https?:\/\//i.test(baseClean)) {
      try {
        const joinBase = baseClean.endsWith("/") ? baseClean : `${baseClean}/`;
        return new URL(pathPart, joinBase).toString();
      } catch {
        return `${baseClean}/${pathPart}`;
      }
    }
    return `${baseClean}/${pathPart}`;
  }
  function getPathNoQueryAndSearchFromCombined(combined) {
    const s = (combined || "").trim();
    if (!s) return { pathNoQuery: "", queryString: "" };
    if (/^https?:\/\//i.test(s)) {
      try {
        const u = new URL(s);
        return {
          pathNoQuery: `${u.origin}${u.pathname}`,
          queryString: u.searchParams.toString()
        };
      } catch {
      }
    }
    const qIdx = s.indexOf("?");
    if (qIdx < 0) return { pathNoQuery: s, queryString: "" };
    return { pathNoQuery: s.slice(0, qIdx), queryString: s.slice(qIdx + 1) };
  }
  var markdownCodeBlockSeq = 0;
  function renderMarkdownFromEscapedBlocks(escaped) {
    const blocks = escaped.split(/\n{2,}/);
    return blocks.map((block) => {
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
        const items = lines.map((line) => line.replace(/^\s*[-*]\s+/, "")).map((line) => `<li>${line}</li>`).join("");
        return `<ul>${items}</ul>`;
      }
      const paragraph = trimmed.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+?)`/g, "<code>$1</code>").replace(/\n/g, "<br>");
      return `<p>${paragraph}</p>`;
    }).filter(Boolean).join("");
  }
  function renderAssistantMarkdown(text) {
    const parts = [];
    const fenceRe = /```([^\n`]*)\r?\n([\s\S]*?)```/g;
    let last = 0;
    let m;
    while ((m = fenceRe.exec(text)) !== null) {
      const before = text.slice(last, m.index);
      if (before.trim()) {
        parts.push(renderMarkdownFromEscapedBlocks(escapeHtml(before)));
      }
      const lang = (m[1] || "").trim();
      const rawCode = m[2].replace(/\n$/, "");
      const id = `md-code-${markdownCodeBlockSeq++}`;
      const langHtml = escapeHtml(lang || "bash");
      parts.push(
        `<div class="md-code-wrap"><div class="md-code-toolbar"><span class="md-code-lang">${langHtml}</span><button type="button" class="md-code-copy" data-copy="${id}" title="\u8907\u88FD\u6B64\u5340\u584A">\u8907\u88FD</button></div><pre class="md-code-pre" id="${id}"><code>${escapeHtml(rawCode)}</code></pre></div>`
      );
      last = m.index + m[0].length;
    }
    const tail = text.slice(last);
    if (tail.trim()) {
      parts.push(renderMarkdownFromEscapedBlocks(escapeHtml(tail)));
    }
    return parts.join("");
  }
  async function callAgentChatApiStream(message, onDelta) {
    if (!firebaseIdToken) {
      throw new Error("\u5C1A\u672A\u53D6\u5F97 Firebase idToken\uFF0C\u8ACB\u5148\u5B8C\u6210 Google \u6388\u6B0A");
    }
    const response = await fetch(getEffectiveAgentChatUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${firebaseIdToken}`,
        "x-page-url": globalThis.location?.href || "",
        Accept: "text/event-stream, application/json, text/plain"
      },
      body: JSON.stringify({
        message,
        sessionId: chatSessionId
      })
    });
    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401 || response.status === 403) {
        reportBackendApiAuthRejection(response.status);
        await saveMessages();
      }
      throw new Error(`Agent API \u5931\u6557 (${response.status}) ${text}`);
    }
    clearBackendApiAuthHint();
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
          const { eventType, payloadText } = parseSseBlock(event);
          if (!shouldEmitSseDelta(eventType)) continue;
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
      const tail = buffer.trim();
      if (tail && tail !== "[DONE]") {
        const tailEvents = tail.split("\n\n").filter(Boolean);
        for (const ev of tailEvents) {
          const { eventType, payloadText } = parseSseBlock(ev);
          if (!shouldEmitSseDelta(eventType)) continue;
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
      empty.textContent = "\u5C1A\u7121\u8A0A\u606F\u3002\u5728\u4E0B\u65B9\u8F38\u5165\u554F\u984C\u5F8C\u6309\u300C\u9001\u51FA\u300D\u5373\u53EF\u958B\u59CB\u8207 Agent \u5C0D\u8A71\u3002";
      chatMessagesEl.appendChild(empty);
      chatMessagesEl.classList.remove("chat-messages--streaming");
      return;
    }
    messages.forEach((message, index) => {
      const row = document.createElement("div");
      row.className = `message-row ${message.role}`;
      const isStreamingAssistant = message.role === "assistant" && index === streamingAssistantIndex;
      const streamBubbleEmpty = isStreamingAssistant && !message.content.trim();
      if (message.role === "assistant" && index === streamingAssistantIndex) {
        row.classList.add("message-row--streaming");
      }
      if (message.role === "assistant" && index === streamJustFinishedIndex) {
        row.classList.add("message-row--stream-done");
      }
      const bubble = document.createElement("div");
      bubble.className = "message-bubble";
      if (message.role === "assistant") {
        bubble.classList.add("markdown");
        if (streamBubbleEmpty) {
          bubble.classList.add("message-bubble--stream-wait");
          const wait = document.createElement("div");
          wait.className = "stream-wait-lines";
          wait.setAttribute("aria-hidden", "true");
          for (let i = 0; i < 3; i += 1) {
            const bar = document.createElement("span");
            bar.className = "stream-wait-bar";
            wait.appendChild(bar);
          }
          bubble.appendChild(wait);
        } else {
          bubble.innerHTML = renderAssistantMarkdown(message.content);
        }
        if (isStreamingAssistant) {
          const cursor = document.createElement("span");
          cursor.className = "assistant-stream-cursor";
          cursor.setAttribute("aria-hidden", "true");
          bubble.appendChild(cursor);
        }
      } else {
        bubble.textContent = message.content;
      }
      const meta = document.createElement("div");
      meta.className = "message-meta";
      if (message.role === "assistant" && index === streamingAssistantIndex) {
        meta.classList.add("message-meta--streaming");
        const badge = document.createElement("span");
        badge.className = "message-meta-badge message-meta-badge--pulse";
        badge.textContent = "LIVE";
        meta.appendChild(badge);
        meta.appendChild(document.createTextNode(" \u6B63\u5728\u7522\u751F\u56DE\u61C9"));
        const typing = document.createElement("span");
        typing.className = "typing-indicator";
        typing.setAttribute("aria-hidden", "true");
        for (let i = 0; i < 3; i += 1) {
          const dot = document.createElement("span");
          dot.className = "typing-dot";
          typing.appendChild(dot);
        }
        meta.appendChild(typing);
      } else if (message.role === "assistant" && index === streamJustFinishedIndex) {
        meta.classList.add("message-meta--done");
        meta.textContent = `Agent \xB7 \u5DF2\u56DE\u61C9\u5B8C\u7562 \xB7 ${message.at}`;
      } else {
        meta.textContent = `${message.role === "user" ? "\u4F60" : "Agent"} \xB7 ${message.at}`;
      }
      row.appendChild(bubble);
      row.appendChild(meta);
      chatMessagesEl.appendChild(row);
    });
    chatMessagesEl.classList.toggle("chat-messages--streaming", streamingAssistantIndex !== null);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }
  async function loadMessages() {
    persistenceReady = false;
    const storageLocal = extensionChrome?.storage?.local;
    let saved;
    try {
      saved = storageLocal ? await storageLocal.get([
        STORAGE_KEY,
        SESSION_ID_KEY,
        WORKFLOWS_KEY,
        AUTH_STATE_KEY,
        CUSTOM_APIS_KEY,
        EXEC_RESULTS_KEY,
        RUNTIME_ENV_SETTINGS_KEY
      ]) : {
        [STORAGE_KEY]: fallbackStorage.get(STORAGE_KEY),
        [SESSION_ID_KEY]: fallbackStorage.get(SESSION_ID_KEY),
        [WORKFLOWS_KEY]: fallbackStorage.get(WORKFLOWS_KEY),
        [AUTH_STATE_KEY]: fallbackStorage.get(AUTH_STATE_KEY),
        [CUSTOM_APIS_KEY]: fallbackStorage.get(CUSTOM_APIS_KEY),
        [EXEC_RESULTS_KEY]: fallbackStorage.get(EXEC_RESULTS_KEY),
        [RUNTIME_ENV_SETTINGS_KEY]: fallbackStorage.get(RUNTIME_ENV_SETTINGS_KEY)
      };
    } catch (err) {
      console.error("[personal-extension] loadMessages: storage.get failed", err);
      saved = {};
    }
    try {
      setAuthStatus("\u5C1A\u672A\u6388\u6B0A\uFF0C\u8ACB\u5148\u6309\u300CGoogle \u6388\u6B0A\u300D\u3002", "normal");
      setChatEnabled(false);
      hydrateRuntimeEnvFromSaved(saved[RUNTIME_ENV_SETTINGS_KEY]);
      if (typeof saved[SESSION_ID_KEY] === "string" && saved[SESSION_ID_KEY]) {
        chatSessionId = saved[SESSION_ID_KEY];
      }
      if (saved[STORAGE_KEY]) {
        try {
          const parsed = JSON.parse(saved[STORAGE_KEY]);
          if (Array.isArray(parsed)) {
            messages = parsed.slice(-MAX_MESSAGES).filter((item) => {
              return Boolean(item) && typeof item === "object" && item.role !== void 0 && typeof item.content === "string" && typeof item.at === "string";
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
            savedWorkflows = parsedWorkflows.filter((item) => Boolean(item) && typeof item === "object").map((item) => {
              const legacySteps = Array.isArray(item.apis) ? item.apis.map((api) => String(api || "").trim()).filter(Boolean).map((api) => ({ api, purpose: "\u5F85\u88DC\u5145\u76EE\u7684", params: [] })) : [];
              const steps = Array.isArray(item.steps) ? item.steps.filter((step) => step && typeof step.api === "string").map((step) => ({
                api: step.api,
                path: typeof step.path === "string" ? step.path : void 0,
                requestName: typeof step.requestName === "string" ? step.requestName : void 0,
                method: typeof step.method === "string" ? step.method : void 0,
                headers: step.headers && typeof step.headers === "object" ? { ...step.headers } : {},
                bodyTemplate: typeof step.bodyTemplate === "string" ? step.bodyTemplate : "",
                bearerToken: typeof step.bearerToken === "string" ? step.bearerToken : "",
                purpose: typeof step.purpose === "string" ? step.purpose : "\u5F85\u88DC\u5145\u76EE\u7684",
                params: Array.isArray(step.params) ? step.params.map((p) => String(p)) : []
              })) : legacySteps;
              return {
                id: typeof item.id === "string" ? item.id : `wf-${Date.now()}`,
                name: typeof item.name === "string" ? item.name : "\u672A\u547D\u540D\u6D41\u7A0B",
                steps
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
            customApiSpecs = parsedCustomApis.filter((item) => item && typeof item.api === "string").map((item) => ({
              api: item.api,
              path: typeof item.path === "string" ? item.path : void 0,
              requestName: typeof item.requestName === "string" ? item.requestName : void 0,
              method: typeof item.method === "string" ? item.method : void 0,
              headers: item.headers && typeof item.headers === "object" ? item.headers : {},
              bodyTemplate: typeof item.bodyTemplate === "string" ? item.bodyTemplate : "",
              bearerToken: typeof item.bearerToken === "string" ? item.bearerToken : "",
              purpose: typeof item.purpose === "string" ? item.purpose : "",
              params: Array.isArray(item.params) ? item.params.map((p) => String(p)) : []
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
      renderSavedApis();
      try {
        if (typeof saved[EXEC_RESULTS_KEY] === "string" && saved[EXEC_RESULTS_KEY]) {
          const parsed = JSON.parse(saved[EXEC_RESULTS_KEY]);
          if (Array.isArray(parsed)) execResults = parsed.slice(0, MAX_EXEC_RESULTS);
        }
      } catch {
        execResults = [];
      }
      renderExecResults();
    } catch (err) {
      console.error("[personal-extension] loadMessages: restore UI failed", err);
    } finally {
      persistenceReady = true;
    }
    if (typeof saved[AUTH_STATE_KEY] === "string" && saved[AUTH_STATE_KEY]) {
      try {
        const parsed = JSON.parse(saved[AUTH_STATE_KEY]);
        if (isAuthStateValid(parsed)) {
          const storedEmail = parsed.accountEmail || "";
          if (!isAllowedAiiiEmail(storedEmail)) {
            clearAuthStateInMemory();
            await saveMessages();
            if (isEmailDomainRestrictionActive()) {
              setAuthStatus(
                `\u6B64\u64F4\u5145\u50C5\u9650\u516C\u53F8 Google \u5E33\u865F\uFF08\u7DB2\u57DF\u9808\u70BA ${ALLOWED_GOOGLE_EMAIL_SUFFIX.trim()}\uFF09\u3002\u5DF2\u6E05\u9664\u4E0D\u7B26\u5408\u7DB2\u57DF\u7684\u6388\u6B0A\u8CC7\u6599\uFF0C\u8ACB\u6539\u7528\u7B26\u5408\u8CC7\u683C\u7684\u5E33\u865F\u6388\u6B0A\u3002`,
                "error"
              );
              setOAuthInfo(storedEmail ? `\u5148\u524D\u5E33\u865F\uFF1A${storedEmail}` : "\u5148\u524D\u6388\u6B0A\u7121\u6709\u6548\u4FE1\u7BB1");
              setToast(`\u50C5\u9650 ${ALLOWED_GOOGLE_EMAIL_SUFFIX.trim()} \u7DB2\u57DF\u53EF\u4F7F\u7528\u672C\u64F4\u5145\u3002`, "error", 8e3);
            } else {
              setAuthStatus(
                "\u5B58\u653E\u7684\u6388\u6B0A\u4FE1\u7BB1\u7121\u6548\u6216\u7121\u6CD5\u8FA8\u8B58\u3002\u5DF2\u6E05\u9664\u6388\u6B0A\u8CC7\u6599\uFF0C\u8ACB\u91CD\u65B0\u5B8C\u6210 Google \u6388\u6B0A\u3002",
                "error"
              );
              setOAuthInfo(storedEmail ? `\u5148\u524D\u5E33\u865F\uFF1A${storedEmail}` : "\u5148\u524D\u6388\u6B0A\u7121\u6709\u6548\u4FE1\u7BB1");
              setToast("\u8ACB\u91CD\u65B0\u5B8C\u6210 Google \u6388\u6B0A\u3002", "error", 8e3);
            }
          } else {
            firebaseIdToken = parsed.firebaseIdToken;
            googleAccessToken = parsed.googleAccessToken;
            authExpiresAt = parsed.expiresAt;
            accountEmail = storedEmail || "(\u7121\u6CD5\u53D6\u5F97 email)";
            isAuthorized = true;
            setChatEnabled(true);
            clearBackendApiAuthHint();
            setAuthStatus(`\u5DF2\u6388\u6B0A\uFF08${accountEmail}\uFF09`, "ok");
            setOAuthInfo(`account_email: ${accountEmail}`);
            return;
          }
        }
      } catch {
      }
    }
    const identityInfo = await checkIdentityAuthorization();
    if (identityInfo.authorized) {
      setAuthStatus(`${identityInfo.message}\uFF0C\u4F46 Token \u5DF2\u904E\u671F\uFF0C\u8ACB\u91CD\u65B0\u6388\u6B0A\u3002`, "normal");
    } else if (identityInfo.domainNotAllowed) {
      setAuthStatus(identityInfo.message, "error");
      setOAuthInfo(identityInfo.message);
    }
    syncPanelBodyAuthLock();
  }
  async function saveMessages() {
    if (!persistenceReady) return;
    const data = {
      [STORAGE_KEY]: JSON.stringify(messages.slice(-MAX_MESSAGES)),
      [SESSION_ID_KEY]: chatSessionId,
      [WORKFLOWS_KEY]: JSON.stringify(savedWorkflows),
      [AUTH_STATE_KEY]: JSON.stringify(getCurrentAuthState()),
      [CUSTOM_APIS_KEY]: JSON.stringify(customApiSpecs.slice(0, 50)),
      [EXEC_RESULTS_KEY]: JSON.stringify(execResults.slice(0, MAX_EXEC_RESULTS))
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
      at: (/* @__PURE__ */ new Date()).toLocaleTimeString("zh-Hant-TW", { hour: "2-digit", minute: "2-digit" })
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
          resolve({ authorized: false, message: "\u5C1A\u672A\u5B8C\u6210 OAuth \u6388\u6B0A\uFF0C\u8ACB\u6309\u300CGoogle \u6388\u6B0A\u300D" });
          return;
        }
        if (!isAllowedAiiiEmail(userInfo.email)) {
          resolve({
            authorized: false,
            domainNotAllowed: true,
            message: isEmailDomainRestrictionActive()
              ? `\u700F\u89BD\u5668 Google \u5E33\u865F\u70BA ${userInfo.email}\uFF0C\u50C5\u9650 ${ALLOWED_GOOGLE_EMAIL_SUFFIX.trim()} \u53EF\u4F7F\u7528\u672C\u64F4\u5145\u3002`
              : `\u700F\u89BD\u5668\u56DE\u5831\u7684 Google \u5E33\u865F\u683C\u5F0F\u7570\u5E38\uFF08${userInfo.email}\uFF09\uFF0C\u7121\u6CD5\u4F7F\u7528\u672C\u64F4\u5145\u3002`
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
      authUrl.searchParams.set("client_id", getEffectiveGoogleOAuthClientId());
      authUrl.searchParams.set("response_type", "token");
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("scope", GOOGLE_OAUTH_SCOPE);
      authUrl.searchParams.set("prompt", "select_account");
      const oauthState = createOAuthState();
      authUrl.searchParams.set("state", oauthState);
      extensionChrome.identity.launchWebAuthFlow(
        { url: authUrl.toString(), interactive: true },
        (responseUrl) => {
          const maybeError = extensionChrome?.runtime?.lastError?.message;
          if (maybeError) {
            reject(new Error(`${maybeError}\uFF08\u8ACB\u78BA\u8A8D OAuth client \u5DF2\u5141\u8A31 redirect URI: ${redirectUri}\uFF09`));
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
            reject(new Error("OAuth state \u9A57\u8B49\u5931\u6557\uFF0C\u53EF\u80FD\u5B58\u5728\u8ACB\u6C42\u507D\u9020\u98A8\u96AA"));
            return;
          }
          const accessToken = params.get("access_token");
          if (!accessToken) {
            const error = params.get("error");
            const errorDescription = params.get("error_description");
            reject(new Error(`OAuth \u672A\u53D6\u5F97 access token: ${error || "unknown"} ${errorDescription || ""}`.trim()));
            return;
          }
          resolve({
            accessToken,
            expiresIn: params.get("expires_in") || "(unknown)",
            scope: params.get("scope") || "(unknown)",
            tokenType: params.get("token_type") || "(unknown)",
            redirectUri
          });
        }
      );
    });
  }
  async function authorizeNow() {
    setAuthStatus("\u6B63\u5728\u9032\u884C Google OAuth \u6388\u6B0A...", "normal");
    try {
      const grant = await requestOAuthAuthorization();
      let resolvedEmail = "(\u7121\u6CD5\u53D6\u5F97 email)";
      try {
        const userInfo = await fetchGoogleUserInfo(grant.accessToken);
        if (userInfo.email) resolvedEmail = userInfo.email;
      } catch (error) {
        console.log("[personal-extension] userinfoError", error);
      }
      if (!isAllowedAiiiEmail(resolvedEmail)) {
        clearAuthStateInMemory();
        setChatEnabled(false);
        await saveMessages();
        const detail = isEmailDomainRestrictionActive()
          ? resolvedEmail !== "(\u7121\u6CD5\u53D6\u5F97 email)"
            ? `\u76EE\u524D Google \u5E33\u865F\u70BA ${resolvedEmail}\uFF0C\u50C5\u9650 ${ALLOWED_GOOGLE_EMAIL_SUFFIX.trim()} \u53EF\u4F7F\u7528\u672C\u64F4\u5145\u3002`
            : `\u7121\u6CD5\u53D6\u5F97\u6388\u6B0A\u4FE1\u7BB1\uFF0C\u6216\u4FE1\u7BB1\u975E ${ALLOWED_GOOGLE_EMAIL_SUFFIX.trim()}\u3002\u8ACB\u78BA\u8A8D\u5DF2\u4F7F\u7528\u516C\u53F8\u5E33\u865F\u767B\u5165 Google\u3002`
          : "\u7121\u6CD5\u53D6\u5F97\u6709\u6548\u7684\u6388\u6B0A\u4FE1\u7BB1\u3002\u8ACB\u78BA\u8A8D OAuth \u5DF2\u5305\u542B userinfo \u6B0A\u9650\uFF0C\u4E26\u91CD\u65B0\u6388\u6B0A\u3002";
        setAuthStatus(detail, "error");
        setOAuthInfo(detail);
        setToast(
          isEmailDomainRestrictionActive()
            ? `\u50C5\u9650 ${ALLOWED_GOOGLE_EMAIL_SUFFIX.trim()} \u5E33\u865F`
            : "\u6388\u6B0A\u4FE1\u7BB1\u7121\u6548",
          "error",
          8e3
        );
        return;
      }
      googleAccessToken = grant.accessToken;
      accountEmail = resolvedEmail;
      firebaseIdToken = await exchangeGoogleTokenForFirebaseIdToken(grant.accessToken);
      const expiresInSeconds = Number.parseInt(grant.expiresIn || "", 10);
      const safeTtlMs = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds * 1e3 : 3600 * 1e3;
      authExpiresAt = Date.now() + safeTtlMs - 6e4;
      clearBackendApiAuthHint();
      setAuthStatus("OAuth \u6388\u6B0A\u6210\u529F\u3002", "ok");
      setOAuthInfo(`account_email: ${accountEmail}`);
      setAuthStatus(`OAuth \u6388\u6B0A\u6210\u529F\uFF08${accountEmail}\uFF09`, "ok");
      isAuthorized = true;
      setChatEnabled(true);
      await saveMessages();
      console.log("[personal-extension] oauthGrant", {
        ...grant,
        accountEmail,
        accessToken: maskToken(grant.accessToken)
      });
    } catch (error) {
      clearAuthStateInMemory();
      setChatEnabled(false);
      await saveMessages();
      const message = error instanceof Error ? error.message : "\u672A\u77E5\u932F\u8AA4";
      setAuthStatus(`OAuth \u6388\u6B0A\u5931\u6557\uFF1A${message}`, "error");
      setOAuthInfo(`OAuth \u6388\u6B0A\u5931\u6557\uFF1A${message}`);
      console.log("[personal-extension] oauthAuthorizeError", message);
    }
  }
  var STEP_LETTERS = "abcdefghijklmnopqrstuvwxyz";
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
        (s) => s.path === (step.path || step.api) && s.requestName === step.requestName
      );
      if (alreadyExists) {
        setToast(`\u300C${step.requestName || step.api}\u300D\u5DF2\u5728\u5DF2\u5132\u5B58\u7684 API \u4E2D\u3002`, "error");
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
        params: [...step.params ?? []]
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
      setToast("\u6D41\u7A0B\u8349\u7A3F\u662F\u7A7A\u7684\uFF0C\u8ACB\u5148\u52A0\u5165 API \u6B65\u9A5F\u3002", "error");
      return;
    }
    if (isAuthExpired()) {
      notifyAuthExpired();
      return;
    }
    const workflowName = getDraftWorkflowDisplayName();
    const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
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
      const baseHeaders = { ...step.headers || {} };
      for (const k of Object.keys(baseHeaders)) {
        if (k.toLowerCase() === "authorization") delete baseHeaders[k];
      }
      const contentType = baseHeaders["content-type"] ?? baseHeaders["Content-Type"] ?? "application/json";
      delete baseHeaders["content-type"];
      const headers = {
        ...baseHeaders,
        Authorization: `Bearer ${firebaseIdToken}`,
        "Content-Type": contentType
      };
      const hasBody = !!step.bodyTemplate && ["POST", "PUT", "PATCH"].includes(method);
      try {
        const resp = await fetch(url, {
          method,
          headers,
          ...hasBody ? { body: step.bodyTemplate } : {}
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
          clearBackendApiAuthHint();
          ui.icon.textContent = "\u2705";
          ui.icon.className = "exec-step-icon";
          ui.statusText.textContent = `${resp.status}`;
          ui.row.classList.add("ok");
        } else {
          if (resp.status === 401 || resp.status === 403) {
            reportBackendApiAuthRejection(resp.status);
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
    setToast(allOk ? "\u6D41\u7A0B\u5DF2\u5168\u90E8\u57F7\u884C\u6210\u529F \u2705" : "\u6D41\u7A0B\u57F7\u884C\u5B8C\u6210\uFF0C\u90E8\u5206\u6B65\u9A5F\u5931\u6557 \u274C", allOk ? "ok" : "error");
    const resultRecord = {
      workflowName,
      timestamp,
      ok: allOk,
      steps: draftSteps.map((step, i) => ({
        index: i,
        name: step.requestName || step.api || step.path || `\u6B65\u9A5F ${i + 1}`,
        ok: stepUIs[i].row.classList.contains("ok"),
        statusText: stepUIs[i].statusText.textContent || "",
        response: stepUIs[i].responsePre.textContent || ""
      }))
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
    if (streamingAssistantIndex !== null) return;
    clearStreamJustFinishedTimer();
    streamJustFinishedIndex = null;
    const messageForAgent = buildMessageWithSkillDirective(value, useSkill);
    pushMessage("user", value);
    chatInputEl.value = "";
    const assistantIndex = pushMessage("assistant", "");
    streamingAssistantIndex = assistantIndex;
    renderMessages();
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
    } finally {
      streamingAssistantIndex = null;
      const replyText = messages[assistantIndex]?.content ?? "";
      const streamFailed = replyText.startsWith("\u547C\u53EB Agent API \u5931\u6557");
      if (!streamFailed) {
        streamJustFinishedIndex = assistantIndex;
        clearStreamJustFinishedTimer();
        streamJustFinishedClearTimer = setTimeout(() => {
          streamJustFinishedClearTimer = null;
          streamJustFinishedIndex = null;
          renderMessages();
        }, 4500);
      } else {
        streamJustFinishedIndex = null;
      }
      renderMessages();
      refreshApiCandidatesFromLatestAssistant();
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
    await sendChatMessage(value, false);
  });
  clearChatButton.addEventListener("click", () => {
    clearStreamJustFinishedTimer();
    streamingAssistantIndex = null;
    streamJustFinishedIndex = null;
    messages = [];
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
  manualApiBodyEl.addEventListener("input", () => {
    clearFieldError(manualApiBodyEl);
  });
  manualApiParamsRowsEl.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t?.classList.contains("field-error")) clearFieldError(t);
  });
  manualApiHeadersRowsEl.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t?.classList.contains("field-error")) clearFieldError(t);
  });
  manualApiHeadersRowsEl.addEventListener("change", (ev) => {
    const t = ev.target;
    if (t?.classList.contains("field-error")) clearFieldError(t);
  });
  toggleExecutionResultButton.addEventListener("click", () => {
    const collapsed = executionResultPanelEl.classList.toggle("collapsed");
    toggleExecutionResultButton.textContent = collapsed ? "\u57F7\u884C\u7D50\u679C \u25B8" : "\u57F7\u884C\u7D50\u679C \u25BE";
  });
  toggleSavedWorkflowsButton.addEventListener("click", () => {
    setSavedWorkflowsOpen(!savedWorkflowsOpen);
  });
  clearExecutionResultButton.addEventListener("click", async () => {
    execResults = [];
    executionResultListEl.replaceChildren();
    await saveMessages();
  });
  cancelApiDetailButton.addEventListener("click", () => {
    selectedApiIndex = -1;
    pinnedDetailSpec = null;
    pinnedSavedApiIndex = -1;
    resetApiDetail();
    renderApiCandidates();
    renderSavedApis();
  });
  addStepButton.addEventListener("click", () => {
    const spec = editedDetailSpec ?? getAllApiCandidates()[selectedApiIndex];
    if (!spec) {
      setToast("\u8ACB\u5148\u9078\u64C7\u4E00\u500B API\u3002", "error");
      return;
    }
    const apiKey = (spec.api || spec.path || "").trim();
    if (!apiKey) {
      setToast("API \u8B58\u5225\uFF08\u540D\u7A31\u6216\u8DEF\u5F91\uFF09\u4E0D\u5B8C\u6574\u3002", "error");
      return;
    }
    const stepData = {
      api: apiKey,
      path: spec.path,
      requestName: spec.requestName,
      method: spec.method,
      headers: spec.headers ? { ...spec.headers } : {},
      bodyTemplate: spec.bodyTemplate,
      bearerToken: spec.bearerToken,
      purpose: spec.purpose || "",
      params: [...spec.params || []]
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
  function getCurrentDetailSpec() {
    const src = editedDetailSpec ?? (selectedApiIndex >= 0 ? getAllApiCandidates()[selectedApiIndex] : pinnedDetailSpec);
    if (!src) return null;
    return {
      ...src,
      api: src.api || src.path || "",
      path: src.path,
      requestName: src.requestName,
      method: src.method,
      headers: src.headers ? { ...src.headers } : {},
      bodyTemplate: src.bodyTemplate,
      bearerToken: src.bearerToken,
      purpose: src.purpose || "",
      params: [...src.params || []]
    };
  }
  saveDetailApiButton.addEventListener("click", async () => {
    const spec = getCurrentDetailSpec();
    if (!spec) {
      setToast("\u8ACB\u5148\u9078\u64C7\u4E00\u500B API\u3002", "error");
      return;
    }
    const baseName = (spec.requestName || spec.api || "CustomApi").trim();
    const isDup = customApiSpecs.some(
      (s) => (s.requestName || s.api) === baseName && (s.path || s.api) === (spec.path || spec.api)
    );
    if (isDup) {
      spec.requestName = `${baseName}-copy`;
      spec.api = spec.path || spec.requestName;
    }
    customApiSpecs = [spec, ...customApiSpecs].slice(0, 50);
    selectedApiIndex = -1;
    pinnedSavedApiIndex = 0;
    pinnedDetailSpec = spec;
    renderSavedApis();
    renderApiCandidates();
    setSavedApisOpen(true);
    await saveMessages();
    setToast(isDup ? `\u5DF2\u53E6\u5B58\u70BA\u300C${spec.requestName}\u300D` : `\u5DF2\u5132\u5B58 API\uFF1A${baseName}`, "ok");
  });
  updateDetailApiButton.addEventListener("click", async () => {
    const spec = getCurrentDetailSpec();
    const targetIndex = pinnedSavedApiIndex;
    if (!spec || targetIndex < 0) {
      setToast("\u627E\u4E0D\u5230\u5C0D\u61C9\u7684\u5DF2\u5132\u5B58 API \u53EF\u66F4\u65B0\u3002", "error");
      return;
    }
    customApiSpecs[targetIndex] = spec;
    pinnedDetailSpec = spec;
    renderSavedApis();
    renderApiCandidates();
    await saveMessages();
    setToast(`\u5DF2\u66F4\u65B0\u5DF2\u5132\u5B58 API\uFF1A${spec.requestName || spec.api}`, "ok");
  });
  function clearFieldError(el) {
    el.classList.remove("field-error");
    const hint = el.nextElementSibling;
    if (hint && hint.classList.contains("field-error-hint")) hint.remove();
  }
  function setFieldError(el, hintText) {
    clearFieldError(el);
    el.classList.add("field-error");
    if (hintText) {
      const span = document.createElement("span");
      span.className = "field-error-hint";
      span.textContent = hintText;
      el.insertAdjacentElement("afterend", span);
    }
  }
  function clearManualApiFormValidationHints() {
    clearFieldError(manualApiNameEl);
    clearFieldError(manualApiPathEl);
    clearFieldError(manualApiBodyEl);
    manualApiParamsRowsEl.querySelectorAll("input,select").forEach((node) => {
      clearFieldError(node);
    });
    manualApiHeadersRowsEl.querySelectorAll("input,select").forEach((node) => {
      clearFieldError(node);
    });
  }
  function validateManualApiForm() {
    clearManualApiFormValidationHints();
    let ok = true;
    const name = manualApiNameEl.value.trim();
    if (!name) {
      setFieldError(manualApiNameEl, "\u8ACB\u586B\u5BEB API \u540D\u7A31\u3002");
      ok = false;
    }
    const path = manualApiPathEl.value.trim();
    if (!path) {
      setFieldError(manualApiPathEl, "\u8ACB\u586B\u5BEB URL\u3002");
      ok = false;
    } else if (!isManualApiPathWellFormed(path)) {
      setFieldError(manualApiPathEl, "\u8ACB\u4F7F\u7528\u5B8C\u6574\u7684 http \u6216 https URL\u3002");
      ok = false;
    }
    if (!isManualApiBodyWellFormed(manualApiBodyEl.value)) {
      setFieldError(manualApiBodyEl, "Body \u9808\u70BA\u5408\u6CD5 JSON\uFF08\u6216\u7559\u767D\uFF09\u3002");
      ok = false;
    }
    manualApiParamsRowsEl.querySelectorAll(".header-row").forEach((node) => {
      const row = node;
      const inputs = row.querySelectorAll("input");
      const keyIn = inputs[0];
      const valIn = inputs[1];
      if (!keyIn || !valIn) return;
      const key = keyIn.value.trim();
      const val = valIn.value.trim();
      if (!key && !val) return;
      if (!key && val) {
        setFieldError(keyIn, "\u8ACB\u586B\u5BEB\u53C3\u6578\u9375\u540D\u3002");
        ok = false;
      } else if (key && !MANUAL_API_PARAM_KEY_RE.test(key)) {
        setFieldError(keyIn, "\u9375\u540D\u50C5\u9650\u82F1\u6587\u5B57\u6BCD\u3001\u6578\u5B57\u8207\u5E95\u7DDA\uFF0C\u4E14\u9808\u4EE5\u82F1\u6587\u6216\u5E95\u7DDA\u958B\u982D\u3002");
        ok = false;
      }
    });
    manualApiHeadersRowsEl.querySelectorAll(".header-row").forEach((node) => {
      const row = node;
      const select = row.querySelector(".header-key-select");
      const custom = row.querySelector(".header-key-custom");
      const valInput = row.querySelector(".header-value");
      if (!select || !custom || !valInput) return;
      let key = "";
      if (select.value === HEADER_KEY_CUSTOM) key = custom.value.trim();
      else key = select.value.trim();
      const val = valInput.value.trim();
      if (!key && !val) return;
      if (!key && val) {
        const target = select.value === HEADER_KEY_CUSTOM ? custom : select;
        setFieldError(target, "\u8ACB\u9078\u64C7\u6216\u586B\u5BEB Header \u540D\u7A31\u3002");
        ok = false;
        return;
      }
      if (select.value === HEADER_KEY_CUSTOM && key && !MANUAL_HTTP_HEADER_NAME_RE.test(key)) {
        setFieldError(custom, "Header \u540D\u7A31\u542B\u6709\u4E0D\u5141\u8A31\u7684\u5B57\u5143\u3002");
        ok = false;
      }
    });
    if (!ok) setToast("\u8ACB\u4FEE\u6B63\u6A19\u7D05\u6B04\u4F4D\u5F8C\u518D\u5132\u5B58\u3002", "error");
    return ok;
  }
  function clearManualForm() {
    clearManualApiFormValidationHints();
    manualApiNameEl.value = "";
    manualApiPathEl.value = "";
    manualApiPurposeEl.value = "";
    manualApiMethodEl.value = "GET";
    renderManualParamsRows([]);
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
    const manualParams = collectManualParams();
    const params = manualParams.length ? manualParams : inferParamsFromPathAndBody(path, bodyTemplate);
    const spec = {
      api: path,
      path,
      requestName: name,
      method,
      headers,
      bodyTemplate,
      bearerToken,
      purpose,
      params
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
      if (!validateManualApiForm()) return;
      const { name, spec } = buildSpecFromForm();
      if (!name || !spec.path) return;
      const isDup = customApiSpecs.some(
        (s) => (s.requestName || s.api) === name && (s.path || s.api) === (spec.path || spec.api)
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
      setToast(isDup ? `\u5DF2\u53E6\u5B58\u70BA\u300C${finalName}\u300D` : `\u5DF2\u5132\u5B58 API\uFF1A${finalName}`, "ok");
    });
    const addStepBtn = document.createElement("button");
    addStepBtn.type = "button";
    addStepBtn.className = "pending-api-step";
    addStepBtn.textContent = "\u52A0\u5165\u6D41\u7A0B\u6B65\u9A5F";
    addStepBtn.addEventListener("click", () => {
      if (!validateManualApiForm()) return;
      const { name, spec } = buildSpecFromForm();
      if (!name || !spec.path) return;
      draftSteps.push({ ...spec, params: [...spec.params ?? []] });
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
    if (!validateManualApiForm()) return;
    const { name, path, spec } = buildSpecFromForm();
    if (!name || !path) return;
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
    renderManualParamsRows(inferParamEntries(parsed.url, parsed.body));
    renderManualHeaderRowsFromObject(parsed.headers);
    manualApiBodyEl.value = parsed.body;
    if (!manualApiNameEl.value.trim()) {
      const tail = parsed.url.split("?")[0].split("/").filter(Boolean).pop() || "CustomApi";
      manualApiNameEl.value = `${tail}Request`;
    }
    clearManualApiFormValidationHints();
    setToast(`\u5DF2\u89E3\u6790 curl\uFF08${parsed.method} ${parsed.url}\uFF09`, "ok");
    setManualApiOpen(true);
    updateManualFormActions();
  });
  function showExecutionConfirmDialog() {
    return new Promise((resolve) => {
      const stepsToReview = draftSteps.map((step, i) => {
        const urlParams = {};
        try {
          const urlObj = new URL(step.path ?? step.api ?? "");
          urlObj.searchParams.forEach((v, k) => {
            urlParams[k] = v;
          });
        } catch {
        }
        return {
          step,
          index: i,
          urlParams,
          hasParams: Object.keys(urlParams).length > 0,
          hasBody: !!step.bodyTemplate?.trim()
        };
      }).filter((s) => s.hasParams || s.hasBody);
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
      subtitleEl.textContent = "\u8ACB\u78BA\u8A8D\u4EE5\u4E0B\u6B65\u9A5F\u7684\u53C3\u6578\uFF0C\u78BA\u8A8D\u7121\u8AA4\u5F8C\u518D\u57F7\u884C\u3002";
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
    const name = draftWorkflowNameInputEl.value.trim();
    if (!name) {
      const msg = draftNameFromImport ? "\u8ACB\u586B\u5BEB\u6D41\u7A0B\u540D\u7A31\u5F8C\u518D\u5132\u5B58\u3002" : "\u8ACB\u586B\u5BEB\u6D41\u7A0B\u540D\u7A31\uFF08\u81EA\u884C\u5EFA\u7ACB\u7684\u8349\u7A3F\u70BA\u5FC5\u586B\uFF09\u3002";
      setToast(msg, "error");
      draftWorkflowNameInputEl.focus();
      return;
    }
    const dup = savedWorkflows.some((w) => w.name.trim() === name);
    if (dup) {
      if (!globalThis.confirm(`\u5DF2\u5B58\u5728\u540C\u540D\u6D41\u7A0B\u300C${name}\u300D\uFF0C\u4ECD\u8981\u4EE5\u540C\u540D\u5132\u5B58\u55CE\uFF1F`)) return;
    }
    currentWorkflowName = name;
    draftWorkflowNameInputEl.value = name;
    savedWorkflows = [
      {
        id: globalThis.crypto?.randomUUID?.() || `wf-${Date.now()}`,
        name,
        steps: draftSteps.map((step) => ({
          ...step,
          params: [...step.params],
          headers: step.headers ? { ...step.headers } : {}
        }))
      },
      ...savedWorkflows
    ].slice(0, 20);
    draftNameFromImport = false;
    renderSavedWorkflows();
    setSavedWorkflowsOpen(true);
    await saveMessages();
    setToast(`\u5DF2\u5EFA\u7ACB\u6D41\u7A0B\uFF1A${name}`, "ok");
  });
  clearDraftButton.addEventListener("click", () => {
    draftSteps = [];
    currentWorkflowName = "";
    draftNameFromImport = false;
    draftWorkflowNameInputEl.value = "";
    importWorkflowJsonInputEl.value = "";
    renderDraftSteps();
    setToast("\u5DF2\u6E05\u7A7A\u6D41\u7A0B\u8349\u7A3F\u3002", "normal");
  });
  authorizeGoogleButton.addEventListener("click", () => {
    authorizeGoogleButton.classList.remove("auth-expired-pulse");
    void authorizeNow();
  });
  function summarizeAgentEndpointForSettingsUi() {
    const u = getEffectiveAgentChatUrl();
    try {
      const url = new URL(u);
      return `${url.hostname}${url.pathname}`;
    } catch {
      return u.length > 56 ? `${u.slice(0, 56)}\u2026` : u;
    }
  }
  function refreshEnvSettingsUi() {
    const env = getActiveEnv();
    envToggleStagingButton.classList.toggle("is-active", env === "staging");
    envToggleProductionButton.classList.toggle("is-active", env === "production");
    const f = getOverrideFieldsForActiveEnv();
    settingsFirebaseWebApiKeyEl.value = f.firebaseWebApiKey;
    settingsGoogleOAuthClientIdEl.value = f.googleOAuthClientId;
    envEffectiveSummaryEl.textContent = `\u76EE\u524D\u4F5C\u7528\u4E2D\uFF1A${env === "staging" ? "\u6E2C\u8A66\u74B0\u5883" : "\u6B63\u5F0F\u74B0\u5883"} \xB7 Agent\uFF1A${summarizeAgentEndpointForSettingsUi()}`;
  }
  async function persistRuntimeEnvSettings() {
    const json = runtimeEnvSettingsToJson();
    const storageLocal = extensionChrome?.storage?.local;
    try {
      if (storageLocal) await storageLocal.set({ [RUNTIME_ENV_SETTINGS_KEY]: json });
      else fallbackStorage.set(RUNTIME_ENV_SETTINGS_KEY, json);
    } catch (e) {
      console.error("[personal-extension] persistRuntimeEnvSettings failed", e);
      setToast("\u74B0\u5883\u8A2D\u5B9A\u5132\u5B58\u5931\u6557\u3002", "error");
    }
  }
  function setPanelSettingsOpen(open) {
    panelSettingsOverlayEl.classList.toggle("hidden", !open);
    panelSettingsOverlayEl.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      refreshEnvSettingsUi();
      closePanelSettingsButton.focus();
    } else {
      openPanelSettingsButton.focus();
    }
  }
  openPanelSettingsButton.addEventListener("click", () => setPanelSettingsOpen(true));
  closePanelSettingsButton.addEventListener("click", () => setPanelSettingsOpen(false));
  envToggleStagingButton.addEventListener("click", () => {
    setActiveEnv("staging");
    void persistRuntimeEnvSettings().then(() => {
      refreshEnvSettingsUi();
      setToast("\u5DF2\u5207\u63DB\u70BA\u6E2C\u8A66\u74B0\u5883", "ok", 2200);
    });
  });
  envToggleProductionButton.addEventListener("click", () => {
    setActiveEnv("production");
    void persistRuntimeEnvSettings().then(() => {
      refreshEnvSettingsUi();
      setToast("\u5DF2\u5207\u63DB\u70BA\u6B63\u5F0F\u74B0\u5883", "ok", 2200);
    });
  });
  saveEnvOverridesButton.addEventListener("click", () => {
    updateOverridesForActiveEnv({
      firebaseWebApiKey: settingsFirebaseWebApiKeyEl.value.trim(),
      googleOAuthClientId: settingsGoogleOAuthClientIdEl.value.trim()
    });
    void persistRuntimeEnvSettings().then(() => {
      refreshEnvSettingsUi();
      setToast("\u5DF2\u5132\u5B58\u6B64\u74B0\u5883\u7684\u91D1\u9470\u8986\u5BEB\uFF08\u975E\u7A7A\u503C\u512A\u5148\u65BC\u5EFA\u7F6E\u9810\u8A2D\uFF09\u3002", "ok", 4e3);
    });
  });
  clearEnvOverridesButton.addEventListener("click", () => {
    updateOverridesForActiveEnv({ firebaseWebApiKey: "", googleOAuthClientId: "" });
    void persistRuntimeEnvSettings().then(() => {
      refreshEnvSettingsUi();
      setToast("\u5DF2\u6E05\u9664\u6B64\u74B0\u5883\u7684\u8986\u5BEB\uFF0C\u6539\u56DE\u5EFA\u7F6E\u9810\u8A2D\u3002", "ok", 3500);
    });
  });
  panelSettingsOverlayEl.addEventListener("click", (e) => {
    if (e.target === panelSettingsOverlayEl) setPanelSettingsOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (panelSettingsOverlayEl.classList.contains("hidden")) return;
    setPanelSettingsOpen(false);
  });
  closeDockButton.addEventListener("click", () => {
    chrome?.runtime?.sendMessage({ type: CLOSE_HELLO_DOCK });
  });
  function postDockToHostMessage(msg) {
    window.parent?.postMessage(msg, "*");
  }
  if (dockShellDragGripEl) {
    dockShellDragGripEl.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      postDockToHostMessage({
        source: PANEL_TO_HOST_SOURCE,
        kind: "dock-drag-start",
        iframeClientX: e.clientX,
        iframeClientY: e.clientY
      });
    });
    dockShellDragGripEl.addEventListener("dblclick", (e) => {
      e.preventDefault();
      postDockToHostMessage({ source: PANEL_TO_HOST_SOURCE, kind: "dock-drag-reset-dblclick" });
    });
  }
  minimizeDockButton.addEventListener("click", () => {
    postDockToHostMessage({ source: PANEL_TO_HOST_SOURCE, kind: "dock-minimize" });
  });
  exportDraftWorkflowJsonButton.addEventListener("click", () => {
    if (!draftSteps.length) {
      setToast("\u8349\u7A3F\u70BA\u7A7A\uFF0C\u7121\u6CD5\u532F\u51FA\u3002", "error");
      return;
    }
    const name = draftWorkflowNameInputEl.value.trim() || currentWorkflowName.trim() || `\u8349\u7A3F_${savedWorkflows.length + 1}`;
    const json = buildWorkflowExportJson(name, draftSteps);
    downloadWorkflowJsonFile(name, json);
    setToast("\u5DF2\u4E0B\u8F09\u8349\u7A3F JSON\u3002", "ok");
  });
  copyDraftWorkflowJsonButton.addEventListener("click", async () => {
    if (!draftSteps.length) {
      setToast("\u8349\u7A3F\u70BA\u7A7A\uFF0C\u7121\u6CD5\u532F\u51FA\u3002", "error");
      return;
    }
    const name = draftWorkflowNameInputEl.value.trim() || currentWorkflowName.trim() || `\u8349\u7A3F_${savedWorkflows.length + 1}`;
    const json = buildWorkflowExportJson(name, draftSteps);
    const copied = await copyWorkflowJsonToClipboard(json);
    if (copied) setToast("\u5DF2\u8907\u88FD\u8349\u7A3F JSON \u5230\u526A\u8CBC\u7C3F\u3002", "ok");
    else {
      downloadWorkflowJsonFile(name, json);
      setToast("\u8907\u88FD\u5931\u6557\uFF0C\u5DF2\u6539\u70BA\u4E0B\u8F09 JSON\u3002", "normal");
    }
  });
  importWorkflowToDraftButton.addEventListener("click", async () => {
    const text = importWorkflowJsonInputEl.value.trim();
    if (!text) {
      setToast("\u8ACB\u5148\u8CBC\u4E0A\u6D41\u7A0B JSON\u3002", "error");
      return;
    }
    const parsed = parseWorkflowImportJson(text);
    if (!parsed.ok) {
      setToast(parsed.error, "error");
      return;
    }
    const draftName = defaultImportedWorkflowName(parsed.name);
    const similar = findSavedWorkflowWithSameSignature(parsed.steps);
    const duplicateName = findSavedWorkflowWithDuplicateName(draftName);
    const hasAbsoluteUrl = workflowStepsHaveAbsoluteUrl(parsed.steps);
    const confirmed = await showWorkflowImportConfirmDialog({
      draftName,
      stepCount: parsed.steps.length,
      similar,
      duplicateName,
      hasAbsoluteUrl
    });
    if (!confirmed) return;
    draftSteps = parsed.steps.map((s) => ({
      ...s,
      params: [...s.params ?? []],
      headers: { ...s.headers ?? {} }
    }));
    currentWorkflowName = draftName;
    syncDraftWorkflowNameInputFromState();
    draftNameFromImport = true;
    editingStepIndex = -1;
    addStepButton.textContent = "\u52A0\u5165\u6D41\u7A0B\u6B65\u9A5F";
    addStepButton.classList.remove("updating");
    renderDraftSteps();
    renderApiDetail(getAllApiCandidates()[selectedApiIndex] ?? null);
    setWorkflowPanelOpen(true);
    await saveMessages();
    setToast(`\u5DF2\u532F\u5165\u8349\u7A3F\uFF1A${draftName}`, "ok");
  });
  setWorkflowPanelOpen(true);
  renderManualHeaderRowsFromObject({});
  renderManualParamsRows([]);
  bindChatMarkdownCopyOnce();
  void loadMessages();
  draftWorkflowNameInputEl.addEventListener("input", () => {
    currentWorkflowName = draftWorkflowNameInputEl.value;
    draftNameFromImport = false;
  });
  addHeaderRowButton.addEventListener("click", () => {
    appendManualHeaderRow();
  });
  addParamRowButton.addEventListener("click", () => {
    appendManualParamRow();
  });
  clearManualApiButton.addEventListener("click", () => {
    clearManualForm();
    setToast("\u5DF2\u6E05\u9664\u81EA\u8A02 API \u5167\u5BB9\u3002", "normal");
  });
  var CHAT_HEIGHT_KEY = "chat_messages_height";
  (function initChatResizeHandle() {
    const handle = document.getElementById("chatResizeHandle");
    if (!handle) return;
    const saved = sessionStorage.getItem(CHAT_HEIGHT_KEY);
    if (saved) {
      chatMessagesEl.style.height = saved;
      chatMessagesEl.classList.add("chat-messages--user-height");
    }
    let startY = 0;
    let startH = 0;
    function onMouseMove(e) {
      const delta = e.clientY - startY;
      const newH = Math.max(80, startH + delta);
      chatMessagesEl.classList.add("chat-messages--user-height");
      chatMessagesEl.style.height = `${newH}px`;
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
      chatMessagesEl.classList.add("chat-messages--user-height");
      handle.classList.add("dragging");
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  })();
})();
