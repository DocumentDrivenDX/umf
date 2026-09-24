import {test,expect} from 'bun:test';
import * as u from '../../src';
import {relationshipCandidate} from '../../scripts/core-relationship-cases';

test('public 0.7.0 validation and document serialization retain authored relationships and reject broken targets',()=>{
 const d=relationshipCandidate();expect(u.validateDocument(d).valid).toBe(true);
 for(const format of ['json','yaml'] as const)expect(u.readDocument(u.writeDocument(d,format),format)).toEqual(d);
 d.modules[0].relationships[0].target[0].key='missing';expect(u.validateDocument(d).valid).toBe(false);expect(()=>u.writeDocument(d,'json')).toThrow();
});
test('earlier core operations use 0.7.0 receipts and refuse edits invalidating keyed endpoints',()=>{
 const doc=relationshipCandidate(),field={module:'m',element:'Order.id'},record={module:'m',element:'Order'};
 const kind=u.declareCoreElementKind(doc,field,'field'),availability=u.declareCoreNullability(doc,field,'required'),cardinality=u.declareCoreCardinality(doc,field,{cardinality:'one'}),facet=u.declareCoreFacets(doc,field,{integerWidth:{bits:32,signed:true}});
 expect([kind.version,availability.version,cardinality.version,facet.version]).toEqual(['6.0.0','5.0.0','4.0.0','3.0.0']);
 for(const [r,verify] of [[kind,u.verifyCoreKindDeclaration],[availability,u.verifyCoreNullabilityDeclaration],[cardinality,u.verifyCoreCardinalityDeclaration],[facet,u.verifyCoreFacetDeclaration]] as const)for(const format of ['json','yaml'] as const){const stored=u.readJsonValue(u.writeJsonValue(r,format),format);expect((verify as any)(stored,r.target)).toEqual(r);}
 expect(u.inspectCoreElementKind(doc,field).version).toBe('6.0.0');expect(u.inspectCoreNullability(doc,field).version).toBe('5.0.0');expect(u.inspectCoreCardinality(doc,field).version).toBe('4.0.0');expect(u.inspectCoreFacets(doc,field).version).toBe('3.0.0');
 const key=u.declareCoreKey(doc,record,{id:'identity',name:'Renamed',fields:[field]});expect(key.version).toBe('2.0.0');expect(u.verifyCoreKeyOperation(key,key.target)).toEqual(key);
 expect(u.inspectCoreKeys(doc,record).meaning.state).toBe('known');expect(u.lookupCoreKey(doc,{...record,key:'identity'}).version).toBe('2.0.0');
 const members=u.declareCoreRecordMembers(doc,record,[field]);expect(members.version).toBe('2.0.0');expect(u.verifyCoreKeyOperation(members,members.target)).toEqual(members);
 const tuple=u.encodeCoreKeyTuple(doc,{...record,key:'identity'},[{integerToken:'1'}]);expect(tuple.version).toBe('2.0.0');expect(u.verifyCoreKeyTuple(tuple,doc)).toEqual(tuple);
 expect(()=>u.declareCoreElementKind(doc,record,'group')).toThrow();expect(()=>u.declareCoreNullability(doc,field,'absent-allowed')).toThrow();expect(()=>u.declareCoreCardinality(doc,field,{cardinality:'array'})).toThrow();expect(()=>u.declareCoreRecordMembers(doc,record,[])).toThrow();
 doc.modules[0].elements.push({id:'nested',kind:'field',extensions:{}});const r=u.declareCoreElementKind(doc,record,'record'),f=u.declareCoreElementKind(r.target,{module:'m',element:'nested'},'field'),typed=u.declareCoreRecordType(f,r);expect(typed.version).toBe('6.0.0');expect(u.verifyCoreRecordTypeDeclaration(typed,typed.target)).toEqual(typed);
});
test('0.7.0 element selection retains full relationship context and the explicitly declared element traversal scope',()=>{
 const d=relationshipCandidate(),r=u.selectCoreElements(d,{references:'transitive',identities:[{module:'m',element:'Order'}]});
 expect(r.selection.map(e=>e.element.id)).toEqual(['Order','Order.id']);expect(r.source.modules[0]!.relationships).toEqual(d.modules[0].relationships);
 expect(u.verifyCoreElementSelection(r)).toEqual(r);
});
test('extension semantic validators receive the actual relationship-bearing 0.7.0 document',()=>{
 const d=relationshipCandidate(),manifest:u.ExtensionPackage={id:'future',version:'1.0.0',coreVersion:'0.1.0',description:'test',schema:true,semantics:'test',scopes:['document'],capabilities:{validation:'semantic',directions:[],evidence:[]}};
 let version='',seen=false;
 const registry=new u.Registry().register(manifest,(_payload,context)=>{version=context.document.umf;seen=Array.isArray(context.document.modules[0]!.relationships);return [{code:'CUSTOM',severity:'error',path:context.path,message:'deliberate refusal'}];});
 expect(u.validateDocument(d,registry).valid).toBe(false);expect(version).toBe('0.7.0');expect(seen).toBe(true);
});
