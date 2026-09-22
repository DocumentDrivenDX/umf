import {sqlserverNullabilityCases} from './nullability-sqlserver-cases';
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const fixturePath='fixtures/validation/nullability-sqlserver-native.json';
const fixture=await Bun.file(fixturePath).json(),cases=sqlserverNullabilityCases(fixture.nativeSource);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(fixture);if(path==='/classification-cases')return Response.json(cases);return new Response('<!doctype html><html><body>SQL Server availability discovery</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),f=await(await fetch('/cases')).json();
  const source=u.importSqlServerCatalog(f.nativeSource,{id:'browser-nullability-discovery'}),expected=JSON.parse(f.nativeSource);let recoveries=0;
  for(const format of ['json','yaml']){const restored=u.readDocument(u.writeDocument(source,format),format);if(JSON.stringify(JSON.parse(u.exportSqlServerCatalog(restored)))!==JSON.stringify(expected))throw Error('Native catalog/sidecar tree changed');recoveries++;}
  const cases=await(await fetch('/classification-cases')).json();let classified=0,blocked=0,exactSourceRecoveries=0,forgedRefusals=0;
  for(const c of cases){
   const receipt=u.classifySqlServerNullability(c.source,c.request);
   if(receipt.status!==c.status||receipt.mapping.nullability!==c.expected)throw Error('Classification mismatch '+c.id);
   if(!receipt.target){blocked++;continue;}classified++;
   for(const format of ['json','yaml']){const back=u.readJsonValue(u.writeJsonValue(receipt,format),format);if(u.recoverSqlServerNullabilitySource(back,back.target)!==f.nativeSource)throw Error('Native text loss');exactSourceRecoveries++;}
   const forged=structuredClone(receipt);forged.mapping.nativeFragment={kind:'null'};let refused=false;
   try{u.verifySqlServerNullabilityClassification(forged,forged.target);}catch{refused=true;}if(!refused)throw Error('Forged receipt');forgedRefusals++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');
  return {nativeCasesRetained:f.cases.length,catalogTreeRecoveries:recoveries,sidecarPreserved:true,classificationCases:cases.length,classified,blocked,exactSourceRecoveries,forgedRefusals};
 });
 if(external.length)throw Error('External requests');
 const paths=[fixturePath,'dist/umf.js','scripts/core-ideals/nullability-sqlserver-browser.ts','scripts/core-ideals/nullability-sqlserver-cases.ts','src/core-ideals/nullability-sqlserver.ts','spec/core/sqlserver-nullability-classification.schema.json','spec/extensions/sqlserver-nullability/native.schema.json','spec/extensions/sqlserver-nullability/schema.json','spec/extensions/sqlserver-nullability/package.json'];
 const fingerprints=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/nullability-sqlserver-browser.json',JSON.stringify({scope:'Browser scoped SQL Server availability classification and native source recovery through JSON/YAML; native behavior runs separately; authored projection remains unfinished',browser:browser.version(),checks,externalRequests:external,fingerprints},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
