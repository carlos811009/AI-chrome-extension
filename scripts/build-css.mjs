import { compile } from "sass";
import { writeFile } from "node:fs/promises";

const result = compile("src/panel.scss", { style: "expanded" });
await writeFile("panel.css", result.css);

console.log("Build done: panel.css");
