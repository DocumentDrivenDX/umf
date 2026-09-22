import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {cardinalitySelectionCases} from './cardinality-selection-cases';
import {selectCoreElements} from '../../src/model/selection';
const rows=cardinalitySelectionCases().map(c=>({...c,result:selectCoreElements(c.source,c.query)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(rows);return new Response('<!doctype html><html><body>Nullability selection</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),rows=await(await fetch('/cases')).json();let recoveries=0,refusals=0;
  if(u.coreCardinalitySelectionSchema.$id!=='urn:umf:core:element-selection:0.4.0')throw Error('Public report schema');
  for(const row of rows){const result=u.selectCoreElements(row.source,row.query);if(JSON.stringify(result)!==JSON.stringify(row.result))throw Error('Selection parity');if(JSON.stringify(result.selection.map((e:any)=>e.module+'.'+e.element.id))!==JSON.stringify(row.expected))throw Error('Independent identity expectation');if(result.boundaryReferences.length!==row.genericBoundary||result.boundaryItemTypes.length!==row.itemBoundary)throw Error('Boundary counts');
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(result,format),format);if(JSON.stringify(u.verifyCoreElementSelection(receipt))!==JSON.stringify(result))throw Error('Report recovery');recoveries++;}
   const changed=u.copyJson(result);changed.sourceValidation.diagnostics=[];let rejected=false;try{u.verifyCoreElementSelection(changed);}catch{rejected=true;}if(!rejected)throw Error('Lost diagnostics');refusals++;
  }
  const source=rows[0].source;
  const boundary=u.selectCoreElements(source,{identities:[{module:'sales',element:'rows'}],references:'none'});
  if(boundary.boundaryItemTypes.length!==1||boundary.boundaryReferences.length!==0)throw Error('Typed boundary lost');
  const erased=structuredClone(boundary);erased.boundaryItemTypes=[];let rejected=false;try{u.verifyCoreElementSelection(erased);}catch{rejected=true;}if(!rejected)throw Error('Boundary forgery');refusals++;
  const itemClosure=u.selectCoreElements(source,{identities:[{module:'sales',element:'rows'}],references:'transitive'});if(itemClosure.selection.length!==5||itemClosure.selection.some((e:any)=>['rows','tags'].includes(e.element.id)&&e.element.scalarType!==undefined))throw Error('Container/item confusion');
  for(const umf of ['0.1.0','0.2.0','0.3.0']){const legacy=structuredClone(source);legacy.umf=umf;legacy.modules[0].elements[1].itemType={module:'missing',element:'opaque'};
   const old=u.selectCoreElements(legacy,{identities:[{module:'sales',element:'rows'}],references:'transitive'});u.verifyCoreElementSelection(old);if(old.selection.length!==1||Object.hasOwn(old,'boundaryItemTypes'))throw Error('Legacy item interpretation');
   let rejected=false;try{u.selectCoreElements(legacy,{references:'none',cardinalities:['array']});}catch{rejected=true;}if(!rejected)throw Error('Legacy shape filter');refusals++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:rows.length,recoveries,refusals,legacyVerified:true};
 });
 if(external.length)throw Error('External requests');const paths=['scripts/core-ideals/cardinality-selection-browser.ts','scripts/core-ideals/cardinality-selection-cases.ts','src/model/selection.ts','src/model/selection-verification.ts','spec/core/cardinality-selection.schema.json','dist/umf.js'];const fingerprints=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));await Bun.write('fixtures/validation/cardinality-selection-browser.json',JSON.stringify({scope:'0.4.0 cardinality filtering, item/generic reference traversal and verified copied reports; older item/cardinality fields remain opaque',browser:browser.version(),checks,externalRequests:external,fingerprints},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
