import { writePanelCss } from './compile-panel-scss.mjs';

const isProd = process.env.PROD === '1';

await writePanelCss(isProd ? 'compressed' : 'expanded');
console.log(`Build done: panel.css (${isProd ? 'compressed' : 'expanded'})`);
