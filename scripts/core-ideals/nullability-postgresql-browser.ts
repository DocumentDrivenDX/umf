import {postgresqlNullabilityCases} from './nullability-postgresql-cases';
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const fixturePath='fixtures/validation/nullability-postgresql-native.json';
const fixture=await Bun.file(fixturePath).json();
const cases=postgresqlNullabilityCases(fixture.nativeSource);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(fixture);if(path==='/classification-cases')return Response.json(cases);return new Response('<!doctype html><html><body>PostgreSQL availability discovery</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 page.on('request',request=>{if(!request.url().startsWith(`http://127.0.0.1:${server.port}/`))external.push(request.url());});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),f=await(await fetch('/cases')).json();
  const source=u.importPostgresqlCatalogCapture(f.nativeSource,{id:'browser-nullability-discovery'});
  const expected=u.exportPostgresqlCatalogCapture(source).json;
  // Compare the retained native tree with the native oracle input, not merely with another library export.
  if(JSON.stringify(JSON.parse(expected))!==JSON.stringify(JSON.parse(f.nativeSource)))throw Error('Native tree changed on import');
  let recoveries=0;
  for(const format of ['json','yaml']){
   const restored=u.readJsonValue(u.writeJsonValue(source,format),format);
   if(u.exportPostgresqlCatalogCapture(restored).json!==expected)throw Error('Catalog tree changed');
   recoveries++;
  }
  const cases=await(await fetch('/classification-cases')).json();let classified=0,blocked=0,exactSourceRecoveries=0,forgedRefusals=0;
  for(const c of cases){
   const receipt=u.classifyPostgresqlNullability(c.source,c.request);
   if(receipt.status!==c.status||receipt.mapping.nullability!==c.expected)throw Error('Availability classification mismatch: '+c.id);
   if(!receipt.target){blocked++;continue;}classified++;
   for(const format of ['json','yaml']){const back=u.readJsonValue(u.writeJsonValue(receipt,format),format);if(u.recoverPostgresqlNullabilitySource(back,back.target)!==f.nativeSource)throw Error('Native source text loss');exactSourceRecoveries++;}
   const forged=structuredClone(receipt);forged.mapping.nativeFragment={kind:'null'};let refused=false;
   try{u.verifyPostgresqlNullabilityClassification(forged,forged.target);}catch{refused=true;}if(!refused)throw Error('Forged receipt accepted');forgedRefusals++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');
  return {nativeCasesRetained:f.cases.length,catalogTreeRecoveries:recoveries,classificationCases:cases.length,classified,blocked,exactSourceRecoveries,forgedRefusals};
 });
 if(external.length)throw Error('External requests');
 const paths=[fixturePath,'dist/umf.js','scripts/core-ideals/nullability-postgresql-browser.ts','scripts/core-ideals/nullability-postgresql-cases.ts','src/core-ideals/nullability-postgresql.ts','spec/core/postgresql-nullability-classification.schema.json','spec/extensions/postgresql-nullability/schema.json','spec/extensions/postgresql-nullability/package.json'];
 const fingerprints=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/nullability-postgresql-browser.json',JSON.stringify({scope:'Browser scoped availability classification, refusal and exact captured-source recovery through JSON/YAML; PostgreSQL runs only in the native oracle; authored projection and ideal recovery remain unfinished',browser:browser.version(),checks,externalRequests:external,fingerprints},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
