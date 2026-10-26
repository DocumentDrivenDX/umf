// SPDX-License-Identifier: MIT OR Apache-2.0
/** Real Chromium parity runner for the frozen R2 browser entry. */
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

declare global {
 interface Window {__umfR2MeteringResult?:{count:number;failures:string[];work:number}}
}

const MAX_BUNDLE_BYTES=8*1024*1024;
const PLAYWRIGHT_BROWSERS_JSON_SHA256='545d52f8382c391e605562c330e9c1c534a16045898203037a49bb8bd769a946';
const CHROMIUM_REVISION='1243';
const CHROMIUM_VERSION='153.0.8010.12';
const CURRENT_CONFORMANCE_SHA256='bb008a98b8448050748e65f867e7863475ccad9501a5b9229ae9e6d336691544';
const EXTENSION_KIND_CONFORMANCE_SHA256='780543fe5bd2ca481c4e1062f7f3c755070b0d1934724ee7960f46642a03e598';
const EXTENSION_KIND_CONFORMANCE_CASES=15;
const sha256=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const browsersJson=await Bun.file('node_modules/playwright-core/browsers.json').bytes();
if(sha256(browsersJson)!==PLAYWRIGHT_BROWSERS_JSON_SHA256)throw new Error('R2_BROWSER_BROWSERS_JSON_PIN');
const corpusBytes=await Bun.file('fixtures/metamodel/current-conformance.json').bytes();
if(sha256(corpusBytes)!==CURRENT_CONFORMANCE_SHA256)throw new Error('R2_BROWSER_CORPUS_PIN');
const corpus=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(corpusBytes)) as {cases:unknown[]};
const extensionKindBytes=await Bun.file('fixtures/extension-kinds/conformance.json').bytes();
if(sha256(extensionKindBytes)!==EXTENSION_KIND_CONFORMANCE_SHA256)throw new Error('R2_BROWSER_EXTENSION_KIND_CORPUS_PIN');
const extensionKindCorpus=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(extensionKindBytes)) as unknown[];
if(extensionKindCorpus.length!==EXTENSION_KIND_CONFORMANCE_CASES)throw new Error('R2_BROWSER_EXTENSION_KIND_CORPUS_COUNT');
const expectedCases=corpus.cases.length+extensionKindCorpus.length+2;
const built=await Bun.build({entrypoints:['tests/metamodel/r2-metering-browser-entry.ts'],target:'browser',sourcemap:'none'});
if(!built.success)throw new Error(`R2_BROWSER_BUNDLE:${built.logs.map((item)=>item.message).join('\n')}`);
if(built.outputs.length!==1)throw new Error(`R2_BROWSER_BUNDLE_OUTPUT_COUNT:${built.outputs.length}`);
const bundleBytes=new Uint8Array(await built.outputs[0]!.arrayBuffer());
if(bundleBytes.byteLength>MAX_BUNDLE_BYTES)throw new Error(`R2_BROWSER_BUNDLE_LIMIT:${bundleBytes.byteLength}`);
const bundleSha256=sha256(bundleBytes);
const bundleText=new TextDecoder('utf-8',{fatal:true}).decode(bundleBytes);
const executable=chromium.executablePath();
if(!executable.includes(`chromium_headless_shell-${CHROMIUM_REVISION}`)&&!executable.includes(`chromium-${CHROMIUM_REVISION}`))throw new Error('R2_BROWSER_REVISION_PATH');
const browserBytes=new Uint8Array(await Bun.file(executable).arrayBuffer());
let externalRequests=0;
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/')return new Response('<!doctype html><meta charset="utf-8"><script src="/bundle.js"></script>',{
  headers:{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'"}});
 if(path==='/bundle.js')return new Response(bundleText,{headers:{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'}});
 return new Response('not found',{status:404});
}});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
 browser=await chromium.launch({headless:true,executablePath:executable});
 const page=await browser.newPage();page.setDefaultTimeout(30_000);
 const pageErrors:string[]=[];page.on('pageerror',(error)=>pageErrors.push(error.message));
 await page.route('**/*',(route)=>{
  const url=new URL(route.request().url());
  if(url.origin===`http://127.0.0.1:${server.port}`)return route.continue();
  externalRequests++;return route.abort();
 });
 await page.goto(`http://127.0.0.1:${server.port}/`,{waitUntil:'load'});
 await page.waitForFunction(()=>typeof window.__umfR2MeteringResult==='object');
 const result=await page.evaluate(()=>window.__umfR2MeteringResult);
 const browserVersion=browser.version();
 if(browserVersion!==CHROMIUM_VERSION)throw new Error('R2_BROWSER_VERSION_PIN');
 const passed=Boolean(result&&result.count===expectedCases&&result.failures.length===0&&result.work>0&&pageErrors.length===0&&externalRequests===0);
 const report={profile:'umf.r2.browser-parity/1',status:passed?'PASS':'FAIL',playwrightBrowsersJsonSha256:PLAYWRIGHT_BROWSERS_JSON_SHA256,chromiumRevision:CHROMIUM_REVISION,browser:{version:browserVersion,executable,sha256:sha256(browserBytes),bytes:browserBytes.byteLength},bundle:{sha256:bundleSha256,bytes:bundleBytes.byteLength},expectedCases,actual:result,pageErrors,externalRequests};
 process.stdout.write(JSON.stringify(report)+'\n');
 if(!passed)process.exitCode=1;
}finally{
 try{
  if(browser)await browser.close();
 }finally{
  server.stop(true);
 }
}
