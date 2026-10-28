import {expect,test} from 'bun:test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,join,resolve} from 'node:path';
import {chromium} from 'playwright';

const dist=resolve(process.env.UMF_PROTOBUF_V4_BROWSER_DIST??'');
if(!process.env.UMF_PROTOBUF_V4_BROWSER_DIST)throw new Error('UMF_PROTOBUF_V4_BROWSER_DIST must name the freshly built V4 browser assets');
const root=resolve(import.meta.dir,'../..');
const predecessor=await readFile(join(root,'docs/helix/04-build/evidence/rust-migration/r8-protobuf-descriptor-predecessor/predecessor.json'));
const descriptor=await readFile(join(root,'tests/rust-core/protobuf-read-descriptor-predecessor.json'));
const probe=await readFile(join(root,'scripts/rust-migration/r8/protobuf-descriptor-document-browser-probe.mjs'));
const replay=await readFile(join(root,'scripts/rust-migration/r8/protobuf-descriptor-document-replay.mjs'));
const html='<!doctype html><meta charset="utf-8"><script>window.__wasmInstantiateCount=0; const old=WebAssembly.instantiateStreaming.bind(WebAssembly); WebAssembly.instantiateStreaming=async (source,imports)=>{window.__wasmInstantiateCount++; return old(source,imports);};</script><script type="importmap">'+JSON.stringify({imports:{'@umf/core':'/umf-browser.js','@umf/core/reference':'/umf.js'}})+'</script><script type="module" src="/probe-browser.mjs"></script>';
let server,browser;
try{
  server=createServer(async(req,res)=>{
    const pathname=new URL(req.url??'/','http://127.0.0.1').pathname;
    if(pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}
    if(pathname==='/umf_core_wasm.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(await readFile('/private/tmp/umf-protobuf-v4-wasm/umf_core_wasm.js'));return;}
    if(pathname==='/probe-browser.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end(probe);return;}
    if(pathname==='/protobuf-descriptor-document-replay.mjs'){res.writeHead(200,{'content-type':'text/javascript'});res.end(replay);return;}
    if(pathname==='/packets/protobuf.json'){res.writeHead(200,{'content-type':'application/json'});res.end(predecessor);return;}
    if(pathname==='/packets/descriptor.json'){res.writeHead(200,{'content-type':'application/json'});res.end(descriptor);return;}
    const name=decodeURIComponent(pathname.slice(1));
    try{const file=resolve(dist,name);expect(file.startsWith(dist+'/')).toBe(true);const bytes=await readFile(file);res.writeHead(200,{'content-type':extname(file)==='.wasm'?'application/wasm':'text/javascript'});res.end(bytes);}
    catch{res.writeHead(404);res.end('missing');}
  });
  await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
  const address=server.address();expect(address&&typeof address!=='string').toBe(true);
  browser=await chromium.launch({headless:true,timeout:30000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage(),errors=[],external=[],requests=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('request',request=>{const url=new URL(request.url());requests.push(url.pathname);if(url.origin!==`http://127.0.0.1:${address.port}`)external.push(url.href);});
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.waitForFunction(()=>Boolean(window.result||window.failure),undefined,{timeout:120000});
  const result=await page.evaluate(()=>({result:window.result??null,failure:window.failure??null,userAgent:navigator.userAgent}));
  expect(result.failure).toBe(null);expect(errors).toEqual([]);expect(external).toEqual([]);
  expect(result.result.default.operationVectors).toBe(18);expect(result.result.default.descriptorReaderCases).toBe(14);
  expect(result.result.reference.operationVectors).toBe(18);expect(result.result.reference.descriptorReaderCases).toBe(14);
  expect(result.result.wasmInstantiateCount).toBeGreaterThan(0);expect(result.result.wasmAssetLoaded).toBe(true);
  expect(result.result.nodeGlobalsAbsent).toBe(true);expect(requests).toContain('/umf_core_wasm_bg.wasm');
  console.log(JSON.stringify({browser:'Chromium',version:browser.version(),userAgent:result.userAgent,...result.result,externalRequests:external.length,pageErrors:errors.length}));
}finally{await browser?.close();server?.close();}
