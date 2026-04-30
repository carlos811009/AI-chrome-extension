# Personal Extension — 優化計劃（維護／可讀／測試）

**建立日期**：2026-04-29  
**範圍**：僅規劃與文件層級建議；**不**要求立即改動既有程式行為或產品邏輯。實作時應以小步重構、每步可建置與手動驗證為原則。

**目標對齊**

| 目標     | 本計劃對應方向                                        |
| -------- | ----------------------------------------------------- |
| 好維護   | 單檔職責切分、型別與訊息協定集中、建置與檢查自動化    |
| 好查看   | 目錄與模組邊界清楚、索引文件、純函式命名與區塊一致    |
| 方便測試 | 抽出可單元測試的純邏輯、測試框架與最小測試集、CI 可選 |

---

## 1. 現況摘要（檢視結論）

### 1.1 優點（應保留）

- **`ARCHITECTURE.md`** 已清楚描述 runtime flow、storage keys、訊息協定與 `panel.ts` 九大邏輯區塊，對新進者友善。
- **`AGENT.md`** 與架構文件互補，含行為基準與驗證清單，利於 Agent／人類協作。
- **建置鏈**簡潔：`esbuild` 編譯 TS、`sass` 產出 `panel.css`，且文件已明訂「改 `src/*`、產物不手改」。

### 1.2 主要痛點

| 項目                       | 說明                                                 | 影響                                                                       |
| -------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| **`src/panel.ts` 體積**    | 單檔約三千餘行、百餘個頂層函式與大量 DOM 狀態        | 尋找修改點成本高、合併衝突機率高、難以單獨測試局部邏輯                     |
| **無自動化測試**           | 專案內無 `test`／`*spec*` 檔                         | 回歸依賴手動清單（`AGENT.md` E 節），易漏測                                |
| **`background.js` 非 TS**  | 與 `src/content.ts`、`src/panel.ts` toolchain 不一致 | 型別與訊息字串無法與 panel／content 共用，重構易漏改                       |
| **`tsconfig` 僅 `noEmit`** | 型別檢查需手動執行 `tsc`                             | 若未養成習慣，錯誤延後到執行期才發現                                       |
| **`panel.scss` 規模**      | 與 UI 同量級成長                                     | 與 `panel.ts` 類似，後續可考慮按區塊拆分檔案再以 `@use` 彙整（純維護結構） |

### 1.3 與「不異動程式邏輯」相容的說明

下列建議若採「**只搬檔、不改演算法與分支**」的方式（例如同一函式原封不動移到 `curl/parser.ts` 再 re-export），可視為結構調整而非行為變更。仍建議每個 PR 小範圍並跑完整 `AGENT.md` 驗證清單。

---

## 2. 好維護 — 建議項目

### 2.1 模組化 `panel.ts`（優先級：高）

對齊 `ARCHITECTURE.md` 第 4 節已有之「九大區塊」，建議**漸進式**拆成多檔（範例對應，名稱可再調整）：

| 建議模組                          | 涵蓋內容（摘自現有分段）                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| `types/` 或 `panel/types.ts`      | `ApiSpec`、`WorkflowStep`、`AuthState`、storage 相關型別                             |
| `constants.ts`                    | `STORAGE_KEY`、OAuth／API 端點常數（與機密注入策略一併規劃，見 5.2）                 |
| `auth.ts`                         | 授權狀態讀寫、`notifyAuthExpired`、`isAllowedAiiiEmail` 等                           |
| `curl.ts`                         | `parseCurlCommand`、`collectCurlSnippetsFromText`、`extractApiCandidatesFromText` 等 |
| `workflow-share.ts`               | 匯入／匯出 JSON、sanitize、sigrature、確認對話框資料結構                             |
| `storage-chat.ts`                 | 訊息載入／儲存、與 chat API 呼叫（若仍過大可再拆 `chat-api.ts`）                     |
| `panel-main.ts` 或保留 `panel.ts` | DOM 綁定、事件匯流、初始化 `init`                                                    |

**實作策略**：先拆「依賴最少、純函式最多」的區塊（如 curl／workflow JSON），最後再動 DOM 密集區，可降低風險。

**建置**：目前 `esbuild` `bundle: false` 每個 entry 獨立輸出。若拆多檔且仍單一 entry `panel.ts`，需改為 **`bundle: true`** 且指定 `panel.ts` 為唯一 entry，讓子模組打入同一 `panel.js`（對 extension 載入方式不變）。此為建置設定調整，不改面板對外行為。

### 2.2 統一背景腳本語言（優先級：中）

將 `background.js` 改為 `src/background.ts`，由同一 `build.mjs` 編譯輸出 `background.js`，並在 `manifest.json` 維持指向產物檔名。

**附帶效益**：可與 content／panel 共用 `MessageType` 常數與型別（另建 `messages.ts`），避免字串拼錯。

### 2.3 訊息協定單一真相來源（優先級：中）

新增 `src/messages.ts`（或 `protocol.ts`）集中：

- `TOGGLE_HELLO_DOCK`、`OPEN_HELLO_DOCK`、`CLOSE_HELLO_DOCK`、`SHOW_HELLO_BANNER` 等字串常數
- `ContentMessage` 等 payload 型別

`content.ts`、`background`、文件中的表格可引用同一處，減少漂移。

### 2.4 npm scripts 補強（優先級：中）

建議新增（不改邏輯，只加流程）：

- `typecheck`：`tsc --noEmit`（沿用現有 `tsconfig.json`）
- `build:watch`：esbuild `watch` 模式，加速本機迭代

---

## 3. 好查看 — 建議項目

### 3.1 目錄與 README 索引（優先級：中）

在專案根目錄新增簡短 **`README.md`**（或使用者允許時再補）：一頁內含「這是什麼、如何建置、文件連結（`ARCHITECTURE.md` / `AGENT.md` / 本計劃）」。目前依賴 `AGENT.md` 作為入口，對只開 repo 的協作者可再加一層索引。

### 3.2 `ARCHITECTURE.md` 可加「模組對照表」（優先級：低）

待實際拆檔後，在架構文件新增表格：**檔案路徑 ↔ 第 4 節區塊編號**，與程式目錄一致，降低「文件寫九大段、實際仍單檔」的認知落差。

### 3.3 大型檔案內導覽（優先級：低）

在尚未拆檔前，可於 `panel.ts` 頂部以註解維護「行號區間／錨點」目錄（與 `ARCHITECTURE` 區塊對齊），方便 IDE 折疊與搜尋。拆檔後可刪除此目錄註解。

---

## 4. 方便測試 — 建議項目

### 4.1 測試框架選型（優先級：高）

| 方案               | 說明                                                      |
| ------------------ | --------------------------------------------------------- |
| **Vitest**         | 與 TypeScript、esbuild 生態常見整合；可測 Node 環境純函式 |
| **Node 內建 test** | 依賴少，適合極小測試集                                    |

Extension 內建 API（`chrome.*`）宜以 **mock** 或僅測「不依賴 chrome 的純函式」為第一階段。

### 4.2 第一階段測試靶心（高價值、低耦合）

建議優先為下列邏輯補單元測試（與 `AGENT.md` F 節「下次建議」一致且可量化）：

1. **Curl 解析與 API 抽取**：`parseCurlCommand`、`extractApiCandidatesFromText`（邊界：多段 curl、markdown 包夾、缺 header）
2. **流程 JSON**：`parseWorkflowImportJson`、`buildWorkflowExportJson`、sanitize headers、同名／同 signature 的 helper（若為純函式）
3. **字串／標準化工具**：`endpointKey`、`workflowStepSignature`、`normalizeWorkflowRequestTarget` 等

上述函式在拆模組後，測試檔可直接 import，無需啟動瀏覽器。

### 4.3 第二階段（可選）

- **Playwright** 或 **puppeteer** 載入 unpacked extension：成本高，適合關鍵路徑 E2E（開啟 dock、關閉）。
- **手動測試矩陣**：將 `AGENT.md` E 節整理成 checklist 檔（如 `docs/MANUAL_QA.md`），版本發佈前勾選。

### 4.4 CI（優先級：低）

若有遠端 repo：在 PR 上跑 `npm run typecheck` + `npm test`（即使測試數很少也能防止完全無法執行的提交）。

---

## 5. 其他風險與非邏輯類改善（備註）

### 5.1 `.gitignore` 與 lockfile

目前 `.gitignore` 包含 `package-lock.json`，團隊若需可重現安裝，可評估是否改為**提交 lockfile**（屬流程決策，非程式邏輯）。

### 5.2 設定與機密

`panel.ts` 內含 Firebase Web API key、OAuth client id 等（Web 延伸常見作法）。長期可評估：**建置時由環境變數注入**，避免硬編碼分散；屬建置／營運優化，需與安全規範對齊。

### 5.3 `chrome` 型別

現以手寫 `declare const chrome` 補足型別。若全面採 `@types/chrome`，可減少手寫宣告維護成本（需注意與實際使用 API 一致）。

---

## 6. 建議實施順序（路線圖）

| 階段  | 內容                                                                        | 預期產出                      |
| ----- | --------------------------------------------------------------------------- | ----------------------------- |
| **0** | 新增 `npm run typecheck`；文件連結本計劃                                    | 每次提交可選跑型別檢查        |
| **1** | 引入 Vitest（或 Node test）+ 3～5 個針對 curl／workflow 的單元測試          | 核心字串解析有回歸防護        |
| **2** | 拆出 `curl`／`workflow-share` 模組 + esbuild `bundle: true` 單一 `panel.js` | `panel.ts` 行數下降、職責清晰 |
| **3** | `background.ts` + `messages.ts` 共用常數                                    | 訊息字串單一來源、型別一致    |
| **4** | 其餘 `panel` 區塊漸進拆分 + 更新 `ARCHITECTURE` 模組表                      | 維護與 onboard 成本持續下降   |
| **5** | （可選）E2E、CI、README                                                     | 發版信心與協作效率再提升      |

---

## 7. 驗收建議（每階段共通）

不改產品邏輯的前提下，每個合併前仍應執行：

1. `npm run build` 成功，`panel.js` / `content.js` / `panel.css` 與 `manifest` 引用一致。
2. `AGENT.md` **E. 標準作業流程** 手動驗證清單（或對應的自動化子集）。
3. 若有測試：`npm test` 全綠。

---

## 8. 文件維護

本計劃為滾動文件：完成某階段後，請在表頭註記「最後更新日期」並於 `ARCHITECTURE.md`／`AGENT.md` 適當處加上指向 `docs/OPTIMIZATION_PLAN.md` 的連結（若團隊同意單一入口）。

---

**結語**：目前文件品質已高；最大結構性負擔來自 **`panel.ts` 單檔**與 **零測試**。優先補上 **型別檢查腳本** 與 **curl／流程 JSON 的單元測試**，再以 **模組化 + bundle 單一輸出** 漸進收斂，可在不追求一次大重構的前提下，同時改善維護性、可讀性與可測性。
