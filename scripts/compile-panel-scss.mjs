import { compile } from "sass";
import { writeFile } from "node:fs/promises";

const PANEL_SCSS = "src/panel.scss";
const OUT_CSS = "panel.css";

/**
 * @param {"expanded" | "compressed"} style
 */
export async function writePanelCss(style) {
  const result = compile(PANEL_SCSS, { style });
  await writeFile(OUT_CSS, result.css);
}
