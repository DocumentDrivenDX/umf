import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const corpus='fixtures/validation/cardinality-parquet-carrier-corpus.json';
const native='fixtures/validation/cardinality-parquet-carrier-native.json';
const evidence=await Bun.file(native).json();assert.equal(evidence.runtime,'PyArrow 21.0.0');
for(const [p,h] of Object.entries(evidence.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex'),h);
const rows=await Promise.all((await Bun.file(corpus).json()).rows.map(async(r:any)=>{
 const bytes=new Uint8Array(await Bun.file(r.path).arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);return {...r,bytes:Array.from(bytes)};
}));
const entry='.cache/cardinality-parquet-carrier-entry.ts';
await Bun.write(entry,"export * from '../src';\nexport {parquetCardinalityFile} from '../src/core-ideals/parquet-cardinality-carrier';\n");
const build=await Bun.build({entrypoints:[entry],target:'browser',format:'esm'});assert.ok(build.success,JSON.stringify(build.logs));const bundle=await build.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const p=new URL(request.url).pathname;
 if(p==='/umf.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});
 if(p==='/cases')return Response.json(rows);
 return new Response('<!doctype html><html><body>Parquet native carrier writer</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),rows=await(await fetch('/cases')).json();let recoveries=0;
  for(const row of rows){
   const bytes=u.parquetCardinalityFile('NativeRecord','value',row.carrier);
   if(bytes.length!==row.bytes.length||bytes.some((b:number,i:number)=>b!==row.bytes[i]))throw Error('Native-checked bytes differ');
   const source=u.importParquetSchema(bytes,{id:row.id});
   if(u.inspectParquetContainers(source).status!=='checked')throw Error('Invalid native structure');
   for(const format of ['json','yaml']){
    const back=u.exportParquetCapture(u.readDocument(u.writeDocument(source,format),format));
    if(back.length!==bytes.length||back.some((b:number,i:number)=>b!==bytes[i]))throw Error('Archive changed');recoveries++;
   }
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {files:rows.length,recoveries};
 });
 assert.equal(external.length,0);assert.deepEqual(checks,{files:80,recoveries:160});
 const paths=[corpus,native,'src/core-ideals/parquet-cardinality-carrier.ts','src/core-ideals/parquet-carriers.ts','scripts/core-ideals/cardinality-parquet-carrier-browser.ts',...rows.map((r:any)=>r.path)];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/cardinality-parquet-carrier-browser.json',JSON.stringify({scope:'Internal explicit native carrier writer; no authored ideal projection or acceptance',browser:browser.version(),checks,externalRequests:external,bundleSha256:createHash('sha256').update(bundle).digest('hex'),sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
