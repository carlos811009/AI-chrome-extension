import type {
  ApiSpec,
  AuthState,
  ChatMessage,
  ChatRole,
  ExecResult,
  GoogleUserInfo,
  OAuthGrantInfo,
  SavedWorkflow,
  WorkflowExportEnvelope,
  WorkflowStep,
} from './panel/types';
import {
  ALLOWED_GOOGLE_EMAIL_SUFFIX,
  AUTH_STATE_KEY,
  CUSTOM_APIS_KEY,
  EXEC_RESULTS_KEY,
  GOOGLE_OAUTH_SCOPE,
  MAX_EXEC_RESULTS,
  MAX_MESSAGES,
  RUNTIME_ENV_SETTINGS_KEY,
  SESSION_ID_KEY,
  STORAGE_KEY,
  WORKFLOWS_KEY,
  WORKFLOW_EXPORT_FORMAT,
  WORKFLOW_EXPORT_VERSION,
} from './panel/constants';
import {
  getActiveEnv,
  getOverrideFieldsForActiveEnv,
  getEffectiveAgentChatUrl,
  getEffectiveFirebaseWebApiKey,
  getEffectiveGoogleOAuthClientId,
  hydrateRuntimeEnvFromSaved,
  runtimeEnvSettingsToJson,
  setActiveEnv,
  updateOverridesForActiveEnv,
} from './panel/env-runtime';
import {
  extractApiCandidatesFromText,
  inferParamEntries,
  inferParamsFromPathAndBody,
  parseCurlCommand,
} from './panel/api-extraction';
import { CLOSE_HELLO_DOCK, PANEL_TO_HOST_SOURCE, type PanelToHostDockMessage } from './messages';

function isEmailDomainRestrictionActive(): boolean {
  return ALLOWED_GOOGLE_EMAIL_SUFFIX.trim().length > 0;
}

function isAllowedAiiiEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) return false;
  if (!isEmailDomainRestrictionActive()) return true;
  return normalized.endsWith(ALLOWED_GOOGLE_EMAIL_SUFFIX.trim().toLowerCase());
}

// ===== DOM 節點快取 =====
const toastStatusEl = document.getElementById('toastStatus') as HTMLDivElement;
const toggleChatButton = document.getElementById('toggleChat') as HTMLButtonElement;
const chatPanelEl = document.getElementById('chatPanel') as HTMLDivElement;
const chatMessagesEl = document.getElementById('chatMessages') as HTMLDivElement;
const chatFormEl = document.getElementById('chatForm') as HTMLFormElement;
const chatInputEl = document.getElementById('chatInput') as HTMLTextAreaElement;
const sendMessageButton = document.getElementById('sendMessage') as HTMLButtonElement;
const clearChatButton = document.getElementById('clearChat') as HTMLButtonElement;
const authStatusEl = document.getElementById('authStatus') as HTMLParagraphElement;
const authorizeGoogleButton = document.getElementById('authorizeGoogle') as HTMLButtonElement;
const closeDockButton = document.getElementById('closeDock') as HTMLButtonElement;
const dockShellDragGripEl = document.getElementById('dockShellDragGrip') as HTMLButtonElement | null;
const minimizeDockButton = document.getElementById('minimizeDock') as HTMLButtonElement;
const openPanelSettingsButton = document.getElementById('openPanelSettings') as HTMLButtonElement;
const panelSettingsOverlayEl = document.getElementById('panelSettingsOverlay') as HTMLDivElement;
const closePanelSettingsButton = document.getElementById('closePanelSettings') as HTMLButtonElement;
const envToggleStagingButton = document.getElementById('envToggleStaging') as HTMLButtonElement;
const envToggleProductionButton = document.getElementById('envToggleProduction') as HTMLButtonElement;
const envEffectiveSummaryEl = document.getElementById('envEffectiveSummary') as HTMLParagraphElement;
const settingsFirebaseWebApiKeyEl = document.getElementById('settingsFirebaseWebApiKey') as HTMLInputElement;
const settingsGoogleOAuthClientIdEl = document.getElementById('settingsGoogleOAuthClientId') as HTMLInputElement;
const saveEnvOverridesButton = document.getElementById('saveEnvOverridesButton') as HTMLButtonElement;
const clearEnvOverridesButton = document.getElementById('clearEnvOverridesButton') as HTMLButtonElement;
const oauthInfoEl = document.getElementById('oauthInfo') as HTMLPreElement;
const toggleWorkflowsButton = document.getElementById('toggleWorkflows') as HTMLButtonElement;
const workflowPanelEl = document.getElementById('workflowPanel') as HTMLDivElement;
const toggleCurlParserButton = document.getElementById('toggleCurlParser') as HTMLButtonElement;
const curlParserPanelEl = document.getElementById('curlParserPanel') as HTMLDivElement;
const toggleManualApiButton = document.getElementById('toggleManualApi') as HTMLButtonElement;
const manualApiPanelEl = document.getElementById('manualApiPanel') as HTMLDivElement;
const apiCandidatesEl = document.getElementById('apiCandidates') as HTMLDivElement;
const manualApiNameEl = document.getElementById('manualApiName') as HTMLInputElement;
const manualApiPathEl = document.getElementById('manualApiPath') as HTMLInputElement;
const manualApiPurposeEl = document.getElementById('manualApiPurpose') as HTMLInputElement;
const manualApiCurlEl = document.getElementById('manualApiCurl') as HTMLTextAreaElement;
const parseCurlButton = document.getElementById('parseCurl') as HTMLButtonElement;
const manualApiMethodEl = document.getElementById('manualApiMethod') as HTMLSelectElement;
const manualApiParamsRowsEl = document.getElementById('manualApiParamsRows') as HTMLDivElement;
const addParamRowButton = document.getElementById('addParamRow') as HTMLButtonElement;
const manualApiHeadersRowsEl = document.getElementById('manualApiHeadersRows') as HTMLDivElement;
const addHeaderRowButton = document.getElementById('addHeaderRow') as HTMLButtonElement;
const manualApiBodyEl = document.getElementById('manualApiBody') as HTMLTextAreaElement;
const addManualApiButton = document.getElementById('addManualApi') as HTMLButtonElement;
const manualApiActionsEl = document.getElementById('manualApiActions') as HTMLDivElement;
const clearManualApiButton = document.getElementById('clearManualApi') as HTMLButtonElement;
const apiDetailNameEl = document.getElementById('apiDetailName') as HTMLDivElement;
const apiDetailPurposeEl = document.getElementById('apiDetailPurpose') as HTMLDivElement;
const apiDetailParamsEl = document.getElementById('apiDetailParams') as HTMLDivElement;
const cancelApiDetailButton = document.getElementById('cancelApiDetail') as HTMLButtonElement;
const apiDetailActionsEl = document.getElementById('apiDetailActions') as HTMLDivElement;
const addStepButton = document.getElementById('addStep') as HTMLButtonElement;
const saveDetailApiButton = document.getElementById('saveDetailApi') as HTMLButtonElement;
const updateDetailApiButton = document.getElementById('updateDetailApi') as HTMLButtonElement;
const draftStepsEl = document.getElementById('draftSteps') as HTMLOListElement;
const runWorkflowButton = document.getElementById('runWorkflow') as HTMLButtonElement;
const saveWorkflowButton = document.getElementById('saveWorkflow') as HTMLButtonElement;
const clearDraftButton = document.getElementById('clearDraft') as HTMLButtonElement;
const draftWorkflowNameInputEl = document.getElementById('draftWorkflowName') as HTMLInputElement;
const savedWorkflowsEl = document.getElementById('savedWorkflows') as HTMLDivElement;
const toggleSavedApisButton = document.getElementById('toggleSavedApis') as HTMLButtonElement;
const savedApisPanelEl = document.getElementById('savedApisPanel') as HTMLDivElement;
const savedApisListEl = document.getElementById('savedApisList') as HTMLDivElement;
const toggleSavedWorkflowsButton = document.getElementById('toggleSavedWorkflows') as HTMLButtonElement;
const savedWorkflowsPanelEl = document.getElementById('savedWorkflowsPanel') as HTMLDivElement;
const toggleExecutionResultButton = document.getElementById('toggleExecutionResult') as HTMLButtonElement;
const executionResultPanelEl = document.getElementById('executionResultPanel') as HTMLDivElement;
const executionResultListEl = document.getElementById('executionResultList') as HTMLDivElement;
const clearExecutionResultButton = document.getElementById('clearExecutionResult') as HTMLButtonElement;
const panelBodyEl = document.querySelector('.panel-body') as HTMLDivElement | null;
const backendApiHintEl = document.getElementById('backendApiHint') as HTMLParagraphElement | null;
const exportDraftWorkflowJsonButton = document.getElementById('exportDraftWorkflowJson') as HTMLButtonElement;
const copyDraftWorkflowJsonButton = document.getElementById('copyDraftWorkflowJson') as HTMLButtonElement;
const importWorkflowJsonInputEl = document.getElementById('importWorkflowJsonInput') as HTMLTextAreaElement;
const importWorkflowToDraftButton = document.getElementById('importWorkflowToDraft') as HTMLButtonElement;
let execResults: ExecResult[] = [];

let messages: ChatMessage[] = [];
let streamingAssistantIndex: number | null = null;
let streamJustFinishedIndex: number | null = null;
let streamJustFinishedClearTimer: ReturnType<typeof setTimeout> | null = null;

function clearStreamJustFinishedTimer(): void {
  if (streamJustFinishedClearTimer !== null) {
    clearTimeout(streamJustFinishedClearTimer);
    streamJustFinishedClearTimer = null;
  }
}

let persistenceReady = false;
let isAuthorized = false;
let firebaseIdToken = '';
let googleAccessToken = '';
let authExpiresAt = 0;
let accountEmail = '';
let chatSessionId: string = globalThis.crypto?.randomUUID?.() || `session-${Date.now()}`;
let apiCandidates: ApiSpec[] = [];
let customApiSpecs: ApiSpec[] = [];
let savedWorkflows: SavedWorkflow[] = [];
let draftSteps: WorkflowStep[] = [];
let selectedApiIndex = -1;
let pinnedDetailSpec: ApiSpec | null = null;
let pinnedSavedApiIndex = -1;
let chatPanelOpen = true;
let workflowPanelOpen = true;
let curlParserOpen = false;
let manualApiOpen = false;
let savedWorkflowsOpen = false;
let savedApisOpen = false;
let editedDetailSpec: ApiSpec | null = null;
let editingStepIndex = -1;
let editingApiIndex = -1;
let currentWorkflowName = '';
let draftNameFromImport = false;
/** 後端 API 回傳 401/403 等（與 Google OAuth／本機 Token 是否仍有效分開） */
let lastBackendApiAuthHint: string | null = null;
const fallbackStorage = new Map<string, string>();
const extensionChrome = typeof chrome !== 'undefined' ? chrome : undefined;

// ===== 授權狀態與共用 UI 提示 =====
function isAuthStateValid(state: AuthState): boolean {
  return Boolean(
    state.firebaseIdToken &&
    state.googleAccessToken &&
    state.expiresAt &&
    Number.isFinite(state.expiresAt) &&
    Date.now() < state.expiresAt
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

function isAuthExpired(): boolean {
  if (!isAuthorized || !firebaseIdToken) return true;
  if (authExpiresAt > 0 && Date.now() >= authExpiresAt) return true;
  return false;
}

function canUseAuthenticatedFeatures(): boolean {
  return Boolean(
    isAuthorized &&
    firebaseIdToken &&
    authExpiresAt > 0 &&
    Date.now() < authExpiresAt &&
    isAllowedAiiiEmail(accountEmail)
  );
}

function updateBackendApiHintDisplay(): void {
  if (!backendApiHintEl) return;
  if (lastBackendApiAuthHint) {
    backendApiHintEl.textContent = lastBackendApiAuthHint;
    backendApiHintEl.classList.remove('hidden');
  } else {
    backendApiHintEl.textContent = '';
    backendApiHintEl.classList.add('hidden');
  }
}

function clearBackendApiAuthHint(): void {
  lastBackendApiAuthHint = null;
  updateBackendApiHintDisplay();
}

/** 後端拒絕憑證時呼叫：不會清除 Google 授權或本機 Token。 */
function reportBackendApiAuthRejection(httpStatus: number): void {
  lastBackendApiAuthHint = `後端回傳 HTTP ${httpStatus}（與 Google 授權狀態分開）。登入仍有效；請確認後端權限或稍後重試。`;
  updateBackendApiHintDisplay();
  setToast(
    `後端拒絕請求（${httpStatus}）。未清除 Google 授權，請確認權限或稍後重試。`,
    'error',
    7000
  );
}

function syncPanelBodyAuthLock(): void {
  const locked = !canUseAuthenticatedFeatures();
  if (panelBodyEl) panelBodyEl.classList.toggle('panel-body--auth-locked', locked);
}

function clearAuthStateInMemory(): void {
  isAuthorized = false;
  firebaseIdToken = '';
  googleAccessToken = '';
  authExpiresAt = 0;
  accountEmail = '';
  clearBackendApiAuthHint();
  syncPanelBodyAuthLock();
}

function notifyAuthExpired(): void {
  clearAuthStateInMemory();
  setChatEnabled(false);
  const msg = '授權已失效，請重新點擊「Google 授權」登入。';
  setAuthStatus(msg, 'error');
  setToast(msg, 'error', 5000);
  authorizeGoogleButton.classList.add('auth-expired-pulse');
}

function setAuthStatus(text: string, status: 'normal' | 'ok' | 'error' = 'normal'): void {
  authStatusEl.textContent = text;
  authStatusEl.classList.remove('ok', 'error');
  if (status !== 'normal') authStatusEl.classList.add(status);
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;
function copyToClipboard(text: string, btn: HTMLButtonElement): void {
  const succeed = () => {
    btn.textContent = '已複製 ✓';
    setTimeout(() => {
      btn.textContent = '複製';
    }, 1500);
  };
  const fail = () => setToast('複製失敗，請手動選取文字。', 'error');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(succeed)
      .catch(() => {
        // Fallback: execCommand
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(ta);
          ok ? succeed() : fail();
        } catch {
          fail();
        }
      });
  } else {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      ok ? succeed() : fail();
    } catch {
      fail();
    }
  }
}

function setToast(text: string, status: 'normal' | 'ok' | 'error' = 'normal', autoDismissMs = 4000): void {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  toastStatusEl.textContent = text;
  toastStatusEl.classList.remove('ok', 'error', 'hidden');
  if (status !== 'normal') toastStatusEl.classList.add(status);
  if (autoDismissMs > 0) {
    toastTimer = setTimeout(() => {
      toastStatusEl.classList.add('hidden');
      toastTimer = null;
    }, autoDismissMs);
  }
}

function bindChatMarkdownCopyOnce(): void {
  const g = globalThis as { __personalExtMdCopy?: boolean };
  if (g.__personalExtMdCopy) return;
  g.__personalExtMdCopy = true;
  chatMessagesEl.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('button.md-code-copy');
    if (!btn || !chatMessagesEl.contains(btn)) return;
    const id = btn.getAttribute('data-copy');
    const el = id ? document.getElementById(id) : null;
    const txt = el?.textContent ?? '';
    if (!txt.trim()) {
      setToast('此區塊沒有可複製文字', 'error');
      return;
    }
    void navigator.clipboard.writeText(txt).then(
      () => setToast('已複製到剪貼簿', 'ok', 2200),
      () => setToast('複製失敗，請手動選取內容', 'error')
    );
  });
}

function setOAuthInfo(text: string): void {
  oauthInfoEl.textContent = text;
}

function updateWorkflowToggleLabel(): void {
  toggleWorkflowsButton.textContent = workflowPanelOpen ? '常用工作流程 ▾' : '常用工作流程 ▸';
}

function setCurlParserOpen(open: boolean): void {
  curlParserOpen = open;
  curlParserPanelEl.classList.toggle('collapsed', !open);
  toggleCurlParserButton.textContent = open ? '解析 Curl ▾' : '解析 Curl ▸';
}
function setManualApiOpen(open: boolean): void {
  manualApiOpen = open;
  manualApiPanelEl.classList.toggle('collapsed', !open);
  toggleManualApiButton.textContent = open ? '自訂 API ▾' : '自訂 API ▸';
}
function setSavedWorkflowsOpen(open: boolean): void {
  savedWorkflowsOpen = open;
  savedWorkflowsPanelEl.classList.toggle('collapsed', !open);
  toggleSavedWorkflowsButton.textContent = open ? '已儲存流程 ▾' : '已儲存流程 ▸';
}
function setSavedApisOpen(open: boolean): void {
  savedApisOpen = open;
  savedApisPanelEl.classList.toggle('collapsed', !open);
  toggleSavedApisButton.textContent = open ? '已儲存的 API ▾' : '已儲存的 API ▸';
}
function setChatPanelOpen(open: boolean): void {
  chatPanelOpen = open;
  chatPanelEl.classList.toggle('collapsed', !open);
  toggleChatButton.textContent = open ? 'AI 小幫手 ▾' : 'AI 小幫手 ▸';
  chatPanelEl.closest('section.chat-section')?.classList.toggle('is-section-collapsed', !open);
}

function setWorkflowPanelOpen(open: boolean): void {
  workflowPanelOpen = open;
  workflowPanelEl.classList.toggle('collapsed', !open);
  updateWorkflowToggleLabel();
  workflowPanelEl.closest('section.workflow-section')?.classList.toggle('is-section-collapsed', !open);
}

function setChatEnabled(enabled: boolean): void {
  chatInputEl.disabled = !enabled;
  sendMessageButton.disabled = !enabled;
  chatInputEl.placeholder = enabled
    ? '例如：業務離職了，我要移除他的 sales 與 lineUser 身份'
    : '請先完成 Google 授權後，才可使用對話窗';
  syncPanelBodyAuthLock();
}

// ===== 自訂 API 表單輔助（欄位正規化 / Header 管理） =====
function buildMessageWithSkillDirective(rawMessage: string, useSkill: boolean): string {
  if (!useSkill) return rawMessage;
  return `${rawMessage}

[系統指令]
若你判斷有可用 skill 或工具，請優先使用 skill 來回答，並在回覆開頭簡短說明「已使用的 skill 與原因」。
若無合適 skill，請明確說明「本次不使用 skill」並直接給一般回答。`;
}

function _maskBearerToken(token: string): string {
  return maskToken(token.replace(/^Bearer\s+/i, '').trim());
}

const HEADER_KEY_CUSTOM = '__custom__';
const HEADER_KEY_PRESETS = [
  'Authorization',
  'Content-Type',
  'Accept',
  'Accept-Language',
  'x-api-key',
  'X-API-Key',
  'User-Agent',
  'X-Request-Id',
  'Cookie',
];

const MANUAL_API_PARAM_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MANUAL_HTTP_HEADER_NAME_RE = /^[-0-9A-Za-z!#$%&'*+.^_`|~]+$/;

function isManualApiPathWellFormed(path: string): boolean {
  const t = path.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function isManualApiBodyWellFormed(body: string): boolean {
  const t = body.trim();
  if (!t) return true;
  try {
    JSON.parse(body);
    return true;
  } catch {
    return false;
  }
}

function _maskSensitiveHeaderValue(key: string, value: string): string {
  const k = key.toLowerCase();
  const raw = value.replace(/^Bearer\s+/i, '').trim();
  if (k === 'authorization' || k === 'x-api-key' || k.endsWith('api-key')) return maskToken(raw);
  if (raw.length > 32) return maskToken(raw);
  return value;
}

function buildHeaderKeySelect(selectedKey: string): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'header-key-select';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '選擇 Key';
  select.appendChild(empty);
  HEADER_KEY_PRESETS.forEach((preset) => {
    const opt = document.createElement('option');
    opt.value = preset;
    opt.textContent = preset;
    select.appendChild(opt);
  });
  const customOpt = document.createElement('option');
  customOpt.value = HEADER_KEY_CUSTOM;
  customOpt.textContent = '自訂…';
  select.appendChild(customOpt);
  if (selectedKey && HEADER_KEY_PRESETS.includes(selectedKey)) {
    select.value = selectedKey;
  } else if (selectedKey) {
    select.value = HEADER_KEY_CUSTOM;
  }
  return select;
}

function syncHeaderRowCustomVisibility(row: HTMLDivElement): void {
  const select = row.querySelector('.header-key-select') as HTMLSelectElement;
  const custom = row.querySelector('.header-key-custom') as HTMLInputElement;
  if (!select || !custom) return;
  const isCustom = select.value === HEADER_KEY_CUSTOM;
  custom.classList.toggle('visible', isCustom);
  if (!isCustom) custom.value = '';
}

function appendManualHeaderRow(key = '', value = ''): void {
  const row = document.createElement('div');
  row.className = 'header-row';
  const wrap = document.createElement('div');
  wrap.className = 'header-key-wrap';
  const select = buildHeaderKeySelect(key);
  const customKey = document.createElement('input');
  customKey.type = 'text';
  customKey.className = 'header-key-custom';
  customKey.placeholder = '自訂 Key';
  if (key && !HEADER_KEY_PRESETS.includes(key)) {
    customKey.value = key;
    customKey.classList.add('visible');
  }
  const valInput = document.createElement('input');
  valInput.type = 'text';
  valInput.className = 'header-value';
  valInput.placeholder = 'Value';
  valInput.value = value;
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'header-remove';
  removeBtn.textContent = '移除';
  removeBtn.addEventListener('click', () => {
    row.remove();
    if (!manualApiHeadersRowsEl.querySelector('.header-row')) appendManualHeaderRow();
  });
  select.addEventListener('change', () => {
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
  manualApiHeadersRowsEl.querySelectorAll('.header-row').forEach((node) => {
    const row = node as HTMLDivElement;
    const select = row.querySelector('.header-key-select') as HTMLSelectElement;
    const custom = row.querySelector('.header-key-custom') as HTMLInputElement;
    const valInput = row.querySelector('.header-value') as HTMLInputElement;
    if (!select || !valInput) return;
    let key = '';
    if (select.value === HEADER_KEY_CUSTOM) key = custom.value.trim();
    else key = select.value.trim();
    const val = valInput.value.trim();
    if (key && val) out[key] = val;
  });
  return out;
}

function appendManualParamRow(key = '', value = ''): void {
  const row = document.createElement('div');
  row.className = 'header-row';
  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.className = 'header-value';
  keyInput.placeholder = 'Param key';
  keyInput.value = key;
  const valInput = document.createElement('input');
  valInput.type = 'text';
  valInput.className = 'header-value';
  valInput.placeholder = 'Value（可空）';
  valInput.value = value;
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'header-remove';
  removeBtn.textContent = '移除';
  removeBtn.addEventListener('click', () => {
    row.remove();
    if (!manualApiParamsRowsEl.querySelector('.header-row')) appendManualParamRow();
  });
  row.appendChild(keyInput);
  row.appendChild(valInput);
  row.appendChild(removeBtn);
  manualApiParamsRowsEl.appendChild(row);
}

function renderManualParamsRows(params: Array<{ key: string; value: string }>): void {
  manualApiParamsRowsEl.replaceChildren();
  const clean = params.filter((p) => p.key.trim());
  if (!clean.length) {
    appendManualParamRow();
    return;
  }
  clean.forEach((p) => appendManualParamRow(p.key, p.value));
}

function collectManualParams(): string[] {
  const keys: string[] = [];
  manualApiParamsRowsEl.querySelectorAll('.header-row').forEach((node) => {
    const row = node as HTMLDivElement;
    const inputs = row.querySelectorAll('input');
    const key = (inputs[0] as HTMLInputElement | undefined)?.value.trim() ?? '';
    if (key) keys.push(key);
  });
  return Array.from(new Set(keys));
}

function getAllApiCandidates(): ApiSpec[] {
  return [...apiCandidates];
}

function _findSavedApiIndex(spec: ApiSpec | null): number {
  if (!spec) return -1;
  const key = (spec.path || spec.api || '').trim();
  if (!key) return -1;
  return customApiSpecs.findIndex((c) => (c.path || c.api || '').trim() === key);
}

function refreshApiDetailActions(spec: ApiSpec | null): void {
  const hasSpec = !!spec;
  const savedIndex = pinnedSavedApiIndex;
  addStepButton.disabled = !hasSpec;
  saveDetailApiButton.disabled = !hasSpec;
  updateDetailApiButton.disabled = !hasSpec || savedIndex < 0;
  updateDetailApiButton.style.display = savedIndex >= 0 ? 'block' : 'none';
  apiDetailActionsEl.classList.toggle('hidden', !hasSpec);
}

// ===== API 設定區渲染與互動 =====
function buildDetailSection(label: string, defaultOpen: boolean): { wrap: HTMLDivElement; body: HTMLDivElement } {
  const wrap = document.createElement('div');
  wrap.className = 'detail-section';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'detail-section-toggle';
  toggle.textContent = `${defaultOpen ? '▾' : '▸'} ${label}`;
  const body = document.createElement('div');
  body.className = 'detail-section-body' + (defaultOpen ? '' : ' collapsed');
  toggle.addEventListener('click', () => {
    const isCollapsed = body.classList.toggle('collapsed');
    toggle.textContent = `${isCollapsed ? '▸' : '▾'} ${label}`;
  });
  wrap.appendChild(toggle);
  wrap.appendChild(body);
  return { wrap, body };
}

function resetApiDetail(): void {
  apiDetailNameEl.textContent = '尚未選擇 API';
  apiDetailPurposeEl.replaceChildren();
  apiDetailParamsEl.replaceChildren();
  addStepButton.textContent = '加入流程步驟';
  addStepButton.classList.remove('updating');
  editedDetailSpec = null;
  editingStepIndex = -1;
  refreshApiDetailActions(null);
  renderDraftSteps();
}

function renderApiDetail(spec: ApiSpec | null): void {
  if (!spec) {
    resetApiDetail();
    return;
  }

  editedDetailSpec = { ...spec, params: [...(spec.params ?? [])], headers: { ...(spec.headers ?? {}) } };

  apiDetailNameEl.textContent = spec.requestName ?? spec.api;

  apiDetailPurposeEl.replaceChildren();
  const nameWrap = document.createElement('div');
  nameWrap.className = 'api-detail-purpose-edit';
  const nameLabel = document.createElement('label');
  nameLabel.className = 'api-detail-purpose-label';
  nameLabel.setAttribute('for', 'apiDetailNameInput');
  nameLabel.textContent = 'API 名稱';
  const nameInput = document.createElement('input');
  nameInput.id = 'apiDetailNameInput';
  nameInput.type = 'text';
  nameInput.className = 'api-detail-purpose-input';
  nameInput.placeholder = '顯示名稱（例如：MedSalesRollbackRequest）';
  nameInput.value = (spec.requestName ?? spec.api ?? '').trim();
  nameInput.autocomplete = 'off';
  nameInput.addEventListener('input', () => {
    if (!editedDetailSpec) return;
    const nextName = nameInput.value.trim();
    editedDetailSpec.requestName = nextName || undefined;
    apiDetailNameEl.textContent = nextName || editedDetailSpec.api || '尚未命名 API';
  });
  nameWrap.appendChild(nameLabel);
  nameWrap.appendChild(nameInput);
  apiDetailPurposeEl.appendChild(nameWrap);

  const purposeWrap = document.createElement('div');
  purposeWrap.className = 'api-detail-purpose-edit';
  const purposeLabel = document.createElement('label');
  purposeLabel.className = 'api-detail-purpose-label';
  purposeLabel.setAttribute('for', 'apiDetailPurposeInput');
  purposeLabel.textContent = '用途';
  const purposeInput = document.createElement('input');
  purposeInput.id = 'apiDetailPurposeInput';
  purposeInput.type = 'text';
  purposeInput.className = 'api-detail-purpose-input';
  purposeInput.placeholder = '簡短說明此 API 的用途（可選）';
  purposeInput.value = (spec.purpose ?? '').trim();
  purposeInput.autocomplete = 'off';
  purposeInput.addEventListener('input', () => {
    if (editedDetailSpec) editedDetailSpec.purpose = purposeInput.value;
  });
  purposeWrap.appendChild(purposeLabel);
  purposeWrap.appendChild(purposeInput);
  apiDetailPurposeEl.appendChild(purposeWrap);

  const container = document.createDocumentFragment();

  const requestCard = document.createElement('div');
  requestCard.className = 'api-detail-request-card';
  const rqTitle = document.createElement('div');
  rqTitle.className = 'api-detail-request-title';
  rqTitle.textContent = '連線與端點';
  requestCard.appendChild(rqTitle);

  const initialTarget = (spec.path ?? spec.api ?? '').trim();
  const pathSplit = splitRequestTargetForEditor(initialTarget);

  const methodRow = document.createElement('div');
  methodRow.className = 'api-detail-request-row';
  const methodLabel = document.createElement('label');
  methodLabel.className = 'api-detail-purpose-label';
  methodLabel.setAttribute('for', 'apiDetailMethodSelect');
  methodLabel.textContent = 'HTTP 方法';
  const methodSelect = document.createElement('select');
  methodSelect.id = 'apiDetailMethodSelect';
  methodSelect.className = 'api-detail-method-select';
  const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
  const methodUpper = ((spec.method || 'GET') as string).toUpperCase();
  allowedMethods.forEach((m) => {
    const o = document.createElement('option');
    o.value = m;
    o.textContent = m;
    methodSelect.appendChild(o);
  });
  if (!allowedMethods.includes(methodUpper)) {
    const o = document.createElement('option');
    o.value = methodUpper;
    o.textContent = methodUpper;
    methodSelect.appendChild(o);
  }
  methodSelect.value = methodUpper;
  methodRow.appendChild(methodLabel);
  methodRow.appendChild(methodSelect);
  requestCard.appendChild(methodRow);

  const baseRow = document.createElement('div');
  baseRow.className = 'api-detail-request-row';
  const baseLabel = document.createElement('label');
  baseLabel.className = 'api-detail-purpose-label';
  baseLabel.setAttribute('for', 'apiDetailBaseUrlInput');
  baseLabel.textContent = '網域／基底 URL';
  const baseInput = document.createElement('input');
  baseInput.id = 'apiDetailBaseUrlInput';
  baseInput.type = 'text';
  baseInput.className = 'api-detail-purpose-input';
  baseInput.placeholder = 'https://api.example.com（相對路徑可留空）';
  baseInput.value = pathSplit.base;
  baseInput.autocomplete = 'off';
  baseRow.appendChild(baseLabel);
  baseRow.appendChild(baseInput);
  requestCard.appendChild(baseRow);

  const pathRow = document.createElement('div');
  pathRow.className = 'api-detail-request-row';
  const pathLabel = document.createElement('label');
  pathLabel.className = 'api-detail-purpose-label';
  pathLabel.setAttribute('for', 'apiDetailPathInput');
  pathLabel.textContent = '路徑與查詢';
  const pathInput = document.createElement('input');
  pathInput.id = 'apiDetailPathInput';
  pathInput.type = 'text';
  pathInput.className = 'api-detail-purpose-input';
  pathInput.placeholder = '例如 /v1/foo、siteId/med-sales 或 ?a=1&b=2';
  pathInput.value = pathSplit.pathAndQuery;
  pathInput.autocomplete = 'off';
  pathRow.appendChild(pathLabel);
  pathRow.appendChild(pathInput);
  requestCard.appendChild(pathRow);

  const urlCode = document.createElement('code');
  urlCode.className = 'detail-url-code detail-url-code--preview';

  const refreshRequestPreview = (): void => {
    if (!editedDetailSpec) return;
    editedDetailSpec.method = methodSelect.value;
    const joined = joinRequestTargetFromEditor(baseInput.value, pathInput.value);
    editedDetailSpec.path = joined;
    urlCode.textContent = `${(methodSelect.value || 'GET').toUpperCase()} ${joined || '-'}`;
  };
  methodSelect.addEventListener('change', refreshRequestPreview);
  baseInput.addEventListener('input', refreshRequestPreview);
  pathInput.addEventListener('input', refreshRequestPreview);
  refreshRequestPreview();

  const previewLabel = document.createElement('div');
  previewLabel.className = 'api-detail-preview-label';
  previewLabel.textContent = '實際請求（預覽）';
  requestCard.appendChild(previewLabel);
  requestCard.appendChild(urlCode);
  container.appendChild(requestCard);

  // ── Params ──
  const urlParamObj: Record<string, string> = {};
  try {
    const { queryString: initialQs } = getPathNoQueryAndSearchFromCombined(initialTarget);
    new URLSearchParams(initialQs).forEach((v, k) => {
      if (k) urlParamObj[k] = v;
    });
  } catch {
    void 0;
  }
  const urlParamKeys = [...new Set(Object.keys(urlParamObj))];

  const urlParamsSec = buildDetailSection(`Params（URL 查詢參數，${urlParamKeys.length} 個）`, true);
  const urlParamsList = document.createElement('div');
  urlParamsList.className = 'detail-edit-list';

  const rebuildUrlParams = () => {
    if (!editedDetailSpec) return;
    try {
      const combined = (editedDetailSpec.path ?? editedDetailSpec.api ?? '').trim();
      const { pathNoQuery, queryString } = getPathNoQueryAndSearchFromCombined(combined);
      const collected: Record<string, string> = {};
      try {
        new URLSearchParams(queryString).forEach((v, k) => {
          if (k) collected[k] = v;
        });
      } catch {
        void 0;
      }
      urlParamsList.querySelectorAll<HTMLDivElement>('.detail-edit-row').forEach((r) => {
        const key = (r.querySelector('.detail-edit-key-input') as HTMLInputElement)?.value.trim() ?? '';
        const val = (r.querySelector('.detail-edit-val-input') as HTMLInputElement)?.value ?? '';
        if (key && val) collected[key] = val;
      });
      const qs = new URLSearchParams(collected).toString();
      const newPath = qs ? `${pathNoQuery}?${qs}` : pathNoQuery;
      editedDetailSpec.path = newPath;
      editedDetailSpec.params = Array.from(new Set([...(editedDetailSpec.params ?? []), ...Object.keys(collected)]));
      urlCode.textContent = `${(methodSelect.value || editedDetailSpec.method || 'GET').toString().toUpperCase()} ${newPath}`;
      const sp = splitRequestTargetForEditor(newPath);
      baseInput.value = sp.base;
      pathInput.value = sp.pathAndQuery;
    } catch {
      // ignore parse/update errors for incomplete editing state
    }
  };

  const addEditableUrlParamRow = (key: string, value: string) => {
    const row = document.createElement('div');
    row.className = 'detail-edit-row';
    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'detail-edit-key-input detail-edit-input';
    keyInput.value = key;
    keyInput.placeholder = 'Param key';
    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'detail-edit-val-input detail-edit-input';
    valInput.value = value;
    valInput.placeholder = 'value';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'header-remove';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      row.remove();
      rebuildUrlParams();
    });
    keyInput.addEventListener('input', rebuildUrlParams);
    valInput.addEventListener('input', rebuildUrlParams);
    row.appendChild(keyInput);
    row.appendChild(valInput);
    row.appendChild(removeBtn);
    urlParamsList.appendChild(row);
  };

  urlParamKeys.forEach((key) => addEditableUrlParamRow(key, urlParamObj[key] ?? ''));
  const addParamBtn = document.createElement('button');
  addParamBtn.type = 'button';
  addParamBtn.className = 'detail-add-row-btn';
  addParamBtn.textContent = '＋ 新增 Param';
  addParamBtn.addEventListener('click', () => addEditableUrlParamRow('', ''));
  urlParamsSec.body.appendChild(urlParamsList);
  urlParamsSec.body.appendChild(addParamBtn);
  container.appendChild(urlParamsSec.wrap);

  // ── Headers ──
  const visibleHeaders = Object.entries(spec.headers ?? {}).filter(([k]) => k.toLowerCase() !== 'authorization');
  const headerSec = buildDetailSection(`Headers（${visibleHeaders.length} 個）`, visibleHeaders.length > 0);
  const headerList = document.createElement('div');
  headerList.className = 'detail-edit-list';

  const rebuildEditedHeaders = () => {
    if (!editedDetailSpec) return;
    const obj: Record<string, string> = {};
    headerList.querySelectorAll<HTMLDivElement>('.detail-edit-row').forEach((r) => {
      const k = (r.querySelector('.detail-edit-key-input') as HTMLInputElement).value.trim();
      const v = (r.querySelector('.detail-edit-val-input') as HTMLInputElement).value;
      if (k) obj[k] = v;
    });
    editedDetailSpec.headers = obj;
  };

  const addEditableHeaderRow = (k: string, v: string) => {
    const row = document.createElement('div');
    row.className = 'detail-edit-row';
    const keyInp = document.createElement('input');
    keyInp.type = 'text';
    keyInp.className = 'detail-edit-key-input detail-edit-input';
    keyInp.value = k;
    keyInp.placeholder = 'Header key';
    const valInp = document.createElement('input');
    valInp.type = 'text';
    valInp.className = 'detail-edit-val-input detail-edit-input';
    valInp.value = v;
    valInp.placeholder = 'value';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'header-remove';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      row.remove();
      rebuildEditedHeaders();
    });
    keyInp.addEventListener('input', rebuildEditedHeaders);
    valInp.addEventListener('input', rebuildEditedHeaders);
    row.appendChild(keyInp);
    row.appendChild(valInp);
    row.appendChild(removeBtn);
    headerList.appendChild(row);
  };

  visibleHeaders.forEach(([k, v]) => addEditableHeaderRow(k, v));
  const addHdrBtn = document.createElement('button');
  addHdrBtn.type = 'button';
  addHdrBtn.className = 'detail-add-row-btn';
  addHdrBtn.textContent = '＋ 新增 Header';
  addHdrBtn.addEventListener('click', () => addEditableHeaderRow('', ''));
  headerSec.body.appendChild(headerList);
  headerSec.body.appendChild(addHdrBtn);
  container.appendChild(headerSec.wrap);

  // ── Body ──
  const bodySec = buildDetailSection('Body（JSON）', !!spec.bodyTemplate);
  const bodyTa = document.createElement('textarea');
  bodyTa.className = 'detail-edit-body';
  bodyTa.placeholder = '（可貼上 JSON）';
  bodyTa.value = spec.bodyTemplate ?? '';
  bodyTa.addEventListener('input', () => {
    if (editedDetailSpec) editedDetailSpec.bodyTemplate = bodyTa.value;
  });
  bodySec.body.appendChild(bodyTa);
  container.appendChild(bodySec.wrap);

  apiDetailParamsEl.replaceChildren(container);
  refreshApiDetailActions(spec);
}

function refreshApiCandidatesFromLatestAssistant(): void {
  const latestAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && m.content.trim());
  apiCandidates = latestAssistant ? extractApiCandidatesFromText(latestAssistant.content) : [];
  selectedApiIndex = -1;
  pinnedDetailSpec = null;
  pinnedSavedApiIndex = -1;
  renderApiCandidates();
}

function isCustomSpec(spec: ApiSpec): boolean {
  const key = spec.path || spec.api;
  return customApiSpecs.some((c) => (c.path || c.api) === key);
}
function removeCustomSpec(spec: ApiSpec): void {
  const key = spec.path || spec.api;
  customApiSpecs = customApiSpecs.filter((c) => (c.path || c.api) !== key);
  const pinnedKey = pinnedDetailSpec ? pinnedDetailSpec.path || pinnedDetailSpec.api : '';
  if (pinnedKey && pinnedKey === key) {
    pinnedDetailSpec = null;
    pinnedSavedApiIndex = -1;
  }
}
function renderApiCandidates(): void {
  const allCandidates = getAllApiCandidates();
  apiCandidatesEl.replaceChildren();
  if (!allCandidates.length) {
    selectedApiIndex = -1;
    const empty = document.createElement('div');
    empty.className = 'workflow-subtitle';
    empty.textContent = '尚未偵測到 API，可手動新增。';
    apiCandidatesEl.appendChild(empty);
    renderApiDetail(pinnedDetailSpec || null);
    return;
  }
  if (selectedApiIndex >= allCandidates.length) {
    selectedApiIndex = allCandidates.length - 1;
  }
  allCandidates.forEach((spec, index) => {
    const wrap = document.createElement('div');
    wrap.className = 'api-candidate-wrap';
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'api-candidate';
    row.classList.toggle('active', index === selectedApiIndex);
    const name = document.createElement('div');
    name.className = 'api-candidate-name';
    name.textContent = spec.requestName || spec.api;
    row.appendChild(name);
    const purpose = (spec.purpose || '').trim();
    if (purpose) {
      const text = document.createElement('span');
      text.className = 'api-candidate-purpose';
      text.textContent = purpose;
      row.appendChild(text);
    }
    row.addEventListener('click', () => {
      selectedApiIndex = index;
      pinnedDetailSpec = null;
      pinnedSavedApiIndex = -1;
      renderApiCandidates();
    });
    wrap.appendChild(row);
    if (isCustomSpec(spec)) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'api-candidate-remove';
      removeBtn.title = '移除此 API';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', async (e) => {
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

// ===== 流程分享／匯入（JSON）=====

function isSensitiveShareHeaderKey(key: string): boolean {
  const k = key.trim().toLowerCase();
  if (k === 'authorization' || k === 'cookie') return true;
  if (k === 'x-api-key' || k.endsWith('api-key')) return true;
  return false;
}

function sanitizeHeadersForShare(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (isSensitiveShareHeaderKey(k)) continue;
    out[k] = v;
  }
  return out;
}

function sanitizeStepForShare(step: WorkflowStep): WorkflowStep {
  return {
    ...step,
    params: [...(step.params ?? [])],
    headers: sanitizeHeadersForShare(step.headers),
    bearerToken: '',
  };
}

function normalizeWorkflowRequestTarget(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) {
    try {
      const u = new URL(t);
      const p = u.pathname.replace(/\/+$/, '') || '/';
      return p.toLowerCase();
    } catch {
      return t.toLowerCase();
    }
  }
  return t.replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
}

function workflowStepSignature(step: WorkflowStep): string {
  const method = (step.method || 'GET').toUpperCase();
  const raw = (step.path && step.path.trim()) || (step.api || '').trim();
  return `${method}:${normalizeWorkflowRequestTarget(raw)}`;
}

function findSavedWorkflowWithSameSignature(steps: WorkflowStep[]): SavedWorkflow | null {
  if (!steps.length) return null;
  const sig = steps.map(workflowStepSignature).join('\n');
  for (const w of savedWorkflows) {
    if (!w.steps.length) continue;
    if (w.steps.map(workflowStepSignature).join('\n') === sig) return w;
  }
  return null;
}

function workflowStepsHaveAbsoluteUrl(steps: WorkflowStep[]): boolean {
  return steps.some((s) => {
    const t = (s.path && s.path.trim()) || (s.api || '').trim();
    return /^https?:\/\//i.test(t);
  });
}

function buildWorkflowExportJson(workflowName: string, steps: WorkflowStep[]): string {
  const envelope: WorkflowExportEnvelope = {
    format: WORKFLOW_EXPORT_FORMAT,
    version: WORKFLOW_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    workflow: {
      name: workflowName.trim() || '未命名流程',
      steps: steps.map(sanitizeStepForShare),
    },
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

async function copyWorkflowJsonToClipboard(json: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(json);
      return true;
    }
  } catch {
    void 0;
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = json;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function downloadWorkflowJsonFile(filename: string, json: string): void {
  const safe = filename.replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 80) || 'workflow';
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${safe}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function parseWorkflowStepFromImport(raw: unknown): WorkflowStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const apiRaw = typeof o.api === 'string' ? o.api.trim() : '';
  const pathRaw = typeof o.path === 'string' ? o.path.trim() : '';
  const target = pathRaw || apiRaw;
  if (!target) return null;
  const purpose = typeof o.purpose === 'string' ? o.purpose.trim() : '匯入流程步驟';
  const params = Array.isArray(o.params) ? o.params.map((p) => String(p).trim()).filter(Boolean) : [];
  const methodRaw = typeof o.method === 'string' ? o.method.trim().toUpperCase() : '';
  const method = methodRaw || 'GET';
  let headers: Record<string, string> = {};
  if (o.headers && typeof o.headers === 'object' && !Array.isArray(o.headers)) {
    for (const [k, v] of Object.entries(o.headers as Record<string, unknown>)) {
      if (typeof v === 'string') headers[k] = v;
    }
  }
  headers = sanitizeHeadersForShare(headers);
  const bodyTemplate = typeof o.bodyTemplate === 'string' ? o.bodyTemplate : '';
  const requestName = typeof o.requestName === 'string' ? o.requestName.trim() : undefined;
  return {
    api: apiRaw || pathRaw,
    path: pathRaw || undefined,
    requestName,
    method: method || 'GET',
    headers,
    bodyTemplate,
    bearerToken: '',
    purpose: purpose || '匯入流程步驟',
    params,
  };
}

function parseWorkflowImportJson(
  text: string
): { ok: true; steps: WorkflowStep[]; name: string } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: '不是有效的 JSON。' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'JSON 根節點必須為物件。' };
  }
  const root = parsed as Record<string, unknown>;
  if (root.format !== WORKFLOW_EXPORT_FORMAT) {
    return { ok: false, error: `缺少或無效的 format（須為「${WORKFLOW_EXPORT_FORMAT}」）。` };
  }
  const version = typeof root.version === 'number' ? root.version : Number(root.version);
  if (version !== WORKFLOW_EXPORT_VERSION) {
    return { ok: false, error: `不支援的版本：${String(root.version)}（目前僅支援 ${WORKFLOW_EXPORT_VERSION}）。` };
  }
  const wf = root.workflow;
  if (!wf || typeof wf !== 'object') {
    return { ok: false, error: '缺少 workflow 物件。' };
  }
  const wfo = wf as Record<string, unknown>;
  const name = typeof wfo.name === 'string' ? wfo.name.trim() : '';
  const stepsRaw = wfo.steps;
  if (!Array.isArray(stepsRaw) || !stepsRaw.length) {
    return { ok: false, error: 'workflow.steps 必須為非空陣列。' };
  }
  const steps: WorkflowStep[] = [];
  for (let i = 0; i < stepsRaw.length; i += 1) {
    const step = parseWorkflowStepFromImport(stepsRaw[i]);
    if (!step) return { ok: false, error: `第 ${i + 1} 步格式不正確（需有 path 或 api）。` };
    steps.push(step);
  }
  return { ok: true, steps, name };
}

function defaultImportedWorkflowName(suggested: string): string {
  const base = suggested.trim();
  if (base) return base;
  const ts = new Date().toLocaleString('zh-Hant-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `匯入流程 ${ts}`;
}

function findSavedWorkflowWithDuplicateName(name: string): SavedWorkflow | null {
  const n = name.trim();
  if (!n) return null;
  return savedWorkflows.find((w) => w.name.trim() === n) ?? null;
}

type WorkflowImportConfirmInfo = {
  draftName: string;
  stepCount: number;
  similar: SavedWorkflow | null;
  duplicateName: SavedWorkflow | null;
  hasAbsoluteUrl: boolean;
};

function showWorkflowImportConfirmDialog(info: WorkflowImportConfirmInfo): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'exec-confirm-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'exec-confirm-dialog';

    const titleEl = document.createElement('div');
    titleEl.className = 'exec-confirm-title';
    titleEl.textContent = '匯入流程至草稿';

    const intro = document.createElement('div');
    intro.className = 'exec-confirm-subtitle';
    intro.textContent = `將載入「${info.draftName}」，共 ${info.stepCount} 個步驟，並覆寫目前草稿。`;

    const showProminentAlerts = Boolean(info.duplicateName || info.similar);
    let alertBanner: HTMLDivElement | null = null;
    if (showProminentAlerts) {
      alertBanner = document.createElement('div');
      alertBanner.className = 'workflow-import-alert-banner';
      const bannerTitle = document.createElement('div');
      bannerTitle.className = 'workflow-import-alert-title';
      bannerTitle.textContent = '請留意：與現有流程重疊';
      alertBanner.appendChild(bannerTitle);

      if (info.duplicateName && info.similar && info.duplicateName.id === info.similar.id) {
        const row = document.createElement('div');
        row.className = 'workflow-import-alert-item workflow-import-alert-item--both';
        row.textContent = `與已儲存流程「${info.similar.name}」同名，且每步 HTTP 方法 + 正規化路徑序列完全相同，極可能為同一條流程。`;
        alertBanner.appendChild(row);
      } else {
        if (info.duplicateName) {
          const row = document.createElement('div');
          row.className = 'workflow-import-alert-item workflow-import-alert-item--duplicate';
          row.textContent = `已有已儲存流程使用相同名稱「${info.draftName}」（與「${info.duplicateName.name}」同名），匯入後草稿名稱也會相同，建議匯入後改名再儲存。`;
          alertBanner.appendChild(row);
        }
        if (info.similar) {
          const row = document.createElement('div');
          row.className = 'workflow-import-alert-item workflow-import-alert-item--similar';
          row.textContent = `步驟路徑與「${info.similar.name}」完全相同（每步 HTTP 方法 + 正規化路徑序列一致），可能與該流程重複。`;
          alertBanner.appendChild(row);
        }
      }
    }

    const list = document.createElement('ul');
    list.className = 'workflow-import-confirm-list';

    const liAuth = document.createElement('li');
    liAuth.textContent =
      '此 JSON 不含 Authorization、API Key、Cookie 等敏感 Header；若 API 需要，請匯入後在各步驟的 API 設定中自行補上。';
    list.appendChild(liAuth);

    if (info.hasAbsoluteUrl) {
      const liUrl = document.createElement('li');
      liUrl.textContent =
        '偵測到完整 URL（含 http/https）：請確認與你目前的環境一致，必要時請改為相對 path 或正確的網址。';
      list.appendChild(liUrl);
    }

    const actions = document.createElement('div');
    actions.className = 'exec-confirm-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'exec-confirm-cancel';
    cancelBtn.textContent = '取消';
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'exec-confirm-ok';
    okBtn.textContent = '仍匯入';

    function close(ok: boolean): void {
      overlay.remove();
      resolve(ok);
    }

    cancelBtn.addEventListener('click', () => close(false));
    okBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => {
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

// ===== 流程草稿、已儲存流程、已儲存 API =====

function getDraftWorkflowDisplayName(): string {
  const fromInput = draftWorkflowNameInputEl.value.trim();
  if (fromInput) return fromInput;
  return (currentWorkflowName || '').trim() || '草稿';
}

function syncDraftWorkflowNameInputFromState(): void {
  draftWorkflowNameInputEl.value = currentWorkflowName;
}

function renderDraftSteps(): void {
  draftStepsEl.replaceChildren();
  if (!draftSteps.length) {
    const empty = document.createElement('li');
    empty.className = 'workflow-subtitle';
    empty.textContent = '尚未加入步驟。';
    draftStepsEl.appendChild(empty);
    return;
  }
  draftSteps.forEach((step, index) => {
    const item = document.createElement('li');
    item.className = 'draft-step-item' + (index === editingStepIndex ? ' editing' : '');
    const info = document.createElement('div');
    info.className = 'draft-step-info';
    const num = document.createElement('span');
    num.className = 'draft-step-num';
    num.textContent = `${index + 1}.`;
    const title = document.createElement('span');
    title.className = 'draft-step-title';
    title.textContent = step.requestName || step.api;
    info.appendChild(num);
    info.appendChild(title);
    const purpose = (step.purpose || '').trim();
    if (purpose) {
      const purposeEl = document.createElement('span');
      purposeEl.className = 'draft-step-purpose';
      purposeEl.textContent = purpose;
      info.appendChild(purposeEl);
    }
    const actions = document.createElement('div');
    actions.className = 'draft-step-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'draft-step-edit';
    editBtn.textContent = index === editingStepIndex ? '編輯中' : '編輯';
    editBtn.disabled = index === editingStepIndex;
    editBtn.addEventListener('click', () => {
      editingStepIndex = index;
      addStepButton.textContent = '更新步驟';
      addStepButton.classList.add('updating');
      renderApiDetail({ ...step });
      renderDraftSteps();
    });
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'draft-step-delete';
    delBtn.textContent = '✕';
    delBtn.title = index === editingStepIndex ? '編輯中，無法刪除' : '移除此步驟';
    delBtn.disabled = index === editingStepIndex;
    delBtn.addEventListener('click', () => {
      const stepTitle = step.requestName || step.api;
      if (!confirmDelete(`確定要刪除步驟「${stepTitle}」嗎？`)) return;
      draftSteps.splice(index, 1);
      if (editingStepIndex === index) {
        editingStepIndex = -1;
        addStepButton.textContent = '加入流程步驟';
        addStepButton.classList.remove('updating');
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
    const empty = document.createElement('div');
    empty.className = 'workflow-subtitle';
    empty.textContent = '尚未建立流程。';
    savedWorkflowsEl.appendChild(empty);
    return;
  }
  savedWorkflows.forEach((workflow, index) => {
    const card = document.createElement('div');
    card.className = 'workflow-card';

    const nameEl = document.createElement('div');
    nameEl.className = 'workflow-card-name';
    nameEl.textContent = workflow.name;
    nameEl.title = workflow.steps.map((step) => step.api).join(', ');

    const stepsEl = document.createElement('div');
    stepsEl.className = 'workflow-card-steps';
    stepsEl.textContent = `${workflow.steps.length} 步`;

    const actions = document.createElement('div');
    actions.className = 'workflow-card-actions';

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.textContent = '載入';
    loadBtn.addEventListener('click', () => {
      draftSteps = workflow.steps.map((step) => ({
        ...step,
        params: [...step.params],
        headers: step.headers ? { ...step.headers } : {},
      }));
      currentWorkflowName = workflow.name;
      syncDraftWorkflowNameInputFromState();
      draftNameFromImport = false;
      renderDraftSteps();
      setWorkflowPanelOpen(true);
      setToast(`已載入流程：${workflow.name}`, 'ok');
      chatInputEl.focus();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'workflow-card-delete';
    deleteBtn.textContent = '刪除';
    deleteBtn.addEventListener('click', async () => {
      if (!confirmDelete(`確定要刪除已儲存流程「${workflow.name}」嗎？`)) return;
      savedWorkflows.splice(index, 1);
      renderSavedWorkflows();
      await saveMessages();
      setToast(`已刪除流程：${workflow.name}`, 'ok');
    });

    actions.appendChild(loadBtn);
    actions.appendChild(deleteBtn);
    card.appendChild(nameEl);
    card.appendChild(stepsEl);
    card.appendChild(actions);
    savedWorkflowsEl.appendChild(card);
  });
}

function renderSavedApis(): void {
  savedApisListEl.replaceChildren();
  if (!customApiSpecs.length) {
    const empty = document.createElement('div');
    empty.className = 'detail-empty';
    empty.textContent = '尚未儲存任何 API';
    savedApisListEl.appendChild(empty);
    return;
  }
  customApiSpecs.forEach((spec, index) => {
    const card = document.createElement('div');
    card.className = 'saved-api-card';
    if (index === pinnedSavedApiIndex) card.classList.add('selected');

    const info = document.createElement('div');
    info.className = 'saved-api-info';
    const nameEl = document.createElement('div');
    nameEl.className = 'saved-api-name';
    nameEl.textContent = spec.requestName ?? spec.api;
    info.appendChild(nameEl);
    const purpose = (spec.purpose ?? '').trim();
    if (purpose) {
      const purposeEl = document.createElement('div');
      purposeEl.className = 'saved-api-purpose';
      purposeEl.textContent = purpose;
      info.appendChild(purposeEl);
    }

    const actions = document.createElement('div');
    actions.className = 'saved-api-actions';

    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.textContent = '選擇';
    if (index === pinnedSavedApiIndex) selectBtn.classList.add('active');
    selectBtn.addEventListener('click', () => {
      selectedApiIndex = -1;
      pinnedSavedApiIndex = index;
      pinnedDetailSpec = { ...spec, params: [...(spec.params ?? [])], headers: { ...(spec.headers ?? {}) } };
      renderSavedApis();
      renderApiCandidates();
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'saved-api-delete';
    deleteBtn.textContent = '✕';
    deleteBtn.title = '刪除此 API';
    deleteBtn.addEventListener('click', async () => {
      const apiTitle = spec.requestName || spec.api;
      if (!confirmDelete(`確定要刪除已儲存 API「${apiTitle}」嗎？`)) return;
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

// ===== OAuth、串流訊息、聊天渲染 =====
function maskToken(token: string): string {
  if (token.length <= 14) return token;
  return `${token.slice(0, 10)}...${token.slice(-4)}`;
}

function confirmDelete(message: string): boolean {
  return globalThis.confirm(message);
}

function createOAuthState(): string {
  if (globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`userinfo 取得失敗 (${response.status})`);
  }
  return (await response.json()) as GoogleUserInfo;
}

async function exchangeGoogleTokenForFirebaseIdToken(googleAccessToken: string): Promise<string> {
  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${encodeURIComponent(
    getEffectiveFirebaseWebApiKey()
  )}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      postBody: `access_token=${encodeURIComponent(googleAccessToken)}&providerId=google.com`,
      requestUri: 'https://localhost',
      returnIdpCredential: true,
      returnSecureToken: true,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firebase token 交換失敗 (${response.status}) ${text}`);
  }
  const data = (await response.json()) as { idToken?: string };
  if (!data.idToken) throw new Error('Firebase 回應缺少 idToken');
  return data.idToken;
}

async function callAgentChatApi(message: string): Promise<string> {
  if (!firebaseIdToken) {
    throw new Error('尚未取得 Firebase idToken，請先完成 Google 授權');
  }
  const response = await fetch(getEffectiveAgentChatUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${firebaseIdToken}`,
      'x-page-url': globalThis.location?.href || '',
    },
    body: JSON.stringify({
      message,
      sessionId: chatSessionId,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      reportBackendApiAuthRejection(response.status);
      await saveMessages();
    }
    throw new Error(`Agent API 失敗 (${response.status}) ${text}`);
  }
  clearBackendApiAuthHint();
  const data = (await response.json()) as {
    reply?: string;
    message?: string;
    data?: { reply?: string; message?: string };
  };
  return data.reply || data.message || data.data?.reply || data.data?.message || JSON.stringify(data);
}

function extractTextFromPayload(payload: unknown): string {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload !== 'object') return '';
  const data = payload as Record<string, unknown>;
  if (typeof data.reply === 'string') return data.reply;
  if (typeof data.message === 'string') return data.message;
  if (typeof data.content === 'string') return data.content;
  if (data.data && typeof data.data === 'object') {
    const nested = data.data as Record<string, unknown>;
    if (typeof nested.reply === 'string') return nested.reply;
    if (typeof nested.message === 'string') return nested.message;
    if (typeof nested.content === 'string') return nested.content;
  }
  if (Array.isArray(data.choices)) {
    const first = data.choices[0] as Record<string, unknown> | undefined;
    const delta = first?.delta as Record<string, unknown> | undefined;
    if (typeof delta?.content === 'string') return delta.content;
    if (typeof first?.text === 'string') return first.text;
  }
  return '';
}

function stripThinkingText(text: string): string {
  if (!text) return '';
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, '')
    .replace(/^\s*(思考|thinking)\s*[:：].*$/gim, '');
}

function parseSseBlock(block: string): { eventType: string | null; payloadText: string } {
  let eventType: string | null = null;
  const dataParts: string[] = [];
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim().toLowerCase();
    } else if (line.startsWith('data:')) {
      dataParts.push(line.slice(5).trim());
    }
  }
  return { eventType, payloadText: dataParts.join('\n') };
}

function shouldEmitSseDelta(eventType: string | null): boolean {
  if (eventType === null) return true;
  return eventType === 'delta';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function splitRequestTargetForEditor(raw: string): { base: string; pathAndQuery: string } {
  const s = (raw || '').trim();
  if (!s) return { base: '', pathAndQuery: '' };
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      return { base: u.origin, pathAndQuery: `${u.pathname}${u.search}` || '/' };
    } catch {
      return { base: '', pathAndQuery: s };
    }
  }
  return { base: '', pathAndQuery: s };
}

function joinRequestTargetFromEditor(base: string, pathAndQuery: string): string {
  const b = (base || '').trim();
  const p = (pathAndQuery || '').trim();
  if (!b) return p;
  if (!p) return b;
  const baseClean = b.replace(/\/+$/, '');
  let pathPart = p;
  if (pathPart.startsWith('?')) {
    pathPart = `/${pathPart}`;
  } else {
    pathPart = pathPart.replace(/^\/+/, '');
  }
  if (/^https?:\/\//i.test(baseClean)) {
    try {
      const joinBase = baseClean.endsWith('/') ? baseClean : `${baseClean}/`;
      return new URL(pathPart, joinBase).toString();
    } catch {
      return `${baseClean}/${pathPart}`;
    }
  }
  return `${baseClean}/${pathPart}`;
}

function getPathNoQueryAndSearchFromCombined(combined: string): { pathNoQuery: string; queryString: string } {
  const s = (combined || '').trim();
  if (!s) return { pathNoQuery: '', queryString: '' };
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      return {
        pathNoQuery: `${u.origin}${u.pathname}`,
        queryString: u.searchParams.toString(),
      };
    } catch {
      void 0;
    }
  }
  const qIdx = s.indexOf('?');
  if (qIdx < 0) return { pathNoQuery: s, queryString: '' };
  return { pathNoQuery: s.slice(0, qIdx), queryString: s.slice(qIdx + 1) };
}

let markdownCodeBlockSeq = 0;

function renderMarkdownFromEscapedBlocks(escaped: string): string {
  const blocks = escaped.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('### ')) {
        return `<h4>${trimmed.slice(4)}</h4>`;
      }
      if (trimmed.startsWith('## ')) {
        return `<h3>${trimmed.slice(3)}</h3>`;
      }
      if (trimmed.startsWith('# ')) {
        return `<h2>${trimmed.slice(2)}</h2>`;
      }
      const lines = trimmed.split('\n');
      if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
        const items = lines
          .map((line) => line.replace(/^\s*[-*]\s+/, ''))
          .map((line) => `<li>${line}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }
      const paragraph = trimmed
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
      return `<p>${paragraph}</p>`;
    })
    .filter(Boolean)
    .join('');
}

function renderAssistantMarkdown(text: string): string {
  const parts: string[] = [];
  const fenceRe = /```([^\n`]*)\r?\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    const before = text.slice(last, m.index);
    if (before.trim()) {
      parts.push(renderMarkdownFromEscapedBlocks(escapeHtml(before)));
    }
    const lang = (m[1] || '').trim();
    const rawCode = m[2].replace(/\n$/, '');
    const id = `md-code-${markdownCodeBlockSeq++}`;
    const langHtml = escapeHtml(lang || 'bash');
    parts.push(
      `<div class="md-code-wrap"><div class="md-code-toolbar"><span class="md-code-lang">${langHtml}</span><button type="button" class="md-code-copy" data-copy="${id}" title="複製此區塊">複製</button></div><pre class="md-code-pre" id="${id}"><code>${escapeHtml(rawCode)}</code></pre></div>`
    );
    last = m.index + m[0].length;
  }
  const tail = text.slice(last);
  if (tail.trim()) {
    parts.push(renderMarkdownFromEscapedBlocks(escapeHtml(tail)));
  }
  return parts.join('');
}

async function callAgentChatApiStream(message: string, onDelta: (chunk: string) => void): Promise<string> {
  if (!firebaseIdToken) {
    throw new Error('尚未取得 Firebase idToken，請先完成 Google 授權');
  }
  const response = await fetch(getEffectiveAgentChatUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${firebaseIdToken}`,
      'x-page-url': globalThis.location?.href || '',
      Accept: 'text/event-stream, application/json, text/plain',
    },
    body: JSON.stringify({
      message,
      sessionId: chatSessionId,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      reportBackendApiAuthRejection(response.status);
      await saveMessages();
    }
    throw new Error(`Agent API 失敗 (${response.status}) ${text}`);
  }
  clearBackendApiAuthHint();
  if (!response.body) {
    return callAgentChatApi(message);
  }

  const contentType = response.headers.get('content-type') || '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';

  // eslint-disable-next-line no-constant-condition -- ReadableStream.read() 直到 done
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    if (contentType.includes('text/event-stream')) {
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      for (const event of events) {
        const { eventType, payloadText } = parseSseBlock(event);
        if (!shouldEmitSseDelta(eventType)) continue;
        if (!payloadText || payloadText === '[DONE]') continue;
        let deltaText = '';
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
      buffer = '';
    }
  }

  if (contentType.includes('text/event-stream')) {
    const tail = buffer.trim();
    if (tail && tail !== '[DONE]') {
      const tailEvents = tail.split('\n\n').filter(Boolean);
      for (const ev of tailEvents) {
        const { eventType, payloadText } = parseSseBlock(ev);
        if (!shouldEmitSseDelta(eventType)) continue;
        if (!payloadText || payloadText === '[DONE]') continue;
        let deltaText = '';
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
    const empty = document.createElement('div');
    empty.className = 'empty-tip';
    empty.textContent = '尚無訊息。在下方輸入問題後按「送出」即可開始與 Agent 對話。';
    chatMessagesEl.appendChild(empty);
    chatMessagesEl.classList.remove('chat-messages--streaming');
    return;
  }

  messages.forEach((message, index) => {
    const row = document.createElement('div');
    row.className = `message-row ${message.role}`;
    const isStreamingAssistant = message.role === 'assistant' && index === streamingAssistantIndex;
    const streamBubbleEmpty = isStreamingAssistant && !message.content.trim();

    if (message.role === 'assistant' && index === streamingAssistantIndex) {
      row.classList.add('message-row--streaming');
    }
    if (message.role === 'assistant' && index === streamJustFinishedIndex) {
      row.classList.add('message-row--stream-done');
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    if (message.role === 'assistant') {
      bubble.classList.add('markdown');
      if (streamBubbleEmpty) {
        bubble.classList.add('message-bubble--stream-wait');
        const wait = document.createElement('div');
        wait.className = 'stream-wait-lines';
        wait.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 3; i += 1) {
          const bar = document.createElement('span');
          bar.className = 'stream-wait-bar';
          wait.appendChild(bar);
        }
        bubble.appendChild(wait);
      } else {
        bubble.innerHTML = renderAssistantMarkdown(message.content);
      }
      if (isStreamingAssistant) {
        const cursor = document.createElement('span');
        cursor.className = 'assistant-stream-cursor';
        cursor.setAttribute('aria-hidden', 'true');
        bubble.appendChild(cursor);
      }
    } else {
      bubble.textContent = message.content;
    }

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    if (message.role === 'assistant' && index === streamingAssistantIndex) {
      meta.classList.add('message-meta--streaming');
      const badge = document.createElement('span');
      badge.className = 'message-meta-badge message-meta-badge--pulse';
      badge.textContent = 'LIVE';
      meta.appendChild(badge);
      meta.appendChild(document.createTextNode(' 正在產生回應'));
      const typing = document.createElement('span');
      typing.className = 'typing-indicator';
      typing.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 3; i += 1) {
        const dot = document.createElement('span');
        dot.className = 'typing-dot';
        typing.appendChild(dot);
      }
      meta.appendChild(typing);
    } else if (message.role === 'assistant' && index === streamJustFinishedIndex) {
      meta.classList.add('message-meta--done');
      meta.textContent = `Agent · 已回應完畢 · ${message.at}`;
    } else {
      meta.textContent = `${message.role === 'user' ? '你' : 'Agent'} · ${message.at}`;
    }

    row.appendChild(bubble);
    row.appendChild(meta);
    chatMessagesEl.appendChild(row);
  });
  chatMessagesEl.classList.toggle('chat-messages--streaming', streamingAssistantIndex !== null);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

async function loadMessages(): Promise<void> {
  persistenceReady = false;
  const storageLocal = extensionChrome?.storage?.local;
  let saved: Record<string, unknown>;
  try {
    saved = storageLocal
      ? await storageLocal.get([
          STORAGE_KEY,
          SESSION_ID_KEY,
          WORKFLOWS_KEY,
          AUTH_STATE_KEY,
          CUSTOM_APIS_KEY,
          EXEC_RESULTS_KEY,
          RUNTIME_ENV_SETTINGS_KEY,
        ])
      : {
          [STORAGE_KEY]: fallbackStorage.get(STORAGE_KEY),
          [SESSION_ID_KEY]: fallbackStorage.get(SESSION_ID_KEY),
          [WORKFLOWS_KEY]: fallbackStorage.get(WORKFLOWS_KEY),
          [AUTH_STATE_KEY]: fallbackStorage.get(AUTH_STATE_KEY),
          [CUSTOM_APIS_KEY]: fallbackStorage.get(CUSTOM_APIS_KEY),
          [EXEC_RESULTS_KEY]: fallbackStorage.get(EXEC_RESULTS_KEY),
          [RUNTIME_ENV_SETTINGS_KEY]: fallbackStorage.get(RUNTIME_ENV_SETTINGS_KEY),
        };
  } catch (err) {
    console.error('[personal-extension] loadMessages: storage.get failed', err);
    saved = {};
  }
  try {
    setAuthStatus('尚未授權，請先按「Google 授權」。', 'normal');
    setChatEnabled(false);

    hydrateRuntimeEnvFromSaved(saved[RUNTIME_ENV_SETTINGS_KEY]);

    if (typeof saved[SESSION_ID_KEY] === 'string' && saved[SESSION_ID_KEY]) {
      chatSessionId = saved[SESSION_ID_KEY] as string;
    }

    if (saved[STORAGE_KEY]) {
      try {
        const parsed = JSON.parse(saved[STORAGE_KEY] as string) as unknown[];
        if (Array.isArray(parsed)) {
          messages = parsed.slice(-MAX_MESSAGES).filter((item): item is ChatMessage => {
            return (
              Boolean(item) &&
              typeof item === 'object' &&
              (item as ChatMessage).role !== undefined &&
              typeof (item as ChatMessage).content === 'string' &&
              typeof (item as ChatMessage).at === 'string'
            );
          });
        }
      } catch {
        messages = [];
      }
    }
    if (saved[WORKFLOWS_KEY]) {
      try {
        const parsedWorkflows = JSON.parse(saved[WORKFLOWS_KEY] as string) as Array<
          SavedWorkflow & { apis?: string[] }
        >;
        if (Array.isArray(parsedWorkflows)) {
          savedWorkflows = parsedWorkflows
            .filter((item) => Boolean(item) && typeof item === 'object')
            .map((item) => {
              const legacySteps = Array.isArray(item.apis)
                ? item.apis
                    .map((api) => String(api || '').trim())
                    .filter(Boolean)
                    .map((api) => ({ api, purpose: '待補充目的', params: [] as string[] }))
                : [];
              const steps = Array.isArray(item.steps)
                ? item.steps
                    .filter((step) => step && typeof step.api === 'string')
                    .map((step) => ({
                      api: step.api,
                      path: typeof step.path === 'string' ? step.path : undefined,
                      requestName: typeof step.requestName === 'string' ? step.requestName : undefined,
                      method: typeof step.method === 'string' ? step.method : undefined,
                      headers:
                        step.headers && typeof step.headers === 'object'
                          ? { ...(step.headers as Record<string, string>) }
                          : {},
                      bodyTemplate: typeof step.bodyTemplate === 'string' ? step.bodyTemplate : '',
                      bearerToken: typeof step.bearerToken === 'string' ? step.bearerToken : '',
                      purpose: typeof step.purpose === 'string' ? step.purpose : '待補充目的',
                      params: Array.isArray(step.params) ? step.params.map((p) => String(p)) : [],
                    }))
                : legacySteps;
              return {
                id: typeof item.id === 'string' ? item.id : `wf-${Date.now()}`,
                name: typeof item.name === 'string' ? item.name : '未命名流程',
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
            .filter((item) => item && typeof item.api === 'string')
            .map((item) => ({
              api: item.api,
              path: typeof item.path === 'string' ? item.path : undefined,
              requestName: typeof item.requestName === 'string' ? item.requestName : undefined,
              method: typeof item.method === 'string' ? item.method : undefined,
              headers: item.headers && typeof item.headers === 'object' ? (item.headers as Record<string, string>) : {},
              bodyTemplate: typeof item.bodyTemplate === 'string' ? item.bodyTemplate : '',
              bearerToken: typeof item.bearerToken === 'string' ? item.bearerToken : '',
              purpose: typeof item.purpose === 'string' ? item.purpose : '',
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
    renderSavedApis();
    try {
      if (typeof saved[EXEC_RESULTS_KEY] === 'string' && saved[EXEC_RESULTS_KEY]) {
        const parsed = JSON.parse(saved[EXEC_RESULTS_KEY] as string) as ExecResult[];
        if (Array.isArray(parsed)) execResults = parsed.slice(0, MAX_EXEC_RESULTS);
      }
    } catch {
      execResults = [];
    }
    renderExecResults();
  } catch (err) {
    console.error('[personal-extension] loadMessages: restore UI failed', err);
  } finally {
    persistenceReady = true;
  }

  if (typeof saved[AUTH_STATE_KEY] === 'string' && saved[AUTH_STATE_KEY]) {
    try {
      const parsed = JSON.parse(saved[AUTH_STATE_KEY] as string) as AuthState;
      if (isAuthStateValid(parsed)) {
        const storedEmail = parsed.accountEmail || '';
        if (!isAllowedAiiiEmail(storedEmail)) {
          clearAuthStateInMemory();
          await saveMessages();
          if (isEmailDomainRestrictionActive()) {
            setAuthStatus(
              `此擴充僅限公司 Google 帳號（網域須為 ${ALLOWED_GOOGLE_EMAIL_SUFFIX.trim()}）。已清除不符合網域的授權資料，請改用符合資格的帳號授權。`,
              'error'
            );
            setOAuthInfo(storedEmail ? `先前帳號：${storedEmail}` : '先前授權無有效信箱');
            setToast(`僅限 ${ALLOWED_GOOGLE_EMAIL_SUFFIX.trim()} 網域可使用本擴充。`, 'error', 8000);
          } else {
            setAuthStatus(
              '存放的授權信箱無效或無法辨識。已清除授權資料，請重新完成 Google 授權。',
              'error'
            );
            setOAuthInfo(storedEmail ? `先前帳號：${storedEmail}` : '先前授權無有效信箱');
            setToast('請重新完成 Google 授權。', 'error', 8000);
          }
        } else {
          firebaseIdToken = parsed.firebaseIdToken;
          googleAccessToken = parsed.googleAccessToken;
          authExpiresAt = parsed.expiresAt;
          accountEmail = storedEmail || '(無法取得 email)';
          isAuthorized = true;
          setChatEnabled(true);
          clearBackendApiAuthHint();
          setAuthStatus(`已授權（${accountEmail}）`, 'ok');
          setOAuthInfo(`account_email: ${accountEmail}`);
          return;
        }
      }
    } catch {
      // ignore parse errors and fallback to interactive auth
    }
  }

  const identityInfo = await checkIdentityAuthorization();
  if (identityInfo.authorized) {
    setAuthStatus(`${identityInfo.message}，但 Token 已過期，請重新授權。`, 'normal');
  } else if (identityInfo.domainNotAllowed) {
    setAuthStatus(identityInfo.message, 'error');
    setOAuthInfo(identityInfo.message);
  }
  syncPanelBodyAuthLock();
}

async function saveMessages(): Promise<void> {
  if (!persistenceReady) return;
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
  fallbackStorage.set(STORAGE_KEY, data[STORAGE_KEY] ?? '');
  fallbackStorage.set(SESSION_ID_KEY, data[SESSION_ID_KEY] ?? '');
  fallbackStorage.set(WORKFLOWS_KEY, data[WORKFLOWS_KEY] ?? '');
  fallbackStorage.set(AUTH_STATE_KEY, data[AUTH_STATE_KEY] ?? '');
  fallbackStorage.set(CUSTOM_APIS_KEY, data[CUSTOM_APIS_KEY] ?? '');
  fallbackStorage.set(EXEC_RESULTS_KEY, data[EXEC_RESULTS_KEY] ?? '');
}

function pushMessage(role: ChatRole, content: string): number {
  messages.push({
    role,
    content,
    at: new Date().toLocaleTimeString('zh-Hant-TW', { hour: '2-digit', minute: '2-digit' }),
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

function checkIdentityAuthorization(): Promise<{
  authorized: boolean;
  message: string;
  domainNotAllowed?: boolean;
}> {
  return new Promise((resolve) => {
    if (!extensionChrome?.identity?.getProfileUserInfo) {
      resolve({ authorized: false, message: '目前環境不支援 chrome.identity' });
      return;
    }
    extensionChrome.identity.getProfileUserInfo((userInfo) => {
      const maybeError = extensionChrome?.runtime?.lastError?.message;
      if (maybeError) {
        resolve({ authorized: false, message: maybeError });
        return;
      }
      if (!userInfo?.email) {
        resolve({ authorized: false, message: '尚未完成 OAuth 授權，請按「Google 授權」' });
        return;
      }
      if (!isAllowedAiiiEmail(userInfo.email)) {
        resolve({
          authorized: false,
          domainNotAllowed: true,
          message: isEmailDomainRestrictionActive()
            ? `瀏覽器 Google 帳號為 ${userInfo.email}，僅限 ${ALLOWED_GOOGLE_EMAIL_SUFFIX.trim()} 可使用本擴充。`
            : `瀏覽器回報的 Google 帳號格式異常（${userInfo.email}），無法使用本擴充。`,
        });
        return;
      }
      resolve({ authorized: true, message: `已偵測瀏覽器帳號 ${userInfo.email}` });
    });
  });
}

function requestOAuthAuthorization(): Promise<OAuthGrantInfo> {
  return new Promise((resolve, reject) => {
    if (!extensionChrome?.identity?.launchWebAuthFlow || !extensionChrome?.identity?.getRedirectURL) {
      reject(new Error('目前環境不支援 chrome.identity.launchWebAuthFlow'));
      return;
    }
    const redirectUri = extensionChrome.identity.getRedirectURL('oauth2');
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', getEffectiveGoogleOAuthClientId());
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', GOOGLE_OAUTH_SCOPE);
    authUrl.searchParams.set('prompt', 'select_account');
    const oauthState = createOAuthState();
    authUrl.searchParams.set('state', oauthState);

    extensionChrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (responseUrl?: string) => {
        const maybeError = extensionChrome?.runtime?.lastError?.message;
        if (maybeError) {
          reject(new Error(`${maybeError}（請確認 OAuth client 已允許 redirect URI: ${redirectUri}）`));
          return;
        }
        if (!responseUrl) {
          reject(new Error('授權流程未回傳 response URL'));
          return;
        }
        const hash = responseUrl.split('#')[1] || '';
        const params = new URLSearchParams(hash);
        const returnedState = params.get('state');
        if (!returnedState || returnedState !== oauthState) {
          reject(new Error('OAuth state 驗證失敗，可能存在請求偽造風險'));
          return;
        }
        const accessToken = params.get('access_token');
        if (!accessToken) {
          const error = params.get('error');
          const errorDescription = params.get('error_description');
          reject(new Error(`OAuth 未取得 access token: ${error || 'unknown'} ${errorDescription || ''}`.trim()));
          return;
        }
        resolve({
          accessToken,
          expiresIn: params.get('expires_in') || '(unknown)',
          scope: params.get('scope') || '(unknown)',
          tokenType: params.get('token_type') || '(unknown)',
          redirectUri,
        });
      }
    );
  });
}

async function authorizeNow(): Promise<void> {
  setAuthStatus('正在進行 Google OAuth 授權...', 'normal');
  try {
    const grant = await requestOAuthAuthorization();
    let resolvedEmail = '(無法取得 email)';
    try {
      const userInfo = await fetchGoogleUserInfo(grant.accessToken);
      if (userInfo.email) resolvedEmail = userInfo.email;
    } catch (error) {
      console.log('[personal-extension] userinfoError', error);
    }
    if (!isAllowedAiiiEmail(resolvedEmail)) {
      clearAuthStateInMemory();
      setChatEnabled(false);
      await saveMessages();
      const detail = isEmailDomainRestrictionActive()
        ? resolvedEmail !== '(無法取得 email)'
          ? `目前 Google 帳號為 ${resolvedEmail}，僅限 ${ALLOWED_GOOGLE_EMAIL_SUFFIX.trim()} 可使用本擴充。`
          : `無法取得授權信箱，或信箱非 ${ALLOWED_GOOGLE_EMAIL_SUFFIX.trim()}。請確認已使用公司帳號登入 Google。`
        : '無法取得有效的授權信箱。請確認 OAuth 已包含 userinfo 權限，並重新授權。';
      setAuthStatus(detail, 'error');
      setOAuthInfo(detail);
      setToast(
        isEmailDomainRestrictionActive() ? `僅限 ${ALLOWED_GOOGLE_EMAIL_SUFFIX.trim()} 帳號` : '授權信箱無效',
        'error',
        8000
      );
      return;
    }
    googleAccessToken = grant.accessToken;
    accountEmail = resolvedEmail;
    firebaseIdToken = await exchangeGoogleTokenForFirebaseIdToken(grant.accessToken);
    const expiresInSeconds = Number.parseInt(grant.expiresIn || '', 10);
    const safeTtlMs = Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds * 1000 : 3600 * 1000;
    // 提前 60 秒視為到期，避免邊界時間觸發 401。
    authExpiresAt = Date.now() + safeTtlMs - 60_000;
    clearBackendApiAuthHint();
    setAuthStatus('OAuth 授權成功。', 'ok');
    setOAuthInfo(`account_email: ${accountEmail}`);
    setAuthStatus(`OAuth 授權成功（${accountEmail}）`, 'ok');
    isAuthorized = true;
    setChatEnabled(true);
    await saveMessages();
    console.log('[personal-extension] oauthGrant', {
      ...grant,
      accountEmail,
      accessToken: maskToken(grant.accessToken),
    });
  } catch (error) {
    clearAuthStateInMemory();
    setChatEnabled(false);
    await saveMessages();
    const message = error instanceof Error ? error.message : '未知錯誤';
    setAuthStatus(`OAuth 授權失敗：${message}`, 'error');
    setOAuthInfo(`OAuth 授權失敗：${message}`);
    console.log('[personal-extension] oauthAuthorizeError', message);
  }
}

// ===== 執行流程與結果渲染 =====
const STEP_LETTERS = 'abcdefghijklmnopqrstuvwxyz';

function renderExecResults(): void {
  executionResultListEl.replaceChildren();
  execResults.forEach((result) => {
    const block = document.createElement('div');
    block.className = 'exec-workflow-block';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'exec-workflow-toggle';
    toggle.textContent = `${result.ok ? '✅' : '❌'} ▾  【${result.workflowName}】${result.timestamp}`;
    const stepsWrap = document.createElement('div');
    stepsWrap.className = 'exec-workflow-steps collapsed';
    toggle.addEventListener('click', () => {
      const collapsed = stepsWrap.classList.toggle('collapsed');
      toggle.textContent = `${result.ok ? '✅' : '❌'} ${collapsed ? '▸' : '▾'}  【${result.workflowName}】${result.timestamp}`;
    });
    result.steps.forEach((s) => {
      const row = document.createElement('div');
      row.className = `exec-step-row ${s.ok ? 'ok' : 'error'}`;
      const left = document.createElement('div');
      left.className = 'exec-step-left';
      const icon = document.createElement('span');
      icon.className = 'exec-step-icon';
      icon.textContent = s.ok ? '✅' : '❌';
      const label = document.createElement('span');
      label.className = 'exec-step-label';
      label.textContent = `${s.index + 1}. ${s.name}`;
      const statusText = document.createElement('span');
      statusText.className = 'exec-step-status-text';
      statusText.textContent = s.statusText;
      left.appendChild(icon);
      left.appendChild(label);
      left.appendChild(statusText);
      const actions = document.createElement('div');
      actions.className = 'exec-step-actions';
      if (s.response) {
        const viewBtn = document.createElement('button');
        viewBtn.type = 'button';
        viewBtn.className = 'exec-view-btn';
        viewBtn.textContent = '查看結果';
        const pre = document.createElement('pre');
        pre.className = 'exec-step-response hidden';
        pre.textContent = s.response;
        viewBtn.addEventListener('click', () => {
          pre.classList.toggle('hidden');
          viewBtn.textContent = pre.classList.contains('hidden') ? '查看結果' : '收起';
        });
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'exec-copy-btn';
        copyBtn.textContent = '複製';
        copyBtn.addEventListener('click', () => {
          copyToClipboard(s.response ?? '', copyBtn);
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
  step: WorkflowStep
): {
  row: HTMLDivElement;
  icon: HTMLSpanElement;
  statusText: HTMLSpanElement;
  viewBtn: HTMLButtonElement;
  copyBtn: HTMLButtonElement;
  responsePre: HTMLPreElement;
} {
  const row = document.createElement('div');
  row.className = 'exec-step-row';
  const left = document.createElement('div');
  left.className = 'exec-step-left';
  const icon = document.createElement('span');
  icon.className = 'exec-step-icon running';
  icon.textContent = '⏳';
  const label = document.createElement('span');
  label.className = 'exec-step-label';
  const letter = STEP_LETTERS[index] ?? String(index + 1);
  label.textContent = `${letter}. ${step.requestName || step.api}`;
  const statusText = document.createElement('span');
  statusText.className = 'exec-step-status-text';
  statusText.textContent = '等待中';
  left.appendChild(icon);
  left.appendChild(label);
  left.appendChild(statusText);
  const viewBtn = document.createElement('button');
  viewBtn.type = 'button';
  viewBtn.className = 'exec-view-btn hidden';
  viewBtn.textContent = '查看結果';
  const responseBlock = document.createElement('div');
  responseBlock.className = 'exec-step-response hidden';
  const responsePre = document.createElement('pre');
  responseBlock.appendChild(responsePre);
  viewBtn.addEventListener('click', () => {
    const isHidden = responseBlock.classList.toggle('hidden');
    viewBtn.textContent = isHidden ? '查看結果' : '收起';
  });
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'exec-copy-btn hidden';
  copyBtn.textContent = '複製';
  copyBtn.addEventListener('click', () => {
    copyToClipboard(responsePre.textContent ?? '', copyBtn);
  });
  const saveApiBtn = document.createElement('button');
  saveApiBtn.type = 'button';
  saveApiBtn.className = 'exec-save-api-btn';
  saveApiBtn.textContent = '儲存 API';
  saveApiBtn.addEventListener('click', () => {
    const cleanedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(step.headers ?? {})) {
      if (k.toLowerCase() !== 'authorization') cleanedHeaders[k] = v;
    }
    const alreadyExists = customApiSpecs.some(
      (s) => s.path === (step.path || step.api) && s.requestName === step.requestName
    );
    if (alreadyExists) {
      setToast(`「${step.requestName || step.api}」已在已儲存的 API 中。`, 'error');
      return;
    }
    customApiSpecs.push({
      api: step.api || step.path || '',
      path: step.path,
      requestName: step.requestName,
      method: step.method,
      headers: cleanedHeaders,
      bodyTemplate: step.bodyTemplate,
      purpose: step.purpose ?? '',
      params: [...(step.params ?? [])],
    });
    renderSavedApis();
    renderApiCandidates();
    setSavedApisOpen(true);
    saveApiBtn.textContent = '已儲存 ✓';
    saveApiBtn.disabled = true;
    setToast(`已儲存 API：${step.requestName || step.api}`, 'ok');
    void saveMessages();
  });
  const rowActions = document.createElement('div');
  rowActions.className = 'exec-step-actions';
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
    setToast('流程草稿是空的，請先加入 API 步驟。', 'error');
    return;
  }
  if (isAuthExpired()) {
    notifyAuthExpired();
    return;
  }
  const workflowName = getDraftWorkflowDisplayName();
  const timestamp = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });

  // Build workflow result block
  const block = document.createElement('div');
  block.className = 'exec-workflow-block';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'exec-workflow-toggle';
  toggle.textContent = `▾  【${workflowName}】${timestamp}`;
  const stepsWrap = document.createElement('div');
  stepsWrap.className = 'exec-workflow-steps';
  toggle.addEventListener('click', () => {
    const collapsed = stepsWrap.classList.toggle('collapsed');
    toggle.textContent = `${collapsed ? '▸' : '▾'}  【${workflowName}】${timestamp}`;
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
  executionResultPanelEl.classList.remove('collapsed');
  toggleExecutionResultButton.textContent = '執行結果 ▾';

  let allOk = true;
  for (let i = 0; i < draftSteps.length; i += 1) {
    const step = draftSteps[i];
    const ui = stepUIs[i];
    ui.icon.textContent = '⏳';
    ui.icon.className = 'exec-step-icon running';
    ui.statusText.textContent = '執行中…';
    ui.row.className = 'exec-step-row';

    const url = step.path || step.api;
    const method = (step.method || 'GET').toUpperCase();
    const baseHeaders: Record<string, string> = { ...(step.headers || {}) };
    for (const k of Object.keys(baseHeaders)) {
      if (k.toLowerCase() === 'authorization') delete baseHeaders[k];
    }
    const contentType = baseHeaders['content-type'] ?? baseHeaders['Content-Type'] ?? 'application/json';
    delete baseHeaders['content-type'];
    const headers: Record<string, string> = {
      ...baseHeaders,
      Authorization: `Bearer ${firebaseIdToken}`,
      'Content-Type': contentType,
    };
    const hasBody = !!step.bodyTemplate && ['POST', 'PUT', 'PATCH'].includes(method);
    try {
      const resp = await fetch(url, {
        method,
        headers,
        ...(hasBody ? { body: step.bodyTemplate } : {}),
      });
      const ct = resp.headers.get('content-type') ?? '';
      let resultText: string;
      if (ct.includes('application/json')) {
        const json = (await resp.json()) as unknown;
        resultText = JSON.stringify(json, null, 2);
      } else {
        resultText = await resp.text();
      }
      if (resp.ok) {
        clearBackendApiAuthHint();
        ui.icon.textContent = '✅';
        ui.icon.className = 'exec-step-icon';
        ui.statusText.textContent = `${resp.status}`;
        ui.row.classList.add('ok');
      } else {
        if (resp.status === 401 || resp.status === 403) {
          reportBackendApiAuthRejection(resp.status);
        }
        ui.icon.textContent = '❌';
        ui.icon.className = 'exec-step-icon';
        ui.statusText.textContent = `${resp.status} 失敗`;
        ui.row.classList.add('error');
        allOk = false;
      }
      ui.responsePre.textContent = resultText;
      ui.viewBtn.classList.remove('hidden');
      ui.copyBtn.classList.remove('hidden');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知錯誤';
      ui.icon.textContent = '❌';
      ui.icon.className = 'exec-step-icon';
      ui.statusText.textContent = '網路錯誤';
      ui.row.classList.add('error');
      ui.responsePre.textContent = message;
      ui.viewBtn.classList.remove('hidden');
      ui.copyBtn.classList.remove('hidden');
      allOk = false;
      break;
    }
  }
  toggle.textContent = `${allOk ? '✅' : '❌'} ▾  【${workflowName}】${timestamp}`;
  setToast(allOk ? '流程已全部執行成功 ✅' : '流程執行完成，部分步驟失敗 ❌', allOk ? 'ok' : 'error');
  // Persist result
  const resultRecord: ExecResult = {
    workflowName,
    timestamp,
    ok: allOk,
    steps: draftSteps.map((step, i) => ({
      index: i,
      name: step.requestName || step.api || step.path || `步驟 ${i + 1}`,
      ok: stepUIs[i].row.classList.contains('ok'),
      statusText: stepUIs[i].statusText.textContent || '',
      response: stepUIs[i].responsePre.textContent || '',
    })),
  };
  execResults.unshift(resultRecord);
  if (execResults.length > MAX_EXEC_RESULTS) execResults = execResults.slice(0, MAX_EXEC_RESULTS);
  renderExecResults();
  // Re-open the first (latest) block
  const firstBlock = executionResultListEl.firstElementChild;
  if (firstBlock) {
    const firstSteps = firstBlock.querySelector('.exec-workflow-steps');
    const firstToggleEl = firstBlock.querySelector('.exec-workflow-toggle');
    if (firstSteps && firstToggleEl) {
      firstSteps.classList.remove('collapsed');
      firstToggleEl.textContent = `${allOk ? '✅' : '❌'} ▾  【${workflowName}】${timestamp}`;
    }
  }
  await saveMessages();
}

async function sendChatMessage(rawMessage: string, useSkill: boolean): Promise<void> {
  const value = rawMessage.trim();
  if (!value) return;
  if (streamingAssistantIndex !== null) return;
  clearStreamJustFinishedTimer();
  streamJustFinishedIndex = null;

  const messageForAgent = buildMessageWithSkillDirective(value, useSkill);
  pushMessage('user', value);
  chatInputEl.value = '';
  const assistantIndex = pushMessage('assistant', '');
  streamingAssistantIndex = assistantIndex;
  renderMessages();

  try {
    const fullText = await callAgentChatApiStream(messageForAgent, (chunk) => {
      appendToMessage(assistantIndex, chunk);
    });
    if (!messages[assistantIndex]?.content.trim()) {
      messages[assistantIndex].content = fullText || '(無回應內容)';
      renderMessages();
      refreshApiCandidatesFromLatestAssistant();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知錯誤';
    messages[assistantIndex].content = `呼叫 Agent API 失敗：${message}`;
    renderMessages();
    setToast(`呼叫失敗：${message}`, 'error');
  } finally {
    streamingAssistantIndex = null;
    const replyText = messages[assistantIndex]?.content ?? '';
    const streamFailed = replyText.startsWith('呼叫 Agent API 失敗');
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

// ===== 事件綁定與初始化 =====
chatFormEl.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isAuthExpired()) {
    notifyAuthExpired();
    return;
  }
  const value = chatInputEl.value.trim();
  if (!value) return;
  await sendChatMessage(value, false);
});

clearChatButton.addEventListener('click', () => {
  clearStreamJustFinishedTimer();
  streamingAssistantIndex = null;
  streamJustFinishedIndex = null;
  messages = [];
  renderMessages();
  void saveMessages();
});

toggleChatButton.addEventListener('click', () => {
  setChatPanelOpen(!chatPanelOpen);
});
toggleWorkflowsButton.addEventListener('click', () => {
  setWorkflowPanelOpen(!workflowPanelOpen);
});
toggleCurlParserButton.addEventListener('click', () => {
  setCurlParserOpen(!curlParserOpen);
});
toggleManualApiButton.addEventListener('click', () => {
  setManualApiOpen(!manualApiOpen);
});
toggleSavedApisButton.addEventListener('click', () => {
  setSavedApisOpen(!savedApisOpen);
});
manualApiNameEl.addEventListener('input', () => {
  clearFieldError(manualApiNameEl);
  updateManualFormActions();
});
manualApiPathEl.addEventListener('input', () => {
  clearFieldError(manualApiPathEl);
  updateManualFormActions();
});
manualApiBodyEl.addEventListener('input', () => {
  clearFieldError(manualApiBodyEl);
});
manualApiParamsRowsEl.addEventListener('input', (ev) => {
  const t = ev.target as HTMLElement | null;
  if (t?.classList.contains('field-error')) clearFieldError(t);
});
manualApiHeadersRowsEl.addEventListener('input', (ev) => {
  const t = ev.target as HTMLElement | null;
  if (t?.classList.contains('field-error')) clearFieldError(t);
});
manualApiHeadersRowsEl.addEventListener('change', (ev) => {
  const t = ev.target as HTMLElement | null;
  if (t?.classList.contains('field-error')) clearFieldError(t);
});
toggleExecutionResultButton.addEventListener('click', () => {
  const collapsed = executionResultPanelEl.classList.toggle('collapsed');
  toggleExecutionResultButton.textContent = collapsed ? '執行結果 ▸' : '執行結果 ▾';
});
toggleSavedWorkflowsButton.addEventListener('click', () => {
  setSavedWorkflowsOpen(!savedWorkflowsOpen);
});
clearExecutionResultButton.addEventListener('click', async () => {
  execResults = [];
  executionResultListEl.replaceChildren();
  await saveMessages();
});

cancelApiDetailButton.addEventListener('click', () => {
  selectedApiIndex = -1;
  pinnedDetailSpec = null;
  pinnedSavedApiIndex = -1;
  resetApiDetail();
  renderApiCandidates();
  renderSavedApis();
});

addStepButton.addEventListener('click', () => {
  const spec = editedDetailSpec ?? getAllApiCandidates()[selectedApiIndex];
  if (!spec) {
    setToast('請先選擇一個 API。', 'error');
    return;
  }
  const apiKey = (spec.api || spec.path || '').trim();
  if (!apiKey) {
    setToast('API 識別（名稱或路徑）不完整。', 'error');
    return;
  }
  const stepData: WorkflowStep = {
    api: apiKey,
    path: spec.path,
    requestName: spec.requestName,
    method: spec.method,
    headers: spec.headers ? { ...spec.headers } : {},
    bodyTemplate: spec.bodyTemplate,
    bearerToken: spec.bearerToken,
    purpose: spec.purpose || '',
    params: [...(spec.params || [])],
  };
  if (editingStepIndex >= 0 && editingStepIndex < draftSteps.length) {
    draftSteps[editingStepIndex] = stepData;
    editingStepIndex = -1;
    addStepButton.textContent = '加入流程步驟';
    addStepButton.classList.remove('updating');
    setToast(`已更新步驟：${stepData.requestName || stepData.api}`, 'ok');
  } else {
    draftSteps.push(stepData);
    setToast(`已加入步驟：${stepData.requestName || stepData.api}`, 'ok');
  }
  renderDraftSteps();
});

// ===== API 設定動作（加入步驟 / 儲存 / 更新）與確認對話 =====
function getCurrentDetailSpec(): ApiSpec | null {
  const src = editedDetailSpec ?? (selectedApiIndex >= 0 ? getAllApiCandidates()[selectedApiIndex] : pinnedDetailSpec);
  if (!src) return null;
  return {
    ...src,
    api: src.api || src.path || '',
    path: src.path,
    requestName: src.requestName,
    method: src.method,
    headers: src.headers ? { ...src.headers } : {},
    bodyTemplate: src.bodyTemplate,
    bearerToken: src.bearerToken,
    purpose: src.purpose || '',
    params: [...(src.params || [])],
  };
}

saveDetailApiButton.addEventListener('click', async () => {
  const spec = getCurrentDetailSpec();
  if (!spec) {
    setToast('請先選擇一個 API。', 'error');
    return;
  }
  const baseName = (spec.requestName || spec.api || 'CustomApi').trim();
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
  setToast(isDup ? `已另存為「${spec.requestName}」` : `已儲存 API：${baseName}`, 'ok');
});

updateDetailApiButton.addEventListener('click', async () => {
  const spec = getCurrentDetailSpec();
  const targetIndex = pinnedSavedApiIndex;
  if (!spec || targetIndex < 0) {
    setToast('找不到對應的已儲存 API 可更新。', 'error');
    return;
  }
  customApiSpecs[targetIndex] = spec;
  pinnedDetailSpec = spec;
  renderSavedApis();
  renderApiCandidates();
  await saveMessages();
  setToast(`已更新已儲存 API：${spec.requestName || spec.api}`, 'ok');
});

function clearFieldError(el: HTMLElement): void {
  el.classList.remove('field-error');
  const hint = el.nextElementSibling;
  if (hint && hint.classList.contains('field-error-hint')) hint.remove();
}

function setFieldError(el: HTMLElement, hintText?: string): void {
  clearFieldError(el);
  el.classList.add('field-error');
  if (hintText) {
    const span = document.createElement('span');
    span.className = 'field-error-hint';
    span.textContent = hintText;
    el.insertAdjacentElement('afterend', span);
  }
}

function clearManualApiFormValidationHints(): void {
  clearFieldError(manualApiNameEl);
  clearFieldError(manualApiPathEl);
  clearFieldError(manualApiBodyEl);
  manualApiParamsRowsEl.querySelectorAll('input,select').forEach((node) => {
    clearFieldError(node as HTMLElement);
  });
  manualApiHeadersRowsEl.querySelectorAll('input,select').forEach((node) => {
    clearFieldError(node as HTMLElement);
  });
}

function validateManualApiForm(): boolean {
  clearManualApiFormValidationHints();
  let ok = true;

  const name = manualApiNameEl.value.trim();
  if (!name) {
    setFieldError(manualApiNameEl, '請填寫 API 名稱。');
    ok = false;
  }

  const path = manualApiPathEl.value.trim();
  if (!path) {
    setFieldError(manualApiPathEl, '請填寫 URL。');
    ok = false;
  } else if (!isManualApiPathWellFormed(path)) {
    setFieldError(manualApiPathEl, '請使用完整的 http 或 https URL。');
    ok = false;
  }

  if (!isManualApiBodyWellFormed(manualApiBodyEl.value)) {
    setFieldError(manualApiBodyEl, 'Body 須為合法 JSON（或留白）。');
    ok = false;
  }

  manualApiParamsRowsEl.querySelectorAll('.header-row').forEach((node) => {
    const row = node as HTMLDivElement;
    const inputs = row.querySelectorAll('input');
    const keyIn = inputs[0] as HTMLInputElement | undefined;
    const valIn = inputs[1] as HTMLInputElement | undefined;
    if (!keyIn || !valIn) return;
    const key = keyIn.value.trim();
    const val = valIn.value.trim();
    if (!key && !val) return;
    if (!key && val) {
      setFieldError(keyIn, '請填寫參數鍵名。');
      ok = false;
    } else if (key && !MANUAL_API_PARAM_KEY_RE.test(key)) {
      setFieldError(keyIn, '鍵名僅限英文字母、數字與底線，且須以英文或底線開頭。');
      ok = false;
    }
  });

  manualApiHeadersRowsEl.querySelectorAll('.header-row').forEach((node) => {
    const row = node as HTMLDivElement;
    const select = row.querySelector('.header-key-select') as HTMLSelectElement | null;
    const custom = row.querySelector('.header-key-custom') as HTMLInputElement | null;
    const valInput = row.querySelector('.header-value') as HTMLInputElement | null;
    if (!select || !custom || !valInput) return;
    let key = '';
    if (select.value === HEADER_KEY_CUSTOM) key = custom.value.trim();
    else key = select.value.trim();
    const val = valInput.value.trim();
    if (!key && !val) return;
    if (!key && val) {
      const target = select.value === HEADER_KEY_CUSTOM ? custom : select;
      setFieldError(target, '請選擇或填寫 Header 名稱。');
      ok = false;
      return;
    }
    if (select.value === HEADER_KEY_CUSTOM && key && !MANUAL_HTTP_HEADER_NAME_RE.test(key)) {
      setFieldError(custom, 'Header 名稱含有不允許的字元。');
      ok = false;
    }
  });

  if (!ok) setToast('請修正標紅欄位後再儲存。', 'error');
  return ok;
}

function clearManualForm(): void {
  clearManualApiFormValidationHints();
  manualApiNameEl.value = '';
  manualApiPathEl.value = '';
  manualApiPurposeEl.value = '';
  manualApiMethodEl.value = 'GET';
  renderManualParamsRows([]);
  renderManualHeaderRowsFromObject({});
  manualApiBodyEl.value = '';
  manualApiCurlEl.value = '';
  addManualApiButton.textContent = '加入自訂 API';
  manualApiActionsEl.classList.add('hidden');
  manualApiActionsEl.replaceChildren();
  editingApiIndex = -1;
  addManualApiButton.style.display = 'none';
}

function buildSpecFromForm(): { name: string; path: string; spec: ApiSpec } {
  const name = manualApiNameEl.value.trim();
  const path = manualApiPathEl.value.trim();
  const purpose = manualApiPurposeEl.value.trim();
  const method = (manualApiMethodEl.value.trim() || 'GET').toUpperCase();
  const headers = collectManualHeaders();
  const bodyTemplate = manualApiBodyEl.value.trim();
  const bearerRaw = headers.Authorization ?? headers.authorization ?? '';
  const bearerToken = bearerRaw.replace(/^Bearer\s+/i, '').trim();
  const manualParams = collectManualParams();
  const params = manualParams.length ? manualParams : inferParamsFromPathAndBody(path, bodyTemplate);
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
  manualApiActionsEl.classList.remove('hidden');
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'pending-api-save';
  saveBtn.textContent = '儲存至已儲存的 API';
  saveBtn.addEventListener('click', async () => {
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
    setToast(isDup ? `已另存為「${finalName}」` : `已儲存 API：${finalName}`, 'ok');
  });
  const addStepBtn = document.createElement('button');
  addStepBtn.type = 'button';
  addStepBtn.className = 'pending-api-step';
  addStepBtn.textContent = '加入流程步驟';
  addStepBtn.addEventListener('click', () => {
    if (!validateManualApiForm()) return;
    const { name, spec } = buildSpecFromForm();
    if (!name || !spec.path) return;
    draftSteps.push({ ...spec, params: [...(spec.params ?? [])] });
    renderDraftSteps();
    renderApiDetail(spec);
    clearManualForm();
    setToast(`已加入步驟：${name}`, 'ok');
  });
  manualApiActionsEl.appendChild(saveBtn);
  manualApiActionsEl.appendChild(addStepBtn);
}

function updateManualFormActions(): void {
  const name = manualApiNameEl.value.trim();
  const path = manualApiPathEl.value.trim();
  if (editingApiIndex >= 0) {
    addManualApiButton.style.display = 'block';
    manualApiActionsEl.classList.add('hidden');
    manualApiActionsEl.replaceChildren();
    return;
  }
  addManualApiButton.style.display = 'none';
  if (name && path) {
    showPendingApiActions();
  } else {
    manualApiActionsEl.classList.add('hidden');
    manualApiActionsEl.replaceChildren();
  }
}

// Edit mode only: Save button handler
addManualApiButton.addEventListener('click', async () => {
  if (editingApiIndex < 0 || editingApiIndex >= customApiSpecs.length) return;
  if (!validateManualApiForm()) return;
  const { name, path, spec } = buildSpecFromForm();
  if (!name || !path) return;
  customApiSpecs[editingApiIndex] = spec;
  clearManualForm();
  renderSavedApis();
  await saveMessages();
  setToast(`已更新 API：${name}`, 'ok');
});

parseCurlButton.addEventListener('click', () => {
  const raw = manualApiCurlEl.value.trim() || manualApiPathEl.value.trim();
  const parsed = parseCurlCommand(raw);
  if (!parsed) {
    setToast('未偵測到有效的 curl 指令。', 'error');
    return;
  }
  manualApiMethodEl.value = parsed.method;
  manualApiPathEl.value = parsed.url;
  renderManualParamsRows(inferParamEntries(parsed.url, parsed.body));
  renderManualHeaderRowsFromObject(parsed.headers);
  manualApiBodyEl.value = parsed.body;
  if (!manualApiNameEl.value.trim()) {
    const tail = parsed.url.split('?')[0].split('/').filter(Boolean).pop() || 'CustomApi';
    manualApiNameEl.value = `${tail}Request`;
  }
  clearManualApiFormValidationHints();
  setToast(`已解析 curl（${parsed.method} ${parsed.url}）`, 'ok');
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
          const urlObj = new URL(step.path ?? step.api ?? '');
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

    const overlay = document.createElement('div');
    overlay.className = 'exec-confirm-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'exec-confirm-dialog';

    const titleEl = document.createElement('div');
    titleEl.className = 'exec-confirm-title';
    titleEl.textContent = '執行前確認';
    const subtitleEl = document.createElement('div');
    subtitleEl.className = 'exec-confirm-subtitle';
    subtitleEl.textContent = '請確認以下步驟的參數，確認無誤後再執行。';
    const stepsWrap = document.createElement('div');
    stepsWrap.className = 'exec-confirm-steps';

    const stepEditors: {
      index: number;
      urlBase: string;
      hasParams: boolean;
      paramInputs: Record<string, HTMLInputElement>;
      hasBody: boolean;
      bodyInput: HTMLTextAreaElement | null;
    }[] = [];

    stepsToReview.forEach(({ step, index, urlParams, hasParams, hasBody }) => {
      const card = document.createElement('div');
      card.className = 'exec-confirm-step';
      const nameEl = document.createElement('div');
      nameEl.className = 'exec-confirm-step-name';
      nameEl.textContent = `${index + 1}. ${step.requestName ?? step.api}`;
      card.appendChild(nameEl);

      const paramInputs: Record<string, HTMLInputElement> = {};
      if (hasParams) {
        const label = document.createElement('div');
        label.className = 'exec-confirm-label';
        label.textContent = 'Params（URL 查詢參數）';
        card.appendChild(label);
        const grid = document.createElement('div');
        grid.className = 'exec-confirm-params';
        for (const [key, val] of Object.entries(urlParams)) {
          const row = document.createElement('div');
          row.className = 'exec-confirm-param-row';
          const keyEl = document.createElement('span');
          keyEl.className = 'exec-confirm-param-key';
          keyEl.textContent = key;
          const valInput = document.createElement('input');
          valInput.type = 'text';
          valInput.value = val;
          valInput.className = 'exec-confirm-param-value';
          row.appendChild(keyEl);
          row.appendChild(valInput);
          grid.appendChild(row);
          paramInputs[key] = valInput;
        }
        card.appendChild(grid);
      }

      let bodyInput: HTMLTextAreaElement | null = null;
      if (hasBody) {
        const label = document.createElement('div');
        label.className = 'exec-confirm-label';
        label.textContent = 'Body';
        bodyInput = document.createElement('textarea');
        bodyInput.className = 'exec-confirm-body';
        bodyInput.value = step.bodyTemplate ?? '';
        card.appendChild(label);
        card.appendChild(bodyInput);
      }

      stepsWrap.appendChild(card);
      const urlBase = (step.path ?? step.api ?? '').split('?')[0];
      stepEditors.push({ index, urlBase, hasParams, paramInputs, hasBody, bodyInput });
    });

    const actions = document.createElement('div');
    actions.className = 'exec-confirm-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'exec-confirm-cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'exec-confirm-ok';
    confirmBtn.textContent = '確認執行';
    confirmBtn.addEventListener('click', () => {
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

runWorkflowButton.addEventListener('click', async () => {
  if (isAuthExpired()) {
    notifyAuthExpired();
    return;
  }
  const confirmed = await showExecutionConfirmDialog();
  if (confirmed) void executeDraftWorkflow();
});

saveWorkflowButton.addEventListener('click', async () => {
  if (!draftSteps.length) {
    setToast('流程草稿是空的，請先加入 API。', 'error');
    return;
  }
  const name = draftWorkflowNameInputEl.value.trim();
  if (!name) {
    const msg = draftNameFromImport ? '請填寫流程名稱後再儲存。' : '請填寫流程名稱（自行建立的草稿為必填）。';
    setToast(msg, 'error');
    draftWorkflowNameInputEl.focus();
    return;
  }
  const dup = savedWorkflows.some((w) => w.name.trim() === name);
  if (dup) {
    if (!globalThis.confirm(`已存在同名流程「${name}」，仍要以同名儲存嗎？`)) return;
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
        headers: step.headers ? { ...step.headers } : {},
      })),
    },
    ...savedWorkflows,
  ].slice(0, 20);
  draftNameFromImport = false;
  renderSavedWorkflows();
  setSavedWorkflowsOpen(true);
  await saveMessages();
  setToast(`已建立流程：${name}`, 'ok');
});

clearDraftButton.addEventListener('click', () => {
  draftSteps = [];
  currentWorkflowName = '';
  draftNameFromImport = false;
  draftWorkflowNameInputEl.value = '';
  importWorkflowJsonInputEl.value = '';
  renderDraftSteps();
  setToast('已清空流程草稿。', 'normal');
});

authorizeGoogleButton.addEventListener('click', () => {
  authorizeGoogleButton.classList.remove('auth-expired-pulse');
  void authorizeNow();
});

function summarizeAgentEndpointForSettingsUi(): string {
  const u = getEffectiveAgentChatUrl();
  try {
    const url = new URL(u);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return u.length > 56 ? `${u.slice(0, 56)}…` : u;
  }
}

function refreshEnvSettingsUi(): void {
  const env = getActiveEnv();
  envToggleStagingButton.classList.toggle('is-active', env === 'staging');
  envToggleProductionButton.classList.toggle('is-active', env === 'production');
  const f = getOverrideFieldsForActiveEnv();
  settingsFirebaseWebApiKeyEl.value = f.firebaseWebApiKey;
  settingsGoogleOAuthClientIdEl.value = f.googleOAuthClientId;
  envEffectiveSummaryEl.textContent = `目前作用中：${
    env === 'staging' ? '測試環境' : '正式環境'
  } · Agent：${summarizeAgentEndpointForSettingsUi()}`;
}

async function persistRuntimeEnvSettings(): Promise<void> {
  const json = runtimeEnvSettingsToJson();
  const storageLocal = extensionChrome?.storage?.local;
  try {
    if (storageLocal) await storageLocal.set({ [RUNTIME_ENV_SETTINGS_KEY]: json });
    else fallbackStorage.set(RUNTIME_ENV_SETTINGS_KEY, json);
  } catch (e) {
    console.error('[personal-extension] persistRuntimeEnvSettings failed', e);
    setToast('環境設定儲存失敗。', 'error');
  }
}

function setPanelSettingsOpen(open: boolean): void {
  panelSettingsOverlayEl.classList.toggle('hidden', !open);
  panelSettingsOverlayEl.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (open) {
    refreshEnvSettingsUi();
    closePanelSettingsButton.focus();
  } else {
    openPanelSettingsButton.focus();
  }
}

openPanelSettingsButton.addEventListener('click', () => setPanelSettingsOpen(true));
closePanelSettingsButton.addEventListener('click', () => setPanelSettingsOpen(false));

envToggleStagingButton.addEventListener('click', () => {
  setActiveEnv('staging');
  void persistRuntimeEnvSettings().then(() => {
    refreshEnvSettingsUi();
    setToast('已切換為測試環境', 'ok', 2200);
  });
});

envToggleProductionButton.addEventListener('click', () => {
  setActiveEnv('production');
  void persistRuntimeEnvSettings().then(() => {
    refreshEnvSettingsUi();
    setToast('已切換為正式環境', 'ok', 2200);
  });
});

saveEnvOverridesButton.addEventListener('click', () => {
  updateOverridesForActiveEnv({
    firebaseWebApiKey: settingsFirebaseWebApiKeyEl.value.trim(),
    googleOAuthClientId: settingsGoogleOAuthClientIdEl.value.trim(),
  });
  void persistRuntimeEnvSettings().then(() => {
    refreshEnvSettingsUi();
    setToast('已儲存此環境的金鑰覆寫（非空值優先於建置預設）。', 'ok', 4000);
  });
});

clearEnvOverridesButton.addEventListener('click', () => {
  updateOverridesForActiveEnv({ firebaseWebApiKey: '', googleOAuthClientId: '' });
  void persistRuntimeEnvSettings().then(() => {
    refreshEnvSettingsUi();
    setToast('已清除此環境的覆寫，改回建置預設。', 'ok', 3500);
  });
});

panelSettingsOverlayEl.addEventListener('click', (e: MouseEvent) => {
  if (e.target === panelSettingsOverlayEl) setPanelSettingsOpen(false);
});

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  if (panelSettingsOverlayEl.classList.contains('hidden')) return;
  setPanelSettingsOpen(false);
});

closeDockButton.addEventListener('click', () => {
  chrome?.runtime?.sendMessage({ type: CLOSE_HELLO_DOCK });
});

function postDockToHostMessage(msg: PanelToHostDockMessage): void {
  window.parent?.postMessage(msg, '*');
}

if (dockShellDragGripEl) {
  dockShellDragGripEl.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    postDockToHostMessage({
      source: PANEL_TO_HOST_SOURCE,
      kind: 'dock-drag-start',
      iframeClientX: e.clientX,
      iframeClientY: e.clientY,
    });
  });

  dockShellDragGripEl.addEventListener('dblclick', (e: MouseEvent) => {
    e.preventDefault();
    postDockToHostMessage({ source: PANEL_TO_HOST_SOURCE, kind: 'dock-drag-reset-dblclick' });
  });
}

minimizeDockButton.addEventListener('click', () => {
  postDockToHostMessage({ source: PANEL_TO_HOST_SOURCE, kind: 'dock-minimize' });
});

exportDraftWorkflowJsonButton.addEventListener('click', () => {
  if (!draftSteps.length) {
    setToast('草稿為空，無法匯出。', 'error');
    return;
  }
  const name =
    draftWorkflowNameInputEl.value.trim() || currentWorkflowName.trim() || `草稿_${savedWorkflows.length + 1}`;
  const json = buildWorkflowExportJson(name, draftSteps);
  downloadWorkflowJsonFile(name, json);
  setToast('已下載草稿 JSON。', 'ok');
});

copyDraftWorkflowJsonButton.addEventListener('click', async () => {
  if (!draftSteps.length) {
    setToast('草稿為空，無法匯出。', 'error');
    return;
  }
  const name =
    draftWorkflowNameInputEl.value.trim() || currentWorkflowName.trim() || `草稿_${savedWorkflows.length + 1}`;
  const json = buildWorkflowExportJson(name, draftSteps);
  const copied = await copyWorkflowJsonToClipboard(json);
  if (copied) setToast('已複製草稿 JSON 到剪貼簿。', 'ok');
  else {
    downloadWorkflowJsonFile(name, json);
    setToast('複製失敗，已改為下載 JSON。', 'normal');
  }
});

importWorkflowToDraftButton.addEventListener('click', async () => {
  const text = importWorkflowJsonInputEl.value.trim();
  if (!text) {
    setToast('請先貼上流程 JSON。', 'error');
    return;
  }
  const parsed = parseWorkflowImportJson(text);
  if (!parsed.ok) {
    setToast(parsed.error, 'error');
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
    hasAbsoluteUrl,
  });
  if (!confirmed) return;
  draftSteps = parsed.steps.map((s) => ({
    ...s,
    params: [...(s.params ?? [])],
    headers: { ...(s.headers ?? {}) },
  }));
  currentWorkflowName = draftName;
  syncDraftWorkflowNameInputFromState();
  draftNameFromImport = true;
  editingStepIndex = -1;
  addStepButton.textContent = '加入流程步驟';
  addStepButton.classList.remove('updating');
  renderDraftSteps();
  renderApiDetail(getAllApiCandidates()[selectedApiIndex] ?? null);
  setWorkflowPanelOpen(true);
  await saveMessages();
  setToast(`已匯入草稿：${draftName}`, 'ok');
});

setWorkflowPanelOpen(true);
renderManualHeaderRowsFromObject({});
renderManualParamsRows([]);
bindChatMarkdownCopyOnce();
void loadMessages();

draftWorkflowNameInputEl.addEventListener('input', () => {
  currentWorkflowName = draftWorkflowNameInputEl.value;
  draftNameFromImport = false;
});

addHeaderRowButton.addEventListener('click', () => {
  appendManualHeaderRow();
});
addParamRowButton.addEventListener('click', () => {
  appendManualParamRow();
});
clearManualApiButton.addEventListener('click', () => {
  clearManualForm();
  setToast('已清除自訂 API 內容。', 'normal');
});

// ── Chat messages resize handle ──
const CHAT_HEIGHT_KEY = 'chat_messages_height';
(function initChatResizeHandle() {
  const handle = document.getElementById('chatResizeHandle') as HTMLDivElement;
  if (!handle) return;

  // Restore saved height
  const saved = sessionStorage.getItem(CHAT_HEIGHT_KEY);
  if (saved) {
    chatMessagesEl.style.height = saved;
    chatMessagesEl.classList.add('chat-messages--user-height');
  }

  let startY = 0;
  let startH = 0;

  function onMouseMove(e: MouseEvent) {
    const delta = e.clientY - startY;
    const newH = Math.max(80, startH + delta);
    chatMessagesEl.classList.add('chat-messages--user-height');
    chatMessagesEl.style.height = `${newH}px`;
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    handle.classList.remove('dragging');
    sessionStorage.setItem(CHAT_HEIGHT_KEY, chatMessagesEl.style.height);
  }

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    startY = e.clientY;
    startH = chatMessagesEl.offsetHeight;
    chatMessagesEl.classList.add('chat-messages--user-height');
    handle.classList.add('dragging');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
})();
