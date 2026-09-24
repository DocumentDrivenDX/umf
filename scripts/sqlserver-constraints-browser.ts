import {chromium} from 'playwright';
const source=await Bun.file('fixtures/sqlserver/constraints-catalog.json').text(),view=await Bun.file('fixtures/sqlserver/constraint-metadata.json').json();
const built=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm',outdir:'.cache/sqlserver-constraints-browser',naming:'umf.js'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/sqlserver-constraints-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>SQL Server constraints</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async({source,view})=>{
  const path='/umf.js',u=await import(path),doc=u.importSqlServerCatalog(source,{id:'browser'});
  for(const format of ['json','yaml']){const back=u.readDocument(u.writeDocument(doc,format),format);if(JSON.stringify(u.getSqlServerConstraintMetadata(back))!==JSON.stringify(view))throw Error('Constraint view differs');if(JSON.stringify(JSON.parse(u.exportSqlServerCatalog(back)))!==JSON.stringify(JSON.parse(source)))throw Error('Capture differs');}
  const edited=u.proposeSqlServerCatalogEdit(doc,'/tables/0/checks/0/definition','"([id]>(-100))"');if(JSON.parse(u.exportSqlServerCatalog(edited)).state!=='modified'||u.exportSqlServerCatalog(doc).includes('(-100)'))throw Error('Copied edit differs');
  return {tables:view.tables.length,recoveries:2,edits:1,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },{source,view});
 if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary');await Bun.write('fixtures/sqlserver/constraints-browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
