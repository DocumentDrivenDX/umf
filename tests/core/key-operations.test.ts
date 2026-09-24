import {test,expect} from 'bun:test';
import * as u from '../../src';
import {keyTransitionSource} from '../../scripts/core-key-transition-cases';
const record={module:'m',element:'record'},field={module:'m',element:'id'};
const source=()=>u.upgradeKeyEnvelope(keyTransitionSource(null)).target;
const authored=()=>u.declareCoreKey(u.declareCoreRecordMembers(source(),record,[field]).target,record,{id:'pk',name:'ID',fields:[field],primary:true});

test('public Key authoring, inspection and stable lookup preserve copied source and both serializations',()=>{
 const membership=u.declareCoreRecordMembers(source(),record,[field]),key=u.declareCoreKey(membership.target,record,{id:'pk',name:'ID',fields:[field],primary:true});
 expect(u.validateDocument(key.target).valid).toBe(true);expect(u.inspectCoreKeys(key.target,record).meaning.state).toBe('known');
 const lookup=u.lookupCoreKey(key.target,{...record,key:'pk'});expect(lookup.key.id).toBe('pk');expect(lookup.provenance).toBe('unverified');
 expect(()=>u.lookupCoreKey(key.target,{...record,key:'ID'})).toThrow('does not resolve');expect(()=>u.lookupCoreKey(key.target,record as any)).toThrow();
 for(const operation of [membership,key,lookup,u.inspectCoreKeys(key.target,record)])for(const format of ['json','yaml'] as const){
  const saved=u.readJsonValue(u.writeJsonValue(operation,format),format) as unknown as u.CoreKeyOperation;
  expect(u.verifyCoreKeyOperation(saved,'target'in saved?saved.target:saved.source)).toEqual(operation);
  const current='target'in saved?saved.target:saved.source;expect(u.readDocument(u.writeDocument(current,format),format)).toEqual(current);
 }
 expect(Object.hasOwn(membership.source.modules[0]!.elements[0]!,'members')).toBe(false);
 key.target.modules[0]!.elements[0]!.name='mutated';expect(Object.hasOwn(key.source.modules[0]!.elements[0]!,'name')).toBe(false);
});
test('key updates retain identity and unknowns, reject tuple changes and implicit primary demotion',()=>{
 const first=authored(),doc=structuredClone(first.target),r=doc.modules[0]!.elements[0]!;
 (r.keys as any[])[0].future={opaque:true};(r.keys as any[])[0].fields[0].future=false;(r.members as any[])[0].future='retain';
 const next=u.declareCoreKey(doc,record,{id:'pk',name:'Renamed',fields:[field]});
 const key=u.lookupCoreKey(next.target,{...record,key:'pk'}).key;expect(key.primary).toBe(true);expect(key.future).toEqual({opaque:true});expect(key.fields[0]!.future).toBe(false);
 expect(u.inspectCoreKeys(next.target,record).meaning.state).toBe('partial');
 expect(()=>u.encodeCoreKeyTuple(next.target,{...record,key:'pk'},[{integerToken:'1'}])).toThrow('Relevant qualifier');
 expect(()=>u.declareCoreRecordMembers(doc,record,[])).toThrow('unknown qualifiers');
 expect((u.declareCoreRecordMembers(doc,record,[field]).target.modules[0]!.elements[0]!.members as any[])[0].future).toBe('retain');
 const clean=authored().target;clean.modules[0]!.elements.push({id:'other',kind:'field',scalarType:'string',nullability:'required',cardinality:'one',extensions:{}});
 const members=u.declareCoreRecordMembers(clean,record,[field,{module:'m',element:'other'}]).target;
 expect(()=>u.declareCoreKey(members,record,{id:'pk',name:'changed',fields:[{module:'m',element:'other'}]})).toThrow('ordered component');
 expect(()=>u.declareCoreKey(members,record,{id:'other',name:'Other',fields:[{module:'m',element:'other'}],primary:true})).toThrow('KEY_PRIMARY_COUNT');
 const alternate=u.declareCoreKey(members,record,{id:'other',name:'Other',fields:[{module:'m',element:'other'}]});expect((alternate.target.modules[0]!.elements[0]!.keys as any[]).length).toBe(2);
 expect(()=>u.declareCoreKey(members,record,{id:'copy',name:'Copy',fields:[field]})).toThrow('KEY_DUPLICATE_SET');
 expect(()=>u.declareCoreRecordMembers(members,record,[{module:'m',element:'other'}])).toThrow('KEY_FIELD_OWNER');
});
test('operation verification rejects forged/stale context and old profiles remain opaque',()=>{
 const key=authored();for(const edit of [(r:any)=>r.target.modules[0].elements[0].keys[0].name='forged',(r:any)=>r.provenance.origin='classified',(r:any)=>r.request.name='different']){const forged=structuredClone(key);edit(forged);expect(()=>u.verifyCoreKeyOperation(forged,key.target)).toThrow();}
 expect(()=>u.verifyCoreKeyOperation(key,{...key.target,id:'other'})).toThrow('changed after');
 const legacy=keyTransitionSource({unknown:true});expect(u.inspectCoreKeys(legacy,record).meaning.state).toBe('legacy');expect(()=>u.declareCoreKey(legacy,record,{id:'x',name:'x',fields:[field]})).toThrow('migration');
 expect(u.inspectCoreKeys(source(),field).meaning.state).toBe('inapplicable');
 let calls=0;expect(()=>u.declareCoreKey(source(),record,{get id(){calls++;return 'x';},name:'x',fields:[field]})).toThrow();expect(calls).toBe(0);
});
test('0.6.0 core operations use new receipts and refuse changes invalidating keys',()=>{
 const doc=authored().target;
 const kind=u.declareCoreElementKind(doc,field,'field'),availability=u.declareCoreNullability(doc,field,'required'),cardinality=u.declareCoreCardinality(doc,field,{cardinality:'one'}),facet=u.declareCoreFacets(doc,field,{integerWidth:{bits:32,signed:true}});
 expect([kind.version,availability.version,cardinality.version,facet.version]).toEqual(['5.0.0','4.0.0','3.0.0','2.0.0']);
 for(const [r,verify] of [[kind,u.verifyCoreKindDeclaration],[availability,u.verifyCoreNullabilityDeclaration],[cardinality,u.verifyCoreCardinalityDeclaration],[facet,u.verifyCoreFacetDeclaration]] as const)for(const format of ['json','yaml'] as const){const saved=u.readJsonValue(u.writeJsonValue(r,format),format);expect((verify as any)(saved,r.target)).toEqual(r);}
 expect(u.inspectCoreElementKind(doc,field).version).toBe('5.0.0');expect(u.inspectCoreNullability(doc,field).version).toBe('4.0.0');expect(u.inspectCoreCardinality(doc,field).version).toBe('3.0.0');expect(u.inspectCoreFacets(doc,field).version).toBe('2.0.0');
 expect(()=>u.declareCoreElementKind(doc,field,'group')).toThrow();expect(()=>u.declareCoreNullability(doc,field,'absent-allowed')).toThrow();expect(()=>u.declareCoreCardinality(doc,field,{cardinality:'unspecified'})).toThrow();
 const old=keyTransitionSource(null);expect(u.declareCoreElementKind(old,field,'field').version).toBe('4.0.0');expect(u.declareCoreFacets(old,field,{integerWidth:{bits:32,signed:true}}).version).toBe('1.0.0');
 const nested=source();nested.modules[0]!.elements.push({id:'nested',kind:'field',extensions:{}});const recordAuthor=u.declareCoreElementKind(nested,record,'record'),fieldAuthor=u.declareCoreElementKind(recordAuthor.target,{module:'m',element:'nested'},'field');
 const typed=u.declareCoreRecordType(fieldAuthor,recordAuthor);expect(typed.version).toBe('5.0.0');expect(u.verifyCoreRecordTypeDeclaration(typed,typed.target)).toEqual(typed);
});
test('Key selection reports explicit member/component boundaries and traverses by identity',()=>{
 const doc=authored().target;doc.modules[0]!.elements[0]!.references=[];
 const direct=u.selectCoreElements(doc,{references:'none',identities:[record]});expect(direct.referenceScope).toBe('explicit-core-references-item-types-members-and-keys');expect(direct.selection).toHaveLength(1);expect(direct.boundaryMembers).toHaveLength(1);expect(direct.boundaryKeyFields?.[0]?.key).toBe('pk');
 const transitive=u.selectCoreElements(doc,{references:'transitive',identities:[record]});expect(transitive.selection).toHaveLength(2);expect(transitive.boundaryMembers).toEqual([]);expect(transitive.boundaryKeyFields).toEqual([]);
 for(const selection of [direct,transitive])for(const format of ['json','yaml'] as const){const saved=u.readJsonValue(u.writeJsonValue(selection,format),format);expect(u.verifyCoreElementSelection(saved as any)).toEqual(selection);}
 const forged=structuredClone(direct);forged.boundaryKeyFields![0]!.key='name';expect(()=>u.verifyCoreElementSelection(forged)).toThrow();
});

test('0.6.0 extension validators receive the actual key-bearing document and can reject it',()=>{
 const doc=authored().target,before=u.copyJson(doc);
 const manifest:u.ExtensionPackage={id:'future',version:'1.0.0',coreVersion:'0.1.0',description:'Synthetic context probe',schema:{type:'object'},semantics:'Inspect complete current source',scopes:['document','element'],capabilities:{validation:'semantic',directions:[],evidence:[]}};
 let calls=0;
 const registry=new u.Registry().register(manifest,(_,context)=>{calls++;expect(context.document.umf).toBe('0.6.0');expect((context.document.modules[0]!.elements[0]!.keys as any[])[0].id).toBe('pk');context.document.id='private copy';return [];});
 const result=u.validateDocument(doc,registry);expect(result.valid).toBe(true);expect(result.diagnostics.some(d=>d.code==='UNKNOWN_EXTENSION')).toBe(false);expect(calls).toBe(2);expect(u.copyJson(doc)).toEqual(before);
 const rejecting=new u.Registry().register(manifest,()=>[{code:'PROBE_REJECT',path:'/extensions/future',message:'Synthetic rejection',severity:'error'}]);
 expect(u.validateDocument(doc,rejecting).valid).toBe(false);expect(()=>u.selectCoreElements(doc,{references:'none'},rejecting)).toThrow('PROBE_REJECT');
});

test('member traversal terminates on cycles and component order cannot change under a stable key ID',()=>{
 const doc=authored().target;doc.modules[0]!.elements[1]!.references=[{role:'owner-link',...record}];
 expect(u.selectCoreElements(doc,{references:'transitive',identities:[record]}).selection).toHaveLength(2);
 const pair=source();pair.modules[0]!.elements.push({id:'b',kind:'field',scalarType:'integer',nullability:'required',cardinality:'one',extensions:{}});
 const refs=[field,{module:'m',element:'b'}],members=u.declareCoreRecordMembers(pair,record,refs);
 const key=u.declareCoreKey(members.target,record,{id:'both',name:'Both',fields:refs});
 expect(()=>u.declareCoreKey(key.target,record,{id:'both',name:'Renamed',fields:[...refs].reverse()})).toThrow('ordered component');
 expect(()=>u.declareCoreKey(key.target,record,{id:'duplicate',name:'Duplicate',fields:[...refs].reverse()})).toThrow('KEY_DUPLICATE_SET');
});
