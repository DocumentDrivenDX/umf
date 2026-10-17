import {copyFramedJson} from './framed-json';
import {copyJson} from '../../model/json';
import {UmfError,type Json} from '../../model/types';
import {validateDocument} from '../../validation/document';
import {encodeCoreKeyTupleBody,type CoreKeyTupleValue} from '../../model/key-tuple';
import {literalIdentity,checkSchemaLiteral,canonicalSchemaJson,type CoreLiteral} from '../../model/schema-literals';
import {knownActionModel} from './known-model';
import {inspectActionPlan,assessActionPlan,prepareActionPlanModel,resolveActionPlanContext,snapshotActionPlanInspection} from './plans';
import {readPlanArtifact,verifyPlanArtifact,jsonEqual,planError,validatePlanStrings,scanPlanJson} from './plan-artifacts';
import {checkActionManifest,planUnknownMembers} from './plan-structure';
import type {ActionPlanArtifact,ActionPlanInspectionContext,ActionPlanCapabilities,ActionPlanAssessment,ActionPlanDiagnostic,PreparedActionPlanModel} from './plan-types';
import type {ActionManifest,ActionManifestInspection} from './manifest-types';
const MANIFEST_BYTES=16777216;

/** Manifest framing is bounded separately; each input/item retains original core JSON admission. */
function snapshotManifest(input:unknown):ActionManifest {
 const copied=copyFramedJson(input) as unknown as ActionManifest;if(copied&&typeof copied==='object'&&Array.isArray(copied.items)){if(copied.items.length>10000)planError('PAP_LIMIT','Manifest item bound exceeded');for(const item of copied.items)copyJson(item);}
 return copied;
}
const diagnostic=(error:unknown):ActionPlanDiagnostic=>{if(!(error instanceof UmfError))throw error;return {code:error.code.startsWith('PAP_')?error.code:error.code==='LIMIT'?'PAP_LIMIT':'PAP_ACTION',path:error.path??'',message:'Original manifest or declaration refused'};};
/** Portable consistency checks; never issues a guard, snapshot, seal or revision. */
export function inspectActionManifest(input:ActionPlanArtifact,context:ActionPlanInspectionContext):ActionManifestInspection {
 const source=readPlanArtifact(input,MANIFEST_BYTES),diagnostics:ActionPlanDiagnostic[]=[];let manifest:ActionManifest|null=null,plan:ActionManifestInspection['plan']=null;
 try {
  verifyPlanArtifact(source,MANIFEST_BYTES);if(source.mediaType!=='application/json')planError('PAP_INVALID','JSON manifest required');
  scanPlanJson(source.utf8,MANIFEST_BYTES,1000000);const parsed=snapshotManifest(JSON.parse(source.utf8));if(!checkActionManifest(parsed))planError('PAP_INVALID','Malformed manifest');manifest=parsed as unknown as ActionManifest;
  const unknown=planUnknownMembers(manifest,'manifest');if(Object.keys(source).some(k=>!['mediaType','utf8','sha256'].includes(k)))unknown.unshift('/artifact');for(const path of unknown){if(diagnostics.length>=128)planError('PAP_LIMIT','Diagnostic capacity exceeded');diagnostics.push({code:'PAP_UNKNOWN',path,message:'Unknown relevant manifest member'});}
  plan=inspectActionPlan(manifest.plan,context);if(!plan.eligible||!plan.plan)planError('PAP_ACTION','Original plan is ineligible');
  const intent=plan.plan!;
  const original=resolveActionPlanContext(intent.model,intent.action,context),prepared=JSON.parse(prepareActionPlanModel(intent.model,intent.action,context).utf8) as PreparedActionPlanModel;
  if(original.ownerBytes>2097152)planError('PAP_LIMIT','Original owner artifacts exceed manifest context limit');
  const pin=intent.action;if(manifest.action.target.module!==pin.identity.module||manifest.action.target.action!==pin.identity.action||manifest.action.documentSha256!==pin.documentSha256||!jsonEqual(manifest.action.invocation,pin.invocation))planError('PAP_ACTION','Resolved original action correspondence mismatch');
  if(manifest.basis.selectionSha256!==intent.selection.artifact.sha256)planError('PAP_INTEGRITY','Selection basis digest differs');
  if(manifest.items.length>intent.limits.maxItems||new TextEncoder().encode(source.utf8).length>intent.limits.maxManifestBytes)planError('PAP_LIMIT','Original plan manifest limit exceeded');
  const size=intent.execution.batchSize,count=manifest.items.length;if(manifest.batches.length!==Math.ceil(count/size))planError('PAP_INVALID','Incomplete deterministic partition');
  manifest.batches.forEach((batch,index)=>{if(batch.ordinal!==index||batch.start!==index*size||batch.count!==Math.min(size,count-index*size))planError('PAP_INVALID','Full-first manifest-order partition required','/batches/'+index);});
  const validation=validateDocument(original.document),identities=new Set<string>(),keys=new Set<string>();let guardProfile:string|undefined;
  for(const [index,item] of manifest.items.entries()) {
   const path='/items/'+index;if(item.ordinal!==index)planError('PAP_INVALID','Consecutive item ordinal required',path);
   if(item.guard.store!==manifest.basis.store||item.guard.epoch!==manifest.basis.epoch)planError('PAP_GUARD','Guard scope mismatch',path+'/guard');
   const profile=canonicalSchemaJson(item.guard.profile);if(guardProfile!==undefined&&guardProfile!==profile)planError('PAP_PROFILE','One declared guard profile required',path+'/guard/profile');guardProfile=profile;
   if(identities.has(item.guard.identity))planError('PAP_SELECTION','Duplicate canonical identity',path+'/guard/identity');identities.add(item.guard.identity);
   if(!jsonEqual(item.entity.key,intent.target))planError('PAP_ACTION','Exact original entity Key required',path+'/entity');
   const tuple=encodeCoreKeyTupleBody(original.document as unknown as Json,item.entity.key,item.entity.components as CoreKeyTupleValue[],validation).bytesHex;
   if(keys.has(tuple))planError('PAP_SELECTION','Nonunique logical Key',path+'/entity');keys.add(tuple);
   const inputs=item.inputs,expected=[prepared.entityParameter,...prepared.assignments.map(a=>a.input)];if(Object.keys(inputs).length!==expected.length||expected.some(id=>!Object.hasOwn(inputs,id)))planError('PAP_ACTION','Complete original action inputs required',path+'/inputs');
   const entity=inputs[prepared.entityParameter];if(!entity||!('key' in entity)||Object.keys(entity).length!==2||!Array.isArray(entity.components)||!jsonEqual(entity.key,item.entity.key))planError('PAP_ACTION','Entity input correspondence mismatch',path+'/inputs');
   if(encodeCoreKeyTupleBody(original.document as unknown as Json,(entity as import('./selector').ActionEntityInput).key,(entity as import('./selector').ActionEntityInput).components as CoreKeyTupleValue[],validation).bytesHex!==tuple)planError('PAP_ACTION','Entity input tuple mismatch',path+'/inputs');
   for(const assignment of intent.inputs.assignments){const field=knownActionModel(original.document,assignment.field,'field');checkSchemaLiteral(original.document,field,inputs[assignment.input] as CoreLiteral);if(literalIdentity(field,inputs[assignment.input] as CoreLiteral)!==literalIdentity(field,assignment.value))planError('PAP_ACTION','Input differs from exact plan constant',path+'/inputs/'+assignment.input);}
   if(item.expectedVersions.length!==prepared.frames.length||prepared.frames.some((frame,i)=>item.expectedVersions[i]?.frame!==frame||item.expectedVersions[i]?.version!==item.guard.version))planError('PAP_GUARD','Every original frame requires ordered whole-entity version',path+'/expectedVersions');
  }
 }catch(error){if(diagnostics.length===128)diagnostics.pop();diagnostics.push(diagnostic(error));}
 return {manifest,source,plan,eligible:diagnostics.length===0,diagnostics};
}
export function assessActionManifest(inspection:ActionManifestInspection,capabilities:ActionPlanCapabilities,context:ActionPlanInspectionContext):ActionPlanAssessment {
 const refusal=(error:unknown):ActionPlanAssessment=>({compatible:false,executionVerified:false,obligations:[],diagnostics:[diagnostic(error)]});
 try {
  const d=Object.getOwnPropertyDescriptors(inspection);if(Object.getOwnPropertySymbols(inspection).length||Object.keys(d).length!==5||Object.entries(d).some(([key,value])=>!['manifest','source','plan','eligible','diagnostics'].includes(key)||!value.enumerable||!('value' in value)))planError('PAP_INVALID','Exact data inspection required');
  const source=readPlanArtifact(d.source!.value!,MANIFEST_BYTES),supplied={manifest:snapshotManifest(d.manifest!.value),source,plan:d.plan!.value===null?null:snapshotActionPlanInspection(d.plan!.value!),eligible:copyJson(d.eligible!.value),diagnostics:copyJson(d.diagnostics!.value)};validatePlanStrings(supplied);const fresh=inspectActionManifest(source,context);if(!fresh.eligible||!fresh.plan||!jsonEqual(fresh,supplied))planError('PAP_ACTION','Inspection differs from unchanged original source or is ineligible');
  const assessment=assessActionPlan(fresh.plan!,capabilities,context);if(!assessment.compatible)return assessment;const caps=copyJson(capabilities) as unknown as ActionPlanCapabilities;
  if(!jsonEqual(caps.snapshot.profile,fresh.manifest!.basis.profile)||fresh.manifest!.items.some(i=>!jsonEqual(caps.guard.profile,i.guard.profile)))return refusal(new UmfError('PAP_PROFILE','Exact manifest guard/snapshot capability required'));
  return assessment;
 }catch(error){return refusal(error);}
}
