export const STORAGE_KEY = 'chatMessages';
export const SESSION_ID_KEY = 'chatSessionId';
export const WORKFLOWS_KEY = 'savedWorkflows';
export const WORKFLOW_EXPORT_FORMAT = 'personal-extension-workflow' as const;
export const WORKFLOW_EXPORT_VERSION = 1;
export const EXEC_RESULTS_KEY = 'execResults';
export const AUTH_STATE_KEY = 'authState';
export const CUSTOM_APIS_KEY = 'customApis';
export const MAX_MESSAGES = 40;
export const GOOGLE_OAUTH_SCOPE = 'openid email profile';
/** 僅允許此 Google Workspace 網域之 email（OAuth userinfo）；留空表示不限制網域 */
export const ALLOWED_GOOGLE_EMAIL_SUFFIX = '';

/** 執行期環境覆寫（activeEnv + 各環境 Firebase／OAuth Client Id），見 docs/env-and-secrets-pattern.md */
export const RUNTIME_ENV_SETTINGS_KEY = 'personalExtRuntimeEnvSettings';

/**
 * 未於 `.env` 設定 Agent URL 時的後備（與舊版硬編碼對齊）。
 * 正式／測試 URL 請優先以 `PERSONAL_EXT_AGENT_CHAT_URL_*` 建置注入。
 */
export const LEGACY_FALLBACK_AGENT_CHAT_URL = '';

export const MAX_EXEC_RESULTS = 10;
