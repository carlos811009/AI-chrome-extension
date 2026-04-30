# Personal Extension — 架構說明

本文件描述 `personal-extension/` 目前實作架構、主要區塊用途與資料流，供後續維護與擴充使用。

---

## 1. 系統目標與目前定位

| 目標                                    | 目前作法                                                |
| --------------------------------------- | ------------------------------------------------------- |
| 在任意網頁側邊快速操作 API 流程         | content script 建立右側 dock，iframe 載入 `panel.html`  |
| 讓非工程使用者可從對話直接轉成 API 步驟 | `panel.ts` 解析 assistant 內容（含 curl）→ API 候選清單 |
| 將常用 API 與流程持久化                 | `chrome.storage.local` 儲存已儲存 API / 流程 / 執行結果 |
| 呼叫前可檢查與編輯參數                  | API 設定區提供 URL params、headers、body 編輯           |
| 授權失效可立即提示                      | 統一走 `notifyAuthExpired()`，更新 status + toast       |

---

## 2. 執行路徑（Runtime Flow）

```
使用者點 extension icon
   -> background.js: openDockOnTab(tab)
   -> tabs.sendMessage(TOGGLE_HELLO_DOCK)；失敗則 executeScript(content.js) 後 OPEN_HELLO_DOCK
   -> content.js: 建立 dock（resize 柄 + iframe）+ 主頁讓位樣式
   -> panel.html 載入 panel.js/panel.css（標題列、關閉 × 在 panel 內）
   -> panel.ts：對話、API 候選、已儲存 API、流程草稿、JSON 匯入／匯出、執行流程
```

### 區塊用途

- **`background.js`**（**原始碼**：`src/background.ts`，由 `npm run build` 產出）
  - 單一入口開啟／切換 dock（只處理 `http/https`）。
  - 先 `tabs.sendMessage(TOGGLE_HELLO_DOCK)`，失敗才補注入 `content.js` 再 `OPEN_HELLO_DOCK`。
  - 轉發 **`CLOSE_HELLO_DOCK`**：`panel` → `runtime.sendMessage` → 查目前 active tab → `tabs.sendMessage` 至 content。

訊息字串常數集中於 **`src/messages.ts`**，供 background／content／panel 建置時各自 bundle，避免拼字漂移。

- **`content.js`**
  - 右側 **dock 殼**：左緣 resize、`iframe` 指向 `panel.html`；**不含** panel 標題／關閉鈕（在 `panel.html`）。
  - 開啟時對 `html`／`body`：`paddingRight` 等讓位、`overflow-x: hidden`、`personal-extension-dock-open`；並注入一小段 **宿主頁樣式**（僅在 `html.personal-extension-dock-open` 下將 `.MatContainer` 的 `min-width` 覆寫為 `0`，關閉 dock 時移除），用於抵消部分後台鎖死 `min-width: 1440px` 導致與 dock 重疊。dock 寬度 `sessionStorage` 記憶，預設 **360px**（範圍 280–860）。
  - 監聽 `SHOW_HELLO_BANNER` 在宿主頁顯示浮層 banner（本 repo 內無發送端，預留／外部訊息）。
  - 不放核心業務邏輯。

- **`panel.ts` / `panel.js`**
  - 主要產品邏輯：授權（含 `` 限制）、聊天、API 解析、流程編排、流程 JSON、執行、儲存。

---

## 3. 面板 UI 區塊用途（`panel.html` 對應）

### 3.1 AI 小幫手區塊

- 提供對話輸入與回應顯示。
- 最新 assistant 回應會被用於抽取 API 候選。

### 3.2 已儲存 API 區塊

- 顯示使用者已存 API。
- 每筆支援 `選擇` / `刪除`（刪除需二次確認）。
- 選擇後會把該筆帶入 API 設定。

### 3.3 解析 Curl 區塊

- 貼入 curl 後解析 method/url/headers/body。
- 可轉為候選或自訂 API 表單資料。

### 3.4 API 候選清單

- 顯示從對話抽取到的 API 候選。
- 選中後可直接加入流程或另存已儲存 API。

### 3.5 API 設定區（核心）

- 欄位：API 名稱、用途、URL params、Headers、Body。
- 動作：
  - `加入流程步驟`
  - `新增到已儲存 API`
  - `更新已儲存 API`（僅已儲存 API 選入時顯示）

### 3.6 流程草稿區

- **流程名稱**輸入欄（載入已儲存流程或匯入 JSON 會帶入；儲存時必填；與已儲存流程 trim 後同名須 `confirm`）。
- 目前執行序列（可編輯、刪除；**刪除單一步驟**需二次確認）。
- **分享／匯入流程（JSON）**：`personal-extension-workflow` v1；匯出剝除敏感 header；匯入至草稿前有說明對話框（若與既有流程同名或步驟 method+path 序列相同會顯示醒目橫幅）。
- **清空草稿**：**不**經 `confirm`；一併清空步驟、流程名稱欄、匯入 JSON 的 textarea。
- 草稿區提供下載／複製草稿 JSON（已儲存流程卡片**無**「匯出 JSON」）。

### 3.7 已儲存流程區

- 每筆流程僅 **`載入` / `刪除`**（無匯出 JSON）。
- 刪除流程需二次確認。

### 3.8 執行結果區

- 顯示流程執行歷史、各步驟結果、複製與保存 API 快捷操作。

---

## 4. `src/panel.ts` 模組分段用途

1. **型別與常數區**
   - 定義 `ApiSpec`、`WorkflowStep`、`ExecResult` 等核心資料型別。
   - 定義 storage keys 與 OAuth / API 端點常數。

2. **DOM 綁定與狀態區**
   - 所有 UI 節點快取（`getElementById`）。
   - 全域狀態（候選 API、已儲存 API、目前選取索引、授權狀態等）。

3. **授權與提示工具區**
   - `isAuthExpired` / `notifyAuthExpired` / `setAuthStatus` / `setToast`。
   - 授權失效統一提醒策略。

4. **curl 與 API 抽取區**
   - `parseCurlCommand`、`collectCurlSnippetsFromText`、`extractApiCandidatesFromText`。
   - 負責把自然語言/markdown/curl 轉成 `ApiSpec`。

5. **API 設定渲染區**
   - `renderApiDetail` + 可編輯區塊（URL params / headers / body）。
   - 控制 `API 設定` 動作按鈕顯示條件。

6. **已儲存 API / 流程渲染區**
   - `renderSavedApis`、`renderSavedWorkflows`。
   - 處理選擇、刪除、索引同步與二次確認。

7. **流程執行與結果區**
   - `executeDraftWorkflow`、`showExecutionConfirmDialog`、`renderExecResults`。
   - 呼叫 API 前確認、逐步執行、結果序列化顯示。

8. **流程 JSON 與草稿名稱**
   - 匯出／匯入、敏感欄位過濾、匯入前對話框與同名／同序列警示；`draftNameFromImport` 等與儲存流程連動。

9. **事件綁定區**
   - 所有 button/input 事件入口（含新增/更新/刪除/清空/授權、關閉 dock 訊息）。

---

## 5. 儲存模型（`chrome.storage.local`）

| Key              | 用途                    |
| ---------------- | ----------------------- |
| `chatMessages`   | 對話紀錄                |
| `chatSessionId`  | 對話 session id         |
| `savedWorkflows` | 已儲存流程              |
| `execResults`    | 最近執行結果            |
| `authState`      | OAuth/Firebase 授權狀態 |
| `customApis`     | 已儲存 API 清單         |

---

## 6. 訊息協定

字串常數定義於 **`src/messages.ts`**（`TOGGLE_HELLO_DOCK` 等），下列表格為語意說明。

| 訊息類型            | 方向                                                    | 用途                                                                 |
| ------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- |
| `TOGGLE_HELLO_DOCK` | background → content                                    | 使用者點擊 extension icon：已注入時切換開／關 dock                   |
| `OPEN_HELLO_DOCK`   | background → content                                    | 剛注入 content 後：若尚未開啟則建立 dock                             |
| `CLOSE_HELLO_DOCK`  | panel → background → content                            | 關閉 dock（`runtime.sendMessage` 後由 background 轉發至 active tab） |
| `SHOW_HELLO_BANNER` | 任意 extension 端點 → content（本 repo 內無固定發送端） | `payload` 文字在宿主頁顯示浮層 banner                                |

---

## 7. 建置與同步規則

### 標準指令

建置前會檢查 **Node ≥ 22**（`scripts/check-node.mjs`）；`.nvmrc` 仍建議使用 `22` 以利與團隊一致。

```bash
cd personal-extension
nvm use          # 讀取專案 .nvmrc（建議 22）
npm run build
```

其他：`npm run typecheck`、`npm run lint`、`npm run format:check`、`npm run build:dev`／`build:prod`／`build:watch`／`build:css` 見 `docs/OPTIMIZATION_PROGRESS.md`。

### 產物

- `panel.js`（由 `src/panel.ts` **bundle** 編譯，內含 `src/panel/*.ts` 子模組）
- `content.js`
- `background.js`（由 `src/background.ts` 編譯）
- `panel.css`

> 原則：優先改 `src/*.ts`／`src/panel.scss`／`panel.html`，產物由 **`npm run build`** 生成，不手改產物。**`scripts/*.mjs` 為建置腳本，一般維護不必修改。**

---

## 8. 權限與限制

- `host_permissions: ["<all_urls>"]` 仍受 CORS / Cookie 政策限制。
- `chrome://`、Chrome Web Store 等頁面通常不可注入 content script。
- Token/API Key 目前在本機 storage；正式產品需進一步安全設計。
- **Google 授權**：僅 `` 帳號可通過；未授權時 `.panel-body` 使用 `panel-body--auth-locked`（主體互動鎖定；header 的授權與關閉 dock 仍可用）。

---

## 9. 目錄樹（現況）

```
personal-extension/
├── manifest.json
├── background.js       # 建置產物（源：src/background.ts）
├── content.js
├── panel.html
├── panel.js
├── panel.css
├── src/
│   ├── panel.ts          # 面板入口：DOM、狀態、事件、流程／聊天／授權等
│   ├── panel/
│   │   ├── types.ts      # 共用型別
│   │   ├── constants.ts # 儲存 key、OAuth／API 常數
│   │   └── api-extraction.ts  # curl／對話文字 → API 候選（純邏輯為主）
│   ├── messages.ts       # dock／banner runtime 訊息字串常數（與型別）
│   ├── background.ts     # MV3 service worker 源碼
│   ├── panel.scss
│   └── content.ts
├── scripts/
│   ├── build.mjs
│   ├── build-css.mjs
│   ├── build-watch.mjs
│   ├── compile-panel-scss.mjs
│   └── check-node.mjs
├── tsconfig.json
├── ARCHITECTURE.md
└── AGENT.md
```

---

如有新增區塊或調整主流程，請同步更新本檔與 `AGENT.md`。
