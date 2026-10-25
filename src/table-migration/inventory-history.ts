import {hashCanonical,hashCanonicalCharged,sha256Text} from '../compilation/bundle/hash';
import {verifyTableDeployment,verifyTableDeploymentWithAccounting,type TableDeploymentBundle} from '../table-deployment';
import {verifyTableMigration} from './index';
import type {AccountingContext} from '../model/internal/accounting-context';

type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
type SeedSet=TableDeploymentBundle['seedSets'][number];
export type SeedLineageEntry={id:string;definitionDigest:string;originalSourceDigest:string;disposition:'retain-definition'|'apply-once'|'retire-definition';execution:'not-run'|'confirmed'};
export type SeedProof={kind:'atomic-publication';entryDigest:string}|{kind:'phase';phaseId:string;phaseDigest:string;phaseReceiptDigest:string;entryDigest:string};
export type SeedOutcome={id:string;definitionDigest:string;originalSourceDigest:string;execution:'confirmed';proof:SeedProof};
export interface InventoryHistory {profile:'umf.table-inventory-source-history/0.1';plans:unknown[];executions:unknown[]}
export interface CurrentSeedRequest {previous:TableDeploymentBundle|null;next:TableDeploymentBundle;options:{seedSets:string[];retiredSeedSets:string[]}}
type State={definition:SeedSet;definitionDigest:string;originalSourceDigest:string;execution:'not-run'|'confirmed';retired:boolean};
const SHA=/^[a-f0-9]{64}$/;
function fail(code:string):never{throw new Error('G10_SEED_LINEAGE_'+code);}
function isObject(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);}
function exact(value:unknown,keys:readonly string[]):value is Record<string,unknown>{return isObject(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));}
function sha(value:unknown):value is string{return typeof value==='string'&&SHA.test(value);}
function withoutDigest(plan:Record<string,unknown>):Json {const copy:Record<string,Json>={};for(const [key,value]of Object.entries(plan)){if(key==='digest')continue;copy[key]=value as Json;}return copy;}
function verifiedBundle(value:unknown,accounting?:AccountingContext):TableDeploymentBundle {const result=accounting?verifyTableDeploymentWithAccounting(value as TableDeploymentBundle,accounting).bundle:verifyTableDeployment(value);if(result.bundleDigest!==((value as Record<string,unknown>).bundleDigest))fail('BUNDLE_DIGEST');return result;}
function seedMap(bundle:TableDeploymentBundle,accounting?:AccountingContext,path='/seedSets'):Map<string,SeedSet>{const out=new Map<string,SeedSet>();for(let index=0;index<bundle.seedSets.length;index++){accounting?.visit('seed-lineage-map-entry',`${path}/${index}`);const definition=bundle.seedSets[index]!;if(out.has(definition.id))fail('DUPLICATE_DEFINITION');accounting?.visit('seed-lineage-map-retention',`${path}/${index}`);out.set(definition.id,definition);}return out;}
function pythonCanonical(value:unknown):string {
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isSafeInteger(value)||Object.is(value,-0))fail('LEGACY_PHASE_NUMBER');return String(value);}
 if(Array.isArray(value))return '['+value.map(pythonCanonical).join(',')+']';
 if(!isObject(value))return fail('LEGACY_PHASE_VALUE');
 const keys=Object.keys(value).sort((a,b)=>{const aa=Array.from(a,character=>character.codePointAt(0)!),bb=Array.from(b,character=>character.codePointAt(0)!);for(let i=0;i<Math.min(aa.length,bb.length);i++)if(aa[i]!==bb[i])return aa[i]!-bb[i]!;return aa.length-bb.length;});
 return '{'+keys.map(key=>JSON.stringify(key)+':'+pythonCanonical(value[key])).join(',')+'}';
}
function seedPhaseFor(plan:Record<string,unknown>,seedId:string,legacy:boolean,accounting?:AccountingContext,path='/seed-proof'): {phase:Record<string,unknown>;digest:string}|null {
 const rawSteps=Array.isArray(plan.steps)?plan.steps:[];accounting?.visit('seed-phase-step-scan',`${path}/steps`,rawSteps.length);const steps:Record<string,unknown>[]=[];
 for(const step of rawSteps)if(isObject(step)){accounting?.visit('seed-phase-step-retention',`${path}/steps`);steps.push(step);}
 const seenIds=new Set<string>();for(const step of steps){accounting?.visit('seed-phase-id-check',`${path}/steps`);if(typeof step.id!=='string'||seenIds.has(step.id))return null;seenIds.add(step.id);}
 const matching:Record<string,unknown>[]=[];for(const step of steps){accounting?.visit('seed-phase-seed-match',`${path}/steps`);
  const ids=step.seedSets??(isObject(step.inventorySubject)?step.inventorySubject.sets:undefined);let containsSeed=false;
  if(Array.isArray(ids))for(const id of ids){accounting?.visit('seed-phase-seed-id-compare',`${path}/steps/${String(step.id)}/seedSets`);if(id===seedId)containsSeed=true;}
  if((step.kind==='seed'||step.operation==='apply-seeds')&&Array.isArray(ids)&&containsSeed&&typeof step.id==='string'){accounting?.visit('seed-phase-match-retention',`${path}/steps`);matching.push(step);}
 }
 if(matching.length!==1)return null;
 const stepId=matching[0]!.id,rawPhases=Array.isArray(plan.phases)?plan.phases:[];accounting?.visit('seed-phase-owner-scan',`${path}/phases`,rawPhases.length);const phases:Record<string,unknown>[]=[];for(const phase of rawPhases)if(isObject(phase)){accounting?.visit('seed-phase-owner-retention',`${path}/phases`);phases.push(phase);}
 const owners:Record<string,unknown>[]=[];for(const phase of phases){accounting?.visit('seed-phase-owner-match',`${path}/phases`);let ownsStep=false;if(Array.isArray(phase.steps))for(const id of phase.steps){accounting?.visit('seed-phase-owner-step-compare',`${path}/phases`);if(id===stepId)ownsStep=true;}if(ownsStep){accounting?.visit('seed-phase-owner-result',`${path}/phases`);owners.push(phase);}}
 if(owners.length!==1)return null;
 const phase=owners[0]!,phaseStepIds=phase.steps as unknown[];
 const phaseSeen=new Set<string>();for(const id of phaseStepIds){accounting?.visit('seed-phase-step-uniqueness',`${path}/phase/steps`);if(typeof id!=='string'||phaseSeen.has(id))return null;phaseSeen.add(id);}
 const byId=new Map<string,Record<string,unknown>>();for(const step of steps){accounting?.visit('seed-phase-step-index',`${path}/steps`);byId.set(step.id as string,step);}
 for(const id of phaseStepIds){accounting?.visit('seed-phase-step-binding',`${path}/phase/steps`);if(!byId.has(id as string))return null;}
 const phaseSteps:Record<string,unknown>[]=[];for(const id of phaseStepIds as string[]){accounting?.visit('seed-phase-step-resolution',`${path}/phase/steps`);phaseSteps.push(byId.get(id)!);}
 const selected=matching[0]!,selectedSets=selected.seedSets??(isObject(selected.inventorySubject)?selected.inventorySubject.sets:undefined);
 const execution=plan.seedExecution;
 if(!Array.isArray(selectedSets)||!exact(execution,['version','sets'])||execution.version!=='umf.table-seed-execution/0.1'||!Array.isArray(execution.sets)||selectedSets.length!==execution.sets.length)return null;
 let sameSelected=true;for(let index=0;index<selectedSets.length;index++){accounting?.visit('seed-phase-selected-set-binding',`${path}/seedExecution/sets/${index}`);if(selectedSets[index]!==execution.sets[index])sameSelected=false;}if(!sameSelected)return null;
 const preimage={phase,steps:phaseSteps};
 const digest=legacy?sha256Text(pythonCanonical(preimage)):accounting?hashCanonicalCharged(preimage,accounting,`${path}/phase-digest`):hashCanonical(preimage);
 return {phase,digest};
}
function proof(value:unknown,entryDigest:string,plan:Record<string,unknown>,seedId:string,accounting?:AccountingContext,path='/seed-proof'):SeedProof {
 if(!isObject(value))return fail('PROOF_SHAPE');
 const phased=Array.isArray(plan.phases)&&plan.phases.length>0,legacy=typeof plan.version==='string'&&/^umf\.table-migration\/0\.[1-6]$/.test(plan.version),atomicLegacy=plan.version==='umf.table-migration/0.1'&&!phased;
 if(value.kind==='atomic-publication'&&exact(value,['kind','entryDigest'])&&atomicLegacy&&sha(value.entryDigest)&&value.entryDigest===entryDigest){accounting?.visit('seed-proof-result',path);return {kind:'atomic-publication',entryDigest:value.entryDigest};}
 if(value.kind==='phase'&&exact(value,['kind','phaseId','phaseDigest','phaseReceiptDigest','entryDigest'])&&typeof value.phaseId==='string'&&sha(value.phaseDigest)&&sha(value.phaseReceiptDigest)&&sha(value.entryDigest)&&value.entryDigest===entryDigest){const phase=seedPhaseFor(plan,seedId,legacy,accounting,path);if(phase&&phase.phase.id===value.phaseId&&phase.digest===value.phaseDigest){accounting?.visit('seed-proof-result',path);return {kind:'phase',phaseId:value.phaseId,phaseDigest:value.phaseDigest,phaseReceiptDigest:value.phaseReceiptDigest,entryDigest};}}
 return fail('PROOF_BINDING');
}
function readOutcome(value:unknown,entryDigest:string,plan:Record<string,unknown>,accounting?:AccountingContext,path='/seed-outcome'):SeedOutcome {
 if(!exact(value,['id','definitionDigest','originalSourceDigest','execution','proof'])||typeof value.id!=='string'||!value.id||!sha(value.definitionDigest)||!sha(value.originalSourceDigest)||value.execution!=='confirmed')return fail('OUTCOME_SHAPE');
 return {id:value.id,definitionDigest:value.definitionDigest,originalSourceDigest:value.originalSourceDigest,execution:'confirmed',proof:proof(value.proof,entryDigest,plan,value.id,accounting,`${path}/proof`)};
}
function consistentPhaseReceipts(outcomes:readonly SeedOutcome[],accounting?:AccountingContext,path='/seed-outcomes'):void {
 const byPhase=new Map<string,{phaseDigest:string;receiptDigest:string}>();
 for(const outcome of outcomes){accounting?.visit('seed-phase-receipt-scan',path);const value=outcome.proof;if(value.kind!=='phase')continue;const prior=byPhase.get(value.phaseId);if(prior&&(prior.phaseDigest!==value.phaseDigest||prior.receiptDigest!==value.phaseReceiptDigest))fail('PHASE_RECEIPT_CONFLICT');accounting?.visit('seed-phase-receipt-retention',path);byPhase.set(value.phaseId,{phaseDigest:value.phaseDigest,receiptDigest:value.phaseReceiptDigest});}
}
function readLineage(value:unknown):SeedLineageEntry {
 if(!exact(value,['id','definitionDigest','originalSourceDigest','disposition','execution'])||typeof value.id!=='string'||!value.id||!sha(value.definitionDigest)||!sha(value.originalSourceDigest)||!['retain-definition','apply-once','retire-definition'].includes(String(value.disposition))||!['not-run','confirmed'].includes(String(value.execution)))return fail('ENTRY_SHAPE');
 return {id:value.id,definitionDigest:value.definitionDigest,originalSourceDigest:value.originalSourceDigest,disposition:value.disposition as SeedLineageEntry['disposition'],execution:value.execution as SeedLineageEntry['execution']};
}
function readIds(value:unknown,code:string,accounting?:AccountingContext,path='/seed-ids'):string[]{if(!Array.isArray(value))return fail(code);const result:string[]=[],seen=new Set<string>();for(const item of value){accounting?.visit('seed-id-validation',path);if(typeof item!=='string'||!item||seen.has(item))return fail(code);accounting?.visit('seed-id-retention',path);seen.add(item);result.push(item);}return result;}
function idsFromPlan(plan:Record<string,unknown>,accounting?:AccountingContext,path='/plan'): {selected:string[];retired:string[]} {
 if(typeof plan.version==='string'&&/^umf\.table-migration\/0\.[1-6]$/.test(plan.version)){
  const execution=plan.seedExecution;if(execution==='none')return {selected:[],retired:[]};
  if(!exact(execution,['version','sets'])||execution.version!=='umf.table-seed-execution/0.1')return fail('LEGACY_SEED_EXECUTION');
  return {selected:readIds(execution.sets,'LEGACY_SELECTED_IDS',accounting,`${path}/seedExecution/sets`),retired:[]};
 }
 const options=plan.options;
 if(!isObject(options)||options.version!=='umf.table-inventory-migration-options/0.1')return fail('PLAN_OPTIONS');
 const selected=readIds(options.seedSets,'SELECTED_IDS',accounting,`${path}/options/seedSets`),retired=readIds(options.retiredSeedSets,'RETIRED_IDS',accounting,`${path}/options/retiredSeedSets`);
 const seedExecution=plan.seedExecution;
 if(selected.length===0){if(seedExecution!=='none')return fail('SEED_EXECUTION_EMPTY');}
 else{
  if(!exact(seedExecution,['version','sets'])||seedExecution.version!=='umf.table-seed-execution/0.1')return fail('SEED_EXECUTION_BINDING');
  const executionIds=readIds(seedExecution.sets,'EXECUTION_IDS',accounting,`${path}/seedExecution/sets`);if(executionIds.length!==selected.length)return fail('SEED_EXECUTION_BINDING');
  for(let index=0;index<selected.length;index++){accounting?.visit('seed-execution-id-binding',`${path}/seedExecution/sets/${index}`);if(executionIds[index]!==selected[index])return fail('SEED_EXECUTION_BINDING');}
 }
 return {selected,retired};
}
function assertPlanShape(value:unknown,index:number,priorHistory:InventoryHistory,verifyG10?:import('./inventory-options').HistoricalG10PlanVerifier,accounting?:AccountingContext):Record<string,unknown> {
 if(isObject(value)&&typeof value.version==='string'&&/^umf\.table-migration\/0\.[1-6]$/.test(value.version)){
  if(accounting)return fail('UNSUPPORTED_METERED_LEGACY_HISTORY');
  const verified=verifyTableMigration(value);if(verified.digest!==value.digest)return fail('LEGACY_PLAN_DIGEST');
  if(index===0&&verified.previous!==null||index>0&&verified.previous===null)return fail('LEGACY_PLAN_INITIAL');
  return verified as unknown as Record<string,unknown>;
 }
 // A canonical digest is only a self-consistency check. Until this scratch
 // profile has an exact G10 plan recompiler, it must not accept G10 history as
 // proof of a prior source-derived plan or execution context.
 if(isObject(value)&&value.version==='umf.table-inventory-migration/0.1'){if(!verifyG10)return fail('UNVERIFIED_HISTORICAL_PLAN');verifyG10(value,index,priorHistory as unknown as Parameters<import('./inventory-options').HistoricalG10PlanVerifier>[2]);return value;}
 if(!isObject(value)||typeof value.digest!=='string'||!sha(value.digest))return fail('PLAN_SHAPE');
 if(hashCanonical(withoutDigest(value))!==value.digest)return fail('PLAN_DIGEST');
 return fail('UNVERIFIED_HISTORICAL_PLAN');
}
function expectedLineage(states:Map<string,State>,next:Map<string,SeedSet>,selected:string[],retired:string[],accounting?:AccountingContext,path='/seedLineage'):SeedLineageEntry[]{
 accounting?.visit('seed-lineage-selection-index',path,selected.length+retired.length);const selectedSet=new Set(selected),retiredSet=new Set(retired);if(selectedSet.size!==selected.length||retiredSet.size!==retired.length)return fail('DUPLICATE_SELECTION');
 for(const id of selected){accounting?.visit('seed-lineage-selected-check',path);if(!next.has(id))return fail('SELECTED_NOT_IN_NEXT');const state=states.get(id);if(state?.retired||state?.execution==='confirmed')return fail('REPLAY_OR_RETIRED');}
 for(const id of retired){accounting?.visit('seed-lineage-retired-check',path);if(next.has(id)||!states.has(id)||states.get(id)!.retired)return fail('RETIREMENT_TARGET');}
 const ordered:string[]=[];for(const id of states.keys()){accounting?.visit('seed-lineage-existing-order',path);accounting?.visit('seed-lineage-order-retention',path);ordered.push(id);}
 for(const [id,definition]of next){accounting?.visit('seed-lineage-next-definition',path);const state=states.get(id);if(!state){const digest=accounting?hashCanonicalCharged(definition,accounting,`${path}/${id}/definition`):hashCanonical(definition);accounting?.visit('seed-lineage-state-retention',`${path}/${id}`);states.set(id,{definition,definitionDigest:digest,originalSourceDigest:'',execution:'not-run',retired:false});accounting?.visit('seed-lineage-order-retention',path);ordered.push(id);}else{const before=accounting?hashCanonicalCharged(state.definition,accounting,`${path}/${id}/prior-definition`):hashCanonical(state.definition),after=accounting?hashCanonicalCharged(definition,accounting,`${path}/${id}/definition`):hashCanonical(definition);if(before!==after)return fail('REDEFINITION');}}
 for(const id of ordered){accounting?.visit('seed-lineage-disposition',path);const state=states.get(id)!;if(state.retired&&next.has(id))return fail('RETIRED_ID_REUSED');if(retiredSet.has(id))state.retired=true;}
 const result:SeedLineageEntry[]=[];for(const id of ordered){accounting?.visit('seed-lineage-result',path);const state=states.get(id)!;const disposition:SeedLineageEntry['disposition']=state.retired?'retire-definition':selectedSet.has(id)?'apply-once':'retain-definition';accounting?.visit('seed-lineage-result-retention',path);result.push({id,definitionDigest:state.definitionDigest,originalSourceDigest:state.originalSourceDigest,disposition,execution:state.execution});}return result;
}
function sameEntries(actual:unknown,expected:SeedLineageEntry[],accounting?:AccountingContext,path='/seedLineage'):void {
 if(!Array.isArray(actual)||actual.length!==expected.length)return fail('LINEAGE_COUNT');
 for(let i=0;i<expected.length;i++){accounting?.visit('seed-lineage-compare',`${path}/${i}`);const found=readLineage(actual[i]),foundDigest=accounting?hashCanonicalCharged(found,accounting,`${path}/${i}/actual`):hashCanonical(found),expectedDigest=accounting?hashCanonicalCharged(expected[i],accounting,`${path}/${i}/expected`):hashCanonical(expected[i]);if(foundDigest!==expectedDigest)fail('LINEAGE_MISMATCH');}
}
function applyConfirmed(states:Map<string,State>,selected:string[],outcomes:SeedOutcome[],accounting?:AccountingContext,path='/seed-outcomes'):void {
 const byId=new Map<string,SeedOutcome>();for(const item of outcomes){accounting?.visit('seed-outcome-index',path);if(byId.has(item.id))fail('OUTCOME_COUNT');accounting?.visit('seed-outcome-index-retention',path);byId.set(item.id,item);}if(byId.size!==outcomes.length||byId.size!==selected.length)return fail('OUTCOME_COUNT');
 for(const id of selected){accounting?.visit('seed-outcome-apply',path);const state=states.get(id),result=byId.get(id);if(!state||!result||result.definitionDigest!==state.definitionDigest||result.originalSourceDigest!==state.originalSourceDigest||state.retired||state.execution==='confirmed')return fail('OUTCOME_MISMATCH');state.execution='confirmed';}
}

/** Derive source lineage only. This never proves that a reported native outcome occurred. */
export function deriveInventorySeedLineage(history:InventoryHistory,current:CurrentSeedRequest,verifyG10?:import('./inventory-options').HistoricalG10PlanVerifier,accounting?:AccountingContext):SeedLineageEntry[] {
 if(!exact(history,['profile','plans','executions'])||history.profile!=='umf.table-inventory-source-history/0.1'||!Array.isArray(history.plans)||!Array.isArray(history.executions)||history.plans.length!==history.executions.length||history.plans.length>128)return fail('HISTORY_SHAPE');
 const states=new Map<string,State>();let priorPlan:Record<string,unknown>|null=null,priorBundle:TableDeploymentBundle|null=null;
 for(let i=0;i<history.plans.length;i++){
  accounting?.charge('historyMember',1,`/history/plans/${i}`);accounting?.charge('historyMember',1,`/history/executions/${i}`);
  if(accounting){hashCanonicalCharged(history.plans[i],accounting,`/history/plans/${i}`);hashCanonicalCharged(history.executions[i],accounting,`/history/executions/${i}`);}
  accounting?.visit('seed-history-prefix-copy',`/history/${i}`,i*2);const plan=assertPlanShape(history.plans[i],i,{profile:history.profile,plans:history.plans.slice(0,i),executions:history.executions.slice(0,i)},verifyG10,accounting),next=verifiedBundle(plan.next,accounting),previous=plan.previous===null?null:verifiedBundle(plan.previous,accounting);
  if(i===0){if(previous!==null||plan.predecessor!==null)return fail('FIRST_PLAN_NOT_INITIAL');}
  else {if(!priorPlan||!priorBundle||!previous||previous.bundleDigest!==priorBundle.bundleDigest||!exact(plan.predecessor,['id','digest'])||plan.predecessor.id!==priorPlan.id||plan.predecessor.digest!==priorPlan.digest)return fail('HISTORY_CHAIN');}
  const {selected,retired}=idsFromPlan(plan,accounting,`/history/plans/${i}`),nextSeeds=seedMap(next,accounting,`/history/plans/${i}/next/seedSets`),beforeIds:string[]=[];for(const id of states.keys()){accounting?.visit('seed-lineage-before-id',`/history/plans/${i}`);accounting?.visit('seed-lineage-before-id-retention',`/history/plans/${i}`);beforeIds.push(id);}
  for(const [id,definition] of nextSeeds){accounting?.visit('seed-definition-lineage',`/history/plans/${i}/next/seedSets`);const digest=accounting?hashCanonicalCharged(definition,accounting,`/history/plans/${i}/next/seedSets/${id}`):hashCanonical(definition);const found=states.get(id);if(!found){accounting?.visit('seed-lineage-state-retention',`/history/plans/${i}/seedLineage/${id}`);states.set(id,{definition,definitionDigest:digest,originalSourceDigest:next.sourceDigest,execution:'not-run',retired:false});}else if(found.retired||found.definitionDigest!==digest)return fail('HISTORICAL_REDEFINITION');}
  const expected=expectedLineage(states,nextSeeds,selected,retired,accounting,`/history/plans/${i}/seedLineage`);
  const legacy=typeof plan.version==='string'&&/^umf\.table-migration\/0\.[1-6]$/.test(plan.version);
  if(!legacy){if(!isObject(plan.inventory)||!Array.isArray(plan.inventory.seedLineage))return fail('PLAN_LINEAGE_MISSING');sameEntries(plan.inventory.seedLineage,expected,accounting,`/history/plans/${i}/inventory/seedLineage`);}
  const execution=history.executions[i];if(!exact(execution,['planDigest','entryDigest','seedOutcomes'])||execution.planDigest!==plan.digest||!sha(execution.entryDigest)||!Array.isArray(execution.seedOutcomes))return fail('HISTORY_EXECUTION_BINDING');
  accounting?.visit('seed-outcome-lineage',`/history/executions/${i}/seedOutcomes`,execution.seedOutcomes.length);const outcomes:SeedOutcome[]=[];for(let outcomeIndex=0;outcomeIndex<execution.seedOutcomes.length;outcomeIndex++){accounting?.visit('seed-outcome-retention',`/history/executions/${i}/seedOutcomes/${outcomeIndex}`);outcomes.push(readOutcome(execution.seedOutcomes[outcomeIndex],execution.entryDigest as string,plan,accounting,`/history/executions/${i}/seedOutcomes/${outcomeIndex}`));}consistentPhaseReceipts(outcomes,accounting,`/history/executions/${i}/seedOutcomes`);applyConfirmed(states,selected,outcomes,accounting,`/history/executions/${i}/seedOutcomes`);
  // A definition absent from next must be explicitly retired; keep its full original bytes in history.
  for(const id of beforeIds)if(!nextSeeds.has(id)&&!states.get(id)!.retired)return fail('UNDECLARED_REMOVAL');
  priorPlan=plan;priorBundle=next;
 }
 if(accounting){hashCanonicalCharged(current.options,accounting,'/current/options');}
 const previous=current.previous===null?null:verifiedBundle(current.previous,accounting),next=verifiedBundle(current.next,accounting);
 if(priorPlan===null){if(previous!==null)return fail('HISTORY_REQUIRED_FOR_PREVIOUS');}
 else if(!previous||!priorBundle||previous.bundleDigest!==priorBundle.bundleDigest)return fail('HISTORY_TERMINAL');
 const selected=readIds(current.options.seedSets,'CURRENT_SELECTED',accounting,'/current/options/seedSets'),retired=readIds(current.options.retiredSeedSets,'CURRENT_RETIRED',accounting,'/current/options/retiredSeedSets'),nextSeeds=seedMap(next,accounting,'/current/next/seedSets');
 if(previous){const priorSeeds=seedMap(previous,accounting,'/current/previous/seedSets');for(const id of priorSeeds.keys()){accounting?.visit('seed-current-removal-check','/current/previous/seedSets');if(!nextSeeds.has(id)&&!retired.includes(id))return fail('CURRENT_UNDECLARED_REMOVAL');}}
 const expected=expectedLineage(states,nextSeeds,selected,retired,accounting,'/current/seedLineage');
 for(const entry of expected){const state=states.get(entry.id)!;if(!state.originalSourceDigest)state.originalSourceDigest=next.sourceDigest;entry.originalSourceDigest=state.originalSourceDigest;}
 return expected;
}
