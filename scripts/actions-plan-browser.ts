import {chromium} from 'playwright';
import {runActionPlanCorpus} from '../tests/actions-plan-corpus';
import * as api from '../src/index';
import {createHash} from 'node:crypto';
const expected=runActionPlanCorpus(api);
const bundle=await Bun.build({entrypoints:['tests/actions-plan-corpus.ts'],target:'browser',format:'esm'});
if(!bundle.success)throw Error(bundle.logs.join('\n'));
const corpus=await bundle.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/corpus.js')return new Response(corpus,{headers:{'content-type':'text/javascript'}});return new Response('<!doctype html><html><body>US-902 public browser proof</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();const errors:string[]=[],external:string[]=[];page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith(`http://127.0.0.1:${server.port}`))external.push(r.url());});await page.goto(`http://127.0.0.1:${server.port}`);
 const actual=await page.evaluate(async()=>{const path='/umf.js',corpusPath='/corpus.js';const api=await import(path),{runActionPlanCorpus}=await import(corpusPath);const results=runActionPlanCorpus(api);const prepared=results.find((r:any)=>r.id==='preparation').artifact;const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(prepared.utf8));const independent=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');if(independent!==prepared.sha256)throw Error('Independent browser native SHA-256 mismatch');return results;});
 if(JSON.stringify(actual)!==JSON.stringify(expected)||errors.length||external.length)throw Error('Browser corpus/output/error/host-boundary mismatch: '+JSON.stringify({errors,external}));
 const evidence={scope:'US-902 public built ESM in actual Chromium; declaration/inspection only',criteria:['US-902-AC1','US-902-AC2','US-902-AC3','US-902-AC4','US-902-AC5','US-902-AC6'],browser:browser.version(),bun:Bun.version,cases:actual.length,passed:true,nativeExecution:false,externalRequests:external,sourceDigest:createHash('sha256').update(await Bun.file('dist/umf.js').bytes()).digest('hex'),results:actual};
 await Bun.write('docs/helix/04-build/evidence/bulk-update/us902-browser.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({browser:evidence.browser,cases:evidence.cases,passed:true,nativeExecution:false}));
}finally{await browser?.close();server.stop(true);}
