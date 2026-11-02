// SPDX-License-Identifier: MIT OR Apache-2.0
// Exercise the distributed browser entry point using its real WASM and helpers.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';

assert(process.argv[2], 'Pass the built SDK dist directory');
const sdk = resolve(process.argv[2]);
await Promise.all(['umf-browser.js', 'umf_core_wasm_bg.wasm'].map(file => readFile(resolve(sdk, file))));
const entry = `
import * as api from '/sdk/umf-browser.js';
const check=(condition,message)=>{if(!condition)throw Error(message);};
const policy={vocabulary:'umf.security',version:'0.1.0',id:'p',revision:'r1',ontology:{documentId:'d',revision:'o1'},rules:[]};
const upgraded=api.upgradeSecurityPolicySource(policy,'r2');
check(upgraded.status==='migrated','Rust upgrade refused the current legacy policy');
check(api.inspectSecurityPolicyV2Source(upgraded.target).valid===true,'Rust V2 inspection refused migrated policy');
for(const format of ['json','yaml'])check(JSON.stringify(api.readSecuritySource(api.writeSecuritySource(policy,format),format))===JSON.stringify(policy),'source roundtrip mismatch: '+format);
check(api.downgradeSecurityPolicySource(upgraded.target,'r3').status==='migrated','Rust downgrade refused the policy');
check(api.upgradeSecurityPolicySource(policy,'r1').status==='refused','same-revision upgrade was accepted');
window.umfResult={upgraded:upgraded.status,valid:api.inspectSecurityPolicyV2Source(upgraded.target).valid,refused:api.upgradeSecurityPolicySource(policy,'r1').status==='refused',nodeGlobals:typeof process!=='undefined'||typeof Buffer!=='undefined'};
`;
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') { response.setHeader('content-type', 'text/html'); return response.end('<!doctype html><script type="module" src="/entry.js"></script>'); }
  if (pathname === '/entry.js') { response.setHeader('content-type', 'text/javascript'); return response.end(entry); }
  if (pathname.startsWith('/sdk/')) {
    const file = resolve(sdk, decodeURIComponent(pathname.slice('/sdk/'.length)));
    if (file.startsWith(sdk + sep)) { try { const body = await readFile(file); response.setHeader('content-type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'); return response.end(body); } catch {} }
  }
  response.writeHead(404); response.end('not found');
});
await new Promise<void>(done => server.listen({port:0,host:'127.0.0.1'}, done));
let browser;
try {
  const address = server.address(); assert(address && typeof address !== 'string');
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage(); const errors: string[] = []; const external: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/*', route => { const url = new URL(route.request().url()); if (url.hostname !== '127.0.0.1') { external.push(url.href); return route.abort(); } return route.continue(); });
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await Promise.race([page.waitForFunction(() => (window as any).umfResult, undefined, {timeout: 30000}), new Promise((_, reject) => page.once('pageerror', reject))]);
  assert.deepEqual(errors, []); assert.deepEqual(external, []);
  const result = await page.evaluate(() => (window as any).umfResult);
  assert.equal(result.upgraded, 'migrated'); assert.equal(result.valid, true); assert.equal(result.refused, true); assert.equal(result.nodeGlobals, false);
  console.log(JSON.stringify({status: 'passed', result}));
} finally { await browser?.close(); await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose())); }
