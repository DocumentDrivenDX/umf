import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const fixture='fixtures/avro/nullability-cases.json';
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const p=new URL(request.url).pathname;if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(p==='/cases')return new Response(Bun.file(fixture),{headers:{'content-type':'application/json'}});return new Response('<!doctype html><html><body>Avro availability discovery</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),f=await(await fetch('/cases')).json();let recoveries=0,forgedRefusals=0;
  for(const c of f.cases){
   const source=u.upgradeFieldEnvelope(u.importAvroSchema(c.schema,{id:c.id})).target;
   const field=u.getAvroFieldMetadata(source).find((f:any)=>f.record==='availability.Example'&&f.element.name==='value');if(!field)throw Error('Missing field');
   const receipt=u.classifyAvroField(source,{column:field.element.id,nativeSource:c.schema,mode:'strict'});if(!receipt.target)throw Error('Blocked');
   for(const format of ['json','yaml']){const back=u.readJsonValue(u.writeJsonValue(receipt,format),format);const result=u.recoverAvroFieldBundle(back,back.target);if(result.schema!==c.schema||result.dependencies.length)throw Error('Native source lost');recoveries++;}
   const forged=structuredClone(receipt);forged.mapping.nativeFragment={kind:'null'};let refused=false;try{u.recoverAvroFieldBundle(forged,forged.target);}catch{refused=true;}if(!refused)throw Error('Altered receipt accepted');forgedRefusals++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {schemas:f.cases.length,recoveries,forgedRefusals};
 });if(external.length)throw Error('External requests');
 const paths=[fixture,'dist/umf.js','scripts/core-ideals/nullability-avro-browser.ts','src/adapters/avro/index.ts','src/core-ideals/avro-field.ts'];
 const fingerprints=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/nullability-avro-browser.json',JSON.stringify({scope:'Existing Field archival receipts retain the Avro availability discovery corpus; Nullability classification and projection remain unfinished',browser:browser.version(),checks,externalRequests:external,fingerprints},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
