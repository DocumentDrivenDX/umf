import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {facetCases,facetNumericTokens} from './core-facet-cases';
import {validateFacetElement} from '../src/validation/facets';
const entry='.cache/core-facet-browser-entry.ts';
await Bun.write(entry,"export {validateFacetElement} from '../src/validation/facets'; export {readJsonValue,writeJsonValue} from '../src/model/serialization';\n");
const built=await Bun.build({entrypoints:[entry],target:'browser',format:'esm'});assert.ok(built.success,JSON.stringify(built.logs));const bundle=await built.outputs[0]!.text();
const cases=facetCases().map(row=>({...row,expected:validateFacetElement(row.element)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
 if(path==='/candidate.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});
 if(path==='/cases')return Response.json({cases,tokens:facetNumericTokens});
 return new Response('<!doctype html><html><body>Candidate UMF facet validation</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/candidate.js',u=await import(path),fixture=await(await fetch('/cases')).json();let accepted=0,rejected=0,recoveries=0,tokenChecks=0;
  for(const row of fixture.cases){
   const before=JSON.stringify(row.element),result=u.validateFacetElement(row.element);
   if(JSON.stringify(result)!==JSON.stringify(row.expected)||result.valid!==row.valid||result.complete!==(row.valid&&!row.warnings))throw Error('Facet outcome mismatch: '+row.id);
   if(JSON.stringify(row.element)!==before)throw Error('Input mutated');if(result.valid)accepted++;else rejected++;
   for(const format of ['json','yaml']){const recovered=u.readJsonValue(u.writeJsonValue(row.element,format),format);if(JSON.stringify(recovered)!==before)throw Error('Recovery changed metadata');if(JSON.stringify(u.validateFacetElement(recovered))!==JSON.stringify(result))throw Error('Recovered validation differs');recoveries++;}
  }
  for(const row of fixture.tokens)for(const format of ['json','yaml']){
   const text='{"id":"v","kind":"field","scalarType":"string","extensions":{},"facets":{"length":{"max":'+row.token+',"unit":"unicode-scalar"}}}';let accepted=false;
   try{accepted=u.validateFacetElement(u.readJsonValue(text,format)).valid;}catch{}
   if(accepted!==row.accepted)throw Error('Numeric token mismatch: '+row.token);tokenChecks++;
  }
  let invoked=false;const hostile={id:'v',kind:'field',extensions:{},get facets(){invoked=true;return {};}};
  if(u.validateFacetElement(hostile).valid||invoked)throw Error('Accessor executed');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');
  return {cases:fixture.cases.length,accepted,rejected,recoveries,tokenChecks,accessorRefused:true};
 });
 assert.equal(externalRequests.length,0);assert.equal(checks.cases,99);assert.equal(checks.recoveries,198);assert.equal(checks.tokenChecks,18);
 const paths=['scripts/core-facet-browser.ts','scripts/core-facet-cases.ts','scripts/core-facet-schema.ts','src/validation/facets.ts','src/validation/schema.ts','src/model/json.ts','src/model/serialization.ts','spec/core/facet-document.schema.json','tests/core/facet-ideals.test.ts'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/core-facet-candidate-browser.json',JSON.stringify({scope:'Facet-local 0.5.0 schema/semantic validation and JSON/YAML metadata recovery; public document/authoring behavior is verified separately, and native bindings/admission remain pending',browser:browser.version(),checks,externalRequests,bundleSha256:createHash('sha256').update(bundle).digest('hex'),sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
