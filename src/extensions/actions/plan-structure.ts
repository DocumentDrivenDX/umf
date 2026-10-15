import {copyJson} from '../../model/json';
import bulk from '../../../spec/extensions/actions/bulk.schema.json';
import txResults from '../../../spec/extensions/actions/tx-results.schema.json';
import manifest from '../../../spec/extensions/actions/manifest.schema.json';
import manifestInspection from '../../../spec/extensions/actions/manifest-inspection.schema.json';
import plan from '../../../spec/extensions/actions/plan.schema.json';
import model from '../../../spec/extensions/actions/plan-model.schema.json';
import capabilities from '../../../spec/extensions/actions/plan-capabilities.schema.json';
import inspection from '../../../spec/extensions/actions/plan-inspection.schema.json';
import assessment from '../../../spec/extensions/actions/plan-assessment.schema.json';
import core from '../../../spec/core/schema-properties-document.schema.json';
import actionProfile from '../../../spec/extensions/actions/executor-profile.schema.json';
import {createValidator} from '../../validation/schema';
import {planError} from './plan-artifacts';
import {snapshotSchema} from '../../validation/internal-schema';
const schemas=[core,actionProfile,plan,model,capabilities,inspection,assessment,manifest,manifestInspection,txResults,bulk].map(snapshotSchema);
const validator=createValidator(false);for(const schema of schemas)validator.addSchema(schema);
export const checkBulkOutcome=validator.getSchema(bulk.$id)!;
export const checkActionManifest=validator.getSchema(manifest.$id)!;
export const checkActionManifestInspection=validator.getSchema(manifestInspection.$id)!;
export const checkActionPlan=validator.getSchema(plan.$id)!;
export const checkPreparedActionPlanModel=validator.getSchema(model.$id)!;
export const checkActionPlanCapabilities=validator.getSchema(capabilities.$id)!;
export const checkActionPlanInspection=validator.getSchema(inspection.$id)!;
export const checkActionPlanAssessment=validator.getSchema(assessment.$id)!;
export {actionPlanModelSchemaDigest} from './plan-identity';
export const checkActionPlanModelPin=validator.compile({$ref:plan.$id+'#/$defs/model'});
export const checkPortableActionPin=validator.compile({$ref:plan.$id+'#/$defs/action'});
export const checkActionPlanDiagnostic=validator.compile({$ref:plan.$id+'#/$defs/diagnostic'});
export const checkActionPlanField=validator.compile({$ref:plan.$id+'#/$defs/field'});
/** Structural admission preserves future members; this independent pass exposes their meaning. */
export function planUnknownMembers(value:unknown,kind:'plan'|'model'|'capabilities'|'manifest'|'bulk'):string[] {
 const result:string[]=[],byId=new Map(schemas.map(s=>[s.$id,s]));
 function walk(v:any,s:any,root:any,path:string):void {
  if(s.$ref){if(s.$ref==='urn:umf:core:0.8.0#/$defs/literal'){copyJson(v);return;}const [id,fragment]=s.$ref.split('#');root=id?byId.get(id):root;if(!root)return;let target=root;for(const part of (fragment??'').split('/').slice(1))target=target[part.replaceAll('~1','/').replaceAll('~0','~')];if(target)walk(v,target,root,path);return;}
  if(typeof v==='string'&&typeof s.maxLength==='number'&&v.length>s.maxLength)planError('PAP_INVALID','UTF-16 metadata string bound exceeded',path);
  if(s.oneOf||s.anyOf){if(kind==='bulk'){const branch=(s.oneOf??s.anyOf).find((candidate:any)=>validator.validate(candidate.$ref?.startsWith('#')?{$ref:root.$id+candidate.$ref}:candidate,v));if(branch)walk(v,branch,root,path);}return;} // Core literal/schema alternatives are admitted by original schemas.
  if(Array.isArray(v)){if(s.items)v.forEach((child,i)=>walk(child,s.items,root,path+'/'+i));return;}
  if(v&&typeof v==='object'&&(s.properties||typeof s.additionalProperties==='object')){for(const key of Object.keys(v)){if(s.propertyNames)walk(key,s.propertyNames,root,path);const at=path+'/'+key.replaceAll('~','~0').replaceAll('/','~1');if(!Object.hasOwn(s.properties??{},key)){if(typeof s.additionalProperties==='object')walk(v[key],s.additionalProperties,root,at);else result.push(at);}else if(key!=='annotations')walk(v[key],s.properties[key],root,at);}}
 }
 const schema=kind==='plan'?schemas[2]:kind==='model'?schemas[3]:kind==='manifest'?schemas[7]:kind==='bulk'?schemas[10]:schemas[4];walk(value,schema,schema,'');return result;
}
