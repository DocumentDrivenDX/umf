import {copyJson} from './json';
import {UmfError,type Document,type Json,type CoreSemanticTypeReference} from './types';
import {validateDocument} from '../validation/document';
import {checkSemanticTypeReferences} from '../validation/semantic-types';
import {checkSemanticTypeRequest,checkSemanticTypeTransition,semanticTypesCanonical} from './semantic-types-receipts';
import {SEMANTIC_TYPES_EXTENSION} from '../extensions/semantic-types';
/** Opaque element field keeping pre-0.9.0 `semanticTypes` content in the target, so the receipt is not its only copy. */
export const LEGACY_SEMANTIC_TYPES_FIELD='legacySemanticTypes';
const legacyField=LEGACY_SEMANTIC_TYPES_FIELD;
const collisionReason='Legacy semanticTypes content retained without reinterpretation' as const;
export interface SemanticTypesUpgradeRequest {migrateExtension:boolean}
export interface SemanticTypesUpgradeReceipt {operation:'upgrade-semantic-types-envelope';version:'1.0.0';source:Document;target:Document;request:SemanticTypesUpgradeRequest;residuals:{path:string;value:Json;reason:typeof collisionReason}[]}
export interface SemanticTypesRollbackReceipt {operation:'rollback-semantic-types-envelope';version:'1.0.0';source:Document;target:Document;receipt:SemanticTypesUpgradeReceipt;reason:'Original envelope restored; subsequent content retained in source'}
function finish<T>(value:T):T {const copied=copyJson(value);if(!checkSemanticTypeTransition(copied))throw new UmfError('SEMANTIC_TYPE_TRANSITION_RECEIPT',JSON.stringify(checkSemanticTypeTransition.errors));return copied as unknown as T;}
export function upgradeSemanticTypesEnvelope(input:Document,requestInput:SemanticTypesUpgradeRequest={migrateExtension:false}):SemanticTypesUpgradeReceipt {
 const source=copyJson(input) as unknown as Document,request=copyJson(requestInput) as unknown as SemanticTypesUpgradeRequest;
 if(!checkSemanticTypeRequest(request))throw new UmfError('SEMANTIC_TYPE_TRANSITION_REQUEST','Expected explicit migrateExtension boolean only');
 if(source?.umf!=='0.8.0'||!validateDocument(source).valid)throw new UmfError('SEMANTIC_TYPE_TRANSITION_INPUT','Expected valid 0.8.0 envelope');
 const target=copyJson(source) as unknown as Document;target.umf='0.9.0';const residuals:SemanticTypesUpgradeReceipt['residuals']=[];
 target.modules.forEach((m,mi)=>m.elements.forEach((e,ei)=>{
  const path=`/modules/${mi}/elements/${ei}/semanticTypes`,collision=Object.hasOwn(e,'semanticTypes');
  if(collision){if(Object.hasOwn(e,legacyField))throw new UmfError('SEMANTIC_TYPE_TRANSITION_CONFLICT',`Cannot preserve legacy semanticTypes: ${legacyField} already present`,path.replace(/semanticTypes$/,legacyField));residuals.push({path,value:copyJson(e.semanticTypes),reason:collisionReason});e[legacyField]=copyJson(e.semanticTypes);delete e.semanticTypes;}
  if(!request.migrateExtension||!Object.hasOwn(e.extensions,SEMANTIC_TYPES_EXTENSION))return;
  if(collision)throw new UmfError('SEMANTIC_TYPE_TRANSITION_CONFLICT','Opaque core field conflicts with requested extension migration',path);
  if(source.vocabularies[SEMANTIC_TYPES_EXTENSION]?.version!=='0.1.0')throw new UmfError('SEMANTIC_TYPE_PROFILE','Only prototype 0.1.0 can be migrated');
  const payload=e.extensions[SEMANTIC_TYPES_EXTENSION];
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(k=>k!=='types')||!checkSemanticTypeReferences(payload.types))throw new UmfError('SEMANTIC_TYPE_TRANSITION_EXTENSION','Malformed or unknown annotation-level meaning cannot be converted');
  e.semanticTypes=copyJson(payload.types) as unknown as CoreSemanticTypeReference[];
 }));
 const validation=validateDocument(target);if(!validation.valid)throw new UmfError('SEMANTIC_TYPE_TRANSITION_TARGET',JSON.stringify(validation.diagnostics));
 return finish({operation:'upgrade-semantic-types-envelope',version:'1.0.0',source,target,request,residuals});
}
function verifyUpgrade(input:SemanticTypesUpgradeReceipt):SemanticTypesUpgradeReceipt {
 const receipt=copyJson(input) as unknown as SemanticTypesUpgradeReceipt;
 if(!checkSemanticTypeTransition(receipt)||receipt.operation!=='upgrade-semantic-types-envelope')throw new UmfError('SEMANTIC_TYPE_TRANSITION_RECEIPT','Malformed upgrade receipt');
 const expected=upgradeSemanticTypesEnvelope(receipt.source,receipt.request);
 if(semanticTypesCanonical(receipt)!==semanticTypesCanonical(expected))throw new UmfError('SEMANTIC_TYPE_TRANSITION_RECEIPT','Upgrade differs from recomputed retained source and policy');
 return expected;
}
/** Restore the exact legacy source; preserve subsequent edits in the current-source archive. */
export function rollbackSemanticTypesEnvelope(input:SemanticTypesUpgradeReceipt,current:Document):SemanticTypesRollbackReceipt {
 const receipt=verifyUpgrade(input),source=copyJson(current) as unknown as Document;
 if(source?.umf!=='0.9.0'||!validateDocument(source).valid)throw new UmfError('SEMANTIC_TYPE_TRANSITION_CURRENT','Expected valid current 0.9.0 envelope');
 if(source.id!==receipt.target.id)throw new UmfError('SEMANTIC_TYPE_TRANSITION_ID','Current document identity differs');
 return finish({operation:'rollback-semantic-types-envelope',version:'1.0.0',source,target:receipt.source,receipt,reason:'Original envelope restored; subsequent content retained in source'});
}
export function verifySemanticTypesTransition(input:SemanticTypesUpgradeReceipt|SemanticTypesRollbackReceipt):SemanticTypesUpgradeReceipt|SemanticTypesRollbackReceipt {
 const receipt=copyJson(input) as unknown as typeof input;
 if(!checkSemanticTypeTransition(receipt))throw new UmfError('SEMANTIC_TYPE_TRANSITION_RECEIPT','Malformed transition receipt');
 const expected=receipt.operation==='upgrade-semantic-types-envelope'?verifyUpgrade(receipt):rollbackSemanticTypesEnvelope(receipt.receipt,receipt.source);
 if(semanticTypesCanonical(receipt)!==semanticTypesCanonical(expected))throw new UmfError('SEMANTIC_TYPE_TRANSITION_RECEIPT','Transition differs from recomputed retained source');
 return expected;
}
