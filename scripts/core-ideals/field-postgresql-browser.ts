import {chromium} from 'playwright';
const fixture=await Bun.file('fixtures/validation/field-postgresql-native.json').json();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(fixture);return new Response('<!doctype html><html><body>PostgreSQL Field binding</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();const external:string[]=[];page.on('request',request=>{if(!request.url().startsWith(`http://127.0.0.1:${server.port}/`))external.push(request.url());});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),f=await(await fetch('/cases')).json(),source=u.upgradeFieldEnvelope(u.importPostgresqlCatalogCapture(f.nativeSource,{id:'browser-pg'})).target;let recoveries=0;
  for(const row of f.rows){const result=u.classifyPostgresqlField(source,{column:row.path,nativeSource:f.nativeSource,mode:'strict'});if(result.status!=='classified')throw Error('Classification blocked');const element=result.target.modules.find((m:any)=>m.id==='postgresql.columns').elements.find((e:any)=>e.id===row.path);if(element.name!==row.name||element.kind!=='field'||(element.scalarType??null)!==row.scalarType)throw Error('Native identity mismatch');for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(result,format),format);if(u.recoverPostgresqlFieldCapture(receipt,receipt.target)!==f.nativeSource)throw Error('Native text loss');recoveries++;}}
  const column=f.rows.find((r:any)=>r.scalarType===null),author=u.declareCoreElementKind(source,{module:'postgresql.columns',element:column.path},'record');let conflicts=0;
  for(const mode of ['strict','report']){const result=u.classifyPostgresqlField(author.target,{column:column.path,nativeSource:f.nativeSource,mode,author});if(result.status!=='blocked'||'target'in result)throw Error('Conflict overwritten');conflicts++;}
  const stale=u.classifyPostgresqlField(source,{column:f.rows[0].path,nativeSource:f.nativeSource,mode:'strict'});stale.target.future='changed';let refused=false;try{u.recoverPostgresqlFieldCapture(stale,stale.target);}catch{refused=true;}if(!refused)throw Error('Stale receipt accepted');
  let records=0,recordRecoveries=0;
  for(const row of f.records){const result=u.classifyPostgresqlRecord(source,{recordModule:'records',recordId:'record',mode:'strict',nativeSource:f.nativeSource,relation:row.relation});if(result.status!=='classified')throw Error('Record blocked');
   const record=result.target.modules.at(-1).elements[0],names=record.references.map((ref:any)=>result.target.modules.find((m:any)=>m.id===ref.module).elements.find((e:any)=>e.id===ref.element).name);
   if(JSON.stringify(names)!==JSON.stringify(row.names)||result.target.modules.at(-1).namespace!==row.relation.schema)throw Error('Qualified record mismatch');
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(result,format),format);if(u.recoverPostgresqlRecordCapture(receipt,receipt.target)!==f.nativeSource)throw Error('Record native text loss');recordRecoveries++;}records++;
  }
  const view=u.classifyPostgresqlRecord(source,{recordModule:'records',recordId:'view',mode:'report',nativeSource:f.nativeSource,relation:{schema:'sales',name:'scalar_view'}});if(view.status!=='blocked'||'target'in view)throw Error('View accepted');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {columns:f.rows.length,recoveries,conflicts,records,recordRecoveries,viewBlocked:true,staleReceiptBlocked:true};
 });
 if(external.length)throw Error('External requests');await Bun.write('fixtures/validation/field-postgresql-browser.json',JSON.stringify({scope:'PostgreSQL 17.4 captured table and member roles only',browser:browser.version(),checks,externalRequests:external},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
