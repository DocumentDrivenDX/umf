import {copyFramedJson} from './framed-json';
import {boundedJsonBytes} from '../../model/internal/json-byte-budget';
import {verifyCoreKeyTuple,encodeCoreKeyTupleBody,type CoreKeyTupleReceipt,type CoreKeyTupleValue} from '../../model/key-tuple';
import {validateDocument} from '../../validation/document';
import type {Json} from '../../model/types';
import {canonicalSchemaJson} from '../../model/schema-literals';
import {inspectActionPlan,prepareActionPlanModel,resolveActionPlanContext} from './plans';
import {inspectActionManifest} from './manifests';
import {jsonEqual,planError,sha256Text,utf8Size} from './plan-artifacts';
import type {ActionPlanArtifact,ActionPlanInspectionContext,PreparedActionPlanModel} from './plan-types';
import type {ActionManifest} from './manifest-types';

export interface SelectedActionRow {
 entity:ActionManifest['items'][number]['entity'];
 guard:ActionManifest['items'][number]['guard'];
 keyReceipt:CoreKeyTupleReceipt;
}
export interface ActionManifestConstruction {
 plan:ActionPlanArtifact;action:ActionManifest['action'];basis:ActionManifest['basis'];rows:SelectedActionRow[];
}
export interface ConstructedActionManifest {
 artifact:ActionPlanArtifact;keyReceipts:CoreKeyTupleReceipt[];sealed:false;complete:false;authority:false;
}
function closed(value:unknown,keys:string[]):void {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))planError('PAP_INVALID','Exact construction request/row members required');
}
/** Constructs portable invocation bytes; native selection, order and sealing remain host-owned. */
export function constructActionManifest(input:ActionManifestConstruction,context:ActionPlanInspectionContext):ConstructedActionManifest {
 const request=copyFramedJson(input) as unknown as ActionManifestConstruction;
 boundedJsonBytes(request as unknown as Json,67108864);
 closed(request,['plan','action','basis','rows']);
 if(!Array.isArray(request.rows)||request.rows.length>10000)planError('PAP_LIMIT','Bounded selected rows required');
 const inspected=inspectActionPlan(request.plan,context);
 if(!inspected.eligible||!inspected.plan)planError(inspected.diagnostics[0]?.code??'PAP_ACTION','Original plan is ineligible');
 const plan=inspected.plan!,original=resolveActionPlanContext(plan.model,plan.action,context);
 if(request.rows.length>plan.limits.maxItems)planError('PAP_LIMIT','Selected rows exceed original plan limit');
 const prepared=JSON.parse(prepareActionPlanModel(plan.model,plan.action,context).utf8) as PreparedActionPlanModel;
 const validation=validateDocument(original.document);
 const keyReceipts:CoreKeyTupleReceipt[]=[];
 const items=request.rows.map((row,ordinal)=>{
  closed(row,['entity','guard','keyReceipt']);
  if(!row.entity||typeof row.entity!=='object'||Array.isArray(row.entity)||!row.guard||typeof row.guard!=='object'||Array.isArray(row.guard))planError('PAP_INVALID','Selected entity and guard objects required','/rows/'+ordinal);
  if(typeof row.guard.version!=='string'||!row.guard.version||row.guard.version.length>256)planError('PAP_INVALID','Bounded original guard version required','/rows/'+ordinal+'/guard/version');
  const receipt=verifyCoreKeyTuple(row.keyReceipt,original.document);
  if(!jsonEqual(receipt.identity,plan.target)||!jsonEqual(row.entity.key,plan.target))planError('PAP_GUARD','Original selected Key receipt identity mismatch','/rows/'+ordinal);
  const selected=encodeCoreKeyTupleBody(original.document as unknown as Json,row.entity.key,row.entity.components as CoreKeyTupleValue[],validation);
  if(receipt.bytesHex!==selected.bytesHex)planError('PAP_GUARD','Original selected Key receipt tuple mismatch','/rows/'+ordinal);
  keyReceipts.push(receipt);
  const inputs:ActionManifest['items'][number]['inputs']=Object.create(null);
  Object.defineProperty(inputs,prepared.entityParameter,{value:row.entity,enumerable:true});
  for(const assignment of plan.inputs.assignments)Object.defineProperty(inputs,assignment.input,{value:assignment.value,enumerable:true});
  return {ordinal,entity:row.entity,guard:row.guard,inputs,expectedVersions:prepared.frames.map(frame=>({frame,version:row.guard.version}))};
 });
 const size=plan.execution.batchSize,batches=Array.from({length:Math.ceil(items.length/size)},(_,ordinal)=>({ordinal,start:ordinal*size,count:Math.min(size,items.length-ordinal*size)}));
 const body:ActionManifest={protocol:'umf.actions.manifest/1',plan:inspected.source,action:request.action,basis:request.basis,items,batches};
 boundedJsonBytes(body as unknown as Json,plan.limits.maxManifestBytes);
 const utf8=canonicalSchemaJson(body);utf8Size(utf8,plan.limits.maxManifestBytes);
 const artifact:ActionPlanArtifact={mediaType:'application/json',utf8,sha256:sha256Text(utf8,16777216)};
 const result=inspectActionManifest(artifact,context);
 if(!result.eligible)planError(result.diagnostics[0]?.code??'PAP_ACTION','Constructed manifest refused by original inspector',result.diagnostics[0]?.path);
 return {artifact,keyReceipts,sealed:false,complete:false,authority:false};
}
