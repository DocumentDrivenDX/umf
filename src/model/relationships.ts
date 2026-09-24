import {copyJson} from './json';
import {UmfError,type Document,type Json,type Diagnostic} from './types';
import {validateDocument} from '../validation/document';
import {validateRelationshipCandidate,type RelationshipCandidate,type CoreRelationship,type RelationshipEndpoint,type RelationshipTarget,type RelationshipMultiplicity} from '../validation/relationships';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import availability from '../../spec/core/nullability-document.schema.json';import containers from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';import relationships from '../../spec/core/relationship-document.schema.json';import schema from '../../spec/core/relationship-operation.schema.json';
export interface RelationshipModuleIdentity {module:string}
export interface CoreRelationshipIdentity extends RelationshipModuleIdentity {id:string}
export interface CoreRelationshipRequest {id:string;name:string;source:RelationshipEndpoint[];target:RelationshipTarget[];sourceMultiplicity:RelationshipMultiplicity;targetMultiplicity:RelationshipMultiplicity;targetLifecycle:'owned'|'independent'|'unspecified';directed:boolean;inverse?:string|null;associationRecord?:RelationshipEndpoint}
type Source=Document|RelationshipCandidate;
interface OperationContext {diagnostics:Diagnostic[];residuals:[]}
export interface CoreRelationshipDeclaration extends OperationContext {operation:'declare-core-relationship';version:'1.0.0';source:RelationshipCandidate;target:RelationshipCandidate;identity:RelationshipModuleIdentity;request:CoreRelationshipRequest;provenance:{origin:'authored';idealPath:string;basis:'explicit-author-declaration';nativePath:null}}
export type CoreRelationshipMeaning={state:'missing'}|{state:'legacy';value:Json}|{state:'known'|'partial';relationships:CoreRelationship[];uninterpretedPaths:string[]};
export interface CoreRelationshipInspection extends OperationContext {operation:'inspect-core-relationships';version:'1.0.0';source:Source;identity:RelationshipModuleIdentity;path:string;meaning:CoreRelationshipMeaning;provenance:'unverified'}
export interface CoreRelationshipLookup extends OperationContext {operation:'lookup-core-relationship';version:'1.0.0';source:RelationshipCandidate;identity:CoreRelationshipIdentity;path:string;relationship:CoreRelationship;uninterpretedPaths:string[];provenance:'unverified'}
export type CoreRelationshipOperation=CoreRelationshipDeclaration|CoreRelationshipInspection|CoreRelationshipLookup;
const validator=createValidator();for(const s of [legacy,fields,availability,containers,facets,keys,relationships])validator.addSchema(s);
const check=validator.compile(schema),identityCheck=validator.compile(schema.$defs.identity),lookupCheck=validator.compile(schema.$defs.lookupIdentity),requestCheck=validator.compile(schema.$defs.request);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
const equal=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));
const endpoint=(ref:RelationshipEndpoint)=>JSON.stringify([ref.module,ref.element,...('key'in ref?[ref.key]:[])]);
const endpointSet=(refs:RelationshipEndpoint[])=>refs.map(endpoint).sort();
function finish<T>(r:T):T&OperationContext {
 const context=r as {source:Source;target?:Source},document=context.target??context.source;
 const validation=document.umf==='0.7.0'?validateRelationshipCandidate(document):validateDocument(document);
 const copied=copyJson({...r,diagnostics:validation.diagnostics,residuals:[]});
 if(!check(copied))throw new UmfError('RELATIONSHIP_RESULT',JSON.stringify(check.errors));return copied as unknown as T&OperationContext;
}
function locate(input:Source,identityInput:RelationshipModuleIdentity){
 const source=copyJson(input) as unknown as Source,identity=copyJson(identityInput) as unknown as RelationshipModuleIdentity;
 if(!identityCheck(identity))throw new UmfError('RELATIONSHIP_IDENTITY','Expected exact module identity');
 const validation=source.umf==='0.7.0'?validateRelationshipCandidate(source):validateDocument(source);
 if(!validation.valid)throw new UmfError('RELATIONSHIP_SOURCE',JSON.stringify(validation.diagnostics));
 const index=source.modules.findIndex(m=>m.id===identity.module);if(index<0)throw new UmfError('RELATIONSHIP_MISSING','Module does not resolve');
 return {source,identity,index,module:source.modules[index]!,path:`/modules/${index}/relationships`,validation};
}
const unknown=(l:ReturnType<typeof locate>,path:string)=>l.validation.diagnostics.filter(d=>d.code.startsWith('UNKNOWN_RELATIONSHIP_')&&(d.path===path||d.path.startsWith(path+'/'))).map(d=>d.path);
export function inspectCoreRelationships(input:Source,identity:RelationshipModuleIdentity):CoreRelationshipInspection {
 const l=locate(input,identity);let meaning:CoreRelationshipMeaning={state:'missing'};
 if(Object.hasOwn(l.module,'relationships')){
  if(l.source.umf!=='0.7.0')meaning={state:'legacy',value:copyJson(l.module.relationships)};
  else {const uninterpretedPaths=unknown(l,l.path);meaning={state:uninterpretedPaths.length?'partial':'known',relationships:copyJson(l.module.relationships) as unknown as CoreRelationship[],uninterpretedPaths};}
 }
 return finish({operation:'inspect-core-relationships',version:'1.0.0',source:l.source,identity:l.identity,path:l.path,meaning,provenance:'unverified'});
}
export function lookupCoreRelationship(input:Source,identityInput:CoreRelationshipIdentity):CoreRelationshipLookup {
 const identity=copyJson(identityInput) as unknown as CoreRelationshipIdentity;if(!lookupCheck(identity))throw new UmfError('RELATIONSHIP_IDENTITY','Expected stable relationship ID');
 const l=locate(input,{module:identity.module});if(l.source.umf!=='0.7.0')throw new UmfError('RELATIONSHIP_VERSION','Explicit relationship migration required');
 const values=(l.module.relationships??[]) as CoreRelationship[],index=values.findIndex(r=>r.id===identity.id);if(index<0)throw new UmfError('RELATIONSHIP_MISSING','Stable relationship ID does not resolve');
 const path=l.path+'/'+index;
 return finish({operation:'lookup-core-relationship',version:'1.0.0',source:l.source as RelationshipCandidate,identity,path,relationship:values[index]!,uninterpretedPaths:unknown(l,path),provenance:'unverified'});
}
export function declareCoreRelationship(input:Source,identity:RelationshipModuleIdentity,requestInput:CoreRelationshipRequest):CoreRelationshipDeclaration {
 const request=copyJson(requestInput) as unknown as CoreRelationshipRequest;if(!requestCheck(request))throw new UmfError('RELATIONSHIP_REQUEST','Expected complete known authored relationship');
 const l=locate(input,identity);if(l.source.umf!=='0.7.0')throw new UmfError('RELATIONSHIP_VERSION','Explicit relationship migration required');
 const values=(l.module.relationships??[]) as CoreRelationship[],index=values.findIndex(r=>r.id===request.id),old=values[index];
 if(old){
  if(!['owned','independent','unspecified'].includes(old.targetLifecycle))throw new UmfError('RELATIONSHIP_UNKNOWN','Future lifecycle cannot be edited');
  if(!equal(endpointSet(old.source),endpointSet(request.source))||!equal(endpointSet(old.target),endpointSet(request.target))||old.directed!==request.directed||!equal(old.associationRecord?endpoint(old.associationRecord):null,request.associationRecord?endpoint(request.associationRecord):old.associationRecord?endpoint(old.associationRecord):null))throw new UmfError('RELATIONSHIP_ID_CONFLICT','Existing ID cannot change association endpoints, target keys, direction or association Record',l.path+'/'+index);
  if(unknown(l,l.path+'/'+index).length&&(!equal([old.sourceMultiplicity.min,old.sourceMultiplicity.max,old.targetMultiplicity.min,old.targetMultiplicity.max,old.targetLifecycle],[request.sourceMultiplicity.min,request.sourceMultiplicity.max,request.targetMultiplicity.min,request.targetMultiplicity.max,request.targetLifecycle])))throw new UmfError('RELATIONSHIP_UNKNOWN','Unknown qualifiers prevent changing participation or lifecycle meaning');
 }
 const next={...old,...request,source:request.source.map(r=>({...old?.source.find(p=>endpoint(p)===endpoint(r)),...r})),target:request.target.map(r=>({...old?.target.find(p=>endpoint(p)===endpoint(r)),...r})),sourceMultiplicity:{...old?.sourceMultiplicity,...request.sourceMultiplicity},targetMultiplicity:{...old?.targetMultiplicity,...request.targetMultiplicity}} as CoreRelationship;
 if(request.associationRecord)next.associationRecord={...old?.associationRecord,...request.associationRecord};
 if(request.inverse===null)delete next.inverse;
 const target=copyJson(l.source) as unknown as RelationshipCandidate,updated=copyJson(values) as unknown as CoreRelationship[];
 if(index<0)updated.push(next);else updated[index]=next;target.modules[l.index]!.relationships=updated;
 const validation=validateRelationshipCandidate(target);if(!validation.valid)throw new UmfError('RELATIONSHIP_CONFLICT',JSON.stringify(validation.diagnostics));
 return finish({operation:'declare-core-relationship',version:'1.0.0',source:l.source as RelationshipCandidate,target,identity:l.identity,request,provenance:{origin:'authored',idealPath:l.path+'/'+(index<0?values.length:index),basis:'explicit-author-declaration',nativePath:null}});
}
export function verifyCoreRelationshipOperation(input:CoreRelationshipOperation,current:Source):CoreRelationshipOperation {
 const receipt=copyJson(input) as unknown as CoreRelationshipOperation;if(!check(receipt))throw new UmfError('RELATIONSHIP_RECEIPT','Malformed relationship operation');
 const expected=receipt.operation==='declare-core-relationship'?declareCoreRelationship(receipt.source,receipt.identity,receipt.request):receipt.operation==='lookup-core-relationship'?lookupCoreRelationship(receipt.source,receipt.identity):inspectCoreRelationships(receipt.source,receipt.identity);
 if(!equal(expected,receipt))throw new UmfError('RELATIONSHIP_RECEIPT','Operation differs from retained source/request');
 if(!equal(current,'target'in receipt?receipt.target:receipt.source))throw new UmfError('RELATIONSHIP_STALE','Current document changed after operation');return receipt;
}
