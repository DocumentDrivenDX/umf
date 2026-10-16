import {boundedJsonBytes} from '../../model/internal/json-byte-budget';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type Element} from '../../model/types';
import {checkSchemaLiteral} from '../../model/schema-literals';
import {Registry} from '../../registry/registry';
import {inspectActions,assessAction} from './index';
import {knownActionModel} from './known-model';
import {compileActionSelector} from './selector';
import type {ActionReference,Action,InspectedAction} from './types';
import type {ActionPlanArtifact,ActionPlanModelPin,PortableActionPin,ActionPlanInspectionContext,ActionPlanInspection,ActionPlanCapabilities,ActionPlanAssessment,PreparedActionPlanModel,PortableActionPlan,ActionPlanDiagnostic} from './plan-types';
import {readPlanArtifact,verifyPlanArtifact,parsePlanJson,preparedArtifact,planError,jsonEqual,utf8Size,validatePlanStrings} from './plan-artifacts';
import {checkActionPlan,checkPreparedActionPlanModel,checkActionPlanCapabilities,checkActionPlanModelPin,checkPortableActionPin,checkActionPlanField,checkActionPlanDiagnostic,planUnknownMembers,actionPlanModelSchemaDigest} from './plan-structure';
import {actionPlanProducerBuild} from './plan-identity';
import {hasLocalActionBundle,localActionProfiles} from './local-profiles';
const copy=<T>(v:T):T=>{const safe=copyJson(v);validatePlanStrings(safe);return safe as unknown as T;};
const refId=(r:ActionReference)=>JSON.stringify([r.module,r.element]);
const profile=(p:{id:string;version:string},id:string)=>p.id===id&&p.version==='1';
const diag=(code:string,path:string,message:string):ActionPlanDiagnostic=>({code,path,message});
function data<T>(object:object,key:string):T {const d=Object.getOwnPropertyDescriptor(object,key);if(!d||!('value' in d))planError('PAP_INVALID','Context accessors/absent members refuse','/context/'+key);return d!.value as T;}
function collection<T>(value:T[]):T[] {if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)planError('PAP_INVALID','Plain context array required');const result:T[]=[];for(let i=0;i<value.length;i++)result.push(data<T>(value,String(i)));return result;}
function errorDiagnostic(error:unknown):ActionPlanDiagnostic {if(error instanceof UmfError)return diag(error.code.startsWith('PAP_')?error.code:error.code==='LIMIT'?'PAP_LIMIT':'PAP_ACTION',error.path??'','Original declaration or input refused');throw error;}
export function resolveActionPlanContext(modelInput:ActionPlanModelPin,actionInput:PortableActionPin,context:ActionPlanInspectionContext):{document:Document;target:InspectedAction;model:ActionPlanModelPin;action:PortableActionPin;snapshotBytes:number;ownerBytes:number} {
 const model=copy(modelInput),action=copy(actionInput);if(!checkActionPlanModelPin(model)||!checkPortableActionPin(action))planError('PAP_INVALID','Malformed original model/action pin');
 for(const text of [model.documentId,model.revision,action.identity.module,action.identity.action,action.invocation.id,action.invocation.version])if(text.length>256)planError('PAP_INVALID','UTF-16 pin identity limit');
 const local=profile(action.invocation,localActionProfiles.invocation);
 if((!profile(action.invocation,'umf.actions.tx')&&!local)||action.documentSha256!==model.sha256)planError('PAP_PROFILE','Exact action/model/invocation pins required');
 const registry=data<Registry>(context,'registry');if(!(registry instanceof Registry))planError('PAP_INVALID','Explicit original Registry required');
 const models=data<ActionPlanInspectionContext['models']>(context,'models'),actions=data<ActionPlanInspectionContext['actions']>(context,'actions');
 if(!Array.isArray(models)||!Array.isArray(actions)||models.length+actions.length>2||models.length!==1||actions.length!==1)planError('PAP_LIMIT','One original model and action snapshot required');
 const retainedModels=collection(models).map((e,i)=>({pin:copy(data<ActionPlanModelPin>(e,'pin')),artifact:readPlanArtifact(data<ActionPlanArtifact>(e,'artifact'))}));
 const retainedActions=collection(actions).map(e=>({pin:copy(data<PortableActionPin>(e,'pin')),artifact:readPlanArtifact(data<ActionPlanArtifact>(e,'artifact'))}));
 const m=retainedModels[0]!,a=retainedActions[0]!;if(!jsonEqual(m.pin,model)||!jsonEqual(a.pin,action)||m.artifact.sha256!==model.sha256||a.artifact.sha256!==action.documentSha256||a.artifact.utf8!==m.artifact.utf8)planError('PAP_INTEGRITY','Original registration/source correspondence mismatch');
 for(const artifact of [m.artifact,a.artifact]){if(artifact.mediaType!=='application/json'||Object.keys(artifact).some(k=>!['mediaType','utf8','sha256'].includes(k)))planError('PAP_UNKNOWN','Unknown original artifact encoding/member');verifyPlanArtifact(artifact);}
 const document=parsePlanJson(m.artifact.utf8) as unknown as Document;if(document.id!==model.documentId||document.umf!==model.umfVersion)planError('PAP_INTEGRITY','Original document identity/version mismatch');
 const before=copy(document),inspection=inspectActions(document,registry);if(!jsonEqual(before,inspection.source))planError('PAP_ACTION','Owner inspection changed original source');
 if(!inspection.validation.valid)planError('PAP_ACTION','Original action/model validation failed');
 const matches=inspection.actions.filter(t=>t.module===action.identity.module&&t.action.id===action.identity.action);if(matches.length!==1)planError('PAP_ACTION','Exact action identity must resolve');const target=matches[0]!;
 if(local!==hasLocalActionBundle(target.action))planError('PAP_PROFILE','Invocation differs from original local/native actor and policy bundle');
 if(target.obligations.some(o=>o.status!=='checked'))planError('PAP_UNKNOWN','Relevant original action/model meaning unchecked');
 return {document:inspection.source,target,model,action,ownerBytes:utf8Size(m.artifact.utf8)+utf8Size(a.artifact.utf8),snapshotBytes:boundedJsonBytes(m.artifact as never,4194304)+boundedJsonBytes(a.artifact as never,4194304)};
}
function subset(document:Document,action:Action):{entityParameter:string;target:PreparedActionPlanModel['target'];assignments:PreparedActionPlanModel['assignments'];frames:string[]} {
 const recipe=action.binding as Extract<Action['binding'],{kind:'recipe'}>;
 const entities=action.parameters.filter(p=>p.kind==='entity'),values=action.parameters.filter(p=>p.kind==='value');
 if(entities.length!==1||!values.length||action.parameters.length>64||values.some(p=>!p.required)||action.binding.kind!=='recipe'||action.binding.profile.id!=='graph-write'||action.binding.profile.version!=='1'||recipe.effects.length!==1||action.outputs.length||action.preconditions.length||action.postconditions.length||action.failures.length)planError('PAP_ACTION','Outside the first bounded set-action subset');
 const entity=entities[0]!;if(entity.kind!=='entity')return planError('PAP_ACTION','Entity input required');const record=knownActionModel(document,entity.target,'record');
 const effect=recipe.effects[0]!;if(effect.kind!=='set'||!('values' in effect)||!('entity' in effect)||!jsonEqual(effect.entity,{parameter:entity.id}))planError('PAP_ACTION','Exact parameter-bound set effect required');
 const assignments=(effect as {values:{field:ActionReference;value:{parameter?:string}}[]}).values.map(a=>{if(typeof a.value.parameter!=='string'||Object.keys(a.value).length!==1)planError('PAP_ACTION','Set effects require exact value parameters');const param=values.find(p=>p.id===a.value.parameter);if(!param||param.kind!=='value'||!jsonEqual(param.field,a.field))planError('PAP_ACTION','Field/input correspondence mismatch');const field=knownActionModel(document,a.field,'field');if(field.nullability!=='required'||field.cardinality!=='one'||!['boolean','integer','string'].includes(field.scalarType??''))planError('PAP_ACTION','Unsupported mutation value domain');return {input:param!.id,field:copy(a.field)};});
 if(assignments.length!==values.length||new Set(assignments.map(a=>a.input)).size!==values.length)planError('PAP_ACTION','Every value input must bind exactly one set assignment');
 const frames=[...action.reads,...action.writes];if(!action.writes.length||frames.length>256)planError('PAP_ACTION','Bounded write frames required');
 for(const frame of frames){if(frame.id.length>256)planError('PAP_ACTION','Frame identity exceeds preparation bound');const selector=compileActionSelector(document,action,frame);if(!jsonEqual(frame.record,{module:entity.target.module,element:entity.target.element})||frame.maxEntities!==1||frame.create||frame.delete||frame.relationships.length||!jsonEqual(selector.ast,{entity:entity.id}))planError('PAP_ACTION','Frame must select the exact entity without other effects');}
 const written=new Set(action.writes.flatMap(f=>f.fields.map(refId))),assigned=new Set(assignments.map(a=>refId(a.field)));if(written.size!==assigned.size||[...written].some(id=>!assigned.has(id)))planError('PAP_ACTION','Write frame union must exactly equal set Fields');
 const keyFields=((record.keys??[]) as unknown as {fields:ActionReference[]}[]).flatMap(k=>(k as unknown as {fields:ActionReference[]}).fields);if(assignments.some(a=>keyFields.some(k=>refId(k)===refId(a.field))))planError('PAP_ACTION','Key Fields are immutable');
 return {entityParameter:entity.id,target:copy(entity.target),assignments,frames:frames.map(f=>f.id)};
}
export function prepareActionPlanModel(model:ActionPlanModelPin,action:PortableActionPin,context:ActionPlanInspectionContext):ActionPlanArtifact {
 const original=resolveActionPlanContext(model,action,context),bound=subset(original.document,original.target.action);
 const value:PreparedActionPlanModel={protocol:'umf.actions.plan-model/1',model:original.model,action:original.action,...bound,producer:{id:'umf.actions.plan-model',version:'1',build:actionPlanProducerBuild},schema:{id:'urn:umf:actions:plan-model:1',sha256:actionPlanModelSchemaDigest},obligations:original.target.obligations.map(o=>({id:o.id,status:'checked'}))};
 if(!checkPreparedActionPlanModel(value)||planUnknownMembers(value,'model').length)planError('PAP_INVALID','Preparation result violates schema');return preparedArtifact(value);
}
export function inspectActionPlan(input:ActionPlanArtifact,context:ActionPlanInspectionContext):ActionPlanInspection {
 const source=readPlanArtifact(input),diagnostics:ActionPlanDiagnostic[]=[];let plan:PortableActionPlan|null=null;
 try{
  verifyPlanArtifact(source);if(source.mediaType!=='application/json')planError('PAP_INVALID','Plan media type must be application/json');
  const parsed=parsePlanJson(source.utf8);if(!checkActionPlan(parsed))planError('PAP_INVALID','Malformed known plan surface');plan=parsed as unknown as PortableActionPlan;
  const unknown=planUnknownMembers(plan,'plan');if(Object.keys(source).some(k=>!['mediaType','utf8','sha256'].includes(k)))unknown.unshift('/artifact');for(const path of unknown){if(diagnostics.length>=128)planError('PAP_LIMIT','Diagnostic capacity exceeded');diagnostics.push(diag('PAP_UNKNOWN',path,'Unknown relevant plan member'));}
  const original=resolveActionPlanContext(plan.model,plan.action,context),bound=subset(original.document,original.target.action);
  if(!jsonEqual(plan.target,bound.target)||plan.inputs.entityParameter!==bound.entityParameter||plan.inputs.assignments.length!==bound.assignments.length)planError('PAP_ACTION','Invocation template differs from original action');
  const seenInputs=new Set<string>();for(let i=0;i<plan.inputs.assignments.length;i++){const actual=plan.inputs.assignments[i]!,expected=bound.assignments.find(a=>a.input===actual.input);if(!expected||seenInputs.has(actual.input)||!jsonEqual(actual.field,expected.field))planError('PAP_ACTION','Exact assignment/input/Field mismatch','/inputs/assignments/'+i);seenInputs.add(actual.input);const field=knownActionModel(original.document,actual.field,'field');try{checkSchemaLiteral(original.document,field,actual.value);}catch{planError('PAP_ACTION','Constant value violates original Field','/inputs/assignments/'+i+'/value');}}
  let retainedBytes=boundedJsonBytes(source as never,4194304);for(const a of [plan.source,plan.selection.artifact]){const safe=readPlanArtifact(a);verifyPlanArtifact(safe);retainedBytes+=boundedJsonBytes(safe as never,4194304);}retainedBytes+=original.snapshotBytes;if(retainedBytes>4194304)planError('PAP_LIMIT','Total retained input bound exceeded');
  const selections=data<ActionPlanInspectionContext['selections']>(context,'selections');if(!Array.isArray(selections)||selections.length>64)planError('PAP_LIMIT','Selection registry bound exceeded');const matching=collection(selections).filter(s=>jsonEqual(copy(data(s,'profile')),plan!.selection.profile));if(matching.length!==1)planError('PAP_PROFILE','One exact installed selection interpreter required');const callback=data<ActionPlanInspectionContext['selections'][number]['inspect']>(matching[0]!,'inspect');if(typeof callback!=='function')planError('PAP_PROFILE','Missing trusted selection interpreter');
  const selected=copy(callback(copy(plan.selection.artifact),copy(original.document),copy(plan.target)));if(!selected||typeof selected.eligible!=='boolean'||!Array.isArray(selected.dependencies)||!Array.isArray(selected.diagnostics)||selected.dependencies.length>256)planError('PAP_PROFILE','Malformed selection interpretation');
  if(selected.diagnostics.length>128)planError('PAP_LIMIT','Diagnostic capacity exceeded');
  if(!selected.eligible)planError('PAP_PROFILE','Selected program is not fully interpreted');if(!jsonEqual(selected.dependencies,plan.selection.dependencies)||new Set(selected.dependencies.map(refId)).size!==selected.dependencies.length)planError('PAP_ACTION','Selection dependency coverage/order mismatch');
  const record=knownActionModel(original.document,plan.target,'record');for(const ref of selected.dependencies){if(!checkActionPlanField(ref)||((record.members??[]) as unknown as ActionReference[]).every(m=>!jsonEqual(m,ref)))planError('PAP_ACTION','Selection Field is not in target Record');const field=knownActionModel(original.document,ref,'field');if(field.nullability!=='required'||field.cardinality!=='one'||!['boolean','integer','string'].includes(field.scalarType??''))planError('PAP_ACTION','Unsupported selection Field domain');}
  for(const d of selected.diagnostics){if(!checkActionPlanDiagnostic(d)||d.code.length>256||d.message.length>1024)planError('PAP_PROFILE','Malformed interpreter diagnostic');if(diagnostics.length>=128)planError('PAP_LIMIT','Diagnostic capacity exceeded');diagnostics.push(d);}
 }catch(error){if(diagnostics.length===128)diagnostics.pop();diagnostics.push(errorDiagnostic(error));}
 return {plan,source,eligible:diagnostics.length===0,diagnostics};
}
const companionClaims={plan:['integrity','actionBinding'],selection:['interpretation','completeRead'],manifest:['partition','sealCustody'],guard:['identityVersion'],snapshot:['coherentCut'],bulk:['atomicBatch','replay','principal','recovery','cancel','retention']} as const;
export function snapshotActionPlanInspection(inspection:ActionPlanInspection):ActionPlanInspection {
 const descriptors=Object.getOwnPropertyDescriptors(inspection);if(Object.getOwnPropertySymbols(inspection).length||Object.keys(descriptors).length!==4||Object.entries(descriptors).some(([key,d])=>!['source','plan','eligible','diagnostics'].includes(key)||!d.enumerable||!('value' in d)))planError('PAP_INVALID','Malformed inspection wrapper');
  return {source:readPlanArtifact(data<ActionPlanArtifact>(inspection,'source')),plan:copy(data<PortableActionPlan|null>(inspection,'plan')),eligible:copy(data<boolean>(inspection,'eligible')),diagnostics:copy(data<ActionPlanDiagnostic[]>(inspection,'diagnostics'))};
}
export function assessActionPlan(inspection:ActionPlanInspection,capabilities:ActionPlanCapabilities,context:ActionPlanInspectionContext):ActionPlanAssessment {
 const result:ActionPlanAssessment={compatible:false,executionVerified:false,obligations:[],diagnostics:[]};
 try{
  const supplied=snapshotActionPlanInspection(inspection),fresh=inspectActionPlan(supplied.source,context);if(!jsonEqual(supplied,fresh)||!fresh.eligible||!fresh.plan)planError('PAP_ACTION','Inspection differs from fresh original inspection or is ineligible');const plan=fresh.plan!,caps=copy(capabilities);if(!checkActionPlanCapabilities(caps)||planUnknownMembers(caps,'capabilities').length)planError('PAP_PROFILE','Malformed/unknown exact capabilities');
  const local=profile(plan.action.invocation,localActionProfiles.invocation),fixed={plan:'umf.actions.plan',manifest:'umf.actions.manifest',bulk:local?localActionProfiles.bulk:'umf.actions.bulk'};
  for(const family of Object.keys(companionClaims) as (keyof typeof companionClaims)[]){const cap=caps[family],expected=companionClaims[family].map(id=>family+'.'+(local&&family==='bulk'&&id==='principal'?'localOwner':id));if(family in fixed&&!profile(cap.profile,fixed[family as keyof typeof fixed]))planError('PAP_PROFILE','Companion version mismatch');if(family==='selection'&&!jsonEqual(cap.profile,plan.selection.profile))planError('PAP_PROFILE','Selection capability/profile mismatch');
   if(cap.claims.length!==expected.length||new Set(cap.claims.map(c=>c.id)).size!==expected.length||cap.claims.some(c=>!expected.includes(c.id)))planError('PAP_PROFILE','Missing/duplicate/unknown companion claim');
   for(const id of expected){const claim=cap.claims.find(c=>c.id===id)!;if(claim.status==='supported'&&!claim.evidence.length)planError('PAP_PROFILE','Supported claim lacks evidence');result.obligations.push(copy(claim));if(claim.status!=='supported')result.diagnostics.push(diag('PAP_PROFILE','/capabilities/'+family,'Companion obligation '+claim.status));}
  }
  const original=resolveActionPlanContext(plan.model,plan.action,context),assessment=assessAction(original.document,plan.action.identity,caps.action,context.registry);for(const outcome of assessment.outcomes)result.obligations.push({id:outcome.obligation,status:outcome.status,evidence:copy(outcome.evidence)});if(!assessment.declaredCompatible)result.diagnostics.push(diag('PAP_PROFILE','/capabilities/action','Original action capability mismatch'));result.compatible=result.diagnostics.length===0;
 }catch(error){result.diagnostics.push(errorDiagnostic(error));}return copy(result);
}
