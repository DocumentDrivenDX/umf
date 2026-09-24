import relationships from '../../spec/core/relationship-document.schema.json';
import schemaV2 from '../../spec/core/key-operation-v2.schema.json';
import {copyJson} from './json';
import {UmfError,type Document,type Json} from './types';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import type {CoreKeyDefinition,CoreKeyFieldReference} from '../validation/keys';
import type {CoreKeyIdentity} from './key-tuple';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import availability from '../../spec/core/nullability-document.schema.json';import containers from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';import schema from '../../spec/core/key-operation.schema.json';
export interface CoreRecordIdentity {module:string;element:string}
export interface CoreKeyRequest {id:string;name:string;fields:CoreRecordIdentity[];primary?:boolean}
interface Declaration {version:'1.0.0'|'2.0.0';source:Document;target:Document;identity:CoreRecordIdentity;provenance:{origin:'authored';idealPath:string;basis:'explicit-author-declaration';nativePath:null;binding:{id:string;version:'1.0.0'|'2.0.0'}}}
export interface CoreKeyDeclaration extends Declaration {operation:'declare-core-key';request:CoreKeyRequest}
export interface CoreRecordMembersDeclaration extends Declaration {operation:'declare-core-record-members';request:CoreRecordIdentity[]}
export type CoreKeyMeaning={state:'missing'|'inapplicable'}|{state:'legacy';value:Json}|{state:'known'|'partial';keys:CoreKeyDefinition[];uninterpretedPaths:string[]};
export interface CoreKeyInspection {operation:'inspect-core-keys';version:'1.0.0'|'2.0.0';source:Document;identity:CoreRecordIdentity;path:string;meaning:CoreKeyMeaning;provenance:'unverified'}
export interface CoreKeyLookup {operation:'lookup-core-key';version:'1.0.0'|'2.0.0';source:Document;identity:CoreKeyIdentity;path:string;key:CoreKeyDefinition;uninterpretedPaths:string[];provenance:'unverified'}
export type CoreKeyOperation=CoreKeyDeclaration|CoreRecordMembersDeclaration|CoreKeyInspection|CoreKeyLookup;
const validator=createValidator();for(const s of [legacy,fields,availability,containers,facets,keys,relationships])validator.addSchema(s);
const checkV1=validator.compile(schema),checkV2=validator.compile(schemaV2),identityCheck=validator.compile(schema.$defs.identity),keyIdentityCheck=validator.compile(schema.$defs.keyIdentity),requestCheck=validator.compile(schema.$defs.keyRequest),membersCheck=validator.compile(schema.$defs.memberRequest);
const checker=(version:unknown)=>version==='2.0.0'?checkV2:checkV1;
const id=(r:CoreRecordIdentity)=>JSON.stringify([r.module,r.element]);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
function finish<T extends CoreKeyOperation>(result:T):T{const copied=copyJson(result),check=checker(result.version);if(!check(copied))throw new UmfError('CORE_KEY_RESULT',JSON.stringify(check.errors));return copied as unknown as T;}
function locate(input:Document,identityInput:CoreRecordIdentity){
 const source=copyJson(input) as unknown as Document,identity=copyJson(identityInput) as unknown as CoreRecordIdentity;
 if(!identityCheck(identity))throw new UmfError('CORE_KEY_IDENTITY','Expected exact module and element identity');
 const validation=validateDocument(source);if(!validation.valid)throw new UmfError('CORE_KEY_SOURCE',JSON.stringify(validation.diagnostics));
 const mi=source.modules.findIndex(m=>m.id===identity.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===identity.element)??-1;
 if(mi<0||ei<0)throw new UmfError('CORE_KEY_MISSING','Element identity does not resolve');
 return {source,identity,mi,ei,element:source.modules[mi]!.elements[ei]!,path:`/modules/${mi}/elements/${ei}`,validation};
}
const unknown=(diagnostics:ReturnType<typeof validateDocument>['diagnostics'],path:string)=>diagnostics.filter(d=>d.code==='UNKNOWN_KEY_QUALIFIER'&&(d.path===path||d.path.startsWith(path+'/'))).map(d=>d.path);
function record(located:ReturnType<typeof locate>){
 if(located.source.umf!=='0.6.0'&&located.source.umf!=='0.7.0')throw new UmfError('CORE_KEY_VERSION','Explicit Key envelope migration is required');
 if(located.element.kind!=='record')throw new UmfError('CORE_KEY_ROLE','Keys and membership apply only to explicit Records',located.path);
}
export function inspectCoreKeys(input:Document,identity:CoreRecordIdentity):CoreKeyInspection{
 const l=locate(input,identity),path=l.path+'/keys';let meaning:CoreKeyMeaning={state:'missing'};
 if(Object.hasOwn(l.element,'keys')){
  if(l.source.umf!=='0.6.0'&&l.source.umf!=='0.7.0')meaning={state:'legacy',value:copyJson(l.element.keys)};
  else{const uninterpretedPaths=unknown(l.validation.diagnostics,path);meaning={state:uninterpretedPaths.length?'partial':'known',keys:copyJson(l.element.keys) as unknown as CoreKeyDefinition[],uninterpretedPaths};}
 }else if((l.source.umf==='0.6.0'||l.source.umf==='0.7.0')&&l.element.kind!=='record')meaning={state:'inapplicable'};
 return finish({operation:'inspect-core-keys',version:l.source.umf==='0.7.0'?'2.0.0':'1.0.0',source:l.source,identity:l.identity,path,meaning,provenance:'unverified'});
}
export function lookupCoreKey(input:Document,identityInput:CoreKeyIdentity):CoreKeyLookup{
 const identity=copyJson(identityInput) as unknown as CoreKeyIdentity;if(!keyIdentityCheck(identity))throw new UmfError('CORE_KEY_IDENTITY','Explicit stable key identity is required');
 const l=locate(input,{module:identity.module,element:identity.element});record(l);
 const values=l.element.keys as CoreKeyDefinition[]|undefined,index=values?.findIndex(k=>k.id===identity.key)??-1;
 if(index<0)throw new UmfError('CORE_KEY_MISSING','Stable key ID does not resolve');const path=l.path+`/keys/${index}`;
 return finish({operation:'lookup-core-key',version:l.source.umf==='0.7.0'?'2.0.0':'1.0.0',source:l.source,identity,path,key:values![index]!,uninterpretedPaths:unknown(l.validation.diagnostics,path),provenance:'unverified'});
}
export function declareCoreRecordMembers(input:Document,identity:CoreRecordIdentity,requestInput:CoreRecordIdentity[]):CoreRecordMembersDeclaration{
 const request=copyJson(requestInput) as unknown as CoreRecordIdentity[];if(!membersCheck(request))throw new UmfError('CORE_MEMBERS_REQUEST','Expected exact ordered Field references');
 const l=locate(input,identity);record(l);const old=l.element.members as CoreKeyFieldReference[]|undefined;
 for(const ref of old??[])if(!request.some(r=>id(r)===id(ref))&&Object.keys(ref).some(k=>!['module','element'].includes(k)))throw new UmfError('CORE_MEMBERS_UNKNOWN','Cannot remove a member with unknown qualifiers',l.path+'/members');
 const target=copyJson(l.source) as unknown as Document;target.modules[l.mi]!.elements[l.ei]!.members=request.map(ref=>({...old?.find(r=>id(r)===id(ref)),...ref}));
 const validation=validateDocument(target);if(!validation.valid)throw new UmfError('CORE_MEMBERS_CONFLICT',JSON.stringify(validation.diagnostics));
 return finish({operation:'declare-core-record-members',version:l.source.umf==='0.7.0'?'2.0.0':'1.0.0',source:l.source,target,identity:l.identity,request,provenance:{origin:'authored',idealPath:l.path+'/members',basis:'explicit-author-declaration',nativePath:null,binding:{id:'umf.core.members.authoring',version:l.source.umf==='0.7.0'?'2.0.0':'1.0.0'}}});
}
export function declareCoreKey(input:Document,identity:CoreRecordIdentity,requestInput:CoreKeyRequest):CoreKeyDeclaration{
 const request=copyJson(requestInput) as unknown as CoreKeyRequest;if(!requestCheck(request))throw new UmfError('CORE_KEY_REQUEST','Expected key ID, name, ordered components and optional primary');
 const l=locate(input,identity);record(l);const old=(l.element.keys??[]) as CoreKeyDefinition[],index=old.findIndex(k=>k.id===request.id),previous=old[index];
 if(previous&&(previous.fields.length!==request.fields.length||previous.fields.some((ref,i)=>id(ref)!==id(request.fields[i]!))))throw new UmfError('CORE_KEY_ID_CONFLICT','Existing key ID cannot change its ordered component tuple',l.path+`/keys/${index}`);
 const next={...previous,...request,fields:request.fields.map((r,i)=>({...previous?.fields[i],...r}))},target=copyJson(l.source) as unknown as Document;
 const result=copyJson(old) as unknown as CoreKeyDefinition[];if(index<0)result.push(next);else result[index]=next;target.modules[l.mi]!.elements[l.ei]!.keys=result;
 const validation=validateDocument(target);if(!validation.valid)throw new UmfError('CORE_KEY_CONFLICT',JSON.stringify(validation.diagnostics));
 return finish({operation:'declare-core-key',version:l.source.umf==='0.7.0'?'2.0.0':'1.0.0',source:l.source,target,identity:l.identity,request,provenance:{origin:'authored',idealPath:l.path+`/keys/${index<0?old.length:index}`,basis:'explicit-author-declaration',nativePath:null,binding:{id:'umf.core.key.authoring',version:l.source.umf==='0.7.0'?'2.0.0':'1.0.0'}}});
}
/** Recomputes retained meaning and current context; not cryptographic authorship. */
export function verifyCoreKeyOperation(input:CoreKeyOperation,current:Document):CoreKeyOperation{
 const receipt=copyJson(input) as unknown as CoreKeyOperation;if(!checker(receipt.version)(receipt))throw new UmfError('CORE_KEY_RECEIPT','Malformed key operation');
 const expected=receipt.operation==='declare-core-key'?declareCoreKey(receipt.source,receipt.identity,receipt.request):receipt.operation==='declare-core-record-members'?declareCoreRecordMembers(receipt.source,receipt.identity,receipt.request):receipt.operation==='lookup-core-key'?lookupCoreKey(receipt.source,receipt.identity):inspectCoreKeys(receipt.source,receipt.identity);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('CORE_KEY_RECEIPT','Operation differs from retained source/request');
 if(canonical(copyJson(current))!==canonical(copyJson('target'in receipt?receipt.target:receipt.source)))throw new UmfError('CORE_KEY_STALE','Current document changed after operation');return receipt;
}
