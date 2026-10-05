import {test,expect} from 'bun:test';
import {copyJson} from '../../src/model/json';
import {readDocument,writeDocument} from '../../src/model/document';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {validateDocument} from '../../src/validation/document';
import {selectCoreElements} from '../../src/model/selection';
import {verifyCoreElementSelection} from '../../src/model/selection-verification';
import {Registry} from '../../src/registry/registry';
import {SemanticTypeRegistry} from '../../src/extensions/semantic-types';
import {inspectCoreSchemaProperties} from '../../src/model/schema-properties';
import {inspectCoreSemanticTypes,getCoreSemanticTypes,declareCoreSemanticTypes,verifyCoreSemanticTypeDeclaration,validateCoreSemanticTypeValue} from '../../src/model/semantic-types';
import {upgradeSemanticTypesEnvelope,rollbackSemanticTypesEnvelope,verifySemanticTypesTransition} from '../../src/model/semantic-types-transition';
import type {Document,JsonObject,ExtensionPackage} from '../../src/model/types';
const id={module:'contact',element:'email'};
const ref={vocabulary:'example.contact',version:'2026-01',term:'email'};
function document(version='0.9.0'):Document {return {umf:version,id:'semantic',title:'Contacts',vocabularies:{future:{version:'9.0.0'}},modules:[{id:'contact',namespace:'example',elements:[{id:'email',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',examples:[{string:'sample'}],default:{value:{string:'default'},on:'missing'},extensions:{future:{domain_type:'email',recipe:{type:'native'}}}},{id:'other',kind:'field',scalarType:'string',extensions:{}}]}]} as Document;}
const clone=<T>(v:T):T=>copyJson(v) as unknown as T;
const core=()=>{const doc=document();doc.modules[0]!.elements[0]!.semanticTypes=[ref];return doc;};
const payloadKey='umf.semantic-types';
function prototype(){const doc=document('0.8.0');doc.vocabularies[payloadKey]={version:'0.1.0'};doc.modules[0]!.elements[0]!.extensions[payloadKey]={types:[ref]};return doc;}

test('core reference structure is independent of extension registration, with inherited validation',()=>{
 const doc=core(),v=validateDocument(doc);expect(v.valid).toBe(true);expect(v.complete).toBe(false);
 expect(v.diagnostics.some(d=>d.code==='SEMANTIC_TYPE_EXTERNAL')).toBe(true);
 expect(v.diagnostics.some(d=>d.code==='UNKNOWN_CORE_FIELD'&&d.path.endsWith('/semanticTypes'))).toBe(false);
 for(const bad of [[],null,'email',[{}],[{...ref,version:''}],[{...ref,term:42}]]){const candidate=core();(candidate.modules[0]!.elements[0]! as any).semanticTypes=bad;expect(validateDocument(candidate).valid).toBe(false);}
 const invalid=core();invalid.modules[0]!.elements[0]!.default={value:{integerToken:'1'},on:'missing'};expect(validateDocument(invalid).valid).toBe(false);
 const broken=core();broken.modules[0]!.elements[0]!.references=[{role:'record-type',module:'missing',element:'missing'}];expect(validateDocument(broken).valid).toBe(false);
 const absent=document();expect(getCoreSemanticTypes(absent,id)).toBeUndefined();expect(inspectCoreSemanticTypes(absent,id).meaning.state).toBe('missing');
});
test('legacy lookalikes remain opaque and copied in every old profile',()=>{
 for(const version of ['0.1.0','0.2.0','0.3.0','0.4.0','0.5.0','0.6.0','0.7.0','0.8.0']){
  const doc=document(version);delete doc.modules[0]!.elements[0]!.default;delete doc.modules[0]!.elements[0]!.examples;
  (doc.modules[0]!.elements[0]! as any).semanticTypes={future:'opaque'};
  expect(validateDocument(doc).valid).toBe(true);expect(inspectCoreSemanticTypes(doc,id).meaning).toEqual({state:'legacy',value:{future:'opaque'}});
  expect(()=>getCoreSemanticTypes(doc,id)).toThrow();expect(()=>declareCoreSemanticTypes(doc,id,[ref])).toThrow();
 }
});
test('declared references, native metadata and unknown qualifiers survive both formats and copied reads',()=>{
 const doc=core();doc.modules[0]!.elements[0]!.semanticTypes=[{...ref,locale:{future:true}},{...ref,vocabulary:'competing'}];
 (doc as any).semanticTypes={root:'opaque'};doc.modules[0]!.semanticTypes={module:'opaque'};
 for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(doc,format),format);expect(restored).toEqual(doc);const got=getCoreSemanticTypes(restored,id)!;got[0]!.term='changed';expect(getCoreSemanticTypes(restored,id)![0]!.term).toBe('email');}
 const validation=validateDocument(doc);expect(validation.diagnostics.some(d=>d.code==='UNKNOWN_SEMANTIC_TYPE_QUALIFIER')).toBe(true);
 expect(validation.diagnostics.some(d=>d.code==='UNKNOWN_CORE_FIELD'&&d.path==='/semanticTypes')).toBe(true);
 const selection=selectCoreElements(doc,{references:'transitive',identities:[id]});expect(selection.selection).toHaveLength(1);expect(selection.selection[0]!.element.semanticTypes).toEqual(doc.modules[0]!.elements[0]!.semanticTypes);expect(verifyCoreElementSelection(selection)).toEqual(selection);
 const forged=clone(selection);(forged.selection[0]!.element.semanticTypes as any)[0].term='changed';expect(()=>verifyCoreElementSelection(forged)).toThrow();
});
test('extension semantic validators observe the complete 0.9.0 source',()=>{
 const doc=core();doc.vocabularies={probe:{version:'0.1.0'}};doc.modules[0]!.elements[0]!.extensions={probe:{}};
 const manifest:ExtensionPackage={id:'probe',version:'0.1.0',coreVersion:'0.1.0',description:'probe',schema:{type:'object'},semantics:'authored',scopes:['element'],capabilities:{validation:'semantic',directions:[],evidence:[]}};
 let observed:Document|undefined;const registry=new Registry().register(manifest,(_p,c)=>{observed=c.document;return [];});expect(validateDocument(doc,registry).valid).toBe(true);expect(observed).toEqual(doc);
});
test('copy-on-write declarations, clearing, exact identity, and verified stale refusal',()=>{
 const doc=document();const receipt=declareCoreSemanticTypes(doc,id,[ref]);expect(doc.modules[0]!.elements[0]!.semanticTypes).toBeUndefined();expect(receipt.target.modules[0]!.elements[0]!.extensions).toEqual(doc.modules[0]!.elements[0]!.extensions);
 expect(verifyCoreSemanticTypeDeclaration(receipt,receipt.target)).toEqual(receipt);
 for(const format of ['json','yaml'] as const){const restored=readJsonValue(writeJsonValue(receipt as any,format),format) as any;expect(verifyCoreSemanticTypeDeclaration(restored,restored.target)).toEqual(receipt);}
 const forged=clone(receipt);forged.provenance.origin='classified' as any;expect(()=>verifyCoreSemanticTypeDeclaration(forged,receipt.target)).toThrow();
 const stale=clone(receipt.target);stale.modules[0]!.elements[0]!.extensions.future={changed:true};expect(()=>verifyCoreSemanticTypeDeclaration(receipt,stale)).toThrow();
 expect(getCoreSemanticTypes(declareCoreSemanticTypes(receipt.target,id,null).target,id)).toBeUndefined();
 for(const bad of [[],[{}]])expect(()=>declareCoreSemanticTypes(doc,id,bad as any)).toThrow();
 for(const identity of [{module:'contact',element:'missing'},{...id,future:true},{module:'',element:'email'}])expect(()=>declareCoreSemanticTypes(doc,identity as any,[ref])).toThrow();
 const unknown=declareCoreSemanticTypes(doc,id,[{...ref,future:true}]).target;
 expect(()=>declareCoreSemanticTypes(unknown,id,null)).toThrow();expect(()=>declareCoreSemanticTypes(unknown,id,[ref])).toThrow();expect(declareCoreSemanticTypes(unknown,id,[{...ref,future:true}]).target).toEqual(unknown);
});
test('value evaluation requires explicit exact implementations and combines all checks',()=>{
 const doc=core();const registry=new SemanticTypeRegistry().register(ref,{},value=>({status:value==='ok'?'valid':'invalid',complete:true,issues:[]}));
 expect(validateCoreSemanticTypeValue(doc,id,'ok',registry)).toMatchObject({status:'valid',complete:true});
 expect(validateCoreSemanticTypeValue(doc,id,null,registry).status).toBe('invalid');
 doc.modules[0]!.elements[0]!.semanticTypes=[ref,{...ref,version:'next'}];
 expect(validateCoreSemanticTypeValue(doc,id,'ok',registry)).toMatchObject({status:'unknown',complete:false});
 expect(validateCoreSemanticTypeValue(doc,id,'bad',registry)).toMatchObject({status:'invalid',complete:false});
 expect(validateCoreSemanticTypeValue(document(),id,'ok',registry)).toMatchObject({status:'unknown',complete:false});
});
test('upgrade archives every legacy collision, keeps native context, and verifies both formats',()=>{
 const source=document('0.8.0');source.modules[0]!.elements[0]!.semanticTypes=[ref];(source.modules[0]!.elements[1]! as any).semanticTypes={future:'opaque'};source.semanticTypes={root:'opaque'};
 const receipt=upgradeSemanticTypesEnvelope(source);expect(receipt.target.umf).toBe('0.9.0');expect(receipt.residuals).toHaveLength(2);expect(receipt.target.modules[0]!.elements[0]!.semanticTypes).toBeUndefined();expect(receipt.target.semanticTypes).toEqual(source.semanticTypes);expect(receipt.source).toEqual(source);
 for(const format of ['json','yaml'] as const){const restored=readJsonValue(writeJsonValue(receipt as any,format),format) as any;expect(verifySemanticTypesTransition(restored)).toEqual(receipt);}
 const forged=clone(receipt);forged.residuals=[];expect(()=>verifySemanticTypesTransition(forged)).toThrow();
 const current=clone(receipt.target);current.modules[0]!.elements[0]!.extensions.future={edited:true};current.modules[0]!.elements[0]!.semanticTypes=[ref];
 const rollback=rollbackSemanticTypesEnvelope(receipt,current);expect(rollback.target).toEqual(source);expect(rollback.source).toEqual(current);expect(verifySemanticTypesTransition(rollback)).toEqual(rollback);
 const invalid=clone(current);invalid.id='different';expect(()=>rollbackSemanticTypesEnvelope(receipt,invalid)).toThrow();
 const forgedRollback=clone(rollback);forgedRollback.target.id='forged';expect(()=>verifySemanticTypesTransition(forgedRollback)).toThrow();
 expect(()=>upgradeSemanticTypesEnvelope(document('0.7.0'))).toThrow();
});
test('prototype conversion is opt-in and refuses collisions, unknown annotation meanings and wrong profiles',()=>{
 const doc=prototype();expect(upgradeSemanticTypesEnvelope(doc).target.modules[0]!.elements[0]!.semanticTypes).toBeUndefined();
 const converted=upgradeSemanticTypesEnvelope(doc,{migrateExtension:true});expect(getCoreSemanticTypes(converted.target,id)).toEqual([ref]);expect(converted.target.modules[0]!.elements[0]!.extensions).toEqual(doc.modules[0]!.elements[0]!.extensions);expect(verifySemanticTypesTransition(converted)).toEqual(converted);
 const qualified=prototype();(qualified.modules[0]!.elements[0]!.extensions[payloadKey] as JsonObject).types=[{...ref,future:true}];expect(getCoreSemanticTypes(upgradeSemanticTypesEnvelope(qualified,{migrateExtension:true}).target,id)![0]!.future).toBe(true);
 const unknown=prototype();(unknown.modules[0]!.elements[0]!.extensions[payloadKey] as JsonObject).future=true;expect(()=>upgradeSemanticTypesEnvelope(unknown,{migrateExtension:true})).toThrow();
 const conflict=prototype();conflict.modules[0]!.elements[0]!.semanticTypes=[ref];expect(()=>upgradeSemanticTypesEnvelope(conflict,{migrateExtension:true})).toThrow();
 const wrong=prototype();wrong.vocabularies[payloadKey]!.version='2.0.0';expect(()=>upgradeSemanticTypesEnvelope(wrong,{migrateExtension:true})).toThrow();
 const malformed=prototype();malformed.modules[0]!.elements[0]!.extensions[payloadKey]={types:[]};expect(()=>upgradeSemanticTypesEnvelope(malformed,{migrateExtension:true})).toThrow();
 expect(()=>upgradeSemanticTypesEnvelope(doc,{migrateExtension:true,future:true} as any)).toThrow();
});
test('getter inputs reject without execution',()=>{
 let executed=false;const doc=core();Object.defineProperty(doc.modules[0]!.elements[0]!,'semanticTypes',{enumerable:true,get(){executed=true;return [ref];}});
 expect(validateDocument(doc).valid).toBe(false);expect(()=>inspectCoreSemanticTypes(doc,id)).toThrow();expect(()=>declareCoreSemanticTypes(doc,id,[ref])).toThrow();expect(executed).toBe(false);
});

test('bare core references need no extension declaration, and release spellings are literal identities',()=>{
 const doc=core();doc.vocabularies={};doc.modules[0]!.elements[0]!.extensions={};
 const result=validateDocument(doc);expect(result.valid).toBe(true);expect(result.diagnostics.some(d=>d.code==='UNDECLARED_EXTENSION')).toBe(false);
 const literal={...ref,version:'^1.0.0'};doc.modules[0]!.elements[0]!.semanticTypes=[literal];
 const registry=new SemanticTypeRegistry().register({...ref,version:'1.0.0'},{},()=>({status:'valid',complete:true,issues:[]}));
 expect(validateCoreSemanticTypeValue(doc,id,'value',registry).status).toBe('unknown');
 registry.register(literal,{},()=>({status:'valid',complete:true,issues:[]}));expect(validateCoreSemanticTypeValue(doc,id,'value',registry).status).toBe('valid');
});

test('published corpus agrees with authored structural and inherited-semantic outcomes',async()=>{
 const {semanticTypesCases}=await import('../../scripts/core-semantic-types-cases');
 for(const row of semanticTypesCases())expect(validateDocument(row.document).valid).toBe(row.valid);
});

test('invalid rollback sources, malformed receipts and unsafe policy inputs reject',()=>{
 const receipt=upgradeSemanticTypesEnvelope(document('0.8.0'));
 for(const malformed of [null,{}, {...receipt,future:true}, {...receipt,request:{migrateExtension:false,future:true}}])expect(()=>verifySemanticTypesTransition(malformed as any)).toThrow();
 const invalid=clone(receipt.target);invalid.modules[0]!.elements[0]!.semanticTypes=[];
 expect(()=>rollbackSemanticTypesEnvelope(receipt,invalid)).toThrow();
 expect(()=>rollbackSemanticTypesEnvelope(receipt,receipt.source)).toThrow();
 let invoked=false;const policy=Object.defineProperty({},'migrateExtension',{enumerable:true,get(){invoked=true;return true;}});
 expect(()=>upgradeSemanticTypesEnvelope(receipt.source,policy as any)).toThrow();expect(invoked).toBe(false);
});

test('core declarations preserve an actual pinned TableSpec source through explicit migration and native export',async()=>{
 const u=await import('../../src/index');
 const native=await Bun.file('native/tablespec/sources/examples/providers.yaml').text();
 const imported=u.importTableSpec(native,{id:'provider-directory',format:'yaml'});
 const v2=u.upgradeFieldEnvelope(imported).target;
 const v3=u.upgradeNullabilityEnvelope(v2).target;
 const v4=u.upgradeCardinalityEnvelope(v3).target;
 const v5=u.upgradeFacetEnvelope(v4).target;
 const v6=u.upgradeKeyEnvelope(v5).target;
 const v7=u.upgradeRelationshipEnvelope(v6).target;
 const v8=u.upgradeSchemaPropertiesEnvelope(v7).target;
 const v9=upgradeSemanticTypesEnvelope(v8).target;
 const provider={module:'table',element:'column:0'};
 const authored=declareCoreSemanticTypes(v9,provider,[{vocabulary:'example.healthcare',version:'1.0.0',term:'provider_id'}]).target;
 for(const format of ['json','yaml'] as const){
  const restored=readDocument(writeDocument(authored,format),format);
  expect(u.exportTableSpec(restored)).toBe(native);
  expect(getCoreSemanticTypes(restored,provider)![0]!.term).toBe('provider_id');
 }
 expect(u.exportTableSpec(imported)).toBe(native);
},30_000);

test('core and prototype extension meanings that disagree are reported, agreeing ones are not',()=>{
 const agree=upgradeSemanticTypesEnvelope(prototype(),{migrateExtension:true}).target;
 expect(validateDocument(agree).diagnostics.some(d=>d.code==='SEMANTIC_TYPE_COMPETING_MEANING')).toBe(false);
 const edited=clone(agree);edited.modules[0]!.elements[0]!.semanticTypes=[{...ref,term:'other'}];
 const found=validateDocument(edited).diagnostics.filter(d=>d.code==='SEMANTIC_TYPE_COMPETING_MEANING');
 expect(found).toHaveLength(1);expect(found[0]!.severity).toBe('warning');expect(validateDocument(edited).valid).toBe(true);
});

test('0.9.0 diagnostics do not describe the document as 0.8.0',()=>{
 const messages=validateDocument(core()).diagnostics.map(d=>d.message);
 expect(messages.some(m=>m.includes('Experimental 0.8.0'))).toBe(false);
 expect(messages.some(m=>m.includes('inherited from 0.8.0'))).toBe(true);
});

test('0.8.0 schema-property authoring APIs reject 0.9.0 documents (documented limit)',()=>{
 expect(()=>inspectCoreSchemaProperties(core(),{scope:'element',...id})).toThrow('0.8.0');
});
