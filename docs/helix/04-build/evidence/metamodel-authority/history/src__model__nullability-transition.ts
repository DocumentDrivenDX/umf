import {copyJson} from './json';
import {UmfError,type Document,type Json} from './types';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import schema from '../../spec/core/nullability-transition.schema.json';
export {default as nullabilityTransitionSchema} from '../../spec/core/nullability-transition.schema.json';
export interface NullabilityUpgradeReceipt {
 operation:'upgrade-nullability-envelope';version:'1.0.0';source:Document;target:Document;
 residuals:{path:string;value:Json;reason:'Legacy nullability is opaque; no availability assertion inferred'}[];
}
export interface NullabilityRollbackReceipt {
 operation:'rollback-nullability-envelope';version:'1.0.0';source:Document;target:Document;
 receipt:NullabilityUpgradeReceipt;reason:'Original envelope restored; all subsequent content retained in source, not applied to legacy target';
}
const check=createValidator().compile(schema);
function document(input:unknown,version:Document['umf']):Document {
 const copied=copyJson(input) as unknown as Document;
 if(!validateDocument(copied).valid||copied.umf!==version)throw new UmfError('NULLABILITY_TRANSITION_INPUT','Expected valid '+version+' envelope');
 return copied;
}
function finish<T>(value:T):T {
 const copied=copyJson(value);
 if(!check(copied))throw new UmfError('NULLABILITY_TRANSITION_RESULT',JSON.stringify(check.errors));
 return copied as T;
}
/** Explicit version opt-in. Every legacy nullability is archived, including known-looking strings. */
export function upgradeNullabilityEnvelope(input:Document):NullabilityUpgradeReceipt {
 const source=document(input,'0.2.0'),target=copyJson(source) as unknown as Document;
 const residuals:NullabilityUpgradeReceipt['residuals']=[];
 target.umf='0.3.0';
 target.modules.forEach((module,mi)=>module.elements.forEach((element,ei)=>{
  if(Object.hasOwn(element,'nullability')){
   residuals.push({path:`/modules/${mi}/elements/${ei}/nullability`,value:copyJson(element.nullability),reason:'Legacy nullability is opaque; no availability assertion inferred'});
   delete element.nullability;
  }
 }));
 return finish({operation:'upgrade-nullability-envelope',version:'1.0.0',source,target,residuals});
}
function canonical(value:Json):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}';
 return JSON.stringify(value);
}
/** Restore original model; retain the entire current model separately, including later assertions/edits. */
export function rollbackNullabilityEnvelope(input:NullabilityUpgradeReceipt,current:Document):NullabilityRollbackReceipt {
 const receipt=copyJson(input) as unknown as NullabilityUpgradeReceipt;
 if(!check(receipt)||receipt.operation!=='upgrade-nullability-envelope')throw new UmfError('NULLABILITY_TRANSITION_RECEIPT','Invalid upgrade receipt');
 const expected=upgradeNullabilityEnvelope(receipt.source);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('NULLABILITY_TRANSITION_RECEIPT','Receipt conflicts with its retained source');
 const source=document(current,'0.3.0');
 if(source.id!==receipt.target.id)throw new UmfError('NULLABILITY_TRANSITION_ID','Current document identity differs from upgrade');
 return finish({operation:'rollback-nullability-envelope',version:'1.0.0',source,target:receipt.source,receipt,reason:'Original envelope restored; all subsequent content retained in source, not applied to legacy target'});
}
