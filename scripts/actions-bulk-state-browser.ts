// SPDX-License-Identifier: MIT OR Apache-2.0
// US-907-AC8: the public built ESM bundle in actual Chromium must produce results identical to the
// in-process model, and both must satisfy the owner fixture (checked in tests/actions-bulk-state.test.ts).
import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runBulkStateCorpus} from '../tests/actions-bulk-state-corpus';
import * as api from '../src/index';
const fxPath='docs/helix/03-test/fixtures/bulk-update/transitions.json',fxText=readFileSync(fxPath,'utf8'),fx=JSON.parse(fxText);
const expected=runBulkStateCorpus(api,fx);
const bundle=await Bun.build({entrypoints:['tests/actions-bulk-state-corpus.ts'],target:'browser',format:'esm'});
if(!bundle.success)throw Error(bundle.logs.join('\n'));
const corpus=await bundle.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
 if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/corpus.js')return new Response(corpus,{headers:{'content-type':'text/javascript'}});
 if(path==='/fixture.json')return new Response(fxText,{headers:{'content-type':'application/json'}});
 return new Response('<!doctype html><html><body>US-907 public browser proof</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();const errors:string[]=[],external:string[]=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith(`http://127.0.0.1:${server.port}`))external.push(r.url());});
 await page.goto(`http://127.0.0.1:${server.port}`);
 const actual=await page.evaluate(async()=>{const a='/umf.js',c='/corpus.js';const api=await import(a),{runBulkStateCorpus}=await import(c);const fx=await (await fetch('/fixture.json')).json();return runBulkStateCorpus(api,fx);});
 const mismatched=expected.filter((e,i)=>JSON.stringify(e)!==JSON.stringify(actual[i])).map(e=>e.id);
 if(actual.length!==expected.length||mismatched.length||errors.length||external.length)throw Error('Browser/in-process mismatch: '+JSON.stringify({mismatched:mismatched.slice(0,10),errors,external,counts:[expected.length,actual.length]}));
 const evidence={scope:'US-907 public built ESM in actual Chromium; pure reference model only',criteria:['US-907-AC8'],browser:browser.version(),bun:Bun.version,cases:actual.length,passed:true,nativeExecution:false,externalRequests:external,fixtureSha256:createHash('sha256').update(fxText).digest('hex'),sourceDigest:createHash('sha256').update(await Bun.file('dist/umf.js').bytes()).digest('hex')};
 await Bun.write('docs/helix/04-build/evidence/bulk-update/us907-browser.json',JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({browser:evidence.browser,cases:evidence.cases,passed:true,nativeExecution:false}));
}finally{await browser?.close();server.stop(true);}
