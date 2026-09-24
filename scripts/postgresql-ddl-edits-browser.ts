import {chromium} from 'playwright';
const base='fixtures/postgresql/edits/',fixture=await Bun.file(base+'candidates.json').json(),oracle=await Bun.file(base+'oracle.json').json();
const built=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm',outdir:'.cache/postgresql-ddl-edits-browser',naming:'umf.js'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const path=new URL(req.url).pathname;if(path==='/umf.js')return new Response(Bun.file('.cache/postgresql-ddl-edits-browser/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/runtime.js')return new Response(Bun.file('dist/postgresql/runtime.js'),{headers:{'content-type':'text/javascript'}});if(path==='/libpg-query.wasm')return new Response(Bun.file('dist/postgresql/libpg-query.wasm'),{headers:{'content-type':'application/wasm'}});return new Response('<!doctype html><title>PostgreSQL edited DDL</title>');}});let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async({fixture:f,oracle})=>{
  const path='/umf.js',runtime='/runtime.js',u=await import(path),native=await import(runtime),source=await u.importPostgresqlSql(f.source,native.backend,{id:f.document.id});source.vocabularies['example.future']=f.document.vocabularies['example.future'];source.extensions=f.document.extensions;
  if(JSON.stringify(source)!==JSON.stringify(f.document))throw Error('Browser AST differs');let candidate=source;
  for(const edit of f.edits)candidate=u.proposePostgresqlNodeEdit(candidate,edit.path,edit.text).document;
  if(JSON.stringify(candidate)!==JSON.stringify(f.candidate)||JSON.stringify(source)!==JSON.stringify(f.document))throw Error('Proposal differs or changed source');
  for(const output of f.exports){const back=u.readDocument(u.writeDocument(candidate,output.format),output.format);if(await u.exportPostgresqlSql(back,native.backend)!==output.sql)throw Error('Regenerated SQL differs');}
  let captures=0;for(const c of oracle.captures)for(const format of ['json','yaml']){const back=u.readDocument(u.writeDocument(c.document,format),format);if(JSON.stringify(u.getPostgresqlColumnMetadata(back))!==JSON.stringify(c.columns))throw Error('Fresh catalog metadata differs');if(u.exportPostgresqlCatalogCapture(back).json!==u.exportPostgresqlCatalogCapture(c.document).json)throw Error('Fresh capture differs');captures++;}
  return {edits:f.edits.length,ddlRecoveries:f.exports.length,captureRecoveries:captures,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },{fixture,oracle});
 if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary');await Bun.write(base+'browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
