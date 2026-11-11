import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import * as nodeRuntime from '../../src/index-node-v4';
import {buildBindingBrowserRuntime} from '../../scripts/binding/browser-runtime';
import {configureSecurityRuntime,securityFactConsistencyCorpus} from '../../tests/security/browser-corpus';
const output=Bun.argv[2];if(!output)throw Error('Evidence output path required');
const source='tests/security/browser-corpus.ts';
const paths=[import.meta.path,source,'src/index-node-v4.ts','src/index-browser-v4.ts','scripts/binding/browser-runtime.ts','bindings/core/wasm/pkg/umf_core_wasm.js','bindings/core/wasm/pkg/umf_core_wasm_bg.wasm','src/extensions/security/evaluate.ts','src/model/schema-literals.ts'];
const digests=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
const built=await Bun.build({entrypoints:[source],target:'browser',format:'esm'});if(!built.success)throw Error('Browser build refused');
const js=await built.outputs[0]!.text();
const {browserJs,wasmBytes}=await buildBindingBrowserRuntime();
configureSecurityRuntime(nodeRuntime);const expected=securityFactConsistencyCorpus();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const path=new URL(req.url).pathname;if(path==='/consumer.js')return new Response(js,{headers:{'content-type':'text/javascript'}});if(path==='/umf.js')return new Response(browserJs,{headers:{'content-type':'text/javascript'}});if(path==='/umf_core_wasm_bg.wasm')return new Response(Bun.file(wasmBytes),{headers:{'content-type':'application/wasm'}});return new Response('<!doctype html><title>Security fact consistency</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const origin=`http://127.0.0.1:${server.port}`;let external=0;
 await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external++;return route.abort();}return route.continue();});
 await page.goto(origin);const result=await page.evaluate(async()=>{const url='/consumer.js',module=await import(url),runtime=await import('/umf.js');module.configureSecurityRuntime(runtime);return module.securityFactConsistencyCorpus();});
 if(result.mismatches||external||JSON.stringify(result)!==JSON.stringify(expected))throw Error('Browser consistency corpus failed');
 await Bun.write(output,JSON.stringify({status:'passed',bun:Bun.version,chromium:browser.version(),sourceDigests:digests,...result,externalRequests:external,scope:'Actual browser semantic projections only; no backend provenance, native snapshots or policy admission.'},null,2)+'\n');
 console.log(JSON.stringify({status:'passed',chromium:browser.version(),cases:result.cases}));
}finally{await browser?.close();server.stop(true);}
