import {chromium} from 'playwright';
const fixture=await Bun.file('fixtures/postgresql/ddl-declarations.json').json(),source=await Bun.file('fixtures/postgresql/declarations.sql').text();
const built=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm',outdir:'.cache/postgresql-declarations-browser',naming:'umf.js'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const path=new URL(req.url).pathname;if(path==='/umf.js')return new Response(Bun.file('.cache/postgresql-declarations-browser/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/postgresql-runtime.js')return new Response(Bun.file('dist/postgresql/runtime.js'),{headers:{'content-type':'text/javascript'}});if(path==='/libpg-query.wasm')return new Response(Bun.file('dist/postgresql/libpg-query.wasm'),{headers:{'content-type':'application/wasm'}});return new Response('<!doctype html><title>PostgreSQL declarations</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async({fixture:f,source})=>{
  const path='/umf.js',runtime='/postgresql-runtime.js',u=await import(path),native=await import(runtime),doc=await u.importPostgresqlSql(source,native.backend,{id:'browser'}),view=u.getPostgresqlDdlDeclarations(doc);if(JSON.stringify(view)!==JSON.stringify(f.view))throw Error('Native browser declaration view differs');
  for(const output of f.exports){const back=u.readDocument(u.writeDocument(doc,output.format),output.format);if(JSON.stringify(u.getPostgresqlDdlDeclarations(back))!==JSON.stringify(view)||await u.exportPostgresqlSql(back,native.backend)!==output.sql)throw Error('Recovery differs');}
  const c=view.declarations[1].columns[0],edited=u.proposePostgresqlNodeEdit(doc,c.path+'/colname','"browser_id"');if(u.getPostgresqlDdlDeclarations(edited.document).declarations[1].columns[0].element.name!=='browser_id')throw Error('Edit not reflected');
  return {declarations:view.declarations.length,columns:view.declarations.reduce((n:number,d:any)=>n+d.columns.length,0),recoveries:2,edits:1,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },{fixture,source});
 if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary');await Bun.write('fixtures/postgresql/ddl-declarations-browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
