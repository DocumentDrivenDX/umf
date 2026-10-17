// @covers US-080-AC3 @covers US-080-AC4
import {chromium} from 'playwright';
import {probePreparedInspection} from '../tests/core/prepared-browser-probe';
const outputRoot=process.env.UMF_PREPARED_BROWSER_OUTPUT??'/private/tmp/sdk-prepared-browser';
await Bun.$`mkdir -p ${outputRoot}`.quiet();
const build=await Bun.build({entrypoints:['tests/core/prepared-browser-probe.ts'],target:'browser',format:'esm',minify:false});
if(!build.success)throw new AggregateError(build.logs,'browser bundle failed');
const artifact=build.outputs[0]!;await Bun.write(outputRoot+'/probe.js',artifact);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/probe.js'?new Response(artifact,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Prepared core inspection</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}`);
 const actual=await page.evaluate(async()=>{const path='/probe.js';const m=await import(path);return m.probePreparedInspection();});
 const expected=probePreparedInspection();await Bun.write(outputRoot+'/bun.json',expected);await Bun.write(outputRoot+'/chromium.json',actual);
 if(actual!==expected)throw Error('Chromium/Bun prepared inspection bytes differ');
 const receipt={status:'PASS',runtime:Bun.version,chromium:browser.version(),bytes:new TextEncoder().encode(actual).length,sha256:new Bun.CryptoHasher('sha256').update(actual).digest('hex'),bundleSha256:new Bun.CryptoHasher('sha256').update(await artifact.arrayBuffer()).digest('hex'),cases:['ordinary_selector_parity','unknown_key_and_facet_paths','caller_mutation_isolation','result_mutation_isolation','owned_recursive_freeze','unknown_content_retained'],coreVersions:['0.8.0','0.9.0'],temporalQualification:'HELD'};
 await Bun.write(outputRoot+'/verification.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}finally{await browser?.close();server.stop(true);}
