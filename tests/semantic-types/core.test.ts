import {test,expect} from 'bun:test';
import {copyJson} from '../../src/model/json';
import {readDocument,writeDocument} from '../../src/model/document';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {validateDocument} from '../../src/validation/document';
import {selectCoreElements} from '../../src/model/selection';
import {Registry} from '../../src/registry/registry';
import {SemanticTypeRegistry} from '../../src/extensions/semantic-types';
import {inspectCoreSemanticTypes,getCoreSemanticTypes,declareCoreSemanticTypes,verifyCoreSemanticTypeDeclaration,validateCoreSemanticTypeValue} from '../../src/model/semantic-types';
import type {Document,ExtensionPackage} from '../../src/model/types';
const id={module:'contact',element:'email'};
const ref={vocabulary:'example.contact',version:'2026-01',term:'email'};
function document():Document{return {umf:'0.10.0',id:'semantic',title:'Contacts',vocabularies:{future:{version:'0.1.0'}},modules:[{id:'contact',namespace:'example',elements:[{id:'email',kind:'field',scalarType:'string',extensions:{future:{domain_type:'email',recipe:{type:'native'}}}},{id:'other',kind:'field',scalarType:'string',extensions:{}}]}]};}
const clone=<T>(v:T):T=>copyJson(v) as unknown as T;
const core=()=>{const doc=document();doc.modules[0]!.elements[0]!.semanticTypes=[ref];return doc;};

test('current core references validate independently from extension registration',()=>{
 const doc=core(),v=validateDocument(doc);expect(v.valid).toBe(true);expect(v.complete).toBe(false);
 expect(v.diagnostics.some(d=>d.code==='SEMANTIC_TYPE_EXTERNAL')).toBe(true);
 expect(inspectCoreSemanticTypes(doc,id).meaning).toEqual({state:'declared',types:[ref]});
 const retired=clone(doc);(retired as {umf:string}).umf='0.9.0';expect(()=>inspectCoreSemanticTypes(retired,id)).toThrow();
 for(const bad of [[],null,'email',[{}],[{...ref,version:''}],[{...ref,term:42}]]){const candidate=core();(candidate.modules[0]!.elements[0]! as any).semanticTypes=bad;expect(validateDocument(candidate).valid).toBe(false);}
 const absent=document();expect(getCoreSemanticTypes(absent,id)).toBeUndefined();expect(inspectCoreSemanticTypes(absent,id).meaning.state).toBe('missing');
});

test('declared references, unknown qualifiers and native context survive serialization and selection',()=>{
 const doc=core();doc.modules[0]!.elements[0]!.semanticTypes=[{...ref,locale:{future:true}},{...ref,vocabulary:'competing'}];
 for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(doc,format),format);expect(restored).toEqual(doc);const got=getCoreSemanticTypes(restored,id)!;got[0]!.term='changed';expect(getCoreSemanticTypes(restored,id)![0]!.term).toBe('email');}
 const validation=validateDocument(doc);expect(validation.diagnostics.some(d=>d.code==='UNKNOWN_SEMANTIC_TYPE_QUALIFIER')).toBe(true);
 const selection=selectCoreElements(doc,{references:'transitive',identities:[id]});expect(selection.selection).toHaveLength(1);expect(selection.selection[0]!.element.semanticTypes).toEqual(doc.modules[0]!.elements[0]!.semanticTypes);expect(selection.source).toEqual(doc);
 (selection.selection[0]!.element.semanticTypes as any)[0].term='changed';expect(getCoreSemanticTypes(doc,id)![0]!.term).toBe('email');
});

test('copy-on-write declarations and verified stale refusal preserve the source',()=>{
 const doc=document(),receipt=declareCoreSemanticTypes(doc,id,[ref]);expect(doc.modules[0]!.elements[0]!.semanticTypes).toBeUndefined();expect(verifyCoreSemanticTypeDeclaration(receipt,receipt.target)).toEqual(receipt);
 for(const format of ['json','yaml'] as const){const round=readJsonValue(writeJsonValue(receipt as any,format),format) as any;expect(verifyCoreSemanticTypeDeclaration(round,round.target)).toEqual(receipt);}
 const forged=clone(receipt);forged.provenance.origin='classified' as any;expect(()=>verifyCoreSemanticTypeDeclaration(forged,receipt.target)).toThrow();
 const stale=clone(receipt.target);stale.modules[0]!.elements[0]!.extensions.future={changed:true};expect(()=>verifyCoreSemanticTypeDeclaration(receipt,stale)).toThrow();
 expect(getCoreSemanticTypes(declareCoreSemanticTypes(receipt.target,id,null).target,id)).toBeUndefined();
 for(const bad of [[],[{}]])expect(()=>declareCoreSemanticTypes(doc,id,bad as any)).toThrow();
});

test('explicit exact registry implementations evaluate values without inventing meaning',()=>{
 const doc=core(),registry=new SemanticTypeRegistry().register(ref,{},value=>({status:value==='ok'?'valid':'invalid',complete:true,issues:[]}));
 expect(validateCoreSemanticTypeValue(doc,id,'ok',registry)).toMatchObject({status:'valid',complete:true});
 expect(validateCoreSemanticTypeValue(doc,id,null,registry).status).toBe('invalid');
 doc.modules[0]!.elements[0]!.semanticTypes=[ref,{...ref,version:'next'}];expect(validateCoreSemanticTypeValue(doc,id,'ok',registry)).toMatchObject({status:'unknown',complete:false});
 expect(validateCoreSemanticTypeValue(doc,id,'bad',registry)).toMatchObject({status:'invalid',complete:false});
});

test('extension semantic validators observe the complete current source',()=>{
 const doc=core();doc.vocabularies={probe:{version:'0.1.0'}};doc.modules[0]!.elements[0]!.extensions={probe:{}};
 const manifest:ExtensionPackage={id:'probe',version:'0.1.0',coreVersion:'0.10.0',description:'probe',schema:{type:'object'},semantics:'authored',scopes:['element'],capabilities:{validation:'semantic',directions:[],evidence:[]}};
 let observed:Document|undefined;const registry=new Registry().register(manifest,(_p,c)=>{observed=c.document;return [];});expect(validateDocument(doc,registry).valid).toBe(true);expect(observed).toEqual(doc);
});

test('authored corpus agrees with current validation',async()=>{
 const {semanticTypesCases}=await import('../../scripts/core-semantic-types-cases');for(const row of semanticTypesCases())expect(validateDocument(row.document).valid).toBe(row.valid);
});
