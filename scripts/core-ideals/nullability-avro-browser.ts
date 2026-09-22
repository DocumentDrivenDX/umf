import {avroNullabilityCases} from './nullability-avro-cases';
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const fixture='fixtures/avro/nullability-cases.json';
const cases=avroNullabilityCases((await Bun.file(fixture).json()).cases);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const p=new URL(request.url).pathname;if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(p==='/classifications')return Response.json(cases);if(p==='/cases')return new Response(Bun.file(fixture),{headers:{'content-type':'application/json'}});return new Response('<!doctype html><html><body>Avro availability discovery</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),cases=await(await fetch('/classifications')).json();let recoveries=0,forgedRefusals=0,classified=0,blocked=0;
  for(const c of cases){
   const receipt=u.classifyAvroNullability(c.source,c.request);
   if(receipt.status!==c.status||receipt.mapping.nullability!==c.expected)throw Error('Classification mismatch');
   if(!receipt.target){blocked++;continue;}classified++;
   for(const format of ['json','yaml']){const back=u.readJsonValue(u.writeJsonValue(receipt,format),format);const result=u.recoverAvroNullabilityBundle(back,back.target);if(result.schema!==c.request.nativeSource||result.dependencies.length)throw Error('Native source lost');recoveries++;}
   const forged=structuredClone(receipt);forged.mapping.nativeFragment={kind:'null'};let refused=false;try{u.recoverAvroNullabilityBundle(forged,forged.target);}catch{refused=true;}if(!refused)throw Error('Altered receipt accepted');forgedRefusals++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:cases.length,classified,blocked,recoveries,forgedRefusals};
 });if(external.length)throw Error('External requests');
 const paths=[fixture,'dist/umf.js','scripts/core-ideals/nullability-avro-browser.ts','src/adapters/avro/index.ts','src/core-ideals/nullability-avro.ts','src/core-ideals/avro-availability-type.ts','scripts/core-ideals/nullability-avro-cases.ts','spec/core/avro-nullability-classification.schema.json','spec/extensions/avro-nullability/schema.json','spec/extensions/avro-nullability/package.json'];
 const fingerprints=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/nullability-avro-browser.json',JSON.stringify({scope:'Scoped underlying-field-value Nullability classification and exact source recovery; authored projection remains unfinished',browser:browser.version(),checks,externalRequests:external,fingerprints},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
