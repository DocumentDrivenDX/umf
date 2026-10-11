import {copyJson} from './json';
import {UmfError,type Document,type Json} from './types';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import schema from '../../spec/core/field-transition.schema.json';
export {default as fieldTransitionSchema} from '../../spec/core/field-transition.schema.json';
export interface FieldUpgradeReceipt {
 operation:'upgrade-field-envelope';version:'1.0.0';source:Document;target:Document;
 residuals:{path:string;value:Json;reason:'Legacy kind is opaque; no core assertion inferred'}[];
}
export interface FieldRollbackReceipt {
 operation:'rollback-field-envelope';version:'1.0.0';source:Document;target:Document;
 receipt:FieldUpgradeReceipt;reason:'Original envelope restored; all subsequent content retained in source, not applied to legacy target';
}
const check=createValidator().compile(schema);
function document(input:unknown,version:Document['umf']):Document {
 const copied=copyJson(input) as unknown as Document;
 if(!validateDocument(copied).valid||copied.umf!==version)throw new UmfError('FIELD_TRANSITION_INPUT','Expected valid '+version+' envelope');
 return copied;
}
function finish<T>(value:T):T {
 const copied=copyJson(value);
 if(!check(copied))throw new UmfError('FIELD_TRANSITION_RESULT',JSON.stringify(check.errors));
 return copied as T;
}
/** Explicit version opt-in. Every legacy kind is archived, including known-looking strings. */
export function upgradeFieldEnvelope(input:Document):FieldUpgradeReceipt {
 const source=document(input,'0.1.0'),target=copyJson(source) as unknown as Document;
 const residuals:FieldUpgradeReceipt['residuals']=[];
 target.umf='0.2.0';
 target.modules.forEach((module,mi)=>module.elements.forEach((element,ei)=>{
  if(Object.hasOwn(element,'kind')){
   residuals.push({path:`/modules/${mi}/elements/${ei}/kind`,value:copyJson(element.kind),reason:'Legacy kind is opaque; no core assertion inferred'});
   delete element.kind;
  }
 }));
 return finish({operation:'upgrade-field-envelope',version:'1.0.0',source,target,residuals});
}
function canonical(value:Json):string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}';
 return JSON.stringify(value);
}
/** Restore original model; retain the entire current model separately, including later assertions/edits. */
export function rollbackFieldEnvelope(input:FieldUpgradeReceipt,current:Document):FieldRollbackReceipt {
 const receipt=copyJson(input) as unknown as FieldUpgradeReceipt;
 if(!check(receipt)||receipt.operation!=='upgrade-field-envelope')throw new UmfError('FIELD_TRANSITION_RECEIPT','Invalid upgrade receipt');
 const expected=upgradeFieldEnvelope(receipt.source);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('FIELD_TRANSITION_RECEIPT','Receipt conflicts with its retained source');
 const source=document(current,'0.2.0');
 if(source.id!==receipt.target.id)throw new UmfError('FIELD_TRANSITION_ID','Current document identity differs from upgrade');
 return finish({operation:'rollback-field-envelope',version:'1.0.0',source,target:receipt.source,receipt,reason:'Original envelope restored; all subsequent content retained in source, not applied to legacy target'});
}
