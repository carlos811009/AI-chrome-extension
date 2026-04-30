import { build } from "esbuild";
import { writePanelCss } from "./compile-panel-scss.mjs";

const isProd = process.env.PROD === "1";
const isDev = process.env.DEV === "1";

await build({
  entryPoints: ["src/panel.ts", "src/content.ts", "src/background.ts"],
  outdir: ".",
  bundle: true,
  format: "iife",
  target: "chrome114",
  sourcemap: isDev,
  minify: isProd,
  drop: isProd ? ["console", "debugger"] : [],
  legalComments: isProd ? "none" : undefined,
});

await writePanelCss(isProd ? "compressed" : "expanded");

const mode = isProd ? "prod" : isDev ? "dev" : "default";
console.log(
  `Build done (${mode}): panel.js, content.js, background.js, panel.css` +
    (isProd ? " [minify+compressed+drop console]" : isDev ? " [sourcemap]" : ""),
);
