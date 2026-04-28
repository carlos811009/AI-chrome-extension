# Personal Extension — 架構說明

本文件描述 `personal-extension/` 目前實作架構、主要區塊用途與資料流，供後續維護與擴充使用。

---

## 1. 系統目標與目前定位

| 目標 | 目前作法 |
|------|----------|
| 在任意網頁側邊快速操作 API 流程 | content script 建立右側 dock，iframe 載入 `panel.html` |
| 讓非工程使用者可從對話直接轉成 API 步驟 | `panel.ts` 解析 assistant 內容（含 curl）→ API 候選清單 |
| 將常用 API 與流程持久化 | `chrome.storage.local` 儲存已儲存 API / 流程 / 執行結果 |
| 呼叫前可檢查與編輯參數 | API 設定區提供 URL params、headers、body 編輯 |
| 授權失效可立即提示 | 統一走 `notifyAuthExpired()`，更新 status + toast |

---

## 2. 執行路徑（Runtime Flow）

```
使用者點 extension icon
   -> background.js: openDockOnTab(tab)
   -> content.js: 建立 dock + iframe
   -> panel.html 載入 panel.js/panel.css
   -> panel.ts 邏輯：對話、API 候選、已儲存 API、流程草稿、執行流程
```

### 區塊用途

- **`background.js`**
  - 單一入口開啟 dock（只處理 `http/https`）。
  - 先 `tabs.sendMessage`，失敗才補注入 `content.js`。

- **`content.js`**
  - 負責「頁面殼」：右側 dock、關閉行為、頁面 banner。
  - 不放核心業務邏輯。

- **`panel.ts` / `panel.js`**
  - 主要產品邏輯集中地：授權、聊天、API 解析、流程編排、執行、儲存。

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
- 目前執行序列（可編輯、刪除、清空）。
- 刪除步驟與清空草稿都要二次確認。

### 3.7 已儲存流程區
- 每筆流程提供 `載入` / `刪除`。
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

8. **事件綁定區**
   - 所有 button/input 事件入口（含新增/更新/刪除/清空/授權）。

---

## 5. 儲存模型（`chrome.storage.local`）

| Key | 用途 |
|-----|------|
| `chatMessages` | 對話紀錄 |
| `chatSessionId` | 對話 session id |
| `savedWorkflows` | 已儲存流程 |
| `execResults` | 最近執行結果 |
| `authState` | OAuth/Firebase 授權狀態 |
| `customApis` | 已儲存 API 清單 |

---

## 6. 訊息協定

| 訊息類型 | 方向 | 用途 |
|---------|------|------|
| `OPEN_HELLO_DOCK` | background -> content | 開啟右側 dock |
| `SHOW_HELLO_BANNER` | panel -> content | 在宿主頁顯示 banner |

---

## 7. 建置與同步規則

### 標準指令

```bash
nvm use 22
npm run build
```

### 產物

- `panel.js`
- `content.js`
- `panel.css`

> 原則：優先改 `src/*`，產物由 build 生成，不手改產物。

---

## 8. 權限與限制

- `host_permissions: ["<all_urls>"]` 仍受 CORS / Cookie 政策限制。
- `chrome://`、Chrome Web Store 等頁面通常不可注入 content script。
- Token/API Key 目前在本機 storage；正式產品需進一步安全設計。

---

## 9. 目錄樹（現況）

```
personal-extension/
├── manifest.json
├── background.js
├── content.js
├── panel.html
├── panel.js
├── panel.css
├── src/
│   ├── panel.ts
│   ├── panel.scss
│   └── content.ts
├── scripts/
│   └── build.mjs
├── tsconfig.json
├── ARCHITECTURE.md
└── AGENT.md
```

---

如有新增區塊或調整主流程，請同步更新本檔與 `AGENT.md`。
