import {chromium} from 'playwright';
const fixture=await Bun.file('fixtures/validation/field-postgresql-projection-native.json').json();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
 if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/postgresql-runtime.js')return new Response(Bun.file('dist/postgresql/runtime.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/libpg-query.wasm')return new Response(Bun.file('dist/postgresql/libpg-query.wasm'),{headers:{'content-type':'application/wasm'}});
 if(path==='/cases')return Response.json(fixture);return new Response('<!doctype html><html><body>Field PostgreSQL DDL</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();const external:string[]=[];await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',runtime='/postgresql-runtime.js',u=await import(path),{backend}=await import(runtime),f=await(await fetch('/cases')).json();let recoveries=0;
  for(const row of f.rows){const result=await u.projectFieldToPostgresql(row.author,row.request,backend);if(JSON.stringify(result)!==JSON.stringify(row.result))throw Error('Native projection parity');await u.exportPostgresqlSql(result.target,backend);
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(result,format),format);if(JSON.stringify(await u.recoverFieldFromPostgresql(receipt,result.nativeSql,backend))!==JSON.stringify(row.author.target))throw Error('Ideal recovery');recoveries++;}
  }
  const row=f.rows[0],source=u.copyJson(row.author.source);source.modules[0].elements[0].future={constraint:'unknown'};const author=u.declareCoreElementKind(source,{module:'m',element:'e'},'field');
  const strict=await u.projectFieldToPostgresql(author,{...row.request,mode:'strict'},backend),report=await u.projectFieldToPostgresql(author,{...row.request,mode:'report'},backend);
  if(strict.status!=='blocked'||'target'in strict||'nativeSql'in strict||report.status!=='projected'||!report.residuals.length)throw Error('Loss policy');
  let identifiers=0;for(const value of ['x'.repeat(64),'雪'.repeat(22),'\0',String.fromCharCode(0xd800)]){try{await u.projectFieldToPostgresql(row.author,{...row.request,tableName:value},backend);}catch{identifiers++;continue;}throw Error('Unsafe identifier');}
  let recordRecoveries=0,recordBlocks=0;
  for(const row of f.recordRows){const result=await u.projectRecordToPostgresql(row.author,row.request,backend);if(JSON.stringify(result)!==JSON.stringify(row.result))throw Error('Record AST parity');if(result.status==='blocked'){if('target'in result||'nativeSql'in result)throw Error('Partial record');recordBlocks++;continue;}
   const names=u.getPostgresqlDdlDeclarations(result.target).declarations[0].columns.map((c:any)=>c.element.name);if(JSON.stringify(names)!==JSON.stringify(row.variant==='empty'?[]:['id','label','active']))throw Error('Record member order');
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(result,format),format);if(JSON.stringify(await u.recoverRecordFromPostgresql(receipt,result.nativeSql,backend))!==JSON.stringify(row.author.target))throw Error('Record ideal recovery');recordRecoveries++;}
  }
  let namespaceChecks=0,namespaceRecoveries=0;
  for(const record of [false,true]){const row=record?f.recordRows[0]:f.rows[0];for(const mode of ['strict','report']){const result=record?await u.projectRecordToPostgresql(row.author,{...row.request,namespace:'support',mode},backend):await u.projectFieldToPostgresql(row.author,{...row.request,namespace:'support',mode},backend);if(result.status!==(mode==='strict'?'blocked':'projected')||result.residuals.filter((r:any)=>r.path.endsWith('/namespace')).length!==(record?2:1))throw Error('Namespace loss policy');namespaceChecks++;if(result.target)for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(result,format),format);const recovered=record?await u.recoverRecordFromPostgresql(receipt,receipt.nativeSql,backend):await u.recoverFieldFromPostgresql(receipt,receipt.nativeSql,backend);if(JSON.stringify(recovered)!==JSON.stringify(row.author.target))throw Error('Namespace recovery');namespaceRecoveries++;}else if('nativeSql'in result)throw Error('Partial namespace target');}}
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {namespaceChecks,namespaceRecoveries,projections:f.rows.length,recoveries,lossPolicies:2,identifierRefusals:identifiers,recordCases:f.recordRows.length,recordRecoveries,recordBlocks};
 });
 if(external.length)throw Error('External requests');await Bun.write('fixtures/validation/field-postgresql-projection-browser.json',JSON.stringify({scope:'Pinned WASM syntax/AST parity and ideal recovery; native execution evidence recorded separately',browser:browser.version(),checks,externalRequests:external},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
