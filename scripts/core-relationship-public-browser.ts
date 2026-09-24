import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {relationshipOperationCases,relationshipRequest} from './core-relationship-operation-cases';
import {relationshipCandidate} from './core-relationship-cases';
import {declareCoreRelationship,inspectCoreRelationships,lookupCoreRelationship} from '../src/model/relationships';
const bundle=await Bun.file('dist/umf.js').text();
const rows=relationshipOperationCases(),source=relationshipCandidate(),old=source.modules[0].relationships[0];
old.future={uninterpreted:true};old.target[0].future='retain';old.targetMultiplicity.future='retain';old.associationRecord={module:'m',element:'Enrollment',future:'retain'};
const request=relationshipRequest(old);request.name='renamed';rows.push({id:'retained-unknowns',source,identity:{module:'m'},request});
const cases=rows.map(row=>{const declaration=declareCoreRelationship(row.source,row.identity,row.request);return {...row,declaration,inspection:inspectCoreRelationships(declaration.target,row.identity),lookup:lookupCoreRelationship(declaration.target,{...row.identity,id:row.request.id})};});
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/candidate.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(cases);return new Response('<!doctype html><html><body>Relationship operations</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/candidate.js',u=await import(path),cases=await(await fetch('/cases')).json();let recoveries=0,refusals=0;
  const same=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Operation parity mismatch');};
  const refuses=(fn:()=>unknown)=>{let failed=false;try{fn();}catch{failed=true;}if(!failed)throw Error('Expected refusal');refusals++;};
  for(const row of cases){
   const before=JSON.stringify(row.source),r=u.declareCoreRelationship(row.source,row.identity,row.request);same(r,row.declaration);if(JSON.stringify(row.source)!==before)throw Error('Source mutated');
   const inspection=u.inspectCoreRelationships(r.target,row.identity),lookup=u.lookupCoreRelationship(r.target,{...row.identity,id:row.request.id});same(inspection,row.inspection);same(lookup,row.lookup);
   for(const operation of [r,inspection,lookup])for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(operation,format),format);same(u.verifyCoreRelationshipOperation(saved,r.target),operation);recoveries++;}
   const forged=structuredClone(r);forged.provenance.idealPath='/forged';refuses(()=>u.verifyCoreRelationshipOperation(forged,r.target));
   const changed=structuredClone(r.target);changed.id='changed';refuses(()=>u.verifyCoreRelationshipOperation(r,changed));
   const reassigned=structuredClone(row.request);reassigned.target[0].key='not-this-key';refuses(()=>u.declareCoreRelationship(r.target,row.identity,reassigned));
  }
  const retained=cases.find((r:any)=>r.id==='retained-unknowns'),change=structuredClone(retained.request);change.targetMultiplicity.min=0;
  refuses(()=>u.declareCoreRelationship(retained.declaration.target,retained.identity,change));
  if(retained.inspection.meaning.state!=='partial'||retained.lookup.relationship.associationRecord.future!=='retain')throw Error('Unknown meaning lost');
  let getterCalls=0;const bad=structuredClone(cases[0].request);Object.defineProperty(bad,'name',{enumerable:true,get(){getterCalls++;return 'bad';}});refuses(()=>u.declareCoreRelationship(cases[0].source,cases[0].identity,bad));
  const doc=cases[0].declaration.target,field={module:'m',element:'Order.id'},record={module:'m',element:'Order'};
  if(!u.validateDocument(doc).valid)throw Error('Public validation rejected relationship document');
  for(const format of ['json','yaml'])same(u.readDocument(u.writeDocument(doc,format),format),doc);
  const kind=u.declareCoreElementKind(doc,field,'field'),nullable=u.declareCoreNullability(doc,field,'required'),cardinality=u.declareCoreCardinality(doc,field,{cardinality:'one'}),facets=u.declareCoreFacets(doc,field,{integerWidth:{bits:32,signed:true}});
  same([kind.version,nullable.version,cardinality.version,facets.version],['6.0.0','5.0.0','4.0.0','3.0.0']);
  const key=u.declareCoreKey(doc,record,{id:'identity',name:'Renamed',fields:[field]});same(u.verifyCoreKeyOperation(key,key.target),key);
  const tuple=u.encodeCoreKeyTuple(doc,{...record,key:'identity'},[{integerToken:'1'}]);if(tuple.version!=='2.0.0')throw Error('Tuple receipt version');same(u.verifyCoreKeyTuple(tuple,doc),tuple);
  for(const [r,verify] of [[kind,u.verifyCoreKindDeclaration],[nullable,u.verifyCoreNullabilityDeclaration],[cardinality,u.verifyCoreCardinalityDeclaration],[facets,u.verifyCoreFacetDeclaration]])for(const format of ['json','yaml'])same(verify(u.readJsonValue(u.writeJsonValue(r,format),format),r.target),r);
  const selected=u.selectCoreElements(doc,{references:'transitive',identities:[record]});same(u.verifyCoreElementSelection(selected),selected);
  refuses(()=>u.declareCoreNullability(doc,field,'absent-allowed'));refuses(()=>u.declareCoreElementKind(doc,record,'group'));
  if(getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Host or getter behavior leaked');return {cases:cases.length,recoveries,refusals,getterCalls};
 });
 assert.equal(checks.cases,cases.length);assert.equal(checks.recoveries,cases.length*6);assert.equal(checks.refusals,cases.length*3+4);assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-relationship-public-browser.ts','src/index.ts','src/model/types.ts','src/model/field-kind.ts','src/model/record-type.ts','src/model/nullability.ts','src/model/cardinality.ts','src/model/facets.ts','src/model/keys.ts','src/model/key-tuple.ts','src/model/selection.ts','src/model/selection-verification.ts','tests/core/relationship-public.test.ts','scripts/core-relationship-versioned-schemas.ts','dist/umf.js','scripts/core-relationship-operation-cases.ts','scripts/core-relationship-operation-schema.ts','scripts/core-relationship-cases.ts','src/model/relationships.ts','src/validation/relationships.ts','src/validation/keys.ts','src/validation/document.ts','src/model/json.ts','src/model/serialization.ts','spec/core/relationship-document.schema.json','spec/core/relationship-operation.schema.json','tests/core/relationship-operations.test.ts'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/core-relationship-public-browser.json',JSON.stringify({scope:'Public 0.7.0 relationship operations, serialization and versioned earlier operations; full compatibility and native admission remain separate',browser:browser.version(),checks,externalRequests,bundleSha256:createHash('sha256').update(bundle).digest('hex'),sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
