import {chromium} from 'playwright';
const fixture=await Bun.file('fixtures/postgresql/column-metadata.json').json();
const preservation=await Bun.file('fixtures/postgresql/edit-preservation.json').json();
const integers=await Bun.file('fixtures/postgresql/integer-tokens.json').json();
const built=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm',outdir:'.cache/postgresql-column-browser',naming:'umf.js'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/postgresql-column-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>PostgreSQL metadata</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async ({f,preservation,integers})=>{
  const path='/umf.js',u=await import(path),doc=u.importPostgresqlCatalogCapture(f.source,{id:'columns'});
  for(const format of ['json','yaml']){const back=u.readDocument(u.writeDocument(doc,format),format);if(JSON.stringify(u.getPostgresqlColumnMetadata(back))!==JSON.stringify(f.view))throw Error('Metadata differs');if(JSON.stringify(JSON.parse(u.exportPostgresqlCatalogCapture(back).json))!==JSON.stringify(JSON.parse(f.source)))throw Error('Capture differs');}
  const edited=u.proposePostgresqlCatalogEdit(doc,f.editedPath,'"Browser edit"').document;
  if(!u.getPostgresqlColumnMetadata(edited).some((c:any)=>c.element.description==='Browser edit')||u.getPostgresqlColumnMetadata(doc).some((c:any)=>c.element.description==='Browser edit'))throw Error('Edit differs');
  let rejected=0,unknownRecoveries=0;
  for(const mode of ['ast','catalog'])for(const location of ['payload','root','leaf','state']){
   if(mode==='ast'&&location==='state')continue;
   const source=structuredClone(preservation[mode]),key=mode==='ast'?'umf.postgresql':'umf.postgresql.catalog',p=source.modules[0].elements[0].extensions[key];
   (location==='payload'?p:location==='root'?p.root:location==='state'?p.root.members.state:mode==='ast'?p.root.members.version:p.root.members.serverVersion).future={meaning:'not understood'};
   const before=JSON.stringify(source),edit=mode==='ast'?u.proposePostgresqlNodeEdit:u.proposePostgresqlCatalogEdit;
   for(const [path,text] of [['',preservation.native[mode]],[mode==='ast'?'/version':'/serverVersion','170004'],[mode==='ast'?'/stmts/0/stmt/CreateStmt/relation/relname':'/snapshot/types/0/name','"changed"']]){
    let blocked=false;try{edit(source,path,text);}catch(e){blocked=['POSTGRESQL_REPRESENTATION','POSTGRESQL_CATALOG_EXPORT'].includes((e as {code:string}).code);}
    if(!blocked||JSON.stringify(source)!==before)throw Error('Unknown encoding edit loss');rejected++;
   }
   for(const format of ['json','yaml']){if(JSON.stringify(u.readDocument(u.writeDocument(source,format),format))!==before)throw Error('Unknown encoding recovery');unknownRecoveries++;}
  }
  if(rejected!==preservation.rejected)throw Error('Browser/Bun count differs');
  let integerRejections=0,integerRecoveries=0;
  for(const c of integers.cases)for(const operation of [()=>u.importPostgresqlCatalogCapture(c.input,{id:'invalid'}),()=>u.proposePostgresqlCatalogEdit(integers.original,c.path,c.replacement)]){try{operation();}catch(error){if(!String(error).includes('POSTGRESQL_CATALOG_INTEGER'))throw error;integerRejections++;continue;}throw Error('Inexact integer accepted');}
  for(const value of [integers.exact,integers.extended])for(const format of ['json','yaml']){const back=u.readDocument(u.writeDocument(value,format),format);if(u.exportPostgresqlCatalogCapture(back).json!==u.exportPostgresqlCatalogCapture(value).json)throw Error('Exact numeric recovery differs');integerRecoveries++;}
  return {integerRejections,integerRecoveries,columns:f.view.length,recoveries:2,edits:1,rejected,unknownRecoveries,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },{f:fixture,preservation,integers});
 if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary');await Bun.write('fixtures/postgresql/column-browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
