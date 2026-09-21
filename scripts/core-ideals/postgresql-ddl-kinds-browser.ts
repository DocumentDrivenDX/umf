import {chromium} from 'playwright';
const fixture=await Bun.file('fixtures/validation/postgresql-ddl-kinds-native.json').json();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
 if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/postgresql-runtime.js')return new Response(Bun.file('dist/postgresql/runtime.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/libpg-query.wasm')return new Response(Bun.file('dist/postgresql/libpg-query.wasm'),{headers:{'content-type':'application/wasm'}});
 if(path==='/cases')return Response.json(fixture);return new Response('<!doctype html><html><body>PostgreSQL declaration roles</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();const external:string[]=[];await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',runtime='/postgresql-runtime.js',u=await import(path),{backend}=await import(runtime),f=await(await fetch('/cases')).json();let recoveries=0,blocked=0;
  for(const row of f.rows){const result=await u.classifyPostgresqlDdlRecord(row.source,row.request,backend);if(JSON.stringify(result)!==JSON.stringify(row.result))throw Error('Classification parity');
   if(result.status==='blocked'){if('target'in result)throw Error('Partial record');blocked++;continue;}
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(result,format),format);if(await u.recoverPostgresqlDdlKinds(receipt,receipt.target,backend)!==row.case.sql)throw Error('Native recovery');recoveries++;}
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:f.rows.length,recoveries,blocked};
 });
 if(external.length)throw Error('External requests');await Bun.write('fixtures/validation/postgresql-ddl-kinds-browser.json',JSON.stringify({scope:'Declared-only pinned WASM AST classification and exact SQL receipt recovery',browser:browser.version(),checks,externalRequests:external},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
