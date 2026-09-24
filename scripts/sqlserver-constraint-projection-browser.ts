import {chromium} from 'playwright';
const fixture=await Bun.file('fixtures/sqlserver/constraint-projections.json').json();
const built=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm',outdir:'.cache/sqlserver-constraint-projection-browser',naming:'umf.js'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/sqlserver-constraint-projection-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>SQL Server constraint projection</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async f=>{
  const path='/umf.js',u=await import(path);let recoveries=0,constraintIssues=0;
  for(const c of f.cases){const r=u.projectSqlServerToAvro(c.result.source,c.policy);if(JSON.stringify(r)!==JSON.stringify(c.result))throw Error('Projection differs');
   for(const output of c.exports){const back=u.readDocument(u.writeDocument(r.target,output.format),output.format);if(u.exportAvroSchema(back)!==output.schema)throw Error('Target differs');recoveries++;}
   if(u.projectSqlServerToAvro(c.result.source,{...c.policy,lossPolicy:'strict'}).status!=='blocked')throw Error('Strict policy not enforced');constraintIssues+=r.issues.filter((i:any)=>['KEY_NOT_ENFORCED','FOREIGN_KEY_NOT_ENFORCED','CHECK_NOT_ENFORCED'].includes(i.code)).length;
  }
  return {tables:f.cases.length,recoveries,constraintIssues,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },fixture);
 if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary');await Bun.write('fixtures/sqlserver/constraint-projection-browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
