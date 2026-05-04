#!/usr/bin/env node
/**
 * 從 RSA 私鑰 PEM 產出 manifest.json 可用的 "key" 欄位（Chrome 會依此算出固定 extension ID）。
 *
 * 產生私鑰（僅需做一次，請勿提交版控）：
 *   openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out extension-private.pem
 *
 * 印出 key 字串：
 *   node scripts/print-manifest-key-from-pem.mjs extension-private.pem
 *
 * 將輸出貼到 manifest.json 頂層（與 name 同層）：
 *   "key": "<貼上一整行 base64>"
 *
 * 重載擴充後，到 chrome://extensions 確認 ID；在 GCP OAuth「Chrome 擴充功能」類型客戶端
 * 新增重新導向 URI：https://<該ID>.chromiumapp.org/
 */
import { readFileSync } from 'node:fs';
import { createPublicKey } from 'node:crypto';

const pemPath = process.argv[2] || 'extension-private.pem';
let pem;
try {
  pem = readFileSync(pemPath, 'utf8');
} catch {
  console.error(`無法讀取：${pemPath}`);
  process.exit(1);
}

const pub = createPublicKey(pem);
const der = pub.export({ type: 'spki', format: 'der' });
const b64 = der.toString('base64');

console.log('將下列整段貼到 manifest.json（JSON 字串需跳脫換行時請保持單行）：\n');
console.log(JSON.stringify(b64));
console.log('\n或手動寫成：');
console.log(`"key": ${JSON.stringify(b64)}`);
