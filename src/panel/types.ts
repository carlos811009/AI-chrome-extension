export type ChatRole = 'user' | 'assistant';
export type ChatMessage = {
  role: ChatRole;
  content: string;
  at: string;
};
export type OAuthGrantInfo = {
  accessToken: string;
  expiresIn: string;
  scope: string;
  tokenType: string;
  redirectUri: string;
};
export type GoogleUserInfo = {
  email?: string;
  sub?: string;
  name?: string;
};
export type ApiSpec = {
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
export type WorkflowStep = ApiSpec;
export type ExecStepResult = {
  index: number;
  name: string;
  ok: boolean;
  statusText: string;
  response: string;
};
export type ExecResult = {
  workflowName: string;
  timestamp: string;
  ok: boolean;
  steps: ExecStepResult[];
};
export type SavedWorkflow = {
  id: string;
  name: string;
  steps: WorkflowStep[];
};

/** 流程 JSON 分享格式（單一流程） */
export type WorkflowExportEnvelope = {
  format: 'personal-extension-workflow';
  version: number;
  exportedAt: string;
  workflow: {
    name: string;
    steps: WorkflowStep[];
  };
};

export type AuthState = {
  firebaseIdToken: string;
  googleAccessToken: string;
  expiresAt: number;
  accountEmail: string;
};
