import {chromium} from 'playwright';
import {runLocalProfileCorpus} from '../tests/actions-local-profile-corpus';
import * as api from '../src/index';
import {createHash} from 'node:crypto';
const expected=runLocalProfileCorpus(api),bundle=await Bun.build({entrypoints:['tests/actions-local-profile-corpus.ts'],target:'browser',format:'esm'});
if(!bundle.success)throw Error(bundle.logs.join('\n'));
const corpus=await bundle.outputs[0]!.text(),server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(r){const p=new URL(r.url).pathname;return p==='/umf.js'?new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}}):p==='/corpus.js'?new Response(corpus,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Local action declaration profiles</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors:string[]=[],external:string[]=[];
 page.on('pageerror',e=>errors.push(String(e)));await page.route('**/*',r=>{if(!r.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(r.request().url());return r.abort();}return r.continue();});
 await page.goto(`http://127.0.0.1:${server.port}`);
 const actual=await page.evaluate(async()=>{const a='/umf.js',c='/corpus.js',api=await import(a),{runLocalProfileCorpus}=await import(c);return runLocalProfileCorpus(api);});
 if(JSON.stringify(actual)!==JSON.stringify(expected)||errors.length||external.length)throw Error('Local profile browser output/error/request mismatch');
 const evidence={scope:'Exact local action declaration/preparation/manifest/companion meanings in built public ESM; no local database or native execution qualification',passed:true,browser:browser.version(),sourceDigest:createHash('sha256').update(await Bun.file('dist/umf.js').bytes()).digest('hex'),externalRequests:external,results:actual};
 await Bun.write('docs/helix/04-build/evidence/bulk-update/local-profile-browser.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({passed:true,browser:evidence.browser,results:actual}));
}finally{await browser?.close();server.stop(true);}
