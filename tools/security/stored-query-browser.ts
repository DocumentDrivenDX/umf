/** Real-browser parity for the private source resolver; not backend admission. */
import {chromium} from 'playwright';
import {runStoredQueryCorpus} from '../../tests/security/stored-query-corpus';
const node=runStoredQueryCorpus();if(!node.every(r=>r.passed))throw Error('Bun source corpus failed');
const build=await Bun.build({entrypoints:['tests/security/stored-query-corpus.ts'],target:'browser',format:'esm'});if(!build.success)throw Error('Browser build refused');
const js=await build.outputs[0]!.text();const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/corpus.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Stored query source inspection</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(Bun.env.UMF_CHROMIUM_PATH?{executablePath:Bun.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let external=0;
 await page.route('**/*',r=>{if(new URL(r.request().url()).hostname!=='127.0.0.1'){external++;return r.abort();}return r.continue();});await page.goto(server.url.href);
 const actual=await page.evaluate(async()=>{const m=await import('/corpus.js');return {rows:m.runStoredQueryCorpus(),globals:{Bun:typeof (globalThis as any).Bun,process:typeof (globalThis as any).process}};});
 if(JSON.stringify(actual.rows)!==JSON.stringify(node)||external||actual.globals.Bun!=='undefined'||actual.globals.process!=='undefined')throw Error('Browser parity or boundary failed');
 console.log(JSON.stringify({status:'passed',controls:node.length,browser:browser.version(),globals:actual.globals,externalRequests:external,results:actual.rows},null,2));
}finally{await browser?.close();server.stop(true);}
