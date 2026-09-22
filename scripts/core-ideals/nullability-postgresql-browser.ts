import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const fixturePath='fixtures/validation/nullability-postgresql-native.json';
const fixture=await Bun.file(fixturePath).json();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(fixture);return new Response('<!doctype html><html><body>PostgreSQL availability discovery</body></html>',{headers:{'content-type':'text/html'}});}});
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
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');
  return {nativeCasesRetained:f.cases.length,catalogTreeRecoveries:recoveries};
 });
 if(external.length)throw Error('External requests');
 const paths=[fixturePath,'dist/umf.js','scripts/core-ideals/nullability-postgresql-browser.ts'];
 const fingerprints=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/nullability-postgresql-browser.json',JSON.stringify({scope:'Browser import and JSON/YAML recovery of the native availability catalog tree; PostgreSQL runs only in the native oracle, no ideal binding claim',browser:browser.version(),checks,externalRequests:external,fingerprints},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
