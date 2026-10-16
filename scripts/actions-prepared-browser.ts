import {chromium} from 'playwright';
import * as api from '../src/index';
import {runPreparedCorpus} from '../tests/actions-prepared-corpus';
// Optional exact ESM permits qualifying an isolated producer instead of this checkout.
const testedApi=Bun.argv[3]?await import(Bun.argv[3]):api;
const expected=runPreparedCorpus(testedApi);
const outputs=await Promise.all(['src/index.ts','tests/actions-prepared-corpus.ts'].map(async (entry,index)=>{
 if(index===0&&Bun.argv[3])return Bun.file(Bun.argv[3]).text();
 const build=await Bun.build({entrypoints:[entry],target:'browser',format:'esm'});if(!build.success||build.outputs.length!==1)throw Error(String(build.logs));return build.outputs[0]!.text();
}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;if(path==='/umf.js'||path==='/corpus.js')return new Response(outputs[path==='/umf.js'?0:1],{headers:{'content-type':'text/javascript'}});
 return new Response('<!doctype html><title>Prepared UMF declarations</title>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext(),page=await context.newPage(),external:string[]=[],errors:string[]=[];
 const origin=`http://127.0.0.1:${server.port}`;
 await context.route('**/*',route=>{const request=route.request();if(!request.url().startsWith(origin+'/')||request.method()!=='GET'){external.push(request.method()+' '+request.url());return route.abort();}return route.continue();});
 page.on('pageerror',error=>errors.push(String(error)));await page.goto(origin+'/');
 const actual=await page.evaluate(async()=>{const library='/umf.js',corpus='/corpus.js';return (await import(corpus)).runPreparedCorpus(await import(library));});
 if(JSON.stringify(actual)!==JSON.stringify(expected)||errors.length||external.length)throw Error(JSON.stringify({mismatch:JSON.stringify(actual)!==JSON.stringify(expected),errors,external}));
 const report={passed:true,browser:browser.version(),bun:Bun.version,cases:actual.length,sourceBundleSha256:new Bun.CryptoHasher('sha256').update(outputs[0]!).digest('hex'),scope:'Public source-built browser ESM; prepared declaration/key/input equivalence; no execution or authorization authority',producerQualification:false,externalRequests:external,results:actual};
 if(Bun.argv[2])await Bun.write(Bun.argv[2],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,cases:actual.length,browser:report.browser}));
}finally{await browser?.close();server.stop(true);}
