import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {keyTransitionSource} from './core-key-transition-cases';
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const p=new URL(request.url).pathname;
 if(p==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
 if(p==='/source')return Response.json(keyTransitionSource({native:'uninterpreted'}));
 return new Response('<!doctype html><html><body>Public UMF Key operations</body></html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),source=await(await fetch('/source')).json(),record={module:'m',element:'record'},field={module:'m',element:'id'};
  const same=(a:any,b:any)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Unexpected metadata change');};
  const fails=(fn:()=>unknown)=>{try{fn();}catch{return;}throw Error('Expected refusal');};
  const upgraded=u.upgradeKeyEnvelope(source),members=u.declareCoreRecordMembers(upgraded.target,record,[field]),key=u.declareCoreKey(members.target,record,{id:'pk',name:'ID',fields:[field],primary:true});
  if(!u.validateDocument(key.target).valid)throw Error('Public validation failed');
  const inspection=u.inspectCoreKeys(key.target,record),lookup=u.lookupCoreKey(key.target,{...record,key:'pk'});if(inspection.meaning.state!=='known'||lookup.key.id!=='pk')throw Error('Lookup differs');
  fails(()=>u.lookupCoreKey(key.target,{...record,key:'ID'}));fails(()=>u.lookupCoreKey(key.target,record));
  let operationRecoveries=0,documentRecoveries=0,versionedRecoveries=0,selectionRecoveries=0;
  for(const operation of [members,key,inspection,lookup])for(const format of ['json','yaml']){
   const saved=u.readJsonValue(u.writeJsonValue(operation,format),format),current=saved.target??saved.source;same(u.verifyCoreKeyOperation(saved,current),operation);operationRecoveries++;
   same(u.readDocument(u.writeDocument(current,format),format),current);documentRecoveries++;
  }
  const doc=key.target,kind=u.declareCoreElementKind(doc,field,'field'),availability=u.declareCoreNullability(doc,field,'required'),cardinality=u.declareCoreCardinality(doc,field,{cardinality:'one'}),facet=u.declareCoreFacets(doc,field,{integerWidth:{bits:32,signed:true}});
  same([kind.version,availability.version,cardinality.version,facet.version],['5.0.0','4.0.0','3.0.0','2.0.0']);
  for(const [receipt,verify] of [[kind,u.verifyCoreKindDeclaration],[availability,u.verifyCoreNullabilityDeclaration],[cardinality,u.verifyCoreCardinalityDeclaration],[facet,u.verifyCoreFacetDeclaration]])for(const format of ['json','yaml']){const saved=u.readJsonValue(u.writeJsonValue(receipt,format),format);same(verify(saved,receipt.target),receipt);versionedRecoveries++;}
  fails(()=>u.declareCoreElementKind(doc,field,'group'));fails(()=>u.declareCoreNullability(doc,field,'absent-allowed'));fails(()=>u.declareCoreCardinality(doc,field,{cardinality:'unspecified'}));
  const nested=structuredClone(upgraded.target);nested.modules[0].elements.push({id:'nested',kind:'field',extensions:{}});
  const recordAuthor=u.declareCoreElementKind(nested,record,'record'),fieldAuthor=u.declareCoreElementKind(recordAuthor.target,{module:'m',element:'nested'},'field'),typed=u.declareCoreRecordType(fieldAuthor,recordAuthor);
  if(typed.version!=='5.0.0')throw Error('Record type version mismatch');for(const format of ['json','yaml']){same(u.verifyCoreRecordTypeDeclaration(u.readJsonValue(u.writeJsonValue(typed,format),format),typed.target),typed);versionedRecoveries++;}
  const qualified=structuredClone(doc);qualified.modules[0].elements[0].keys[0].future={opaque:true};qualified.modules[0].elements[0].members[0].future=false;
  const preserved=u.declareCoreKey(qualified,record,{id:'pk',name:'Retained',fields:[field]});same(preserved.target.modules[0].elements[0].keys[0].future,{opaque:true});
  if(u.inspectCoreKeys(preserved.target,record).meaning.state!=='partial')throw Error('Unknown qualifier reinterpreted');fails(()=>u.declareCoreRecordMembers(qualified,record,[]));
  fails(()=>u.declareCoreKey(doc,record,{id:'pk',name:'Retuple',fields:[{module:'m',element:'group'}]}));
  const renamed=u.declareCoreKey(doc,record,{id:'pk',name:'Renamed',fields:[field]});if(!u.lookupCoreKey(renamed.target,{...record,key:'pk'}).key.primary)throw Error('Primary lost');
  fails(()=>u.verifyCoreKeyOperation(key,renamed.target));const forged=structuredClone(key);forged.target.modules[0].elements[0].keys[0].name='forged';fails(()=>u.verifyCoreKeyOperation(forged,doc));
  const tuple=u.encodeCoreKeyTuple(doc,{...record,key:'pk'},[{integerToken:'42'}]);if(tuple.bytesHex!=='554d464b310102023432'||u.readCoreKeyTupleBytes(tuple,doc).length!==10)throw Error('Public tuple mismatch');
  same(u.rollbackKeyEnvelope(upgraded,doc).target,source);
  const selectionSource=structuredClone(doc);selectionSource.modules[0].elements[0].references=[];selectionSource.modules[0].elements[1].references=[{role:'owner-link',...record}];
  const direct=u.selectCoreElements(selectionSource,{references:'none',identities:[record]}),transitive=u.selectCoreElements(selectionSource,{references:'transitive',identities:[record]});
  if(direct.boundaryMembers.length!==1||direct.boundaryKeyFields[0].key!=='pk'||transitive.selection.length!==2||transitive.boundaryMembers.length||transitive.boundaryKeyFields.length)throw Error('Selection boundary mismatch');
  for(const s of [direct,transitive])for(const format of ['json','yaml']){same(u.verifyCoreElementSelection(u.readJsonValue(u.writeJsonValue(s,format),format)),s);selectionRecoveries++;}
  const old=u.declareCoreElementKind(source,field,'field');if(old.version!=='4.0.0'||u.inspectCoreKeys(source,record).meaning.state!=='legacy')throw Error('Old profile reinterpreted');
  let registryCalls=0;const manifest={id:'future',version:'1.0.0',coreVersion:'0.1.0',description:'Synthetic browser context probe',schema:{type:'object'},semantics:'Check exact source',scopes:['document','element'],capabilities:{validation:'semantic',directions:[],evidence:[]}};
  const registry=new u.Registry().register(manifest,(_:unknown,c:any)=>{registryCalls++;if(c.document.umf!=='0.6.0'||c.document.modules[0].elements[0].keys[0].id!=='pk')throw Error('Incorrect registry context');return [];});if(!u.validateDocument(doc,registry).valid||registryCalls!==2)throw Error('Registry parity failed');
  let getterCalls=0;fails(()=>u.declareCoreKey(upgraded.target,record,{get id(){getterCalls++;return 'x';},name:'x',fields:[field]}));if(getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Host behavior leaked');
  return {operationRecoveries,documentRecoveries,versionedRecoveries,selectionRecoveries,registryCalls,getterCalls,legacyPreserved:true,unknownQualifiersPreserved:true,stableIdConflictRefused:true,tupleVerified:true,rollbackVerified:true,forgedAndStaleRefused:true};
 });
 assert.deepEqual(externalRequests,[]);assert.equal(checks.operationRecoveries,8);assert.equal(checks.documentRecoveries,8);assert.equal(checks.versionedRecoveries,10);assert.equal(checks.selectionRecoveries,4);
 const paths=['dist/umf.js','scripts/core-key-public-browser.ts','scripts/core-key-transition-cases.ts','src/index.ts','src/model/keys.ts','src/model/key-tuple.ts','src/model/key-transition.ts','src/model/types.ts','src/model/field-kind.ts','src/model/nullability.ts','src/model/cardinality.ts','src/model/facets.ts','src/model/record-type.ts','src/model/selection.ts','src/model/selection-verification.ts','src/validation/document.ts','src/validation/keys.ts','src/validation/schema.ts','tests/core/key-operations.test.ts','scripts/core-key-operation-schema.ts','scripts/core-key-versioned-schemas.ts',...['key-document','key-operation','key-transition','key-tuple-operation','key-selection','kind-operation-v5','record-type-operation-v5','nullability-operation-v4','cardinality-operation-v3','facet-operation-v2'].map(n=>'spec/core/'+n+'.schema.json')];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/core-key-public-browser.json',JSON.stringify({scope:'Public experimental Key 0.6.0 document/authoring/migration/tuple/selection and versioned core APIs; compatibility/native refresh and Key bindings remain pending',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}
