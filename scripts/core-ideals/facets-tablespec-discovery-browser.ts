/** Real browser archive compatibility for native facet discovery inputs; not a facet binding. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const proofPath='fixtures/validation/facets-tablespec-profile-native.json',proof=await Bun.file(proofPath).json();
const bundle=await Bun.file('dist/umf.js').text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
 if(path==='/umf.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});
 if(path==='/cases')return Response.json(proof.declarations);
 return new Response('<!doctype html><html><body>TableSpec facet source recovery</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),rows=await(await fetch('/cases')).json();let recoveries=0,unsafeTokens=0;
  for(const row of rows){
   const original=u.importTableSpec(row.sourceText,{id:'facet-discovery:'+row.case,format:'json'});
   let doc=u.upgradeFieldEnvelope(original).target;doc=u.upgradeNullabilityEnvelope(doc).target;doc=u.upgradeCardinalityEnvelope(doc).target;doc=u.upgradeFacetEnvelope(doc).target;
   if(doc.umf!=='0.5.0'||doc.modules[0].elements[0].facets!==undefined)throw Error('Discovery inferred a facet: '+row.case);
   if(JSON.stringify(doc.extensions)!==JSON.stringify(original.extensions))throw Error('Migration changed native content');
   for(const format of ['json','yaml']){const result=u.readDocument(u.writeDocument(doc,format),format);if(u.exportTableSpec(result)!==row.sourceText)throw Error('Native recovery failed: '+row.case);recoveries++;}
   if(['length-unsafe-exact','decimal-unsafe-precision'].includes(row.case)){
    const column=u.getTableSpecColumn(doc,0),value=column.members[row.case.startsWith('length')?'length':'precision'];
    if(value.kind!=='number'||value.value!=='9007199254740993')throw Error('Exact native integer changed');unsafeTokens++;
   }
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:rows.length,recoveries,unsafeTokens,inferredFacets:0};
 });
 assert.deepEqual(checks,{cases:44,recoveries:88,unsafeTokens:2,inferredFacets:0});assert.equal(externalRequests.length,0);
 const paths=[proofPath,'scripts/core-ideals/facets-tablespec-discovery-browser.ts','tests/core-ideals/facets-tablespec-discovery.test.ts','dist/umf.js','src/adapters/tablespec/index.ts','src/model/native-json.ts','src/model/serialization.ts','src/model/field-transition.ts','src/model/nullability-transition.ts','src/model/cardinality-transition.ts','src/model/facet-transition.ts'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-tablespec-discovery-browser.json',JSON.stringify({scope:'Existing TableSpec archive recovery across core migrations for facet discovery inputs; no facet classification/projection or native equivalence claim',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
