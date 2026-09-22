import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {avroCardinalityProjectionCases} from './cardinality-avro-projection-cases';
import {projectCardinalityToAvro} from '../../src/core-ideals/cardinality-avro-projection';
const cases=avroCardinalityProjectionCases().map(c=>({...c,expected:projectCardinalityToAvro(c.author,c.request)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(cases);return new Response('<!doctype html><html><body>Avro Cardinality projection</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),cases=await(await fetch('/cases')).json();let projected=0,blocked=0,recoveries=0,nativeRecoveries=0,forgedRefusals=0;
  const canonical=(v:any):string=>v!==null&&typeof v==='object'?Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  for(const c of cases){
   const r=u.projectCardinalityToAvro(c.author,c.request);if(canonical(r)!==canonical(c.expected))throw Error('Receipt parity');
   if(!r.nativeBundle){blocked++;continue;}projected++;
   const bundle=r.nativeBundle,record=c.request.namespace?c.request.namespace+'.'+c.request.recordName:c.request.recordName;
   const initial=u.upgradeFieldEnvelope(u.importAvroSchema(bundle.schema,{id:'fresh-native',dependencies:bundle.dependencies})).target;
   const member=u.getAvroFieldMetadata(initial).find((f:any)=>f.record===record&&f.element.name===c.request.fieldName);if(!member)throw Error('Fresh field missing');
   const kind=u.classifyAvroField(initial,{column:member.element.id,nativeSource:bundle.schema,dependencies:bundle.dependencies,mode:'strict'});if(!kind.target)throw Error('Fresh field classification');
   const source=u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(kind.target).target).target;
   const classified=u.classifyAvroCardinality(source,{column:member.element.id,nativeSource:bundle.schema,dependencies:bundle.dependencies,identity:{module:'logical',element:'value'},profile:'present-non-null-schema',mode:'report'});if(!classified.target)throw Error('Fresh shape classification');
   if(r.mapping.outcome==='exact')for(const pair of r.mapping.items){
    const parts=/^\/modules\/(\d+)\/elements\/(\d+)$/.exec(pair.idealPath);if(!parts)throw Error('Ideal path');
    const ideal=r.source.modules[Number(parts[1])].elements[Number(parts[2])];
    const node=classified.mapping.nodes.find((n:any)=>n.location.path===pair.nativeLocation.path&&n.location.dependencyId===pair.nativeLocation.dependencyId);if(!node||node.cardinality!==ideal.cardinality)throw Error('Fresh native shape differs');
    const field=classified.target.modules.find((m:any)=>m.id===node.identity.module).elements.find((e:any)=>e.id===node.identity.element);
    if(ideal.scalarType!==undefined&&field.scalarType!==ideal.scalarType)throw Error('Fresh scalar family differs');
    if(['required','absent-allowed'].includes(ideal.nullability)&&node.nativeAllowsNull!==(ideal.nullability==='absent-allowed'))throw Error('Fresh availability differs');
   }
   for(const format of ['json','yaml']){
    const saved=u.readJsonValue(u.writeJsonValue(r,format),format);if(canonical(u.recoverCardinalityFromAvro(saved,saved.nativeBundle))!==canonical(c.author.target))throw Error('Ideal recovery');recoveries++;
    const fresh=u.readJsonValue(u.writeJsonValue(classified,format),format);if(canonical(u.recoverAvroCardinalityBundle(fresh,fresh.target))!==canonical(bundle))throw Error('Fresh native recovery');nativeRecoveries++;
   }
   const forged=structuredClone(r);forged.mapping.items[0].nativeLocation.path='/forged';let refused=false;try{u.recoverCardinalityFromAvro(forged,r.nativeBundle);}catch{refused=true;}if(!refused)throw Error('Forged receipt');forgedRefusals++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:cases.length,projected,blocked,recoveries,nativeRecoveries,forgedRefusals};
 });assert.equal(external.length,0);
 const paths=['src/core-ideals/cardinality-avro.ts','src/core-ideals/avro-field.ts','src/adapters/avro/index.ts','spec/core/avro-cardinality-classification.schema.json','scripts/core-ideals/cardinality-avro-projection-browser.ts','scripts/core-ideals/cardinality-avro-projection-cases.ts','scripts/core-ideals/cardinality-avro-projection-schema.ts','src/core-ideals/cardinality-avro-projection.ts','src/core-ideals/avro-cardinality-type.ts','src/adapters/avro/metadata.ts','src/index.ts','spec/core/cardinality-avro-projection.schema.json','fixtures/validation/cardinality-avro-projection-oracle.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/cardinality-avro-projection-browser.json',JSON.stringify({scope:'Explicit native carrier projection and retained ideal recovery in Chromium; native value decoding is separately qualified',browser:browser.version(),checks,externalRequests:external,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
