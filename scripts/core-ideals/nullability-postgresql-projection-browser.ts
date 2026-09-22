import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const fixture=await Bun.file('fixtures/validation/nullability-postgresql-projection-native.json').json();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
 if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/postgresql-runtime.js')return new Response(Bun.file('dist/postgresql/runtime.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/libpg-query.wasm')return new Response(Bun.file('dist/postgresql/libpg-query.wasm'),{headers:{'content-type':'application/wasm'}});
 if(path==='/cases')return Response.json(fixture);return new Response('<!doctype html><html><body>Nullability PostgreSQL DDL</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();const external:string[]=[];await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',runtime='/postgresql-runtime.js',u=await import(path),{backend}=await import(runtime),f=await(await fetch('/cases')).json();let recoveries=0;
  let blocked=0,forgedRefusals=0;
  for(const row of f.rows){
   const result=await u.projectNullabilityToPostgresql(row.author,row.request,backend);
   if(JSON.stringify(result)!==JSON.stringify(row.result))throw Error('Native projection parity');
   if(result.status==='blocked'){if(result.target||result.nativeSql)throw Error('Partial blocked target');blocked++;continue;}
   await u.exportPostgresqlSql(result.target,backend);
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(result,format),format);if(JSON.stringify(await u.recoverNullabilityFromPostgresql(receipt,result.nativeSql,backend))!==JSON.stringify(row.author.target))throw Error('Ideal recovery');recoveries++;}
   const forged=structuredClone(result);forged.mapping.idealPath='/wrong';let refused=false;
   try{await u.recoverNullabilityFromPostgresql(forged,result.nativeSql,backend);}catch{refused=true;}if(!refused)throw Error('Forged receipt');forgedRefusals++;
  }
  let identifiers=0;for(const value of ['x'.repeat(64),'雪'.repeat(22),'\0',String.fromCharCode(0xd800)]){try{await u.projectNullabilityToPostgresql(f.rows[0].author,{...f.rows[0].request,tableName:value},backend);}catch{identifiers++;continue;}throw Error('Unsafe identifier');}
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:f.rows.length,blocked,recoveries,forgedRefusals,identifierRefusals:identifiers};
 });
 if(external.length)throw Error('External requests');const paths=['dist/umf.js','dist/postgresql/runtime.js','dist/postgresql/libpg-query.wasm','fixtures/validation/nullability-postgresql-projection-native.json','scripts/core-ideals/nullability-postgresql-projection-browser.ts'];const fingerprints=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));await Bun.write('fixtures/validation/nullability-postgresql-projection-browser.json',JSON.stringify({scope:'Pinned WASM syntax/AST parity and ideal recovery; native execution evidence recorded separately',fingerprints,browser:browser.version(),checks,externalRequests:external},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
