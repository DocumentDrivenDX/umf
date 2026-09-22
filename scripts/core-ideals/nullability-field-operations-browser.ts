import {chromium} from 'playwright';
import {nullabilityFieldOperationsCases} from './nullability-field-operations-cases';
const rows=nullabilityFieldOperationsCases();
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
   const version=row.source.umf==='0.3.0'?'2.0.0':'1.0.0';
   const field=u.declareCoreElementKind(row.source,row.field,'field'),record=u.declareCoreElementKind(row.source,row.record,'record'),result=u.declareCoreRecordType(field,record);
   if(result.version!==version||field.version!==version||u.inspectCoreElementKind(row.source,row.field).version!==version)throw Error('Version');
   if(result.target.modules[0].elements[1].nullability!==row.source.modules[0].elements[1].nullability)throw Error('Availability erased');
   if(JSON.stringify(result.target.modules[0].elements[1].extensions)!==JSON.stringify(row.source.modules[0].elements[1].extensions))throw Error('Native content erased');
   if(u.selectCoreElements(result.target,{identities:[row.field],references:'transitive'}).selection.length!==(row.variant==='recursive'?2:3))throw Error('Qualified/recursive identity');
   for(const format of ['json','yaml']){
    const receipt=u.readJsonValue(u.writeJsonValue(result,format),format);
    if(JSON.stringify(u.verifyCoreRecordTypeDeclaration(receipt,receipt.target))!==JSON.stringify(result))throw Error('Recovery');
    u.verifyCoreKindDeclaration(receipt.fieldAuthor,receipt.source);recoveries++;
   }
   const changed=u.copyJson(result);changed.provenance.recordPath='/wrong';refuse(()=>u.verifyCoreRecordTypeDeclaration(changed,changed.target));
   const stale=u.copyJson(result.target);stale.future=true;refuse(()=>u.verifyCoreRecordTypeDeclaration(result,stale));
   if(row.source.umf==='0.3.0'){
    for(const kind of ['record','group'])refuse(()=>u.declareCoreElementKind(row.source,row.field,kind));
    const forged=u.copyJson(field);forged.version='1.0.0';refuse(()=>u.verifyCoreKindDeclaration(forged,forged.target));
    const old=u.copyJson(row.source);old.umf='0.2.0';refuse(()=>u.declareCoreRecordType(field,u.declareCoreElementKind(old,row.record,'record')));
   }
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:rows.length,recoveries,refusals,versionedReceipts:true};
 });
 if(external.length)throw Error('External requests');await Bun.write('fixtures/validation/nullability-field-operations-browser.json',JSON.stringify({scope:'Versioned Field and record-type authoring in core 0.2.0 and 0.3.0; no native Nullability projection',browser:browser.version(),checks,externalRequests:external},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
