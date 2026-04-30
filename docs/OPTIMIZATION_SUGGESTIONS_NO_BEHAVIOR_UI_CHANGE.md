# 優化建議（不變更產品邏輯與畫面）

**建立日期**：2026-04-29  
**範圍**：在**不改變使用者可見行為、互動流程與視覺呈現**的前提下，可進行的工程化、建置、維護性、體積與安全邊界類改善。  
**說明**：與維護／拆檔／測試路線圖重疊處，會指向既有 `docs/OPTIMIZATION_PLAN.md`，本檔補齊該計劃較少著墨的面向。

---

## 1. 快速對照表

| 類別     | 建議摘要                                                                           | 預期效益                                                                           | 風險／注意                                                       |
| -------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 建置     | 合併 `build.mjs` 與 `build-css.mjs` 的重複 Sass 編譯邏輯                           | 單一真相、少重複程式                                                               | 幾乎無                                                           |
| 建置     | 區分 dev／prod：`esbuild` 開發用 `sourcemap`、發佈用 `minify`                      | 除錯較易／產物較小                                                                 | 須驗證 minify 後行為一致                                         |
| 樣式     | Sass `style: "compressed"` 僅用於發佈建置                                          | 減小 `panel.css`（目前約 35KB 未壓縮）                                             | 極少數邊角 CSS 壓縮差異需 smoke test                             |
| 型別     | `tsconfig` 僅 `include: ["src/**/*.ts"]`，`background.js` 不在型別檢查內           | 與現狀一致；若要「無行為變更」地提升安全網，可改 `src/background.ts` 編譯輸出      | 見 `OPTIMIZATION_PLAN` §2.2                                      |
| 型別     | `panel.ts` 手寫 `declare const chrome` 與 `tsconfig` 的 `"types": ["chrome"]` 並存 | 可漸進改為僅依賴 `@types/chrome`，減少雙軌維護                                     | 需對齊實際用到的 API，避免型別過寬／過窄                         |
| 可觀測性 | `panel.ts` 內多處 `console.log`（授權／OAuth 相關）                                | 開發保留、發佈用建置 `drop` 或條件編譯                                             | 僅影響主控台輸出，不影響 UI；若團隊依賴 log 除錯則保留 dev       |
| 權限     | `host_permissions: ["<all_urls>"]` 為最大範圍                                      | 審查是否可縮至實際 API 網域（屬政策與相容性決策）                                  | 縮小可能影響「任意站點打 API」能力，**屬產品範圍**時需與 PM 對齊 |
| 依賴     | `.gitignore` 忽略 `package-lock.json`                                              | 可改為提交 lockfile 以利可重現安裝                                                 | 團隊流程決策；見 `OPTIMIZATION_PLAN` §5.1                        |
| 版本     | `manifest.json` 的 `version` 與 `package.json` 的 `version` 雙軌                   | 建立發版檢查清單或腳本同步                                                         | 純流程，無執行期邏輯變更                                         |
| 程式風格 | `background.js` 使用 `chrome.tabs.query` 的 callback 風格                          | 改為 `chrome.tabs.query({...})` 的 Promise 包裝（若 extension 環境支援）可讀性較佳 | 須保持錯誤處理語意不變                                           |
| 靜態分析 | 新增 ESLint（含 `@typescript-eslint`）／Prettier／EditorConfig                     | 風格一致、提早發現低級錯誤                                                         | 首次導入需一次性格式化 diff                                      |

---

## 2. 建置管線

### 2.1 Sass 編譯重複

- **`scripts/build.mjs`** 已內嵌 `compile("src/panel.scss")` 並寫入 `panel.css`。
- **`scripts/build-css.mjs`** 做相同的事。
- **建議**：抽成單一模組（例如 `scripts/compile-panel-scss.mjs`）由兩者 import，或讓 `npm run build` 只呼叫一條路徑、`build:css` 僅包一層，避免日後只改一邊造成產物不一致。

### 2.2 esbuild 選項（不變語意前提下）

目前設定（節錄）為：`bundle: false`、`format: "iife"`、`target: "chrome114"`，無 `sourcemap`、無 `minify`。

- **sourcemap**：僅在 `NODE_ENV=development`（或自訂 flag）時開啟，方便對應到 `src/panel.ts` 行號，**不影響**使用者畫面與邏輯。
- **minify**：發佈建置開啟可縮小 `panel.js`（目前約 126KB）；語意上應與未壓縮一致，仍建議跑 `AGENT.md` 手動清單驗證。
- **legalComments**：若需再縮體積可評估 `none`（注意授權聲明是否需保留）。

### 2.3 CSS 輸出模式

- 開發維持 `expanded` 可讀性較佳。
- 發佈改用 `compressed` 可減少載入與解析成本，**視覺上**與 expanded 應一致；若專案有極特殊 selector，仍建議對照截圖或 smoke test。

---

## 3. TypeScript 與型別邊界

### 3.1 `tsconfig.json` 覆蓋範圍

- `include` 僅 `src/**/*.ts`，**`background.js` 未經 `tsc` 檢查**。
- 若將背景改為 `src/background.ts` 並由 esbuild 輸出（見 `OPTIMIZATION_PLAN` §2.2），可在**不改執行邏輯**下納入同一套 strict 檢查。

### 3.2 `chrome` 型別雙軌

- `src/panel.ts` 以大型 `declare const chrome` 描述子集 API；`tsconfig` 又啟用 `"types": ["chrome"]"`。
- **建議**：長期收斂為 `@types/chrome` + 必要時 `// @ts-expect-error` 或極小補充型別，避免兩套定義漂移（屬維護成本優化，不改 runtime）。

---

## 4. 產物體積與載入（畫面不變）

| 檔案（約略）    | 大小（位元組） | 備註                                |
| --------------- | -------------- | ----------------------------------- |
| `panel.js`      | ~126,000       | 單檔邏輯集中；minify 後通常明顯下降 |
| `panel.css`     | ~35,700        | compressed 可再降                   |
| `content.js`    | ~7,300         | 相對小                              |
| `background.js` | ~1,100         | 小檔，仍值得納入 TS 與測試策略      |

- **不建議**為了體積去改 `panel.html` 的 script 載入順序或延遲載入策略，除非經測量確認無初始化競態（易影響邏輯時序）。

---

## 5. 除錯輸出與隱私

- `src/panel.ts` 內有 `console.log("[personal-extension] ...")`（例如 OAuth／profile 相關）。
- **建議**：
  - 開發：可保留或改為 `import.meta.env`／建置常數包裝的 `debugLog`。
  - 發佈：用 esbuild `drop: ['console']` 或僅 `drop_labels` 控制，避免使用者開發者工具長期暴露內部狀態（**不改 UI**，僅減少主控台資訊）。

---

## 6. Manifest 與權限（政策層）

- **`permissions`**：`tabs`、`clipboardWrite`、`identity` 等與功能對應清楚即可；Chrome 線上審核亦關注權限與說明是否一致。
- **`host_permissions: "<all_urls>"`**：擴充可對任意 HTTPS 頁面發請求；若產品上**僅**需少數 API 網域，縮小可降低攻擊面與審核疑慮，但可能限制「自訂 URL」類 API——**屬產品決策**，與「純工程不變行為」可能衝突時需另案評估。
- **`oauth2.client_id`** 寫在 manifest 為常見作法；金鑰與 Firebase 等仍建議依 `OPTIMIZATION_PLAN` §5.2 由建置注入或秘管流程治理。

---

## 7. 與 `OPTIMIZATION_PLAN.md` 的分工

| 主題                                            | 本檔         | `OPTIMIZATION_PLAN.md` |
| ----------------------------------------------- | ------------ | ---------------------- |
| 拆檔、`panel.ts` 模組化、Vitest、路線圖         | 僅表格式提及 | 詳述 §2～§6            |
| 建置 script 重複、esbuild／Sass 壓縮、sourcemap | **詳述**     | 較少                   |
| console／minify／lockfile／manifest 版本        | **詳述**     | 部分重疊 §5            |
| README、ARCHITECTURE 模組表                     | 可選一句     | §3 為主                |

建議兩份文件並存：本檔作為「**不碰產品行為與 UI**」的檢核清單；計劃檔作為中長期重構與測試路線圖。

---

## 8. 建議執行順序（僅工程、低風險優先）

1. 合併 Sass 編譯路徑，消除 `build.mjs`／`build-css.mjs` 重複。
2. 新增 `npm run typecheck`（`tsc --noEmit`）並在說明文件中要求 PR 前執行（若尚未做）。
3. 為 `npm run build` 增加可選環境變數：`DEV=1` → sourcemap；`PROD=1` → minify + compressed CSS +（可選）strip console。
4. 釐清 `manifest.json` 與 `package.json` 版本同步策略。
5. 其餘大項（`background.ts`、拆 `panel.ts`、單元測試）依 `OPTIMIZATION_PLAN.md` 階段推進。

---

## 9. 驗收原則（與本檔範圍對齊）

任何優化合併前仍應：

1. `npm run build` 成功，產物路徑與 `manifest.json` 一致。
2. 依 `AGENT.md` 手動驗證清單跑一輪（確保無「看似無害」的建置選項造成細微差異）。
3. 若啟用 minify／compressed CSS，至少對**授權、流程執行、curl 解析**各做一次 smoke test。

---

**結語**：在維持邏輯與畫面不變的前提下，**建置去重、dev/prod 建置分層、型別覆蓋背景腳本、縮小產物與收斂 console** 是最划算且風險可控的一批項目；結構性負擔仍以 `panel.ts` 單檔與測試缺口為主，請併讀 `docs/OPTIMIZATION_PLAN.md`。
