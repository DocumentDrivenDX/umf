import {chromium} from 'playwright';
const source=await Bun.file('fixtures/sqlserver/catalog.json').text(),view=await Bun.file('fixtures/sqlserver/column-metadata.json').json();
const integers=await Bun.file('fixtures/sqlserver/integer-tokens.json').json();
const built=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm',outdir:'.cache/sqlserver-browser',naming:'umf.js'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/sqlserver-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>SQL Server ingestion</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async({source,view,integers})=>{
  const path='/umf.js',u=await import(path),doc=u.importSqlServerCatalog(source,{id:'browser'});
  for(const format of ['json','yaml']){const back=u.readDocument(u.writeDocument(doc,format),format);if(JSON.stringify(u.getSqlServerColumnMetadata(back))!==JSON.stringify(view))throw Error('Column metadata differs');if(JSON.stringify(JSON.parse(u.exportSqlServerCatalog(back)))!==JSON.stringify(JSON.parse(source)))throw Error('Capture differs');}
  const edited=u.proposeSqlServerCatalogEdit(doc,view[0].path+'/description','"Browser edit"');if(edited.modules[0].elements[0].description!=='Browser edit'||doc.modules[0].elements[0].description==='Browser edit')throw Error('Edit differs');
  let integerRejections=0,integerRecoveries=0;
  for(const c of integers.cases)for(const operation of [()=>u.importSqlServerCatalog(c.input,{id:'bad'}),()=>u.proposeSqlServerCatalogEdit(integers.original,c.path,c.replacement)]){try{operation();}catch(error){if(!String(error).includes('SQLSERVER_INTEGER'))throw error;integerRejections++;continue;}throw Error('Inexact integer accepted');}
  for(const value of [integers.extended,integers.exact])for(const format of ['json','yaml']){const back=u.readDocument(u.writeDocument(value,format),format);if(u.exportSqlServerCatalog(back)!==u.exportSqlServerCatalog(value))throw Error('Exact token recovery differs');integerRecoveries++;}
  return {integerRejections,integerRecoveries,columns:view.length,recoveries:2,edits:1,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },{source,view,integers});
 if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary');await Bun.write('fixtures/sqlserver/browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
