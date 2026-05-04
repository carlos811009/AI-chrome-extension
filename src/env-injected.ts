import type { ActiveEnv } from './env-types';

function normalizeDefaultEnv(raw: string): ActiveEnv {
  return raw === 'production' ? 'production' : 'staging';
}

/**
 * 建置期注入的環境預設（來源：`.env`／CI 環境變數）。
 */
export function getBuildTimeEnv(): {
  stagingAgentChatUrl: string;
  productionAgentChatUrl: string;
  stagingFirebaseWebApiKey: string;
  productionFirebaseWebApiKey: string;
  stagingGoogleOAuthClientId: string;
  productionGoogleOAuthClientId: string;
  defaultActiveEnv: ActiveEnv;
} {
  return {
    stagingAgentChatUrl: __PERSONAL_EXT_STAGING_AGENT_CHAT_URL__,
    productionAgentChatUrl: __PERSONAL_EXT_PRODUCTION_AGENT_CHAT_URL__,
    stagingFirebaseWebApiKey: __PERSONAL_EXT_STAGING_FIREBASE_WEB_API_KEY__,
    productionFirebaseWebApiKey: __PERSONAL_EXT_PRODUCTION_FIREBASE_WEB_API_KEY__,
    stagingGoogleOAuthClientId: __PERSONAL_EXT_STAGING_GOOGLE_OAUTH_CLIENT_ID__,
    productionGoogleOAuthClientId: __PERSONAL_EXT_PRODUCTION_GOOGLE_OAUTH_CLIENT_ID__,
    defaultActiveEnv: normalizeDefaultEnv(__PERSONAL_EXT_DEFAULT_ACTIVE_ENV__),
  };
}
