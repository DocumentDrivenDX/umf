import {copyJson} from './json';
import {UmfError,type Document,type CoreSemanticTypeReference,type Diagnostic,type Json} from './types';
import {validateDocument} from '../validation/document';
import {checkSemanticTypeReferences} from '../validation/semantic-types';
import {checkSemanticTypeOperation,checkSemanticTypeIdentity,semanticTypesCanonical} from './semantic-types-receipts';
import {SemanticTypeRegistry,type SemanticTypeValueResult} from '../extensions/semantic-types';
export interface CoreSemanticTypeIdentity {module:string;element:string}
export type CoreSemanticTypeMeaning={state:'missing'}|{state:'legacy';value:Json}|{state:'declared';types:CoreSemanticTypeReference[]};
export interface CoreSemanticTypeInspection {operation:'inspect-core-semantic-types';version:'1.0.0';source:Document;identity:CoreSemanticTypeIdentity;path:string;meaning:CoreSemanticTypeMeaning;diagnostics:Diagnostic[]}
export interface CoreSemanticTypeDeclaration {operation:'declare-core-semantic-types';version:'1.0.0';source:Document;target:Document;identity:CoreSemanticTypeIdentity;request:{types:CoreSemanticTypeReference[]|null};diagnostics:Diagnostic[];provenance:{origin:'authored';path:string;basis:'explicit-author-declaration'}}
function locate(input:Document,identityInput:CoreSemanticTypeIdentity){
 const source=copyJson(input) as unknown as Document,identity=copyJson(identityInput) as unknown as CoreSemanticTypeIdentity;
 if(!checkSemanticTypeIdentity(identity))throw new UmfError('SEMANTIC_TYPE_IDENTITY','Expected exact nonempty module/element IDs');
 const validation=validateDocument(source);if(!validation.valid)throw new UmfError('SEMANTIC_TYPE_DOCUMENT',JSON.stringify(validation.diagnostics));
 const mi=source.modules.findIndex(m=>m.id===identity.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===identity.element)??-1;
 if(mi<0||ei<0)throw new UmfError('SEMANTIC_TYPE_MISSING','Element identity is absent');
 return {source,identity,mi,ei,element:source.modules[mi]!.elements[ei]!,path:`/modules/${mi}/elements/${ei}/semanticTypes`,validation};
}
function requireCore(source:Document){if(source.umf!=='0.9.0')throw new UmfError('SEMANTIC_TYPE_VERSION','Explicit 0.9.0 migration required; older semanticTypes fields are opaque');}
function finish<T>(receipt:T):T {const copied=copyJson(receipt);if(!checkSemanticTypeOperation(copied))throw new UmfError('SEMANTIC_TYPE_RECEIPT',JSON.stringify(checkSemanticTypeOperation.errors));return copied as unknown as T;}
export function inspectCoreSemanticTypes(input:Document,identity:CoreSemanticTypeIdentity):CoreSemanticTypeInspection {
 const l=locate(input,identity);
 const meaning:CoreSemanticTypeMeaning=!Object.hasOwn(l.element,'semanticTypes')?{state:'missing'}:l.source.umf==='0.9.0'?{state:'declared',types:copyJson(l.element.semanticTypes) as unknown as CoreSemanticTypeReference[]}:{state:'legacy',value:copyJson(l.element.semanticTypes)};
 return finish({operation:'inspect-core-semantic-types',version:'1.0.0',source:l.source,identity:l.identity,path:l.path,meaning,diagnostics:l.validation.diagnostics});
}
export function getCoreSemanticTypes(input:Document,identity:CoreSemanticTypeIdentity):CoreSemanticTypeReference[]|undefined {
 const l=locate(input,identity);requireCore(l.source);
 return l.element.semanticTypes===undefined?undefined:copyJson(l.element.semanticTypes) as unknown as CoreSemanticTypeReference[];
}
/** Explicit declarations retain the entire previous model; they do not assert native enforcement. */
export function declareCoreSemanticTypes(input:Document,identity:CoreSemanticTypeIdentity,typesInput:CoreSemanticTypeReference[]|null):CoreSemanticTypeDeclaration {
 const types=copyJson(typesInput) as unknown as CoreSemanticTypeReference[]|null;
 if(types!==null&&!checkSemanticTypeReferences(types))throw new UmfError('SEMANTIC_TYPE_STRUCTURE','Expected nonempty array of exact semantic references or null to clear');
 const l=locate(input,identity);requireCore(l.source);
 const unknown=l.validation.diagnostics.some(d=>d.code==='UNKNOWN_SEMANTIC_TYPE_QUALIFIER'&&d.path.startsWith(l.path+'/'));
 if(unknown&&semanticTypesCanonical(types)!==semanticTypesCanonical(l.element.semanticTypes))throw new UmfError('SEMANTIC_TYPE_UNKNOWN','Unknown existing qualifiers prevent replacement or removal',l.path);
 const target=copyJson(l.source) as unknown as Document,element=target.modules[l.mi]!.elements[l.ei]!;
 if(types===null)delete element.semanticTypes;else element.semanticTypes=types;
 const validation=validateDocument(target);if(!validation.valid)throw new UmfError('SEMANTIC_TYPE_DOCUMENT',JSON.stringify(validation.diagnostics));
 return finish({operation:'declare-core-semantic-types',version:'1.0.0',source:l.source,target,identity:l.identity,request:{types},diagnostics:validation.diagnostics,provenance:{origin:'authored',path:l.path,basis:'explicit-author-declaration'}});
}
/** Recomputed consistency/provenance check; it cannot authenticate a submitted source. */
export function verifyCoreSemanticTypeDeclaration(input:CoreSemanticTypeDeclaration,current:Document):CoreSemanticTypeDeclaration {
 const receipt=copyJson(input) as unknown as CoreSemanticTypeDeclaration;
 if(!checkSemanticTypeOperation(receipt)||receipt.operation!=='declare-core-semantic-types')throw new UmfError('SEMANTIC_TYPE_RECEIPT','Malformed declaration receipt');
 const expected=declareCoreSemanticTypes(receipt.source,receipt.identity,receipt.request.types);
 if(semanticTypesCanonical(receipt)!==semanticTypesCanonical(expected))throw new UmfError('SEMANTIC_TYPE_RECEIPT','Declaration conflicts with retained source and request');
 if(semanticTypesCanonical(copyJson(current))!==semanticTypesCanonical(expected.target))throw new UmfError('SEMANTIC_TYPE_STALE','Current document differs from declared target');
 return expected;
}
export interface CoreSemanticTypeValueResult {source:Document;identity:CoreSemanticTypeIdentity;checks:SemanticTypeValueResult[];status:'valid'|'invalid'|'unknown';complete:boolean;issues:string[]}
/** Conjunction of exact external checks only; no other field/native constraints are evaluated. */
export function validateCoreSemanticTypeValue(input:Document,identity:CoreSemanticTypeIdentity,valueInput:Json,registry:SemanticTypeRegistry):CoreSemanticTypeValueResult {
 const l=locate(input,identity);requireCore(l.source);const value=copyJson(valueInput);
 const checks=(l.element.semanticTypes??[]).map(ref=>registry.check(ref,value));
 const status=checks.some(c=>c.status==='invalid')?'invalid':!checks.length||checks.some(c=>c.status==='unknown')?'unknown':'valid';
 return copyJson({source:l.source,identity:l.identity,checks,status,complete:!!checks.length&&checks.every(c=>c.complete),issues:checks.length?checks.flatMap(c=>c.issues):['No semantic type declaration to evaluate']}) as unknown as CoreSemanticTypeValueResult;
}
