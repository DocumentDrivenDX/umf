import {chromium} from 'playwright';
const fixtures=await Bun.file('fixtures/avro/tablespec-projection.json').json(),simple=await Bun.file('fixtures/avro/tablespec-carrier-roundtrip.json').json();
const built=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm',outdir:'.cache/avro-tablespec-browser',naming:'umf.js'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/avro-tablespec-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Avro to TableSpec</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async({fixtures,simple})=>{
  const path='/umf.js',u=await import(path),same=(a:any,b:any)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Projection differs');};let recoveries=0;
  for(const c of [...fixtures.cases,simple]){for(const format of ['json','yaml']){const r=u.projectAvroToTableSpec(u.readDocument(u.writeDocument(c.source,format),format),c.policy);same(r,c.result);same(JSON.parse(u.exportTableSpec(u.readDocument(u.writeDocument(r.target,format),format))),JSON.parse(c.result.nativeSchema));recoveries++;}if(u.projectAvroToTableSpec(c.source,{...c.policy,lossPolicy:'strict'}).status!=='blocked')throw Error('Strict policy');}
  same(u.projectTableSpecToAvro(simple.result.target,simple.reverse.policy),simple.reverse);
  return {sources:fixtures.cases.length+1,recoveries,reverseProjection:true,namedDependency:true,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },{fixtures,simple});if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary');await Bun.write('fixtures/avro/tablespec-browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
