import type { ApiSpec } from './types';

/** 將 Word／網頁貼上的彎引號、NBSP 轉成 ASCII，避免 curl 正則匹配失敗。 */
function normalizeCurlSmartQuotes(text: string): string {
  return text
    .replace(/\u2018/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/\u201a/g, "'")
    .replace(/\u201b/g, "'")
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"')
    .replace(/\u201e/g, '"')
    .replace(/\u2032/g, "'")
    .replace(/\uff07/g, "'")
    .replace(/\uff02/g, '"')
    .replace(/\u00a0/g, ' ');
}

export function inferParamEntries(path: string, body: string): Array<{ key: string; value: string }> {
  const map = new Map<string, string>();
  try {
    const qIdx = path.indexOf('?');
    if (qIdx >= 0) {
      new URLSearchParams(path.slice(qIdx + 1)).forEach((v, k) => {
        map.set(k, v);
      });
    }
  } catch {
    // ignore invalid query string
  }
  if (body.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      Object.entries(parsed).forEach(([k, v]) => {
        if (map.has(k)) return;
        if (typeof v === 'string') map.set(k, v);
        else if (typeof v === 'number' || typeof v === 'boolean') map.set(k, String(v));
        else map.set(k, '');
      });
    } catch {
      // ignore invalid json
    }
  }
  return Array.from(map.entries()).map(([key, value]) => ({ key, value }));
}

/** 判斷引號內字串是否像 curl 的 URL／路徑（排除 JSON、Header、純 MIME）。 */
function looksLikeCurlUrlCandidate(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  // 單一 { 後接非 {（常見 JSON）— 勿誤傷 {{API_BASE}} 類模板
  if (/^\s*\{[^{]/.test(t)) return false;
  if (/^\s*\[\s*['"{[]/.test(t) || /^\s*\[\s*\]/.test(t)) return false;
  if (/^[A-Za-z0-9._-]+\s*:\s*\S/.test(t)) return false;
  if (/^[a-z][a-z0-9+.-]*\/[a-z0-9+._-]+$/i.test(t)) return false;
  if (/^https?:\/\//i.test(t)) return true;
  if (t.includes('{{') && t.includes('/')) return true;
  if (t.startsWith('/')) return true;
  if (/[/]/.test(t) && t.length >= 2) return true;
  return false;
}

function extractCurlUrl(text: string): string {
  const normalized = text
    .replace(/\\\r?\n/g, ' ')
    .replace(/\r/g, ' ')
    .trim();
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
  let sm: RegExpExecArray | null;
  while ((sm = sq.exec(normalized)) !== null) {
    const inner = sm[1]?.trim() ?? '';
    if (looksLikeCurlUrlCandidate(inner)) return inner;
  }

  return '';
}

function parseCurlHeadersBlock(text: string): Record<string, string> {
  const normalized = text.replace(/\\\r?\n/g, ' ').replace(/\r/g, ' ');
  const headers: Record<string, string> = {};
  const singleQuoted = /(?:-H|--header)\s+'([^']*)'/gi;
  let match: RegExpExecArray | null;
  while ((match = singleQuoted.exec(normalized)) !== null) {
    const line = match[1];
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const doubleQuoted = /(?:-H|--header)\s+"([^"]*)"/gi;
  while ((match = doubleQuoted.exec(normalized)) !== null) {
    const line = match[1];
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return headers;
}

export function inferParamsFromPathAndBody(path: string, body: string): string[] {
  const fromPathTemplate = Array.from(path.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)).map((m) => m[1]);
  const fromColonPath = Array.from(path.matchAll(/:([a-zA-Z_][a-zA-Z0-9_]*)/g)).map((m) => m[1]);
  let fromQuery: string[] = [];
  try {
    const qIdx = path.indexOf('?');
    if (qIdx >= 0) {
      const sp = new URLSearchParams(path.slice(qIdx + 1));
      const qKeys: string[] = [];
      sp.forEach((_v, k) => {
        qKeys.push(k);
      });
      fromQuery = Array.from(new Set(qKeys));
    }
  } catch {
    fromQuery = [];
  }
  let fromBody: string[] = [];
  if (body.trim().startsWith('{')) {
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
  const flags = ['--data-raw', '--data-binary', '--data', '-d'];
  for (const flag of flags) {
    const escaped = flag.replace(/-/g, '\\-');
    const tries: Array<{ re: RegExp; unescapeDouble: boolean }> = [
      { re: new RegExp(`${escaped}\\s+'([^']*)'`), unescapeDouble: false },
      { re: new RegExp(`${escaped}\\s+"((?:[^"\\\\]|\\\\.)*)"`), unescapeDouble: true },
      { re: new RegExp(`${escaped}\\s*=\\s*'([^']*)'`), unescapeDouble: false },
      { re: new RegExp(`${escaped}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`), unescapeDouble: true },
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
  return '';
}

export function parseCurlCommand(curlText: string): {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  bearerToken: string;
} | null {
  const text = normalizeCurlSmartQuotes(curlText.trim());
  if (!/^curl\b/i.test(text)) return null;
  const normalized = text.replace(/\\\r?\n/g, ' ').replace(/\r/g, ' ');
  const methodMatch =
    normalized.match(/(?:\s|^)-X\s+([A-Z]+)(?=\s|$)/i) ||
    normalized.match(/(?:\s|^)--request\s+([A-Z]+)(?=\s|$)/i);
  const method = (methodMatch?.[1] || '').toUpperCase();
  const rawUrl = extractCurlUrl(normalized);
  if (!rawUrl) return null;

  const headers = parseCurlHeadersBlock(normalized);
  const body = extractCurlBody(normalized);
  const bearerRaw = headers.Authorization || headers.authorization || '';
  const bearerToken = /^Bearer\s+/i.test(bearerRaw) ? bearerRaw.replace(/^Bearer\s+/i, '').trim() : '';
  const inferredMethod = method || (body ? 'POST' : 'GET');
  return {
    method: inferredMethod,
    url: rawUrl,
    headers,
    body,
    bearerToken,
  };
}

/** 從對話文字中擷取「可完整解析」的 curl 片段（圍欄內與獨立行），供 API 候選清單使用。 */
function collectCurlSnippetsFromText(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string): void => {
    const t = raw.trim();
    if (t.length < 10 || !/^curl\b/i.test(t)) return;
    if (!parseCurlCommand(t)) return;
    if (seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  for (const m of text.matchAll(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g)) {
    const inner = m[1] ?? '';
    for (const piece of inner.split(/(?=^\s*curl\s)/im)) {
      if (/^\s*curl\s/im.test(piece)) add(piece);
    }
  }

  const unfenced = text.replace(/```[\s\S]*?```/g, '\n');
  let search = 0;
  while (search < unfenced.length) {
    const tail = unfenced.slice(search);
    const rel = tail.search(/\bcurl\s/i);
    if (rel < 0) break;
    const idx = search + rel;
    const atLineStart = idx === 0 || unfenced[idx - 1] === '\n';
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

function apiSpecFromParsedCurl(p: NonNullable<ReturnType<typeof parseCurlCommand>>): ApiSpec {
  const path = p.url.trim();
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.headers)) {
    if (k.toLowerCase() === 'authorization') continue;
    headers[k] = v;
  }
  return {
    api: path,
    path,
    method: p.method,
    headers,
    bodyTemplate: p.body.trim() ? p.body : undefined,
    bearerToken: p.bearerToken || undefined,
    purpose: '從對話中的 curl 偵測',
    params: inferParamsFromPathAndBody(path, p.body),
  };
}

/** 用於合併「完整 URL」與相對 path，保留較完整者。 */
function preferRicherPath(a?: string, b?: string): string | undefined {
  const x = (a ?? '').trim();
  const y = (b ?? '').trim();
  if (!x) return y || undefined;
  if (!y) return x || undefined;
  if (/^https?:\/\//i.test(x) && !/^https?:\/\//i.test(y)) return x;
  if (/^https?:\/\//i.test(y) && !/^https?:\/\//i.test(x)) return y;
  return x.length >= y.length ? x : y;
}

/** 候選 Map 的 key：URL 轉成 pathname+search，便於與相對路徑對齊。 */
function endpointKey(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  try {
    if (/^https?:\/\//i.test(t)) {
      const u = new URL(t);
      return (u.pathname.replace(/\/+$/, '') || '/') + u.search;
    }
  } catch {
    // ignore
  }
  return t.replace(/^\/+/, '');
}

function pathTail2(pathKey: string): string {
  return pathKey.split('/').filter(Boolean).slice(-2).join('/');
}

/** 若已存在僅差在 host/prefix 的同一端點，合併為同一筆（避免 GET 預設與 curl POST 分兩列）。 */
function findExistingMergeKey(map: Map<string, ApiSpec>, next: ApiSpec): string | undefined {
  const nk = endpointKey(next.path || next.api);
  const nTail = pathTail2(nk);
  if (!nTail) return undefined;
  for (const [mapKey, spec] of map) {
    const ek = endpointKey(spec.path || spec.api);
    if (pathTail2(ek) === nTail) return mapKey;
  }
  return undefined;
}

function _mergeApiSpecs(primary: ApiSpec[], secondary: ApiSpec[]): ApiSpec[] {
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
      purpose: current.purpose !== '待補充目的' ? current.purpose : next.purpose,
      params: Array.from(new Set([...current.params, ...next.params])),
    });
  };
  secondary.forEach(upsert);
  primary.forEach(upsert);
  return Array.from(map.values());
}

/** 僅從可成功解析的完整 curl 指令建立 API 候選（不掃描 JSON／Request 模型／路徑 token）。 */
export function extractApiCandidatesFromText(text: string): ApiSpec[] {
  const specs = new Map<string, ApiSpec>();
  const upsert = (next: ApiSpec): void => {
    const rawKey = (next.path || next.api).trim();
    if (!rawKey) return;
    const existingKey = findExistingMergeKey(specs, next);
    const nk = endpointKey(rawKey);
    const key = existingKey ?? (nk || rawKey);

    const current = specs.get(key);
    if (!current) {
      specs.set(key, {
        ...next,
        params: [...new Set(next.params.map((p) => p.trim()).filter(Boolean))],
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
      headers: { ...(current.headers || {}), ...(next.headers || {}) },
      purpose: current.purpose !== '待補充目的' ? current.purpose : next.purpose,
      params: mergedParams,
    });
  };

  for (const snippet of collectCurlSnippetsFromText(text)) {
    const parsed = parseCurlCommand(snippet);
    if (parsed) upsert(apiSpecFromParsedCurl(parsed));
  }

  return Array.from(specs.values()).slice(0, 20);
}
