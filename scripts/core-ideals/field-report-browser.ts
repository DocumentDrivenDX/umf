import {chromium} from 'playwright';
const fixture=await Bun.file('fixtures/validation/field-report-corpus.json').json();
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
  for(const row of f.rows){const result=await u.inspectFieldProjection(row.receipt,backend);if(JSON.stringify(result)!==JSON.stringify(row.result))throw Error('Common metadata parity');for(const format of ['json','yaml']){const report=u.readJsonValue(u.writeJsonValue(result,format),format);if(JSON.stringify(await u.verifyFieldProjectionInspection(report,backend))!==JSON.stringify(result))throw Error('Report round trip');recoveries++;}const altered=structuredClone(result);altered.mapping.basis.nativeType='forged';let rejected=false;try{await u.verifyFieldProjectionInspection(altered,backend);}catch{rejected=true;}if(!rejected)throw Error('Tampered common basis');}
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:f.rows.length,recoveries};
 });
 if(external.length)throw Error('External requests');await Bun.write('fixtures/validation/field-report-browser.json',JSON.stringify({scope:'Common Field receipt recomputation and metadata parity; native execution not inferred',browser:browser.version(),checks,externalRequests:external},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
