import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {facetCases} from './core-facet-cases';
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
 if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/cases')return Response.json(facetCases());return new Response('<!doctype html><html><body>Core facet migration and authoring</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),cases=await(await fetch('/cases')).json(),identity={module:'m',element:'v'};
  const equal=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Recovery mismatch');};
  let documentRecoveries=0,transitionRecoveries=0,authorRecoveries=0,priorRecoveries=0,selectionRecoveries=0,refusals=0;
  const wrap=(element:any,umf='0.5.0')=>({umf,id:'facets',vocabularies:{},modules:[{id:'m',namespace:'',elements:[element]}]});
  for(const row of cases){const doc=wrap(row.element);if(u.validateDocument(doc).valid!==row.valid)throw Error('Public facet validation: '+row.id);if(row.valid)for(const format of ['json','yaml']){equal(u.readDocument(u.writeDocument(doc,format),format),doc);documentRecoveries++;}}
  for(const value of [null,false,0,'',[],{},'future',{integerWidth:{bits:8,signed:true}},{precision:3,scale:4}]){
   const source=wrap({id:'v',kind:'field',scalarType:'integer',facets:value,extensions:{}},'0.4.0');source.modules[0]!.elements.push({id:'record',kind:'record',facets:value,extensions:{}});
   const r=u.upgradeFacetEnvelope(source);if(r.residuals.length!==2)throw Error('Missing legacy collision');
   r.target.modules[0].elements[0].facets={integerWidth:{bits:16,signed:true}}; // Treat later state separately from the verified receipt.
   const current=r.target,original=u.upgradeFacetEnvelope(source);
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(original,format),format),back=u.rollbackFacetEnvelope(saved,current);equal(back.target,source);equal(back.source,current);transitionRecoveries++;}
   const forged=structuredClone(original);forged.residuals=[];let refused=false;try{u.rollbackFacetEnvelope(forged,current);}catch{refused=true;}if(!refused)throw Error('Forged migration');refusals++;
  }
  for(const [family,request] of [['string',{length:{max:8,unit:'unicode-scalar'}}],['binary',{length:{max:8,unit:'byte'}}],['decimal',{precision:38,scale:9}],['integer',{integerWidth:{bits:128,signed:false}}]]){
   const source=wrap({id:'v',kind:'field',scalarType:family,facets:{future:{native:'preserve'}},extensions:{}}),r=u.declareCoreFacets(source,identity,request);
   if(u.inspectCoreFacets(r.target,identity).meaning.state!=='partial')throw Error('Unknown facet meaning disappeared');equal(r.target.modules[0].elements[0].facets.future,{native:'preserve'});
   for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);equal(u.verifyCoreFacetDeclaration(saved,saved.target),r);authorRecoveries++;}
   const stale=structuredClone(r.target);stale.future='later';let refused=false;try{u.verifyCoreFacetDeclaration(r,stale);}catch{refused=true;}if(!refused)throw Error('Stale facets');refusals++;
  }
  const source=wrap({id:'v',kind:'field',scalarType:'integer',facets:{integerWidth:{bits:64,signed:true,future:{rule:'opaque'}}},extensions:{}});
  source.modules[0]!.elements.push({id:'list',kind:'field',cardinality:'array',itemType:{module:'m',element:'v'},extensions:{}},{id:'record',kind:'record',extensions:{}},{id:'object',kind:'field',extensions:{}});
  const kind=u.declareCoreElementKind(source,identity,'field'),availability=u.declareCoreNullability(source,identity,'required'),cardinality=u.declareCoreCardinality(source,identity,{cardinality:'one'}),record=u.declareCoreRecordType(u.declareCoreElementKind(source,{module:'m',element:'object'},'field'),u.declareCoreElementKind(source,{module:'m',element:'record'},'record'));
  equal([kind.version,availability.version,cardinality.version,record.version],['4.0.0','3.0.0','2.0.0','4.0.0']);
  for(const [r,verify] of [[kind,u.verifyCoreKindDeclaration],[availability,u.verifyCoreNullabilityDeclaration],[cardinality,u.verifyCoreCardinalityDeclaration],[record,u.verifyCoreRecordTypeDeclaration]])for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);equal(verify(saved,saved.target),r);priorRecoveries++;}
  for(const references of ['none','transitive']){const r=u.selectCoreElements(source,{references,identities:[{module:'m',element:'list'}],cardinalities:['array']});if(r.selection.length!==(references==='none'?1:2)||r.boundaryItemTypes.length!==(references==='none'?1:0))throw Error('Item selection');for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);equal(u.verifyCoreElementSelection(saved),r);selectionRecoveries++;}}
  const unknown=wrap({id:'v',kind:'field',scalarType:'string',facets:{length:{max:4,unit:'future'}},extensions:{}});equal(u.inspectCoreFacets(unknown,identity).meaning.interpreted,{});
  let refused=false;try{u.declareCoreFacets(unknown,identity,{length:{max:4,unit:'unicode-scalar'}});}catch{refused=true;}if(!refused)throw Error('Unknown unit overwritten');refusals++;
  let getterCalls=0,accessorRefused=false;try{u.declareCoreFacets(source,identity,{get integerWidth(){getterCalls++;return {bits:8,signed:true};}});}catch{accessorRefused=true;}if(!accessorRefused||getterCalls)throw Error('Accessor accepted or executed');refusals++;
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');
  return {cases:cases.length,documentRecoveries,transitionRecoveries,authorRecoveries,priorRecoveries,selectionRecoveries,refusals,getterCalls};
 });assert.equal(externalRequests.length,0);assert.deepEqual(checks,{cases:99,documentRecoveries:62,transitionRecoveries:18,authorRecoveries:8,priorRecoveries:8,selectionRecoveries:4,refusals:15,getterCalls:0});
 const paths=['scripts/core-facet-operations-browser.ts','scripts/core-facet-cases.ts','src/index.ts','src/model/types.ts','src/model/facets.ts','src/model/facet-transition.ts','src/model/field-kind.ts','src/model/record-type.ts','src/model/nullability.ts','src/model/cardinality.ts','src/model/selection.ts','src/model/selection-verification.ts','src/validation/document.ts','src/validation/schema.ts','src/validation/facets.ts','spec/core/facet-document.schema.json','spec/core/facet-transition.schema.json','spec/core/facet-operation.schema.json','spec/core/facet-selection.schema.json','spec/core/kind-operation-v4.schema.json','spec/core/record-type-operation-v4.schema.json','spec/core/nullability-operation-v3.schema.json','spec/core/cardinality-operation-v2.schema.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/core-facet-operations-browser.json',JSON.stringify({scope:'Experimental public 0.5.0 validation, facet migration/rollback, authoring/inspection, versioned prior authoring and item selection; native facet bindings and core acceptance refresh remain pending',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
