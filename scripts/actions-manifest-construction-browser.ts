import {chromium} from 'playwright';
import {runConstructionCorpus} from '../tests/actions-manifest-construction-corpus';
import * as api from '../src/index';
import {createHash} from 'node:crypto';
const expected=runConstructionCorpus(api),bundle=await Bun.build({entrypoints:['tests/actions-manifest-construction-corpus.ts'],target:'browser',format:'esm'});
if(!bundle.success)throw Error(bundle.logs.join('\n'));
const corpus=await bundle.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(r){const p=new URL(r.url).pathname;return p==='/umf.js'?new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}}):p==='/corpus.js'?new Response(corpus,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Unsealed manifest construction</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors:string[]=[],external:string[]=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith(`http://127.0.0.1:${server.port}/`))external.push(r.url());});
 await page.goto(`http://127.0.0.1:${server.port}`);
 const actual=await page.evaluate(async()=>{const a='/umf.js',c='/corpus.js',api=await import(a),{runConstructionCorpus}=await import(c),result=runConstructionCorpus(api);const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(result.artifact.utf8));if([...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('')!==result.artifact.sha256)throw Error('Native browser SHA256 mismatch');return result;});
 if(JSON.stringify(actual)!==JSON.stringify(expected)||errors.length||external.length)throw Error('Browser constructor parity/error/request mismatch');
 const evidence={scope:'US-903-AC7 pure unsealed constructor in actual Chromium',browser:browser.version(),passed:true,nativeExecution:false,externalRequests:external,errors,sourceDigest:createHash('sha256').update(await Bun.file('dist/umf.js').bytes()).digest('hex'),results:actual};
 await Bun.write('docs/helix/04-build/evidence/bulk-update/us903-construction-browser.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({passed:true,browser:evidence.browser,refusals:actual.refusals}));
}finally{await browser?.close();server.stop(true);}
