import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 讀取專案根目錄 `.env`（簡易 KEY=VALUE，支援 # 註解與引號）。
 * 不含 shell 展開；僅供建置腳本使用。
 *
 * @param {string} cwd
 * @returns {Record<string, string>}
 */
export function loadDotEnvFile(cwd) {
  const path = resolve(cwd, '.env');
  /** @type {Record<string, string>} */
  const out = {};
  if (!existsSync(path)) return out;
  const textRaw = readFileSync(path, 'utf8');
  const text = textRaw.charCodeAt(0) === 0xfeff ? textRaw.slice(1) : textRaw;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * process.env 覆寫檔案值（便於 CI 注入）。
 * @param {string} key
 * @param {Record<string, string>} fileEnv
 */
function resolveKey(key, fileEnv) {
  const fromProc = process.env[key];
  if (fromProc !== undefined && fromProc !== '') return fromProc;
  return fileEnv[key] ?? '';
}

/** 與舊版 constants 對齊的預設 Agent URL（未設 .env 時仍可用） */
const LEGACY_AGENT_CHAT_DEFAULT =
  '';

/**
 * @param {string} cwd
 */
export function logPersonalExtBuildEnvSummary(cwd) {
  const fileEnv = loadDotEnvFile(cwd);
  const stagingChat = resolveKey('PERSONAL_EXT_AGENT_CHAT_URL_STAGING', fileEnv);
  const prodChat = resolveKey('PERSONAL_EXT_AGENT_CHAT_URL_PRODUCTION', fileEnv);
  const stagingFb = resolveKey('PERSONAL_EXT_FIREBASE_WEB_API_KEY_STAGING', fileEnv);
  const prodFb = resolveKey('PERSONAL_EXT_FIREBASE_WEB_API_KEY_PRODUCTION', fileEnv);
  const stagingClient = resolveKey('PERSONAL_EXT_GOOGLE_OAUTH_CLIENT_ID_STAGING', fileEnv);
  const prodClient = resolveKey('PERSONAL_EXT_GOOGLE_OAUTH_CLIENT_ID_PRODUCTION', fileEnv);
  const chatS = stagingChat.trim() ? stagingChat : LEGACY_AGENT_CHAT_DEFAULT;
  const chatP = prodChat.trim() ? prodChat : LEGACY_AGENT_CHAT_DEFAULT;
  console.log(
    `[build] personal-extension env — lengths: stagingChat=${chatS.length}, productionChat=${chatP.length}, ` +
      `stagingFirebase=${stagingFb.length}, productionFirebase=${prodFb.length}, ` +
      `stagingOAuthClientId=${stagingClient.length}, productionOAuthClientId=${prodClient.length}`
  );
  if (stagingFb.length === 0 && prodFb.length === 0 && stagingClient.length === 0 && prodClient.length === 0) {
    console.log(
      '[build] Tip: 可在根目錄 `.env` 設定 PERSONAL_EXT_*，或使用擴充內「設定」覆寫（見 docs/env-and-secrets-pattern.md）。'
    );
  }
}

/**
 * esbuild `define`：建置期由 `.env`／環境變數注入。
 *
 * @param {string} cwd
 */
export function getPersonalExtEnvDefines(cwd) {
  const fileEnv = loadDotEnvFile(cwd);
  const stagingChatRaw = resolveKey('PERSONAL_EXT_AGENT_CHAT_URL_STAGING', fileEnv).trim();
  const productionChatRaw = resolveKey('PERSONAL_EXT_AGENT_CHAT_URL_PRODUCTION', fileEnv).trim();
  const stagingChat = stagingChatRaw || LEGACY_AGENT_CHAT_DEFAULT;
  const productionChat = productionChatRaw || LEGACY_AGENT_CHAT_DEFAULT;
  const stagingFirebase = resolveKey('PERSONAL_EXT_FIREBASE_WEB_API_KEY_STAGING', fileEnv);
  const productionFirebase = resolveKey('PERSONAL_EXT_FIREBASE_WEB_API_KEY_PRODUCTION', fileEnv);
  const stagingClient = resolveKey('PERSONAL_EXT_GOOGLE_OAUTH_CLIENT_ID_STAGING', fileEnv);
  const productionClient = resolveKey('PERSONAL_EXT_GOOGLE_OAUTH_CLIENT_ID_PRODUCTION', fileEnv);
  let defaultEnv = resolveKey('PERSONAL_EXT_DEFAULT_ENV', fileEnv).toLowerCase();
  if (defaultEnv !== 'staging' && defaultEnv !== 'production') {
    defaultEnv = 'staging';
  }
  return {
    __PERSONAL_EXT_STAGING_AGENT_CHAT_URL__: JSON.stringify(stagingChat),
    __PERSONAL_EXT_PRODUCTION_AGENT_CHAT_URL__: JSON.stringify(productionChat),
    __PERSONAL_EXT_STAGING_FIREBASE_WEB_API_KEY__: JSON.stringify(stagingFirebase),
    __PERSONAL_EXT_PRODUCTION_FIREBASE_WEB_API_KEY__: JSON.stringify(productionFirebase),
    __PERSONAL_EXT_STAGING_GOOGLE_OAUTH_CLIENT_ID__: JSON.stringify(stagingClient),
    __PERSONAL_EXT_PRODUCTION_GOOGLE_OAUTH_CLIENT_ID__: JSON.stringify(productionClient),
    __PERSONAL_EXT_DEFAULT_ACTIVE_ENV__: JSON.stringify(defaultEnv),
  };
}
