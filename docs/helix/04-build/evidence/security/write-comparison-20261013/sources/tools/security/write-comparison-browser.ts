import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const output=Bun.argv[2];if(!output)throw Error('Evidence output path required');
const source='tests/security/browser-corpus.ts';
const paths=[import.meta.path,source,'src/extensions/security/write.ts','src/model/schema-literals.ts','src/model/key-tuple.ts'];
const digests=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
const built=await Bun.build({entrypoints:[source],target:'browser',format:'esm'});if(!built.success)throw Error('Browser build refused');
const js=await built.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/consumer.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Security write comparison</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const origin=`http://127.0.0.1:${server.port}`;let external=0;
 await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external++;return route.abort();}return route.continue();});
 await page.goto(origin);const result=await page.evaluate(async()=>{const url='/consumer.js',module=await import(url);return module.securityWriteComparisonCorpus();});
 if(result.mismatches||external)throw Error('Browser consistency corpus failed');
 await Bun.write(output,JSON.stringify({status:'passed',bun:Bun.version,chromium:browser.version(),sourceDigests:digests,...result,externalRequests:external,scope:'Actual browser selected record-ontology write comparison only; no backend provenance, native snapshots or policy admission.'},null,2)+'\n');
 console.log(JSON.stringify({status:'passed',chromium:browser.version(),cases:result.cases}));
}finally{await browser?.close();server.stop(true);}
