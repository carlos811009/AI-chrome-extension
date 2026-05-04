import { getBuildTimeEnv } from '../env-injected';
import type { ActiveEnv } from '../env-types';
import { LEGACY_FALLBACK_AGENT_CHAT_URL, RUNTIME_ENV_SETTINGS_KEY } from './constants';

export type PerEnvSecretOverrides = {
  firebaseWebApiKey: string;
  googleOAuthClientId: string;
};

export type PersonalExtRuntimeEnvSettingsV1 = {
  version: 1;
  activeEnv: ActiveEnv;
  overrides: {
    staging: PerEnvSecretOverrides;
    production: PerEnvSecretOverrides;
  };
};

const emptyOverrides = (): PerEnvSecretOverrides => ({
  firebaseWebApiKey: '',
  googleOAuthClientId: '',
});

function defaultSettings(): PersonalExtRuntimeEnvSettingsV1 {
  return {
    version: 1,
    activeEnv: getBuildTimeEnv().defaultActiveEnv,
    overrides: {
      staging: emptyOverrides(),
      production: emptyOverrides(),
    },
  };
}

let cached: PersonalExtRuntimeEnvSettingsV1 = defaultSettings();

function buildDefaultForEnv(env: ActiveEnv): PerEnvSecretOverrides {
  const b = getBuildTimeEnv();
  if (env === 'staging') {
    return {
      firebaseWebApiKey: b.stagingFirebaseWebApiKey,
      googleOAuthClientId: b.stagingGoogleOAuthClientId,
    };
  }
  return {
    firebaseWebApiKey: b.productionFirebaseWebApiKey,
    googleOAuthClientId: b.productionGoogleOAuthClientId,
  };
}

function coerceSaved(raw: unknown): PersonalExtRuntimeEnvSettingsV1 {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return base;
  const ae = o.activeEnv === 'production' ? 'production' : 'staging';
  const ov = o.overrides;
  if (!ov || typeof ov !== 'object') return { ...base, activeEnv: ae };
  const s = (ov as Record<string, unknown>).staging;
  const p = (ov as Record<string, unknown>).production;
  const readPair = (x: unknown): PerEnvSecretOverrides => {
    if (!x || typeof x !== 'object') return emptyOverrides();
    const r = x as Record<string, unknown>;
    return {
      firebaseWebApiKey: typeof r.firebaseWebApiKey === 'string' ? r.firebaseWebApiKey : '',
      googleOAuthClientId: typeof r.googleOAuthClientId === 'string' ? r.googleOAuthClientId : '',
    };
  };
  return {
    version: 1,
    activeEnv: ae,
    overrides: {
      staging: readPair(s),
      production: readPair(p),
    },
  };
}

/** 由 loadMessages 等呼叫：從 storage 還原覆寫值（不寫回）。 */
export function hydrateRuntimeEnvFromSaved(raw: unknown): void {
  cached = coerceSaved(raw);
}

export function getActiveEnv(): ActiveEnv {
  return cached.activeEnv;
}

export function setActiveEnv(env: ActiveEnv): void {
  cached = { ...cached, activeEnv: env };
}

/**
 * 執行期 effective：storage 非空覆寫 ?? 建置期該環境預設。
 * Agent Chat URL 僅來自建置（依目前 activeEnv）；無建置值時用 LEGACY_FALLBACK_AGENT_CHAT_URL。
 */
export function getEffectiveAgentChatUrl(): string {
  const b = getBuildTimeEnv();
  const url =
    cached.activeEnv === 'staging' ? b.stagingAgentChatUrl.trim() : b.productionAgentChatUrl.trim();
  if (url) return url;
  return LEGACY_FALLBACK_AGENT_CHAT_URL.trim();
}

export function getEffectiveFirebaseWebApiKey(): string {
  const env = cached.activeEnv;
  const trimmed = cached.overrides[env].firebaseWebApiKey.trim();
  if (trimmed) return trimmed;
  return buildDefaultForEnv(env).firebaseWebApiKey.trim();
}

export function getEffectiveGoogleOAuthClientId(): string {
  const env = cached.activeEnv;
  const trimmed = cached.overrides[env].googleOAuthClientId.trim();
  if (trimmed) return trimmed;
  return buildDefaultForEnv(env).googleOAuthClientId.trim();
}

/** 供設定 UI：目前環境下「覆寫欄位」原始值（空＝未覆寫）。 */
export function getOverrideFieldsForActiveEnv(): PerEnvSecretOverrides {
  return { ...cached.overrides[cached.activeEnv] };
}

export function updateOverridesForActiveEnv(patch: PerEnvSecretOverrides): void {
  cached = {
    ...cached,
    overrides: {
      ...cached.overrides,
      [cached.activeEnv]: { ...patch },
    },
  };
}

export function snapshotRuntimeEnvSettings(): PersonalExtRuntimeEnvSettingsV1 {
  return {
    version: 1,
    activeEnv: cached.activeEnv,
    overrides: {
      staging: { ...cached.overrides.staging },
      production: { ...cached.overrides.production },
    },
  };
}

export function runtimeEnvSettingsToJson(): string {
  return JSON.stringify(snapshotRuntimeEnvSettings());
}
