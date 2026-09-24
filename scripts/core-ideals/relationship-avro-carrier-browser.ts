import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const corpus=await Bun.file('fixtures/avro/relationship-carrier-cases.json').json();
const built=await Bun.build({entrypoints:['src/core-ideals/relationship-avro-carrier.ts'],target:'browser',format:'esm'});if(!built.success)throw Error('Carrier browser build failed');
const code=await built.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const p=new URL(req.url).pathname;if(p==='/cases')return Response.json(corpus.cases);if(p==='/carrier.js')return new Response(code,{headers:{'content-type':'text/javascript'}});if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});return new Response('<!doctype html><title>Avro reference carrier</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const cpath='/carrier.js',upath='/umf.js',builder=await import(cpath),u=await import(upath),cases=await(await fetch('/cases')).json();let recoveries=0,strictBlocks=0;
  for(const c of cases){const schema=builder.buildAvroRelationshipCarrier(c.request);if(schema!==c.schemaText)throw Error('Carrier differs');
   const nativeSource={schema,dependencies:[]},source=u.importAvroSchema(schema,{id:c.id}),request={nativeSource,mode:'report',profile:'schema-structure'},r=u.classifyAvroRelationships(source,request);
   if(JSON.stringify(r.target.modules)!==JSON.stringify(source.modules))throw Error('Association inferred');
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);if(JSON.stringify(u.recoverAvroRelationshipSource(saved,saved.target))!==JSON.stringify(nativeSource))throw Error('Archive changed');recoveries++;}
   if(u.classifyAvroRelationships(source,{...request,mode:'strict'}).status!=='blocked')throw Error('Missing strict block');strictBlocks++;
  }
  let getterReads=0,rejected=false;try{builder.buildAvroRelationshipCarrier({...cases[0].request,get fieldName(){getterReads++;return 'bad';}});}catch{rejected=true;}if(!rejected||getterReads)throw Error('Getter executed');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals present');return {cases:cases.length,recoveries,strictBlocks,getterReads};
 });
 assert.deepEqual(checks,{cases:12,recoveries:24,strictBlocks:12,getterReads:0});assert.deepEqual(externalRequests,[]);
 const paths=['src/core-ideals/relationship-avro-carrier.ts','scripts/core-ideals/relationship-avro-carrier-cases.ts','scripts/core-ideals/relationship-avro-carrier-browser.ts','tests/core-ideals/relationship-avro-carrier.test.ts','fixtures/avro/relationship-carrier-cases.json','fixtures/validation/relationship-avro-carrier-native.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/relationship-avro-carrier-browser.json',JSON.stringify({scope:'Internal native carrier builder and classification recovery only; authored projection and full binding acceptance remain unfinished',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
