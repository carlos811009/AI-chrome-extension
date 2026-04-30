/**
 * 確保以 Node 22 以上建置，避免過舊 Node 與 esbuild 等平台原生二進位不相容。
 * 由 npm prebuild 於 `npm run build` 前自動執行；`build:watch` 亦會呼叫。
 */
const major = Number(process.versions.node.split(".")[0]);
if (major < 22) {
  console.error(
    `[personal-extension] 建置需要 Node 22 或以上（目前為 ${process.version}）。\n` +
      "請執行：nvm use 22   （專案根目錄已有 .nvmrc）\n" +
      "或安裝 Node 22+ 後再執行 npm run build。",
  );
  process.exit(1);
}
