import {chromium} from 'playwright';
const fixture=await Bun.file('fixtures/tablespec/avro-projection.json').json();
const tableLosses=await Bun.file('fixtures/tablespec/avro-table-losses.json').json();
fixture.cases.push(...tableLosses.cases.map((c:any)=>({...c,exports:[]})));
fixture.cases.push(...(await Bun.file('fixtures/tablespec/avro-integers.json').json()).cases);
const built=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm',outdir:'.cache/tablespec-avro-browser',naming:'umf.js'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/tablespec-avro-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>TableSpec to Avro</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async f=>{
  const path='/umf.js',u=await import(path);let recoveries=0;
  for(const c of f.cases){const r=u.projectTableSpecToAvro(c.result.source,c.result.policy);if(JSON.stringify(r)!==JSON.stringify(c.result))throw Error('Projection differs');for(const e of c.exports){if(u.exportAvroSchema(u.readDocument(u.writeDocument(r.target,e.format),e.format))!==e.schema)throw Error('Recovery differs');recoveries++;}if(u.projectTableSpecToAvro(c.result.source,{...c.result.policy,lossPolicy:'strict'}).status!=='blocked')throw Error('Strict policy failed');}
  return {cases:f.cases.length,recoveries,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },fixture);
 if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary');await Bun.write('fixtures/tablespec/avro-browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
