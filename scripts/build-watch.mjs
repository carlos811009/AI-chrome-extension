import { context } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writePanelCss } from './compile-panel-scss.mjs';
import { getPersonalExtEnvDefines, logPersonalExtBuildEnvSummary } from './load-env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

logPersonalExtBuildEnvSummary(projectRoot);
const envDefines = getPersonalExtEnvDefines(projectRoot);

await writePanelCss('expanded');

const ctx = await context({
  entryPoints: ['src/panel.ts', 'src/content.ts', 'src/background.ts'],
  outdir: '.',
  bundle: true,
  format: 'iife',
  target: 'chrome114',
  sourcemap: true,
  define: envDefines,
});

await ctx.watch();
console.log(
  '[personal-extension] esbuild watch：panel.js / content.js / background.js（SCSS 請另跑 npm run build:css）'
);
