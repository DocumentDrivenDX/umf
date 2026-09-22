import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {cardinalityFieldOperationsCases} from './cardinality-field-operations-cases';
const rows=cardinalityFieldOperationsCases();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(rows);return new Response('<!doctype html><html><body>Nullability Field authoring</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),rows=await(await fetch('/cases')).json();let recoveries=0,refusals=0;
  if(u.coreKindOperationV2Schema.$id!=='urn:umf:core:kind-operation:2.0.0'||u.coreRecordTypeOperationV2Schema.$id!=='urn:umf:core:record-type-operation:2.0.0')throw Error('Public schemas');
  const refuse=(fn:()=>unknown)=>{let rejected=false;try{fn();}catch{rejected=true;}if(!rejected)throw Error('Expected refusal');refusals++;};
  for(const row of rows){
   const version=row.source.umf==='0.4.0'?'3.0.0':row.source.umf==='0.3.0'?'2.0.0':'1.0.0';
   const field=u.declareCoreElementKind(row.source,row.field,'field'),record=u.declareCoreElementKind(row.source,row.record,'record'),result=u.declareCoreRecordType(field,record);
   if(result.version!==version||field.version!==version||u.inspectCoreElementKind(row.source,row.field).version!==version)throw Error('Version');
   if(result.target.modules[0].elements[1].nullability!==row.source.modules[0].elements[1].nullability)throw Error('Availability erased');
   if(JSON.stringify(result.target.modules[0].elements[1].extensions)!==JSON.stringify(row.source.modules[0].elements[1].extensions))throw Error('Native content erased');
   if(row.source.umf!=='0.4.0'&&u.selectCoreElements(result.target,{identities:[row.field],references:'transitive'}).selection.length!==(row.variant==='recursive'?2:3))throw Error('Qualified/recursive identity');
   for(const format of ['json','yaml']){
    const receipt=u.readJsonValue(u.writeJsonValue(result,format),format);
    if(JSON.stringify(u.verifyCoreRecordTypeDeclaration(receipt,receipt.target))!==JSON.stringify(result))throw Error('Recovery');
    u.verifyCoreKindDeclaration(receipt.fieldAuthor,receipt.source);recoveries++;
   }
   const changed=u.copyJson(result);changed.provenance.recordPath='/wrong';refuse(()=>u.verifyCoreRecordTypeDeclaration(changed,changed.target));
   const stale=u.copyJson(result.target);stale.future=true;refuse(()=>u.verifyCoreRecordTypeDeclaration(result,stale));
   if(row.source.umf==='0.3.0'||row.source.umf==='0.4.0'){
    for(const kind of ['record','group'])refuse(()=>u.declareCoreElementKind(row.source,row.field,kind));
    const forged=u.copyJson(field);forged.version='1.0.0';refuse(()=>u.verifyCoreKindDeclaration(forged,forged.target));
    const old=u.copyJson(row.source);old.umf='0.2.0';refuse(()=>u.declareCoreRecordType(field,u.declareCoreElementKind(old,row.record,'record')));
   }
  }
  let availabilityRecoveries=0,itemRecordRecoveries=0;
  for(const cardinality of ['one','array','map','unspecified'])for(const nullability of ['required','absent-allowed','unspecified']){
   const row=structuredClone(rows.find((r:any)=>r.source.umf==='0.4.0')),field=row.source.modules[0].elements[1];field.cardinality=cardinality;
   const receipt=u.declareCoreNullability(row.source,row.field,nullability);if(receipt.version!=='2.0.0'||u.inspectCoreNullability(receipt.target,row.field).meaning.nullability!==nullability)throw Error('Availability version/meaning');
   if(receipt.target.modules[0].elements[1].cardinality!==cardinality)throw Error('Shape lost');
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(receipt,format),format);if(JSON.stringify(u.verifyCoreNullabilityDeclaration(saved,saved.target))!==JSON.stringify(receipt))throw Error('Availability recovery');availabilityRecoveries++;}
   const forged=structuredClone(receipt);forged.version='1.0.0';refuse(()=>u.verifyCoreNullabilityDeclaration(forged,receipt.target));
   if(['array','map'].includes(cardinality))refuse(()=>u.declareCoreRecordType(u.declareCoreElementKind(row.source,row.field,'field'),u.declareCoreElementKind(row.source,row.record,'record')));
  }
  const nested=structuredClone(rows.find((r:any)=>r.source.umf==='0.4.0'));nested.source.modules[0].elements.push({id:'items',kind:'field',extensions:{}});const parent=nested.source.modules[0].elements[1];parent.cardinality='array';parent.itemType={module:'sales',element:'items'};const item={module:'sales',element:'items'};
  const typed=u.declareCoreRecordType(u.declareCoreElementKind(nested.source,item,'field'),u.declareCoreElementKind(nested.source,nested.record,'record'));if(JSON.stringify(typed.target.modules[0].elements[1])!==JSON.stringify(parent))throw Error('Parent item reference changed');
  for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(typed,format),format);u.verifyCoreRecordTypeDeclaration(saved,saved.target);itemRecordRecoveries++;}
  refuse(()=>u.declareCoreElementKind(nested.source,item,'group'));
  if(u.coreKindOperationV3Schema.$id!=='urn:umf:core:kind-operation:3.0.0'||u.coreRecordTypeOperationV3Schema.$id!=='urn:umf:core:record-type-operation:3.0.0'||u.coreNullabilityOperationV2Schema.$id!=='urn:umf:core:nullability-operation:2.0.0')throw Error('New public schemas');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:rows.length,recoveries,availabilityRecoveries,itemRecordRecoveries,refusals,versionedReceipts:true};
 });
 if(external.length)throw Error('External requests');const paths=['scripts/core-ideals/cardinality-field-operations-browser.ts','scripts/core-ideals/cardinality-field-operations-cases.ts','src/model/field-kind.ts','src/model/nullability.ts','src/model/record-type.ts','spec/core/kind-operation-v3.schema.json','spec/core/record-type-operation-v3.schema.json','spec/core/nullability-operation-v2.schema.json','dist/umf.js'];const fingerprints=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));await Bun.write('fixtures/validation/cardinality-field-operations-browser.json',JSON.stringify({scope:'Versioned Field and record-type authoring in core 0.2.0/0.3.0/0.4.0, and Nullability authoring in 0.4.0; no Cardinality selection or native binding claim',browser:browser.version(),checks,externalRequests:external,fingerprints},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
