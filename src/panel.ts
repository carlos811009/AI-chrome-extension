export {};

declare const chrome:
  | {
      identity?: {
        getAuthToken: (details: { interactive: boolean }, callback: (token?: string) => void) => void;
        getProfileUserInfo: (callback: (userInfo: { email?: string; id?: string }) => void) => void;
        getRedirectURL: (path?: string) => string;
        launchWebAuthFlow: (
          details: { url: string; interactive: boolean },
          callback: (responseUrl?: string) => void,
        ) => void;
      };
      runtime?: { lastError?: { message?: string } };
      storage?: {
        local?: {
          get: (keys: string[]) => Promise<Record<string, unknown>>;
          set: (items: Record<string, string>) => Promise<void>;
        };
      };
    }
  | undefined;

type ChatRole = "user" | "assistant";
type ChatMessage = {
  role: ChatRole;
  content: string;
  at: string;
};
type OAuthGrantInfo = {
  accessToken: string;
  expiresIn: string;
  scope: string;
  tokenType: string;
  redirectUri: string;
};
type GoogleUserInfo = {
  email?: string;
  sub?: string;
  name?: string;
};
type ApiSpec = {
  api: string;
  path?: string;
  requestName?: string;
  method?: string;
  headers?: Record<string, string>;
  bodyTemplate?: string;
  bearerToken?: string;
  purpose: string;
  params: string[];
};
type WorkflowStep = ApiSpec;
type ExecStepResult = {
  index: number;
  name: string;
  ok: boolean;
  statusText: string;
  response: string;
};
type ExecResult = {
  workflowName: string;
  timestamp: string;
  ok: boolean;
  steps: ExecStepResult[];
};
type SavedWorkflow = {
  id: string;
  name: string;
  steps: WorkflowStep[];
};
type AuthState = {
  firebaseIdToken: string;
  googleAccessToken: string;
  expiresAt: number;
  accountEmail: string;
};

const STORAGE_KEY = "chatMessages";
const SESSION_ID_KEY = "chatSessionId";
const WORKFLOWS_KEY = "savedWorkflows";
const EXEC_RESULTS_KEY = "execResults";
const AUTH_STATE_KEY = "authState";
const CUSTOM_APIS_KEY = "customApis";
const MAX_MESSAGES = 40;
const GOOGLE_OAUTH_CLIENT_ID = "";
const GOOGLE_OAUTH_SCOPE = "openid email profile";
// TODO: 需要替換
const FIREBASE_WEB_API_KEY = "";
const AGENT_CHAT_API = "";
const toastStatusEl = document.getElementById("toastStatus") as HTMLDivElement;
const toggleChatButton = document.getElementById("toggleChat") as HTMLButtonElement;
const chatPanelEl = document.getElementById("chatPanel") as HTMLDivElement;
const chatMessagesEl = document.getElementById("chatMessages") as HTMLDivElement;
const chatFormEl = document.getElementById("chatForm") as HTMLFormElement;
const chatInputEl = document.getElementById("chatInput") as HTMLTextAreaElement;
const skillConfirmEl = document.getElementById("skillConfirm") as HTMLDivElement;
const skillUseButton = document.getElementById("skillUse") as HTMLButtonElement;
const skillSkipButton = document.getElementById("skillSkip") as HTMLButtonElement;
const sendMessageButton = document.getElementById("sendMessage") as HTMLButtonElement;
const clearChatButton = document.getElementById("clearChat") as HTMLButtonElement;
const authStatusEl = document.getElementById("authStatus") as HTMLParagraphElement;
const authorizeGoogleButton = document.getElementById("authorizeGoogle") as HTMLButtonElement;
const oauthInfoEl = document.getElementById("oauthInfo") as HTMLPreElement;
const toggleWorkflowsButton = document.getElementById("toggleWorkflows") as HTMLButtonElement;
const workflowPanelEl = document.getElementById("workflowPanel") as HTMLDivElement;
const toggleCurlParserButton = document.getElementById("toggleCurlParser") as HTMLButtonElement;
const curlParserPanelEl = document.getElementById("curlParserPanel") as HTMLDivElement;
const toggleManualApiButton = document.getElementById("toggleManualApi") as HTMLButtonElement;
const manualApiPanelEl = document.getElementById("manualApiPanel") as HTMLDivElement;
const apiCandidatesEl = document.getElementById("apiCandidates") as HTMLDivElement;
const manualApiNameEl = document.getElementById("manualApiName") as HTMLInputElement;
const manualApiPathEl = document.getElementById("manualApiPath") as HTMLInputElement;
const manualApiPurposeEl = document.getElementById("manualApiPurpose") as HTMLInputElement;
const manualApiCurlEl = document.getElementById("manualApiCurl") as HTMLTextAreaElement;
const parseCurlButton = document.getElementById("parseCurl") as HTMLButtonElement;
const manualApiMethodEl = document.getElementById("manualApiMethod") as HTMLSelectElement;
const manualApiHeadersRowsEl = document.getElementById("manualApiHeadersRows") as HTMLDivElement;
const addHeaderRowButton = document.getElementById("addHeaderRow") as HTMLButtonElement;
const manualApiBodyEl = document.getElementById("manualApiBody") as HTMLTextAreaElement;
const addManualApiButton = document.getElementById("addManualApi") as HTMLButtonElement;
const manualApiActionsEl = document.getElementById("manualApiActions") as HTMLDivElement;
const apiDetailNameEl = document.getElementById("apiDetailName") as HTMLDivElement;
const apiDetailPurposeEl = document.getElementById("apiDetailPurpose") as HTMLDivElement;
const apiDetailParamsEl = document.getElementById("apiDetailParams") as HTMLDivElement;
const addStepButton = document.getElementById("addStep") as HTMLButtonElement;
const draftStepsEl = document.getElementById("draftSteps") as HTMLOListElement;
const runWorkflowButton = document.getElementById("runWorkflow") as HTMLButtonElement;
const saveWorkflowButton = document.getElementById("saveWorkflow") as HTMLButtonElement;
const clearDraftButton = document.getElementById("clearDraft") as HTMLButtonElement;
const savedWorkflowsEl = document.getElementById("savedWorkflows") as HTMLDivElement;
const toggleSavedApisButton = document.getElementById("toggleSavedApis") as HTMLButtonElement;
const savedApisPanelEl = document.getElementById("savedApisPanel") as HTMLDivElement;
const savedApisListEl = document.getElementById("savedApisList") as HTMLDivElement;
const toggleSavedWorkflowsButton = document.getElementById("toggleSavedWorkflows") as HTMLButtonElement;
const savedWorkflowsPanelEl = document.getElementById("savedWorkflowsPanel") as HTMLDivElement;
const executionResultSectionEl = document.getElementById("executionResultSection") as HTMLDivElement;
const toggleExecutionResultButton = document.getElementById("toggleExecutionResult") as HTMLButtonElement;
const executionResultPanelEl = document.getElementById("executionResultPanel") as HTMLDivElement;
const executionResultListEl = document.getElementById("executionResultList") as HTMLDivElement;
const clearExecutionResultButton = document.getElementById("clearExecutionResult") as HTMLButtonElement;
const MAX_EXEC_RESULTS = 10;
let execResults: ExecResult[] = [];

let messages: ChatMessage[] = [];
let isAuthorized = false;
let firebaseIdToken = "";
let googleAccessToken = "";
let authExpiresAt = 0;
let accountEmail = "";
let chatSessionId: string = globalThis.crypto?.randomUUID?.() || `session-${Date.now()}`;
let apiCandidates: ApiSpec[] = [];
let customApiSpecs: ApiSpec[] = [];
let savedWorkflows: SavedWorkflow[] = [];
let draftSteps: WorkflowStep[] = [];
let selectedApiIndex = -1;
let chatPanelOpen = true;
let workflowPanelOpen = true;
let curlParserOpen = false;
let manualApiOpen = false;
let savedWorkflowsOpen = false;
let savedApisOpen = false;
let editedDetailSpec: ApiSpec | null = null;
let editingStepIndex = -1;
let editingApiIndex = -1;
let pendingUserMessage = "";
let currentWorkflowName = "";
const fallbackStorage = new Map<string, string>();
const extensionChrome = typeof chrome !== "undefined" ? chrome : undefined;

function isAuthStateValid(state: AuthState): boolean {
  return Boolean(
    state.firebaseIdToken &&
    state.googleAccessToken &&
    state.expiresAt &&
    Number.isFinite(state.expiresAt) &&
    Date.now() < state.expiresAt,
  );
}

function getCurrentAuthState(): AuthState | null {
  if (!firebaseIdToken || !googleAccessToken || !authExpiresAt || Date.now() >= authExpiresAt) return null;
  return {
    firebaseIdToken,
    googleAccessToken,
    expiresAt: authExpiresAt,
    accountEmail,
  };
}

function clearAuthStateInMemory(): void {
  isAuthorized = false;
  firebaseIdToken = "";
  googleAccessToken = "";
  authExpiresAt = 0;
  accountEmail = "";
}

function isAuthExpired(): boolean {
  if (!isAuthorized || !firebaseIdToken) return true;
  if (authExpiresAt > 0 && Date.now() >= authExpiresAt) return true;
  return false;
}

function notifyAuthExpired(): void {
  clearAuthStateInMemory();
  setChatEnabled(false);
  setAuthStatus("授權已失效，請重新點擊「Google 授權」登入。", "error");
  authorizeGoogleButton.classList.add("auth-expired-pulse");
}

function setAuthStatus(text: string, status: "normal" | "ok" | "error" = "normal"): void {
  authStatusEl.textContent = text;
  authStatusEl.classList.remove("ok", "error");
  if (status !== "normal") authStatusEl.classList.add(status);
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
function copyToClipboard(text: string, btn: HTMLButtonElement): void {
  const succeed = () => {
    btn.textContent = "已複製 ✓";
    setTimeout(() => {
      btn.textContent = "複製";
    }, 1500);
  };
  const fail = () => setToast("複製失敗，請手動選取文字。", "error");

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(succeed)
      .catch(() => {
        // Fallback: execCommand
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

function setToast(text: string, status: "normal" | "ok" | "error" = "normal", autoDismissMs = 4000): void {
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

function setOAuthInfo(text: string): void {
  oauthInfoEl.textContent = text;
}

function updateWorkflowToggleLabel(): void {
  toggleWorkflowsButton.textContent = workflowPanelOpen ? "常用工作流程 ▾" : "常用工作流程 ▸";
}

function setCurlParserOpen(open: boolean): void {
  curlParserOpen = open;
  curlParserPanelEl.classList.toggle("collapsed", !open);
  toggleCurlParserButton.textContent = open ? "解析 Curl ▾" : "解析 Curl ▸";
}
function setManualApiOpen(open: boolean): void {
  manualApiOpen = open;
  manualApiPanelEl.classList.toggle("collapsed", !open);
  toggleManualApiButton.textContent = open ? "自訂 API ▾" : "自訂 API ▸";
}
function setSavedWorkflowsOpen(open: boolean): void {
  savedWorkflowsOpen = open;
  savedWorkflowsPanelEl.classList.toggle("collapsed", !open);
  toggleSavedWorkflowsButton.textContent = open ? "已儲存流程 ▾" : "已儲存流程 ▸";
}
function setSavedApisOpen(open: boolean): void {
  savedApisOpen = open;
  savedApisPanelEl.classList.toggle("collapsed", !open);
  toggleSavedApisButton.textContent = open ? "已儲存的 API ▾" : "已儲存的 API ▸";
}
function setChatPanelOpen(open: boolean): void {
  chatPanelOpen = open;
  chatPanelEl.classList.toggle("collapsed", !open);
  toggleChatButton.textContent = open ? "AI 小幫手 ▾" : "AI 小幫手 ▸";
}

function setWorkflowPanelOpen(open: boolean): void {
  workflowPanelOpen = open;
  workflowPanelEl.classList.toggle("collapsed", !open);
  updateWorkflowToggleLabel();
}

function setChatEnabled(enabled: boolean): void {
  chatInputEl.disabled = !enabled;
  sendMessageButton.disabled = !enabled;
  skillUseButton.disabled = !enabled;
  skillSkipButton.disabled = !enabled;
  chatInputEl.placeholder = enabled
    ? "例如：業務離職了，我要移除他的 sales 與 lineUser 身份"
    : "請先完成 Google 授權後，才可使用對話窗";
}

function toggleSkillConfirm(show: boolean): void {
  skillConfirmEl.classList.toggle("hidden", !show);
}

function shouldPromptSkillConfirm(message: string): boolean {
  if (getAllApiCandidates().length > 0) return true;
  return /(api|權限|流程|查詢|刪除|新增|更新)/i.test(message);
}

function buildMessageWithSkillDirective(rawMessage: string, useSkill: boolean): string {
  if (!useSkill) return rawMessage;
  return `${rawMessage}

[系統指令]
若你判斷有可用 skill 或工具，請優先使用 skill 來回答，並在回覆開頭簡短說明「已使用的 skill 與原因」。
若無合適 skill，請明確說明「本次不使用 skill」並直接給一般回答。`;
}

function normalizeParams(value: unknown): string[] {
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

function maskBearerToken(token: string): string {
  return maskToken(token.replace(/^Bearer\s+/i, "").trim());
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

function maskSensitiveHeaderValue(key: string, value: string): string {
  const k = key.toLowerCase();
  const raw = value.replace(/^Bearer\s+/i, "").trim();
  if (k === "authorization" || k === "x-api-key" || k.endsWith("api-key")) return maskToken(raw);
  if (raw.length > 32) return maskToken(raw);
  return value;
}

function buildHeaderKeySelect(selectedKey: string): HTMLSelectElement {
  const select = document.createElement("select");
  select.className = "header-key-select";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "選擇 Key";
  select.appendChild(empty);
  HEADER_KEY_PRESETS.forEach((preset) => {
    const opt = document.createElement("option");
    opt.value = preset;
    opt.textContent = preset;
    select.appendChild(opt);
  });
  const customOpt = document.createElement("option");
  customOpt.value = HEADER_KEY_CUSTOM;
  customOpt.textContent = "自訂…";
  select.appendChild(customOpt);
  if (selectedKey && HEADER_KEY_PRESETS.includes(selectedKey)) {
    select.value = selectedKey;
  } else if (selectedKey) {
    select.value = HEADER_KEY_CUSTOM;
  }
  return select;
}

function syncHeaderRowCustomVisibility(row: HTMLDivElement): void {
  const select = row.querySelector(".header-key-select") as HTMLSelectElement;
  const custom = row.querySelector(".header-key-custom") as HTMLInputElement;
  if (!select || !custom) return;
  const isCustom = select.value === HEADER_KEY_CUSTOM;
  custom.classList.toggle("visible", isCustom);
  if (!isCustom) custom.value = "";
}

function appendManualHeaderRow(key = "", value = ""): void {
  const row = document.createElement("div");
  row.className = "header-row";
  const wrap = document.createElement("div");
  wrap.className = "header-key-wrap";
  const select = buildHeaderKeySelect(key);
  const customKey = document.createElement("input");
  customKey.type = "text";
  customKey.className = "header-key-custom";
  customKey.placeholder = "自訂 Key";
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
  removeBtn.textContent = "移除";
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

function renderManualHeaderRowsFromObject(headers: Record<string, string>): void {
  manualApiHeadersRowsEl.replaceChildren();
  const entries = Object.entries(headers).filter(([k]) => k.trim());
  if (!entries.length) {
    appendManualHeaderRow();
    return;
  }
  entries.forEach(([k, v]) => appendManualHeaderRow(k, v));
}

function collectManualHeaders(): Record<string, string> {
  const out: Record<string, string> = {};
  manualApiHeadersRowsEl.querySelectorAll(".header-row").forEach((node) => {
    const row = node as HTMLDivElement;
    const select = row.querySelector(".header-key-select") as HTMLSelectElement;
    const custom = row.querySelector(".header-key-custom") as HTMLInputElement;
    const valInput = row.querySelector(".header-value") as HTMLInputElement;
    if (!select || !valInput) return;
    let key = "";
    if (select.value === HEADER_KEY_CUSTOM) key = custom.value.trim();
    else key = select.value.trim();
    const val = valInput.value.trim();
    if (key && val) out[key] = val;
  });
  return out;
}

function extractCurlUrl(text: string): string {
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

function parseCurlHeadersBlock(text: string): Record<string, string> {
  const normalized = text.replace(/\\\r?\n/g, " ").replace(/\r/g, " ");
  const headers: Record<string, string> = {};
  const singleQuoted = /(?:-H|--header)\s+'([^']*)'/gi;
  let match: RegExpExecArray | null;
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

function inferParamsFromPathAndBody(path: string, body: string): string[] {
  const fromPathTemplate = Array.from(path.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)).map((m) => m[1]);
  const fromColonPath = Array.from(path.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)/g)).map((m) => m[1]);
  let fromQuery: string[] = [];
  try {
    const qIdx = path.indexOf("?");
    if (qIdx >= 0) {
      fromQuery = Array.from(new URLSearchParams(path.slice(qIdx + 1)).keys());
    }
  } catch {
    fromQuery = [];
  }
  let fromBody: string[] = [];
  if (body.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      fromBody = Object.keys(parsed);
    } catch {
      fromBody = [];
    }
  }
  return Array.from(new Set([...fromPathTemplate, ...fromColonPath, ...fromQuery, ...fromBody]));
}

function extractCurlBody(normalized: string): string {
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

function parseCurlCommand(curlText: string): {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  bearerToken: string;
} | null {
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

function mergeApiSpecs(primary: ApiSpec[], secondary: ApiSpec[]): ApiSpec[] {
  const map = new Map<string, ApiSpec>();
  const upsert = (next: ApiSpec): void => {
    const key = next.path || next.api;
    const current = map.get(key);
    if (!current) {
      map.set(key, { ...next, params: [...new Set(next.params)] });
      return;
    }
    map.set(key, {
      ...current,
      ...next,
      api: current.api || next.api,
      path: current.path || next.path,
      requestName: current.requestName || next.requestName,
      method: current.method || next.method,
      bodyTemplate: current.bodyTemplate || next.bodyTemplate,
      bearerToken: current.bearerToken || next.bearerToken,
      headers: { ...(next.headers || {}), ...(current.headers || {}) },
      purpose: current.purpose !== "待補充目的" ? current.purpose : next.purpose,
      params: Array.from(new Set([...current.params, ...next.params])),
    });
  };
  secondary.forEach(upsert);
  primary.forEach(upsert);
  return Array.from(map.values());
}

function getAllApiCandidates(): ApiSpec[] {
  return [...apiCandidates];
}

function extractApiCandidatesFromText(text: string): ApiSpec[] {
  const specs = new Map<string, ApiSpec>();
  const upsert = (next: ApiSpec): void => {
    const key = next.path || next.api;
    const current = specs.get(key);
    if (!current) {
      specs.set(key, {
        ...next,
        params: [...new Set(next.params.map((p) => p.trim()).filter(Boolean))],
      });
      return;
    }
    const mergedParams = Array.from(new Set([...current.params, ...next.params].map((p) => p.trim()).filter(Boolean)));
    specs.set(key, {
      ...current,
      ...next,
      api: current.api || next.api,
      path: current.path || next.path,
      requestName: current.requestName || next.requestName,
      purpose: current.purpose !== "待補充目的" ? current.purpose : next.purpose,
      params: mergedParams,
    });
  };

  const jsonBlocks = Array.from(text.matchAll(/```json([\s\S]*?)```/g));
  for (const block of jsonBlocks) {
    const raw = block[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const list = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).apis)
          ? ((parsed as Record<string, unknown>).apis as unknown[])
          : [];
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;
        const api = String(obj.api || obj.name || obj.id || obj.path || "").trim();
        if (!api) continue;
        const purpose = String(obj.purpose || obj.description || "待補充目的").trim();
        const params = normalizeParams(obj.params || obj.requiredParams || obj.arguments);
        const path = String(obj.path || obj.endpoint || "").trim() || undefined;
        const requestName = String(obj.requestName || obj.request || "").trim() || undefined;
        upsert({ api: path || api, path, requestName, purpose, params });
      }
    } catch {
      // ignore invalid JSON blocks
    }
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
    const purpose = path ? `對應請求：${requestName}` : `請求模型：${requestName}`;
    upsert({
      api: path || requestName,
      path: path || undefined,
      requestName,
      purpose,
      params: [...typedFields, ...bulletFields],
    });
  }

  if (!specs.size) {
    const tokenRegex = /\b([a-zA-Z][\w-]*(?:[./][a-zA-Z][\w-]*)+)\b/g;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(text)) !== null) {
      const api = match[1];
      if (api.length < 4) continue;
      upsert({ api, path: api.includes("/") ? api : undefined, purpose: "待補充目的", params: [] });
      if (specs.size >= 20) break;
    }
  }

  return Array.from(specs.values()).slice(0, 20);
}

function buildDetailSection(label: string, defaultOpen: boolean): { wrap: HTMLDivElement; body: HTMLDivElement } {
  const wrap = document.createElement("div");
  wrap.className = "detail-section";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "detail-section-toggle";
  toggle.textContent = `${defaultOpen ? "▾" : "▸"} ${label}`;
  const body = document.createElement("div");
  body.className = "detail-section-body" + (defaultOpen ? "" : " collapsed");
  toggle.addEventListener("click", () => {
    const isCollapsed = body.classList.toggle("collapsed");
    toggle.textContent = `${isCollapsed ? "▸" : "▾"} ${label}`;
  });
  wrap.appendChild(toggle);
  wrap.appendChild(body);
  return { wrap, body };
}

function renderApiDetail(spec: ApiSpec | null): void {
  if (!spec) {
    apiDetailNameEl.textContent = "尚未選擇 API";
    apiDetailPurposeEl.textContent = "用途：-";
    apiDetailParamsEl.replaceChildren();
    editedDetailSpec = null;
    return;
  }

  editedDetailSpec = { ...spec, params: [...(spec.params ?? [])], headers: { ...(spec.headers ?? {}) } };

  apiDetailNameEl.textContent = spec.requestName ?? spec.api;
  const purposeText = (spec.purpose ?? "").trim();
  apiDetailPurposeEl.textContent = purposeText ? `用途：${purposeText}` : "";
  apiDetailPurposeEl.style.display = purposeText ? "" : "none";

  const container = document.createDocumentFragment();

  // URL (read-only display, updated when params change)
  const urlCode = document.createElement("code");
  urlCode.className = "detail-url-code";
  urlCode.textContent = `${spec.method ?? "GET"} ${spec.path ?? spec.api ?? "-"}`;
  container.appendChild(urlCode);

  // ── Params ──
  const urlParamObj: Record<string, string> = {};
  try {
    const qIdx = (spec.path ?? spec.api ?? "").indexOf("?");
    if (qIdx >= 0)
      new URLSearchParams((spec.path ?? spec.api ?? "").slice(qIdx + 1)).forEach((v, k) => {
        urlParamObj[k] = v;
      });
  } catch {
    /**/
  }
  const allParamKeys = [...new Set([...(spec.params ?? []), ...Object.keys(urlParamObj)])];

  if (allParamKeys.length) {
    const sec = buildDetailSection("Params（URL 查詢參數）", true);
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
      inp.placeholder = "（值）";
      inp.addEventListener("input", () => {
        if (!editedDetailSpec) return;
        try {
          const base = (editedDetailSpec.path ?? editedDetailSpec.api ?? "").split("?")[0];
          const collected: Record<string, string> = {};
          list.querySelectorAll<HTMLDivElement>(".detail-edit-row").forEach((r) => {
            const k = (r.querySelector(".detail-edit-key") as HTMLSpanElement).textContent ?? "";
            const v = (r.querySelector(".detail-edit-input") as HTMLInputElement).value;
            if (v) collected[k] = v;
          });
          const qs = new URLSearchParams(collected).toString();
          const newPath = qs ? `${base}?${qs}` : base;
          editedDetailSpec.path = newPath;
          urlCode.textContent = `${editedDetailSpec.method ?? "GET"} ${newPath}`;
        } catch {
          /**/
        }
      });
      row.appendChild(label);
      row.appendChild(inp);
      list.appendChild(row);
    });
    sec.body.appendChild(list);
    container.appendChild(sec.wrap);
  }

  // ── Headers ──
  const visibleHeaders = Object.entries(spec.headers ?? {}).filter(([k]) => k.toLowerCase() !== "authorization");
  const headerSec = buildDetailSection(`Headers（${visibleHeaders.length} 個）`, visibleHeaders.length > 0);
  const headerList = document.createElement("div");
  headerList.className = "detail-edit-list";

  const rebuildEditedHeaders = () => {
    if (!editedDetailSpec) return;
    const obj: Record<string, string> = {};
    headerList.querySelectorAll<HTMLDivElement>(".detail-edit-row").forEach((r) => {
      const k = (r.querySelector(".detail-edit-key-input") as HTMLInputElement).value.trim();
      const v = (r.querySelector(".detail-edit-val-input") as HTMLInputElement).value;
      if (k) obj[k] = v;
    });
    editedDetailSpec.headers = obj;
  };

  const addEditableHeaderRow = (k: string, v: string) => {
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
    removeBtn.textContent = "✕";
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
  addHdrBtn.textContent = "＋ 新增 Header";
  addHdrBtn.addEventListener("click", () => addEditableHeaderRow("", ""));
  headerSec.body.appendChild(headerList);
  headerSec.body.appendChild(addHdrBtn);
  container.appendChild(headerSec.wrap);

  // ── Body ──
  const bodySec = buildDetailSection("Body（JSON）", !!spec.bodyTemplate);
  const bodyTa = document.createElement("textarea");
  bodyTa.className = "detail-edit-body";
  bodyTa.placeholder = "（可貼上 JSON）";
  bodyTa.value = spec.bodyTemplate ?? "";
  bodyTa.addEventListener("input", () => {
    if (editedDetailSpec) editedDetailSpec.bodyTemplate = bodyTa.value;
  });
  bodySec.body.appendChild(bodyTa);
  container.appendChild(bodySec.wrap);

  apiDetailParamsEl.replaceChildren(container);
}

function refreshApiCandidatesFromLatestAssistant(): void {
  const latestAssistant = [...messages].reverse().find((m) => m.role === "assistant" && m.content.trim());
  apiCandidates = latestAssistant ? extractApiCandidatesFromText(latestAssistant.content) : [];
  selectedApiIndex = apiCandidates.length ? 0 : -1;
  renderApiCandidates();
}

function isCustomSpec(spec: ApiSpec): boolean {
  const key = spec.path || spec.api;
  return customApiSpecs.some((c) => (c.path || c.api) === key);
}
function removeCustomSpec(spec: ApiSpec): void {
  const key = spec.path || spec.api;
  customApiSpecs = customApiSpecs.filter((c) => (c.path || c.api) !== key);
}
function renderApiCandidates(): void {
  const allCandidates = getAllApiCandidates();
  apiCandidatesEl.replaceChildren();
  if (!allCandidates.length) {
    const empty = document.createElement("div");
    empty.className = "workflow-subtitle";
    empty.textContent = "尚未偵測到 API，可手動新增。";
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
      removeBtn.title = "移除此 API";
      removeBtn.textContent = "✕";
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

function renderDraftSteps(): void {
  draftStepsEl.replaceChildren();
  if (!draftSteps.length) {
    const empty = document.createElement("li");
    empty.className = "workflow-subtitle";
    empty.textContent = "尚未加入步驟。";
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
    editBtn.textContent = index === editingStepIndex ? "編輯中" : "編輯";
    editBtn.disabled = index === editingStepIndex;
    editBtn.addEventListener("click", () => {
      editingStepIndex = index;
      addStepButton.textContent = "更新步驟";
      addStepButton.classList.add("updating");
      renderApiDetail({ ...step });
      renderDraftSteps();
    });
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "draft-step-delete";
    delBtn.textContent = "✕";
    delBtn.title = index === editingStepIndex ? "編輯中，無法刪除" : "移除此步驟";
    delBtn.disabled = index === editingStepIndex;
    delBtn.addEventListener("click", () => {
      draftSteps.splice(index, 1);
      if (editingStepIndex === index) {
        editingStepIndex = -1;
        addStepButton.textContent = "加入流程步驟";
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

function renderSavedWorkflows(): void {
  savedWorkflowsEl.replaceChildren();
  if (!savedWorkflows.length) {
    const empty = document.createElement("div");
    empty.className = "workflow-subtitle";
    empty.textContent = "尚未建立流程。";
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
      setToast(`已載入流程：${workflow.name}`, "ok");
      chatInputEl.focus();
    });
    savedWorkflowsEl.appendChild(chip);
  });
}

function renderSavedApis(): void {
  savedApisListEl.replaceChildren();
  if (!customApiSpecs.length) {
    const empty = document.createElement("div");
    empty.className = "detail-empty";
    empty.textContent = "尚未儲存任何 API";
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
    selectBtn.textContent = "選擇";
    if (index === selectedApiIndex) selectBtn.classList.add("active");
    selectBtn.addEventListener("click", () => {
      selectedApiIndex = index;
      renderSavedApis();
      renderApiDetail({ ...spec });
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "編輯";
    if (index === editingApiIndex) editBtn.classList.add("active");
    editBtn.addEventListener("click", () => {
      editingApiIndex = index;
      selectedApiIndex = -1;
      renderSavedApis();
      addManualApiButton.textContent = "儲存";
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
      setToast(`正在編輯：${spec.requestName ?? spec.api}`, "normal");
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "saved-api-delete";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "刪除此 API";
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

function maskToken(token: string): string {
  if (token.length <= 14) return token;
  return `${token.slice(0, 10)}...${token.slice(-4)}`;
}

function createOAuthState(): string {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`userinfo 取得失敗 (${response.status})`);
  }
  return (await response.json()) as GoogleUserInfo;
}

async function exchangeGoogleTokenForFirebaseIdToken(googleAccessToken: string): Promise<string> {
  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(
    FIREBASE_WEB_API_KEY,
  )}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postBody: `access_token=${encodeURIComponent(googleAccessToken)}&providerId=google.com`,
      requestUri: "https://localhost",
      returnIdpCredential: true,
      returnSecureToken: true,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firebase token 交換失敗 (${response.status}) ${text}`);
  }
  const data = (await response.json()) as { idToken?: string };
  if (!data.idToken) throw new Error("Firebase 回應缺少 idToken");
  return data.idToken;
}

async function callAgentChatApi(message: string): Promise<string> {
  if (!firebaseIdToken) {
    throw new Error("尚未取得 Firebase idToken，請先完成 Google 授權");
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
    throw new Error(`Agent API 失敗 (${response.status}) ${text}`);
  }
  const data = (await response.json()) as {
    reply?: string;
    message?: string;
    data?: { reply?: string; message?: string };
  };
  return data.reply || data.message || data.data?.reply || data.data?.message || JSON.stringify(data);
}

function extractTextFromPayload(payload: unknown): string {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload !== "object") return "";
  const data = payload as Record<string, unknown>;
  if (typeof data.reply === "string") return data.reply;
  if (typeof data.message === "string") return data.message;
  if (typeof data.content === "string") return data.content;
  if (data.data && typeof data.data === "object") {
    const nested = data.data as Record<string, unknown>;
    if (typeof nested.reply === "string") return nested.reply;
    if (typeof nested.message === "string") return nested.message;
    if (typeof nested.content === "string") return nested.content;
  }
  if (Array.isArray(data.choices)) {
    const first = data.choices[0] as Record<string, unknown> | undefined;
    const delta = first?.delta as Record<string, unknown> | undefined;
    if (typeof delta?.content === "string") return delta.content;
    if (typeof first?.text === "string") return first.text;
  }
  return "";
}

function stripThinkingText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, "")
    .replace(/^\s*(思考|thinking)\s*[:：].*$/gim, "");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAssistantMarkdown(text: string): string {
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

async function callAgentChatApiStream(message: string, onDelta: (chunk: string) => void): Promise<string> {
  if (!firebaseIdToken) {
    throw new Error("尚未取得 Firebase idToken，請先完成 Google 授權");
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
    throw new Error(`Agent API 失敗 (${response.status}) ${text}`);
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
    let parsed: unknown = {};
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

function renderMessages(): void {
  chatMessagesEl.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty-tip";
    empty.textContent = "先輸入需求，例如：業務離職後要停用 sales 與 lineUser 身份。";
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
    meta.textContent = `${message.role === "user" ? "你" : "Agent"} · ${message.at}`;

    row.appendChild(bubble);
    row.appendChild(meta);
    chatMessagesEl.appendChild(row);
  });
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

async function loadMessages(): Promise<void> {
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
  setAuthStatus("尚未授權，請先按「Google 授權」。", "normal");
  setChatEnabled(false);

  if (typeof saved[SESSION_ID_KEY] === "string" && saved[SESSION_ID_KEY]) {
    chatSessionId = saved[SESSION_ID_KEY] as string;
  }

  if (saved[STORAGE_KEY]) {
    try {
      const parsed = JSON.parse(saved[STORAGE_KEY] as string) as unknown[];
      if (Array.isArray(parsed)) {
        messages = parsed.slice(-MAX_MESSAGES).filter((item): item is ChatMessage => {
          return (
            Boolean(item) &&
            typeof item === "object" &&
            (item as ChatMessage).role !== undefined &&
            typeof (item as ChatMessage).content === "string" &&
            typeof (item as ChatMessage).at === "string"
          );
        });
      }
    } catch {
      messages = [];
    }
  }
  if (saved[WORKFLOWS_KEY]) {
    try {
      const parsedWorkflows = JSON.parse(saved[WORKFLOWS_KEY] as string) as Array<SavedWorkflow & { apis?: string[] }>;
      if (Array.isArray(parsedWorkflows)) {
        savedWorkflows = parsedWorkflows
          .filter((item) => Boolean(item) && typeof item === "object")
          .map((item) => {
            const legacySteps = Array.isArray(item.apis)
              ? item.apis
                  .map((api) => String(api || "").trim())
                  .filter(Boolean)
                  .map((api) => ({ api, purpose: "待補充目的", params: [] as string[] }))
              : [];
            const steps = Array.isArray(item.steps)
              ? item.steps
                  .filter((step) => step && typeof step.api === "string")
                  .map((step) => ({
                    api: step.api,
                    path: typeof step.path === "string" ? step.path : undefined,
                    requestName: typeof step.requestName === "string" ? step.requestName : undefined,
                    method: typeof step.method === "string" ? step.method : undefined,
                    headers:
                      step.headers && typeof step.headers === "object"
                        ? { ...(step.headers as Record<string, string>) }
                        : {},
                    bodyTemplate: typeof step.bodyTemplate === "string" ? step.bodyTemplate : "",
                    bearerToken: typeof step.bearerToken === "string" ? step.bearerToken : "",
                    purpose: typeof step.purpose === "string" ? step.purpose : "待補充目的",
                    params: Array.isArray(step.params) ? step.params.map((p) => String(p)) : [],
                  }))
              : legacySteps;
            return {
              id: typeof item.id === "string" ? item.id : `wf-${Date.now()}`,
              name: typeof item.name === "string" ? item.name : "未命名流程",
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
      const parsedCustomApis = JSON.parse(saved[CUSTOM_APIS_KEY] as string) as ApiSpec[];
      if (Array.isArray(parsedCustomApis)) {
        customApiSpecs = parsedCustomApis
          .filter((item) => item && typeof item.api === "string")
          .map((item) => ({
            api: item.api,
            path: typeof item.path === "string" ? item.path : undefined,
            requestName: typeof item.requestName === "string" ? item.requestName : undefined,
            method: typeof item.method === "string" ? item.method : undefined,
            headers: item.headers && typeof item.headers === "object" ? (item.headers as Record<string, string>) : {},
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
      const parsed = JSON.parse(saved[EXEC_RESULTS_KEY] as string) as ExecResult[];
      if (Array.isArray(parsed)) execResults = parsed.slice(0, MAX_EXEC_RESULTS);
    }
  } catch {
    execResults = [];
  }
  renderExecResults();

  if (typeof saved[AUTH_STATE_KEY] === "string" && saved[AUTH_STATE_KEY]) {
    try {
      const parsed = JSON.parse(saved[AUTH_STATE_KEY] as string) as AuthState;
      if (isAuthStateValid(parsed)) {
        firebaseIdToken = parsed.firebaseIdToken;
        googleAccessToken = parsed.googleAccessToken;
        authExpiresAt = parsed.expiresAt;
        accountEmail = parsed.accountEmail || "(無法取得 email)";
        isAuthorized = true;
        setChatEnabled(true);
        setAuthStatus(`已授權（${accountEmail}）`, "ok");
        setOAuthInfo(`account_email: ${accountEmail}`);
        return;
      }
    } catch {
      // ignore parse errors and fallback to interactive auth
    }
  }

  const identityInfo = await checkIdentityAuthorization();
  console.log("identityInfo", identityInfo);
  if (identityInfo.authorized) {
    setAuthStatus(`${identityInfo.message}，但 Token 已過期，請重新授權。`, "normal");
  }
}

async function saveMessages(): Promise<void> {
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

function pushMessage(role: ChatRole, content: string): number {
  messages.push({
    role,
    content,
    at: new Date().toLocaleTimeString("zh-Hant-TW", { hour: "2-digit", minute: "2-digit" }),
  });
  messages = messages.slice(-MAX_MESSAGES);
  renderMessages();
  return messages.length - 1;
}

function appendToMessage(index: number, chunk: string): void {
  if (!messages[index]) return;
  messages[index].content += chunk;
  renderMessages();
  refreshApiCandidatesFromLatestAssistant();
}

function checkIdentityAuthorization(): Promise<{ authorized: boolean; message: string }> {
  return new Promise((resolve) => {
    if (!extensionChrome?.identity?.getProfileUserInfo) {
      resolve({ authorized: false, message: "目前環境不支援 chrome.identity" });
      return;
    }
    extensionChrome.identity.getProfileUserInfo((userInfo) => {
      const maybeError = extensionChrome?.runtime?.lastError?.message;
      if (maybeError) {
        resolve({ authorized: false, message: maybeError });
        return;
      }
      if (!userInfo?.email) {
        resolve({ authorized: false, message: "尚未完成 OAuth 授權，請按「Google 授權」" });
        return;
      }
      resolve({ authorized: true, message: `已偵測瀏覽器帳號 ${userInfo.email}` });
    });
  });
}

function requestOAuthAuthorization(): Promise<OAuthGrantInfo> {
  return new Promise((resolve, reject) => {
    if (!extensionChrome?.identity?.launchWebAuthFlow || !extensionChrome?.identity?.getRedirectURL) {
      reject(new Error("目前環境不支援 chrome.identity.launchWebAuthFlow"));
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

    extensionChrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (responseUrl?: string) => {
        const maybeError = extensionChrome?.runtime?.lastError?.message;
        if (maybeError) {
          reject(new Error(`${maybeError}（請確認 OAuth client 已允許 redirect URI: ${redirectUri}）`));
          return;
        }
        if (!responseUrl) {
          reject(new Error("授權流程未回傳 response URL"));
          return;
        }
        const hash = responseUrl.split("#")[1] || "";
        const params = new URLSearchParams(hash);
        const returnedState = params.get("state");
        if (!returnedState || returnedState !== oauthState) {
          reject(new Error("OAuth state 驗證失敗，可能存在請求偽造風險"));
          return;
        }
        const accessToken = params.get("access_token");
        if (!accessToken) {
          const error = params.get("error");
          const errorDescription = params.get("error_description");
          reject(new Error(`OAuth 未取得 access token: ${error || "unknown"} ${errorDescription || ""}`.trim()));
          return;
        }
        resolve({
          accessToken,
          expiresIn: params.get("expires_in") || "(unknown)",
          scope: params.get("scope") || "(unknown)",
          tokenType: params.get("token_type") || "(unknown)",
          redirectUri,
        });
      },
    );
  });
}

function getBrowserGoogleProfile(): Promise<{ email: string; id: string }> {
  return new Promise((resolve, reject) => {
    if (!extensionChrome?.identity?.getProfileUserInfo) {
      reject(new Error("目前環境不支援 chrome.identity.getProfileUserInfo"));
      return;
    }
    extensionChrome.identity.getProfileUserInfo((userInfo) => {
      console.log("[personal-extension] getBrowserGoogleProfile", userInfo);
      const maybeError = extensionChrome?.runtime?.lastError?.message;
      if (maybeError) {
        reject(new Error(maybeError));
        return;
      }
      resolve({
        email: userInfo?.email || "(未提供 email)",
        id: userInfo?.id || "(未提供 id)",
      });
    });
  });
}

async function authorizeNow(): Promise<void> {
  setAuthStatus("正在進行 Google OAuth 授權...", "normal");
  try {
    const grant = await requestOAuthAuthorization();
    googleAccessToken = grant.accessToken;
    firebaseIdToken = await exchangeGoogleTokenForFirebaseIdToken(grant.accessToken);
    accountEmail = "(無法取得 email)";
    try {
      const userInfo = await fetchGoogleUserInfo(grant.accessToken);
      if (userInfo.email) accountEmail = userInfo.email;
    } catch (error) {
      console.log("[personal-extension] userinfoError", error);
    }
    const expiresInSeconds = Number.parseInt(grant.expiresIn || "", 10);
    const safeTtlMs = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds * 1000 : 3600 * 1000;
    // 提前 60 秒視為到期，避免邊界時間觸發 401。
    authExpiresAt = Date.now() + safeTtlMs - 60_000;
    setAuthStatus("OAuth 授權成功。", "ok");
    setOAuthInfo(`account_email: ${accountEmail}`);
    setAuthStatus(`OAuth 授權成功（${accountEmail}）`, "ok");
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
    const message = error instanceof Error ? error.message : "未知錯誤";
    setAuthStatus(`OAuth 授權失敗：${message}`, "error");
    setOAuthInfo(`OAuth 授權失敗：${message}`);
    console.log("[personal-extension] oauthAuthorizeError", message);
  }
}

const STEP_LETTERS = "abcdefghijklmnopqrstuvwxyz";

function renderExecResults(): void {
  executionResultListEl.replaceChildren();
  execResults.forEach((result) => {
    const block = document.createElement("div");
    block.className = "exec-workflow-block";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "exec-workflow-toggle";
    toggle.textContent = `${result.ok ? "✅" : "❌"} ▾  【${result.workflowName}】${result.timestamp}`;
    const stepsWrap = document.createElement("div");
    stepsWrap.className = "exec-workflow-steps collapsed";
    toggle.addEventListener("click", () => {
      const collapsed = stepsWrap.classList.toggle("collapsed");
      toggle.textContent = `${result.ok ? "✅" : "❌"} ${collapsed ? "▸" : "▾"}  【${result.workflowName}】${result.timestamp}`;
    });
    result.steps.forEach((s) => {
      const row = document.createElement("div");
      row.className = `exec-step-row ${s.ok ? "ok" : "error"}`;
      const left = document.createElement("div");
      left.className = "exec-step-left";
      const icon = document.createElement("span");
      icon.className = "exec-step-icon";
      icon.textContent = s.ok ? "✅" : "❌";
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
        viewBtn.textContent = "查看結果";
        const pre = document.createElement("pre");
        pre.className = "exec-step-response hidden";
        pre.textContent = s.response;
        viewBtn.addEventListener("click", () => {
          pre.classList.toggle("hidden");
          viewBtn.textContent = pre.classList.contains("hidden") ? "查看結果" : "收起";
        });
        const copyBtn = document.createElement("button");
        copyBtn.type = "button";
        copyBtn.className = "exec-copy-btn";
        copyBtn.textContent = "複製";
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

function createExecStepRow(
  index: number,
  step: WorkflowStep,
): {
  row: HTMLDivElement;
  icon: HTMLSpanElement;
  statusText: HTMLSpanElement;
  viewBtn: HTMLButtonElement;
  copyBtn: HTMLButtonElement;
  responsePre: HTMLPreElement;
} {
  const row = document.createElement("div");
  row.className = "exec-step-row";
  const left = document.createElement("div");
  left.className = "exec-step-left";
  const icon = document.createElement("span");
  icon.className = "exec-step-icon running";
  icon.textContent = "⏳";
  const label = document.createElement("span");
  label.className = "exec-step-label";
  const letter = STEP_LETTERS[index] ?? String(index + 1);
  label.textContent = `${letter}. ${step.requestName || step.api}`;
  const statusText = document.createElement("span");
  statusText.className = "exec-step-status-text";
  statusText.textContent = "等待中";
  left.appendChild(icon);
  left.appendChild(label);
  left.appendChild(statusText);
  const viewBtn = document.createElement("button");
  viewBtn.type = "button";
  viewBtn.className = "exec-view-btn hidden";
  viewBtn.textContent = "查看結果";
  const responseBlock = document.createElement("div");
  responseBlock.className = "exec-step-response hidden";
  const responsePre = document.createElement("pre");
  responseBlock.appendChild(responsePre);
  viewBtn.addEventListener("click", () => {
    const isHidden = responseBlock.classList.toggle("hidden");
    viewBtn.textContent = isHidden ? "查看結果" : "收起";
  });
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "exec-copy-btn hidden";
  copyBtn.textContent = "複製";
  copyBtn.addEventListener("click", () => {
    copyToClipboard(responsePre.textContent ?? "", copyBtn);
  });
  const saveApiBtn = document.createElement("button");
  saveApiBtn.type = "button";
  saveApiBtn.className = "exec-save-api-btn";
  saveApiBtn.textContent = "儲存 API";
  saveApiBtn.addEventListener("click", () => {
    const cleanedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(step.headers ?? {})) {
      if (k.toLowerCase() !== "authorization") cleanedHeaders[k] = v;
    }
    const alreadyExists = customApiSpecs.some(
      (s) => s.path === (step.path || step.api) && s.requestName === step.requestName,
    );
    if (alreadyExists) {
      setToast(`「${step.requestName || step.api}」已在已儲存的 API 中。`, "error");
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
    saveApiBtn.textContent = "已儲存 ✓";
    saveApiBtn.disabled = true;
    setToast(`已儲存 API：${step.requestName || step.api}`, "ok");
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

async function executeDraftWorkflow(): Promise<void> {
  if (!draftSteps.length) {
    setToast("流程草稿是空的，請先加入 API 步驟。", "error");
    return;
  }
  if (isAuthExpired()) {
    notifyAuthExpired();
    return;
  }
  const workflowName = currentWorkflowName || "草稿";
  const timestamp = new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });

  // Build workflow result block
  const block = document.createElement("div");
  block.className = "exec-workflow-block";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "exec-workflow-toggle";
  toggle.textContent = `▾  【${workflowName}】${timestamp}`;
  const stepsWrap = document.createElement("div");
  stepsWrap.className = "exec-workflow-steps";
  toggle.addEventListener("click", () => {
    const collapsed = stepsWrap.classList.toggle("collapsed");
    toggle.textContent = `${collapsed ? "▸" : "▾"}  【${workflowName}】${timestamp}`;
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
  // trim live DOM (will be replaced by renderExecResults after done)
  while (executionResultListEl.children.length > MAX_EXEC_RESULTS) {
    executionResultListEl.lastElementChild?.remove();
  }
  executionResultPanelEl.classList.remove("collapsed");
  toggleExecutionResultButton.textContent = "執行結果 ▾";

  let allOk = true;
  for (let i = 0; i < draftSteps.length; i += 1) {
    const step = draftSteps[i];
    const ui = stepUIs[i];
    ui.icon.textContent = "⏳";
    ui.icon.className = "exec-step-icon running";
    ui.statusText.textContent = "執行中…";
    ui.row.className = "exec-step-row";

    const url = step.path || step.api;
    const method = (step.method || "GET").toUpperCase();
    const baseHeaders: Record<string, string> = { ...(step.headers || {}) };
    for (const k of Object.keys(baseHeaders)) {
      if (k.toLowerCase() === "authorization") delete baseHeaders[k];
    }
    const contentType = baseHeaders["content-type"] ?? baseHeaders["Content-Type"] ?? "application/json";
    delete baseHeaders["content-type"];
    const headers: Record<string, string> = {
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
      let resultText: string;
      if (ct.includes("application/json")) {
        const json = (await resp.json()) as unknown;
        resultText = JSON.stringify(json, null, 2);
      } else {
        resultText = await resp.text();
      }
      if (resp.ok) {
        ui.icon.textContent = "✅";
        ui.icon.className = "exec-step-icon";
        ui.statusText.textContent = `${resp.status}`;
        ui.row.classList.add("ok");
      } else {
        if (resp.status === 401 || resp.status === 403) {
          notifyAuthExpired();
        }
        ui.icon.textContent = "❌";
        ui.icon.className = "exec-step-icon";
        ui.statusText.textContent = `${resp.status} 失敗`;
        ui.row.classList.add("error");
        allOk = false;
      }
      ui.responsePre.textContent = resultText;
      ui.viewBtn.classList.remove("hidden");
      ui.copyBtn.classList.remove("hidden");
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知錯誤";
      ui.icon.textContent = "❌";
      ui.icon.className = "exec-step-icon";
      ui.statusText.textContent = "網路錯誤";
      ui.row.classList.add("error");
      ui.responsePre.textContent = message;
      ui.viewBtn.classList.remove("hidden");
      ui.copyBtn.classList.remove("hidden");
      allOk = false;
      break;
    }
  }
  toggle.textContent = `${allOk ? "✅" : "❌"} ▾  【${workflowName}】${timestamp}`;
  setToast(allOk ? "流程已全部執行成功 ✅" : "流程執行完成，部分步驟失敗 ❌", allOk ? "ok" : "error");
  // Persist result
  const resultRecord: ExecResult = {
    workflowName,
    timestamp,
    ok: allOk,
    steps: draftSteps.map((step, i) => ({
      index: i,
      name: step.requestName || step.api || step.path || `步驟 ${i + 1}`,
      ok: stepUIs[i].row.classList.contains("ok"),
      statusText: stepUIs[i].statusText.textContent || "",
      response: stepUIs[i].responsePre.textContent || "",
    })),
  };
  execResults.unshift(resultRecord);
  if (execResults.length > MAX_EXEC_RESULTS) execResults = execResults.slice(0, MAX_EXEC_RESULTS);
  renderExecResults();
  // Re-open the first (latest) block
  const firstBlock = executionResultListEl.firstElementChild;
  if (firstBlock) {
    const firstSteps = firstBlock.querySelector(".exec-workflow-steps");
    const firstToggleEl = firstBlock.querySelector(".exec-workflow-toggle");
    if (firstSteps && firstToggleEl) {
      firstSteps.classList.remove("collapsed");
      firstToggleEl.textContent = `${allOk ? "✅" : "❌"} ▾  【${workflowName}】${timestamp}`;
    }
  }
  await saveMessages();
}

async function sendChatMessage(rawMessage: string, useSkill: boolean): Promise<void> {
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
      messages[assistantIndex].content = fullText || "(無回應內容)";
      renderMessages();
      refreshApiCandidatesFromLatestAssistant();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知錯誤";
    messages[assistantIndex].content = `呼叫 Agent API 失敗：${message}`;
    renderMessages();
    setToast(`呼叫失敗：${message}`, "error");
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
    setToast("偵測到可用 skill，請先選擇是否使用。", "normal");
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
  toggleExecutionResultButton.textContent = collapsed ? "執行結果 ▸" : "執行結果 ▾";
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
    setToast("請先選擇一個 API。", "error");
    return;
  }
  const stepData: WorkflowStep = {
    api: spec.api! || spec.path!,
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
    addStepButton.textContent = "加入流程步驟";
    addStepButton.classList.remove("updating");
    setToast(`已更新步驟：${stepData.requestName || stepData.api}`, "ok");
  } else {
    draftSteps.push(stepData);
    setToast(`已加入步驟：${stepData.requestName || stepData.api}`, "ok");
  }
  renderDraftSteps();
});

function clearFieldError(el: HTMLElement): void {
  el.classList.remove("field-error");
  const hint = el.nextElementSibling;
  if (hint && hint.classList.contains("field-error-hint")) hint.remove();
}

function clearManualForm(): void {
  manualApiNameEl.value = "";
  manualApiPathEl.value = "";
  manualApiPurposeEl.value = "";
  manualApiMethodEl.value = "GET";
  renderManualHeaderRowsFromObject({});
  manualApiBodyEl.value = "";
  manualApiCurlEl.value = "";
  addManualApiButton.textContent = "加入自訂 API";
  manualApiActionsEl.classList.add("hidden");
  manualApiActionsEl.replaceChildren();
  editingApiIndex = -1;
  addManualApiButton.style.display = "none";
}

function buildSpecFromForm(): { name: string; path: string; spec: ApiSpec } {
  const name = manualApiNameEl.value.trim();
  const path = manualApiPathEl.value.trim();
  const purpose = manualApiPurposeEl.value.trim();
  const method = (manualApiMethodEl.value.trim() || "GET").toUpperCase();
  const headers = collectManualHeaders();
  const bodyTemplate = manualApiBodyEl.value.trim();
  const bearerRaw = headers.Authorization ?? headers.authorization ?? "";
  const bearerToken = bearerRaw.replace(/^Bearer\s+/i, "").trim();
  const params = inferParamsFromPathAndBody(path, bodyTemplate);
  const spec: ApiSpec = {
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

function showPendingApiActions(): void {
  manualApiActionsEl.replaceChildren();
  manualApiActionsEl.classList.remove("hidden");
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "pending-api-save";
  saveBtn.textContent = "儲存至已儲存的 API";
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
    setToast(isDup ? `已另存為「${finalName}」` : `已儲存 API：${finalName}`, "ok");
  });
  const addStepBtn = document.createElement("button");
  addStepBtn.type = "button";
  addStepBtn.className = "pending-api-step";
  addStepBtn.textContent = "加入流程步驟";
  addStepBtn.addEventListener("click", () => {
    const { name, spec } = buildSpecFromForm();
    if (!name || !spec.path) return;
    draftSteps.push({ ...spec, params: [...(spec.params ?? [])] });
    renderDraftSteps();
    renderApiDetail(spec);
    clearManualForm();
    setToast(`已加入步驟：${name}`, "ok");
  });
  manualApiActionsEl.appendChild(saveBtn);
  manualApiActionsEl.appendChild(addStepBtn);
}

function updateManualFormActions(): void {
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

// Edit mode only: Save button handler
addManualApiButton.addEventListener("click", async () => {
  if (editingApiIndex < 0 || editingApiIndex >= customApiSpecs.length) return;
  const { name, path, spec } = buildSpecFromForm();
  if (!name || !path) {
    if (!name) manualApiNameEl.classList.add("field-error");
    if (!path) manualApiPathEl.classList.add("field-error");
    setToast("請填寫必要欄位。", "error");
    return;
  }
  customApiSpecs[editingApiIndex] = spec;
  clearManualForm();
  renderSavedApis();
  await saveMessages();
  setToast(`已更新 API：${name}`, "ok");
});

parseCurlButton.addEventListener("click", () => {
  const raw = manualApiCurlEl.value.trim() || manualApiPathEl.value.trim();
  const parsed = parseCurlCommand(raw);
  if (!parsed) {
    setToast("未偵測到有效的 curl 指令。", "error");
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
  setToast(`已解析 curl（${parsed.method} ${parsed.url}）`, "ok");
  setManualApiOpen(true);
  updateManualFormActions();
});

function showExecutionConfirmDialog(): Promise<boolean> {
  return new Promise((resolve) => {
    type StepReview = {
      step: WorkflowStep;
      index: number;
      urlParams: Record<string, string>;
      hasParams: boolean;
      hasBody: boolean;
    };
    const stepsToReview: StepReview[] = draftSteps
      .map((step, i) => {
        const urlParams: Record<string, string> = {};
        try {
          const urlObj = new URL(step.path ?? step.api ?? "");
          urlObj.searchParams.forEach((v, k) => {
            urlParams[k] = v;
          });
        } catch {
          /* not a full URL */
        }
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
    titleEl.textContent = "執行前確認";
    const subtitleEl = document.createElement("div");
    subtitleEl.className = "exec-confirm-subtitle";
    subtitleEl.textContent = "請確認以下步驟的參數，確認無誤後再執行。";
    const stepsWrap = document.createElement("div");
    stepsWrap.className = "exec-confirm-steps";

    const stepEditors: {
      index: number;
      urlBase: string;
      hasParams: boolean;
      paramInputs: Record<string, HTMLInputElement>;
      hasBody: boolean;
      bodyInput: HTMLTextAreaElement | null;
    }[] = [];

    stepsToReview.forEach(({ step, index, urlParams, hasParams, hasBody }) => {
      const card = document.createElement("div");
      card.className = "exec-confirm-step";
      const nameEl = document.createElement("div");
      nameEl.className = "exec-confirm-step-name";
      nameEl.textContent = `${index + 1}. ${step.requestName ?? step.api}`;
      card.appendChild(nameEl);

      const paramInputs: Record<string, HTMLInputElement> = {};
      if (hasParams) {
        const label = document.createElement("div");
        label.className = "exec-confirm-label";
        label.textContent = "Params（URL 查詢參數）";
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

      let bodyInput: HTMLTextAreaElement | null = null;
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
    cancelBtn.textContent = "取消";
    cancelBtn.addEventListener("click", () => {
      overlay.remove();
      resolve(false);
    });

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "exec-confirm-ok";
    confirmBtn.textContent = "確認執行";
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
    setToast("流程草稿是空的，請先加入 API。", "error");
    return;
  }
  const defaultName = `流程${savedWorkflows.length + 1}`;
  const name = (globalThis.prompt("請輸入流程名稱", defaultName) || "").trim();
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
  setToast(`已建立流程：${name}`, "ok");
});

clearDraftButton.addEventListener("click", () => {
  draftSteps = [];
  renderDraftSteps();
  setToast("已清空流程草稿。", "normal");
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

// ── Chat messages resize handle ──
const CHAT_HEIGHT_KEY = "chat_messages_height";
(function initChatResizeHandle() {
  const handle = document.getElementById("chatResizeHandle") as HTMLDivElement;
  if (!handle) return;

  // Restore saved height
  const saved = sessionStorage.getItem(CHAT_HEIGHT_KEY);
  if (saved) chatMessagesEl.style.height = saved;

  let startY = 0;
  let startH = 0;

  function onMouseMove(e: MouseEvent) {
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

  handle.addEventListener("mousedown", (e: MouseEvent) => {
    e.preventDefault();
    startY = e.clientY;
    startH = chatMessagesEl.offsetHeight;
    handle.classList.add("dragging");
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
})();
