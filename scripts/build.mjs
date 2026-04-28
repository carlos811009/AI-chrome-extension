import { build } from "esbuild";

await build({
  entryPoints: ["src/panel.ts", "src/content.ts"],
  outdir: ".",
  bundle: false,
  format: "iife",
  target: "chrome114"
});

console.log("Build done: panel.js, content.js");
