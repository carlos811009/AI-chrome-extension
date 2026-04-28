import { build } from "esbuild";
import { compile } from "sass";
import { writeFile } from "node:fs/promises";

await build({
  entryPoints: ["src/panel.ts", "src/content.ts"],
  outdir: ".",
  bundle: false,
  format: "iife",
  target: "chrome114"
});

const scssResult = compile("src/panel.scss", { style: "expanded" });
await writeFile("panel.css", scssResult.css);

console.log("Build done: panel.js, content.js, panel.css");
