# 優化項目進度（依 `docs/` 建議，不含測試類）

**最後更新**：2026-04-29  
**範圍**：對照 `OPTIMIZATION_SUGGESTIONS_NO_BEHAVIOR_UI_CHANGE.md`、`OPTIMIZATION_PLAN.md` 中**非測試**項目；Vitest／單元測試／E2E／CI 測試等暫不列為待辦。

---

## 總覽表

| # | 項目 | 狀態 | 說明 |
|---|------|------|------|
| 1 | Sass 編譯單一路徑（`compile-panel-scss.mjs`） | **已完成** | `build.mjs`、`build-css.mjs` 共用 `writePanelCss()` |
| 2 | `npm run typecheck`（`tsc --noEmit`） | **已完成** | 已加入 `typescript`、`@types/chrome` |
| 3 | 建置分層：`build:dev`／`build:prod` | **已完成** | `DEV=1` → sourcemap；`PROD=1` → minify、compressed CSS、`drop: console` |
| 4 | `npm run build:watch` | **已完成** | `scripts/build-watch.mjs`（esbuild watch；SCSS 仍請 `build:css`） |
| 5 | `src/background.ts` + 建置產出 `background.js` | **已完成** | `manifest` 仍指向 `background.js`；邏輯與原 JS 等價，`CLOSE` 轉發改為 async `tabs.query` |
| 6 | `src/messages.ts` 訊息常數單一來源 | **已完成** | `content.ts`、`background.ts`、`panel.ts` 共用字串 |
| 7 | Node 建置版本檢查 | **已調整** | `check-node.mjs` 改為 **≥22**（與 `engines` 一致），避免僅允許 22.x 時在較新 Node 無法建置 |
| 8 | `manifest.json` ↔ `package.json` 版本同步 | **未做** | 仍雙軌手動；發版時建議勾選同步或加小腳本（見下方「待評估」） |
| 9 | 提交 `package-lock.json`／lockfile 策略 | **未做** | `.gitignore` 仍忽略 lockfile；若團隊要可重現安裝再改 |
| 10 | ESLint／Prettier／EditorConfig | **未做** | 首次導入 diff 較大，另開 PR 較佳 |
| 11 | `panel.ts` 手寫 `chrome` 與 `@types/chrome` 收斂 | **未做** | 大範圍型別調整，與行為無關時再漸進處理 |
| 12 | `host_permissions` 縮小 | **未做** | 屬產品／安全政策，需確認是否仍須任意網域 API |
| 13 | 建置時環境變數注入金鑰 | **未做** | 見計劃 §5.2 |
| 14 | `panel.ts` 進一步模組化、`esbuild` 單一 entry 策略調整 | **進行中／既有** | 已有 `src/panel/*`；其餘依 `OPTIMIZATION_PLAN` §2.1 漸進 |
| 15 | `panel.scss` 區塊拆分 | **未做** | 維護結構向，與畫面無關但工時較長 |
| 16 | 根目錄 README 索引 | **未做** | 計劃 §3.1 |
| 17 | Vitest／`npm test`／CI 測試 | **刻意暫緩** | 依使用者要求先不做 |

---

## 建置指令速查

| 指令 | 用途 |
|------|------|
| `npm run build` | 預設：expanded CSS、無 minify、無 sourcemap（與先前日常建置最接近） |
| `npm run build:dev` | 開發：`DEV=1`，產出 sourcemap |
| `npm run build:prod` | 發佈：`PROD=1`，JS minify、CSS compressed、移除 `console`／`debugger` |
| `npm run build:css` | 僅編譯 SCSS（支援 `PROD=1` 與 `build` 相同語意） |
| `npm run build:watch` | 監聽 TS 並輸出三個 bundle；**不**自動監聽 SCSS |
| `npm run typecheck` | 僅型別檢查，不產檔 |

**Windows**：`DEV=1`／`PROD=1` 為 Unix 環境變數寫法；在 cmd／PowerShell 需改用對應語法或 `cross-env`（尚未加入依賴）。

---

## 待評估／後續（仍不屬測試）

1. **版本同步**：發版腳本讀取 `package.json` version 寫入 `manifest.json`，或反之。  
2. **lockfile**：決定是否追蹤 `package-lock.json` 或 `bun.lockb` 並更新 `.gitignore`。  
3. **`build:watch` + SCSS**：若本機常改樣式，可加 `sass --watch` 或合併進單一 dev 指令。

---

## 驗收建議（每次變更後）

1. `npm run typecheck`  
2. `npm run build`  
3. `AGENT.md` 手動流程（E 節）重點抽測；若使用 `build:prod`，建議完整跑一輪。

---

## 文件對照

| 來源 | 用途 |
|------|------|
| `OPTIMIZATION_SUGGESTIONS_NO_BEHAVIOR_UI_CHANGE.md` | 建置分層、Sass、型別、體積、console |
| `OPTIMIZATION_PLAN.md` | 拆檔、測試路線圖（測試項本進度表刻意略過實作） |
