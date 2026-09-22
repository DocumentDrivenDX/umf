import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const proof='fixtures/validation/cardinality-parquet-projection-corpus.json';
const corpus=await Bun.file(proof).json(),native='fixtures/validation/cardinality-parquet-projection-native.json';
const evidence=await Bun.file(native).json();assert.equal(evidence.runtime,'PyArrow 21.0.0');
for(const [p,h] of Object.entries(evidence.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex'),h);
const cases=await Promise.all(corpus.cases.map(async(c:any)=>{
 const row=corpus.rows.find((r:any)=>r.id===c.id);
 if(!row)return c;
 const bytes=new Uint8Array(await Bun.file(row.path).arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
 return {...c,bytes:Array.from(bytes)};
}));
const build=await Bun.build({entrypoints:['src/index.ts'],target:'browser',format:'esm'});
assert.ok(build.success,JSON.stringify(build.logs));const bundle=await build.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/umf.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});
 if(path==='/cases')return Response.json(cases);
 return new Response('<!doctype html><html><body>Parquet Cardinality projection</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),cases=await(await fetch('/cases')).json();
  let projected=0,blocked=0,recoveries=0,forgedRefusals=0;
  for(const c of cases){
   const r=u.projectCardinalityToParquet(c.author,c.request);
   if(JSON.stringify(r)!==JSON.stringify(c.result))throw Error('Bun receipt parity: '+c.id);
   if(!r.target){blocked++;continue;}projected++;
   for(const format of ['json','yaml']){
    const saved=u.readJsonValue(u.writeJsonValue(r,format),format),ideal=u.recoverCardinalityFromParquet(saved,new Uint8Array(c.bytes));
    if(JSON.stringify(ideal)!==JSON.stringify(c.author.target))throw Error('Ideal changed');recoveries++;
   }
   const forged=structuredClone(r);forged.mapping.items[0].nativeIndex=999;
   let refused=false;try{u.recoverCardinalityFromParquet(forged,new Uint8Array(c.bytes));}catch{refused=true;}
   if(!refused)throw Error('Forged receipt accepted');forgedRefusals++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');
  return {cases:cases.length,projected,blocked,recoveries,forgedRefusals};
 });
 assert.equal(external.length,0);assert.equal(checks.cases,160);assert.equal(checks.recoveries,checks.projected*2);assert.equal(checks.forgedRefusals,checks.projected);
 const paths=[proof,native,'src/index.ts','src/core-ideals/cardinality-parquet-projection.ts','src/core-ideals/parquet-cardinality-carrier.ts','spec/core/cardinality-parquet-projection.schema.json','scripts/core-ideals/cardinality-parquet-projection-browser.ts','tests/core-ideals/cardinality-parquet-projection.test.ts',...corpus.rows.map((r:any)=>r.path)];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/cardinality-parquet-projection-browser.json',JSON.stringify({scope:'Authored Parquet Cardinality projection and retained ideal recovery; composed native recovery and acceptance remain unfinished',browser:browser.version(),checks,externalRequests:external,bundleSha256:createHash('sha256').update(bundle).digest('hex'),sha256,limits:['MAP projection in report mode retains uniqueness/key-carrier residuals; native enforcement is not inferred.','Record members are native observations; no core record definition is fabricated.','PyArrow independently validates generated schemas and row writes; these browser checks recover retained author meaning.']},null,2)+'\n');
 console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
