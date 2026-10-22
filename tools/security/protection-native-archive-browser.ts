/** Actual Chromium/Bun source-owner parity; no native execution or admission. */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {runNativeArchiveCorpus} from '../../tests/security/native/pg18-native-archive-corpus';
const [receiptPath,flag,output]=process.argv.slice(2);if(!receiptPath||flag!=='--output'||!output)throw Error('Native receipt and explicit output required');
const bytes=new Uint8Array(await Bun.file(receiptPath).arrayBuffer()),native=JSON.parse(new TextDecoder().decode(bytes));
const files=[...Object.keys(native.sourceDigests),'tests/security/native/pg18-native-archive-corpus.ts','tools/security/protection-native-archive-browser.ts'];
const snapshot=async()=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex')])));
const before=await snapshot();for(const [file,pin] of Object.entries(native.sourceDigests))if(before[file]!==pin)throw Error('Native/browser source mismatch: '+file);
const rows=runNativeArchiveCorpus(native.catalog);
const build=await Bun.build({entrypoints:['tests/security/native/pg18-native-archive-corpus.ts'],target:'browser',format:'esm'});if(!build.success)throw Error('Browser build refused');
const js=await build.outputs[0]!.text(),server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/corpus.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Opaque native archive</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(Bun.env.UMF_CHROMIUM_PATH?{executablePath:Bun.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let external=0;const pageErrors:string[]=[];page.on('pageerror',error=>pageErrors.push(error.message));
 await page.route('**/*',r=>{if(new URL(r.request().url()).origin!==server.url.origin){external++;return r.abort();}return r.continue();});await page.goto(server.url.href);
 const actual=await page.evaluate(async catalog=>{const moduleUrl='/corpus.js',m=await import(moduleUrl);return {rows:m.runNativeArchiveCorpus(catalog),globals:{Bun:typeof(globalThis as any).Bun,process:typeof(globalThis as any).process}};},native.catalog);
 if(JSON.stringify(actual.rows)!==JSON.stringify(rows)||external||pageErrors.length||actual.globals.Bun!=='undefined'||actual.globals.process!=='undefined')throw Error('Browser parity/boundary failed');
 const sourceDigests=await snapshot();if(JSON.stringify(sourceDigests)!==JSON.stringify(before))throw Error('Browser source drift');
 const result={status:'passed',controls:rows.length,sourceDigests,sourcesUnchanged:true,pageErrors,allowedOrigin:server.url.origin,nativeReceiptSha256:createHash('sha256').update(bytes).digest('hex'),browser:browser.version(),globals:actual.globals,externalRequests:external,observations:rows,scope:'Actual retained native catalog through existing source/catalog/refusal owners in Bun and Chromium; no native interpretation, current authority or browser database access.'};await Bun.write(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,controls:rows.length,browser:result.browser}));
}finally{await browser?.close();server.stop(true);}
