import {chromium} from 'playwright';
const fixture=await Bun.file('fixtures/validation/tablespec-chains.json').json();
const built=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm',outdir:'.cache/tablespec-chains-browser',naming:'umf.js'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(Bun.file('.cache/tablespec-chains-browser/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>TableSpec projection chains</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async(fixture)=>{
  const path='/umf.js',u=await import(path),same=(a:any,b:any)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Chain differs');};let recoveries=0;
  for(const c of fixture.cases){for(const format of ['json','yaml']){const result=u.projectToTableSpecViaAvro(u.readDocument(u.writeDocument(c.source,format),format),c.policy);same(result,c.result);same(JSON.parse(u.exportTableSpec(u.readDocument(u.writeDocument(result.target,format),format))),JSON.parse(c.result.nativeSchema));recoveries++;}
   const first=u.projectToTableSpecViaAvro(c.source,{...c.policy,toAvro:{...c.policy.toAvro,lossPolicy:'strict'}}),second=u.projectToTableSpecViaAvro(c.source,{...c.policy,toTableSpec:{...c.policy.toTableSpec,lossPolicy:'strict'}});if(first.status!=='blocked'||first.stages.avroToTableSpec||first.target||second.status!=='blocked'||!second.stages.avroToTableSpec||second.target)throw Error('Blocked-stage boundary');
  }
  return {cases:fixture.cases.length,recoveries,stageBlockingChecks:fixture.cases.length*2,stageIssues:fixture.cases.map((c:any)=>({kind:c.kind,first:c.result.stages.sourceToAvro.issues.length,second:c.result.stages.avroToTableSpec.issues.length})),nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },fixture);if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary');await Bun.write('fixtures/validation/tablespec-chains-browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}
