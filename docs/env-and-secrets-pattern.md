# Chrome Extension（MV3）— 環境變數與敏感金鑰規格

本文件描述如何在擴充功能中**一致地**處理「端點／金鑰」：  
**建置期**由 `.env` 注入 bundle，**執行期**允許使用者以本機 storage 覆寫。  
UI 可因專案而異，但**取值優先序與建置流程**建議與此對齊。

### personal-extension（本 repo）

- **建置**：`scripts/load-env.mjs` 讀 `.env`，esbuild `define` 注入 `__PERSONAL_EXT_*__`（變數名見根目錄 `.env.example`）。
- **執行期**：`chrome.storage.local` 鍵 `personalExtRuntimeEnvSettings`；面板「設定」可切換測試／正式環境，並覆寫各環境的 `FIREBASE_WEB_API_KEY`、`GOOGLE_OAUTH_CLIENT_ID`（非空則優先於建置預設）。
- **程式**：`getBuildTimeEnv()`（`src/env-injected.ts`）、effective 取值（`src/panel/env-runtime.ts`）。

---

## 1. 前提與限制（必讀）

| 事實 | 意義 |
|------|------|
| 擴充跑在瀏覽器，**沒有 Node / `process.env`（執行期）** | 不可在 `src/*.ts` 裡寫 `process.env.FOO` 並期望與本機 `.env` 同步。 |
| 擴充**無法**在執行期讀寫專案目錄的 `.env` | 「改 `.env` → 按重新載入就有」**不成立**；須 **重新建置** 才會進 bundle。 |
| 任何只存在客戶端的密鑰都可能被還原 | 打包 JS、storage、DevTools 皆可檢視；高敏感請改 **後端代轉 / OAuth**。 |

---

## 2. 雙層模型

### 2.1 建置層（預設／團隊共用）

- **來源**：專案根目錄 `.env`（不提交版控；以 `.env.example` 當範本）。
- **時機**：僅在開發者執行 **`npm run build`**（或 CI）時，由 **Node 腳本**讀取。
- **產物**：經 bundler（如 esbuild）的 **`define`**，將字串常數替換進 `panel.js` / `background.js` 等。
- **程式內**：透過**單一模組**（例如 `getBuildTimeEnv()`）讀取「已被替換的常數」，**禁止**在業務程式散寫金鑰字串。

### 2.2 執行層（每使用者／每 Profile 覆寫）

- **來源**：`chrome.storage.local`（或專案規定的 storage key；**不**使用 `storage.sync` 存放長效高權限金鑰，除非你有特別理由與風險評估）。
- **時機**：使用者於 UI 儲存後即生效；**不需**重新建置。
- **語意**：覆寫「同一語意欄位」時，**優先於建置層**（見 §4）。

---

## 3. 環境變數命名（建議）

為避免與其他工具衝突，建議加**專案前綴**（以下以 `MYEXT` 為例，可改成你的擴充代號）：

| 用途 | 建議 key（`.env` / `process.env`） |
|------|-----------------------------------|
| 測試環境 API 基底網址 | `MYEXT_API_BASE_URL_STAGING` |
| 正式環境 API 基底網址 | `MYEXT_API_BASE_URL_PRODUCTION` |
| 測試環境 API 金鑰 | `MYEXT_API_KEY_STAGING` |
| 正式環境 API 金鑰 | `MYEXT_API_KEY_PRODUCTION` |
| 首次開啟預設環境（選用） | `MYEXT_DEFAULT_ENV` → `staging` \| `production` |

**`template-chrome-extension` 實作**使用的前綴為建置腳本中的實際名稱（見 `scripts/load-env.mjs`），搬運到其他專案時請一併改名並維持 **load → define → `getBuildTimeEnv()`** 一條鏈。

---

## 4. 取值優先序（邏輯核心）

對「某一環境維度」（例如 `staging` / `production`）的**同一類秘密**（例如 API Key）：

```
effectiveSecret =
  (storage 中該環境的覆寫值，若為非空字串)
  ?? (建置期注入的該環境預設值)
```

- **非空**才視為「有覆寫」；空字串視同「未覆寫」（若你需要「刪除覆寫」語意，另訂 UI／按鈕清除 storage）。
- **基底網址**通常只放在建置層；若你也要允許 URL 覆寫，可類推 storage 結構，但仍建議與金鑰分欄位管理。

---

## 5. 建置腳本契約

### 5.1 讀取 `.env`

- 路徑：`path.resolve(專案根, '.env')`。
- 格式：簡易 `KEY=VALUE`，`#` 註解；值可有引號；首行可含 UTF-8 BOM（建議讀取後去掉 BOM）。
- 不含 shell 變數展開。

### 5.2 `process.env` 覆寫檔案（CI／本機）

對每一個邏輯 key，建議使用同一函式（概念如下）：

```text
resolve(key):
  v = process.env[key]
  若 v 為「有值」的非空字串 → 回傳 v
  否則 → 回傳 fileEnv[key] ?? ''
```

- **空字串的 `process.env[key]`**：視為「未指定」，應回退到 `.env` 檔案，避免 CI 誤設空值蓋掉檔案。
- **僅在 Node 建置程序中執行**；勿在擴充 runtime 呼叫。

### 5.3 寫入 bundle（esbuild `define`）

- 將每一個要注入的變數轉成 **`JSON.stringify(字串)`** 再交給 `define`，避免跳脫錯誤。
- TypeScript 端用 **`declare const __XXX__`** 或集中在一個 `getBuildTimeEnv()` 讀取，避免魔術字串分散。

---

## 6. 執行期 storage 契約（覆寫）

- **Scope**：`chrome.storage.local`（依使用者設定檔隔離；不同 Chrome Profile 互不共用）。
- **Key 命名**：使用**單一 JSON 物件**或固定前綴 key（例如 `myExtApiKeyOverrides`），結構需能區分 `staging` / `production`。
- **與建置層對齊**：覆寫的語意欄位應與 §3、§4 一致，否則「同一套 `getEffective*`」無法共用。

---

## 7. 禁止事項（保持一致性）

1. 在 `src/**/*.ts` **硬編碼**長效 API Key、私密 URL（測試用假值除外）。
2. 在擴充 runtime 使用 **`process.env`** 或假設能「寫回」磁碟 `.env`。
3. 假設使用者改 `.env` 後**不重 build** 就會更新行為。
4. 把高權限金鑰放 **`chrome.storage.sync`** 而未做額外風險說明。

---

## 8. 在新專案中落地的檢查清單

- [ ] 提供 `.env.example`（說明各 key，不含真密鑰）。
- [ ] `.env` 列入 `.gitignore`。
- [ ] 建置腳本：讀 `.env` + `resolveKey` + `define` 注入。
- [ ] 程式碼：`getBuildTimeEnv()`（或等價）**唯一**讀取注入常數。
- [ ] 如需使用者覆寫：實作 storage 讀寫 + §4 的 **effective** 函式。
- [ ] 文件／README 註明：**改 `.env` → `npm run build` → 重新載入擴充**。

---

## 9. 與本範本的對照

| 概念 | 本 repo 位置 |
|------|----------------|
| 讀 `.env`、resolve、`define` | `scripts/load-env.mjs`、`scripts/build.mjs` |
| 建置期常數宣告 | `src/globals.d.ts` |
| `getBuildTimeEnv()` | `src/env-injected.ts` |
| effective：storage 優先 | `src/panel.ts` 內 `getEffectiveApiKey` 等（UI 可改，邏輯建議保留） |

將上述檔案複製到新專案時，請同步修改 **變數前綴、storage key、環境枚舉**，並維持 §4、§5、§6 的契約即可。

---

## 10. 版本註記

- 本規格與 `template-chrome-extension` 慣例對齊，適用 **Manifest V3**、以 **esbuild + TypeScript** 建置的擴充。  
- 若改用其他 bundler，維持「建置期 replace 字串常數 + 執行期 storage 覆寫」即可，不需綁定特定工具。
