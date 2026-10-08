import {chromium} from 'playwright';
const built=await Bun.build({entrypoints:['src/index.ts'],outdir:'.cache/delta-ddl-browser',naming:'umf.js',target:'browser',format:'esm'});
if(!built.success)throw Error(built.logs.join('\n'));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/delta-ddl-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Delta DDL evidence</title>');}});
let browser;
try {
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.port);
  const result=await page.evaluate(async()=>{
    const path='/umf.js',u=await import(path);
    const schema='{"type":"struct","fields":[{"name":"id","type":"long","nullable":false,"metadata":{}}]}';
    const doc=u.defineDeltaTable(schema,{profile:'databricks-managed-delta/0.1',name:['items'],clusterBy:['id'],partitionBy:[],properties:{}},{id:'browser-items'});
    const expected='CREATE TABLE `items` (\n  `id` BIGINT NOT NULL\n) USING DELTA CLUSTER BY (`id`);\n';
    for(const format of ['json','yaml'])if(u.generateDeltaDDL(u.readDocument(u.writeDocument(doc,format),format)).sql!==expected)throw Error('Browser DDL mismatch');
    doc.extensions['umf.delta.definition'].future={opaque:'18446744073709551615'};
    const restored=u.readDocument(u.writeDocument(doc,'yaml'),'yaml');
    if(restored.extensions['umf.delta.definition'].future.opaque!=='18446744073709551615')throw Error('Unknown content lost');
    let refused=false;try{u.generateDeltaDDL(restored);}catch{refused=true;}if(!refused)throw Error('Unknown meaning exported');
    if('process' in globalThis||'Buffer' in globalThis)throw Error('Node globals available');
    return {jsonYamlDDL:true,unknownPreserved:true,unknownDDLRefused:true,nodeGlobalsAbsent:true};
  });
  await Bun.write('fixtures/delta/ddl-browser-results.json',JSON.stringify({...result,browser:browser.version(),qualification:'One atomic managed-table definition, JSON/YAML recovery and unknown-content refusal in real Chromium; no native SQL execution.'},null,2)+'\n');
  console.log(result);
} finally {await browser?.close();server.stop(true);}
