import { context } from "esbuild";
import { writePanelCss } from "./compile-panel-scss.mjs";

await writePanelCss("expanded");

const ctx = await context({
  entryPoints: ["src/panel.ts", "src/content.ts", "src/background.ts"],
  outdir: ".",
  bundle: true,
  format: "iife",
  target: "chrome114",
  sourcemap: true,
});

await ctx.watch();
console.log("[personal-extension] esbuild watch：panel.js / content.js / background.js（SCSS 請另跑 npm run build:css）");
