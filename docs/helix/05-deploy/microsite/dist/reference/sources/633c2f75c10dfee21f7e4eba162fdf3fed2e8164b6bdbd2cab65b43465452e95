import {copyJson} from './json';
import {UmfError,type Document,type Json} from './types';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import schema from '../../spec/core/cardinality-transition.schema.json';
export {default as cardinalityTransitionSchema} from '../../spec/core/cardinality-transition.schema.json';
export interface CardinalityUpgradeReceipt {
 operation:'upgrade-cardinality-envelope';version:'1.0.0';source:Document;target:Document;
 residuals:{path:string;value:Json;reason:'Legacy cardinality/itemType is opaque; no container or item meaning inferred'}[];
}
export interface CardinalityRollbackReceipt {
 operation:'rollback-cardinality-envelope';version:'1.0.0';source:Document;target:Document;
 receipt:CardinalityUpgradeReceipt;reason:'Original envelope restored; all subsequent content retained in source, not applied to legacy target';
}
const check=createValidator().compile(schema);
function document(input:unknown,version:Document['umf']):Document {
 const copied=copyJson(input) as unknown as Document;
 if(!validateDocument(copied).valid||copied.umf!==version)throw new UmfError('CARDINALITY_TRANSITION_INPUT','Expected valid '+version+' envelope');
 return copied;
}
function finish<T>(value:T):T {
 const copied=copyJson(value);
 if(!check(copied))throw new UmfError('CARDINALITY_TRANSITION_RESULT',JSON.stringify(check.errors));
 return copied as T;
}
/** Explicit version opt-in. Every legacy cardinality/itemType is archived, including known-looking values. */
export function upgradeCardinalityEnvelope(input:Document):CardinalityUpgradeReceipt {
 const source=document(input,'0.3.0'),target=copyJson(source) as unknown as Document;
 const residuals:CardinalityUpgradeReceipt['residuals']=[];
 target.umf='0.4.0';
 target.modules.forEach((module,mi)=>module.elements.forEach((element,ei)=>{
  for(const key of ['cardinality','itemType'])if(Object.hasOwn(element,key)){
   residuals.push({path:`/modules/${mi}/elements/${ei}/${key}`,value:copyJson(element[key]),reason:'Legacy cardinality/itemType is opaque; no container or item meaning inferred'});
   delete element[key];
  }
 }));
 return finish({operation:'upgrade-cardinality-envelope',version:'1.0.0',source,target,residuals});
}
function canonical(value:Json):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}';
 return JSON.stringify(value);
}
/** Restore original model; retain the entire current model separately, including later assertions/edits. */
export function rollbackCardinalityEnvelope(input:CardinalityUpgradeReceipt,current:Document):CardinalityRollbackReceipt {
 const receipt=copyJson(input) as unknown as CardinalityUpgradeReceipt;
 if(!check(receipt)||receipt.operation!=='upgrade-cardinality-envelope')throw new UmfError('CARDINALITY_TRANSITION_RECEIPT','Invalid upgrade receipt');
 const expected=upgradeCardinalityEnvelope(receipt.source);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('CARDINALITY_TRANSITION_RECEIPT','Receipt conflicts with its retained source');
 const source=document(current,'0.4.0');
 if(source.id!==receipt.target.id)throw new UmfError('CARDINALITY_TRANSITION_ID','Current document identity differs from upgrade');
 return finish({operation:'rollback-cardinality-envelope',version:'1.0.0',source,target:receipt.source,receipt,reason:'Original envelope restored; all subsequent content retained in source, not applied to legacy target'});
}
