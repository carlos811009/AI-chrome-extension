# Agent 指令檔 — Personal Extension（Chrome Extension MV3）

本檔供 Agent 在 `personal-extension/` 內持續維護時遵循。  
修改前請先讀 `ARCHITECTURE.md`，並以本檔為目前產品行為基準。

---

## A. 專案身分與建置

- **專案目錄**：`personal-extension/`
- **主要程式**：`src/panel.ts`、`src/content.ts`、`src/background.ts`、`src/messages.ts`、`panel.html`、`src/panel.scss`
- **建置指令**：`npm run build`（產出 `panel.js`、`content.js`、`background.js`、`panel.css`）
- **其他建置**：`npm run build:dev`（sourcemap）、`npm run build:prod`（minify + 壓縮 CSS + 移除 console）、`npm run build:watch`（僅監聽 TS）、`npm run build:css`（僅 SCSS）、`npm run typecheck`（僅型別）
- **Node 版本**：**22 或以上**（`package.json` 的 `engines`、`prebuild`／`build:watch` 會檢查；`.nvmrc` 建議仍使用 `22`）
- **啟動流程**：工具列點擊 → `background` 送 `TOGGLE_HELLO_DOCK`（必要時注入 `content.js` 後送 `OPEN_HELLO_DOCK`）→ dock（resize + iframe）載入 `panel.html`

### 接手／日常維護邊界（請先看這段）

- **主要改動範圍**：`src/**/*.ts`、`src/panel.scss`、`panel.html`。型別檢查用 `npm run typecheck`，編譯與產物同步用 **`npm run build`**。
- **根目錄的 `*.js`／`panel.css`**：皆為建置產物，**不要手改**；行為以 TS／SCSS 為準。
- **`scripts/*.mjs`**：僅負責呼叫 esbuild／Sass，屬**建置基礎設施**。一般功能與除錯**不必**也不應要求接手人去改這些檔；只有要調整打包選項（例如多一個 entry、改 prod 旗標）時才動。

---

## B. 硬性規則（必遵守）

1. **所有 UI/流程邏輯優先改 `src/*`**，不要直接改產物檔。  
2. 每次改動後都要執行 **`npm run build`**，確保 `panel.js`／`content.js`／`background.js`／`panel.css` 同步。  
3. `panel.html` 的 `id` 不能任意改名，改名必須同步 `src/panel.ts` 綁定。  
4. 涉及授權狀態時，維持 `notifyAuthExpired()` 作為統一失效入口（狀態 + toast）。  
5. 刪除行為需有二次確認（`confirmDelete(...)`），除非使用者明確要求移除（例如：**清空流程草稿**已改為不詢問）。  
6. 未經要求不要重構無關檔案、不要刪除 `AGENT.md` / `ARCHITECTURE.md`。

---

## C. 關鍵功能現況（2026-04-29）

### C1. API 設定區（`API 設定`）

- 來源可來自：
  - `API 候選清單`
  - `已儲存 API` 的「選擇」
- 欄位：
  - `API 名稱`
  - `用途`
  - URL / Params（僅 URL params）
  - Headers
  - Body(JSON)
- 按鈕：
  - `加入流程步驟`
  - `新增到已儲存 API`
  - `更新已儲存 API`（**僅在從已儲存 API 選入時顯示**）

### C2. 已儲存 API 行為

- 卡片只保留：
  - `選擇`
  - `刪除`
- 已修正「同 path 多筆同時被選到」問題：  
  使用 `pinnedSavedApiIndex`（索引）追蹤，更新只會更新該筆。
- 從候選 API 儲存成已儲存 API 後：
  - 會清掉候選選取
  - 改選剛儲存那筆已儲存 API

### C3. 授權與使用限制

- **Google 帳號**：僅 `` 可完成授權；`getProfileUserInfo`／儲存的 `accountEmail` 不符會清除授權並提示。
- **未通過授權**：`.panel-body` 加上 `panel-body--auth-locked`，區塊內僅收合鈕可點；**Google 授權**與 **關閉 dock（×）** 在 header，不受鎖定。
- **授權失效提醒**：實際 API 呼叫若 401/403 等，統一走 `notifyAuthExpired()`：
  - 狀態列：`授權已失效，請重新點擊「Google 授權」登入。`
  - 錯誤 toast
  - Google 授權按鈕 pulse

### C4. 刪除／清空與二次確認

- 刪除草稿步驟：有確認框
- 刪除已儲存 API：有確認框
- **清空流程草稿**：**不**經 `confirm`；並清空草稿步驟、**流程名稱**輸入框、**匯入 JSON** 的 textarea
- 刪除已儲存流程：有確認框（流程卡僅 `載入` / `刪除`，**無**匯出 JSON）

### C5. 流程名稱與 JSON 分享／匯入

- 草稿區有 **流程名稱**欄位；`載入` 已儲存流程、`匯入 JSON` 會寫入此欄與 `currentWorkflowName`。
- **儲存流程**：名稱必填（匯入帶入後若清空會擋）；若與已儲存流程 **trim 後同名**，`confirm` 後才寫入；不再使用 `prompt`。
- **JSON**：`personal-extension-workflow` v1；匯出剝除 `Authorization` / `Cookie` / `*api-key*` 等；匯入至草稿前有對話框（一般說明 + **同名／步驟 method+path 序列相同**時之醒目橫幅）。

---

## D. 檔案對照（改哪裡）

| 任務 | 優先修改 |
|------|-----------|
| API 設定邏輯、儲存 API、流程草稿、授權提醒 | `src/panel.ts` |
| API 設定按鈕版型與視覺 | `src/panel.scss` |
| 面板結構（欄位/按鈕容器） | `panel.html` |
| dock 注入、主頁 padding、關閉 dock 訊息、banner | `src/content.ts` |
| 權限與注入範圍 | `manifest.json` |

---

## E. 標準作業流程（Agent）

1. 先改 `src/*.ts` / `src/*.scss` / `panel.html`。  
2. 執行：
   - `nvm use`（若環境有 nvm；專案 `.nvmrc` 為 22）
   - `npm run typecheck`（建議；僅型別、不產檔）
   - `npm run build`
3. 驗證：
   - 候選 API 與已儲存 API 的選取是否互斥
   - 更新已儲存 API 是否命中正確索引
   - 授權失效提示是否同時有 status + toast
   - 刪除操作（步驟／已儲存 API／已儲存流程）是否先彈窗；**清空草稿**不彈窗且一併清空 JSON 區
   - 非 `` 無法授權；未授權時 panel 主體是否鎖定
   - 流程 JSON 匯入／匯出與儲存流程名稱、同名 confirm

---

## F. 下一個錨點（暫存點）

- **錨點名稱**：`anchor-2026-04-29-workflow-json-auth-ui`
- **目前穩定狀態**：
  - 流程 JSON 分享／匯入、草稿流程名稱、匯入醒目警示、 與 panel 鎖定
  - 建置流程統一為 `npm run build`
- **下次建議優先項**：
  1. 將 `confirmDelete()` 改為自訂 modal（避免瀏覽器原生 confirm 體驗不一致）
  2. 為「更新已儲存 API」補上高亮提示（目前僅按鈕顯示）
  3. 增加整合測試腳本（至少覆蓋選取索引與刪除流程）

---

**版本註記**：本檔已對齊 `personal-extension` 現況；若流程邏輯再變動，請同步更新本檔與 `ARCHITECTURE.md`。
