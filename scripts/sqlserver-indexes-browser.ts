import {chromium} from 'playwright';
const source=await Bun.file('fixtures/sqlserver/indexes-catalog.json').text(),view=await Bun.file('fixtures/sqlserver/index-metadata.json').json(),projection=await Bun.file('fixtures/sqlserver/index-projection.json').json();
const built=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm',outdir:'.cache/sqlserver-indexes-browser',naming:'umf.js'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/sqlserver-indexes-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>SQL Server indexes</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async({source,view,projection})=>{
  const path='/umf.js',u=await import(path),doc=u.importSqlServerCatalog(source,{id:'indexes'}),same=(a:any,b:any)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Browser result differs');};
  for(const format of ['json','yaml']){const back=u.readDocument(u.writeDocument(doc,format),format);same(u.getSqlServerIndexMetadata(back),view);same(JSON.parse(u.exportSqlServerCatalog(back)),JSON.parse(source));same(u.projectSqlServerToAvro(back,projection.policy),projection.result);}
  const edited=u.proposeSqlServerCatalogEdit(doc,'/tables/0/indexes/0/is_disabled','true');if(JSON.parse(u.exportSqlServerCatalog(edited)).state!=='modified'||JSON.parse(u.exportSqlServerCatalog(doc)).tables[0].indexes[0].is_disabled)throw Error('Copied edit differs');
  const exact=source.replace('"type_desc": "CLUSTERED COLUMNSTORE"','"future":9007199254740993.123456789,"type_desc": "CLUSTERED COLUMNSTORE"'),unknown=u.importSqlServerCatalog(exact,{id:'unknown'});if(!u.exportSqlServerCatalog(u.readDocument(u.writeDocument(unknown,'yaml'),'yaml')).includes('9007199254740993.123456789'))throw Error('Unknown precision lost');
  return {tables:view.tables.length,indexes:view.tables.reduce((n:number,t:any)=>n+t.indexes.length,0),recoveries:2,projections:2,indexLosses:projection.result.issues.filter((i:any)=>i.code==='INDEX_NOT_REPRESENTED').length,edits:1,unknownPrecisionPreserved:true,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },{source,view,projection});
 if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary');await Bun.write('fixtures/sqlserver/indexes-browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
