import {hashCanonical,sha256Text} from '../compilation/bundle/hash';
import {verifyTableDeployment,type TableDeploymentBundle} from '../table-deployment';
import {verifyTableMigration} from './index';

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
function verifiedBundle(value:unknown):TableDeploymentBundle {const result=verifyTableDeployment(value);if(result.bundleDigest!==((value as Record<string,unknown>).bundleDigest))fail('BUNDLE_DIGEST');return result;}
function seedMap(bundle:TableDeploymentBundle):Map<string,SeedSet>{const out=new Map<string,SeedSet>();for(const definition of bundle.seedSets){if(out.has(definition.id))fail('DUPLICATE_DEFINITION');out.set(definition.id,definition);}return out;}
function pythonCanonical(value:unknown):string {
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isSafeInteger(value)||Object.is(value,-0))fail('LEGACY_PHASE_NUMBER');return String(value);}
 if(Array.isArray(value))return '['+value.map(pythonCanonical).join(',')+']';
 if(!isObject(value))return fail('LEGACY_PHASE_VALUE');
 const keys=Object.keys(value).sort((a,b)=>{const aa=Array.from(a,character=>character.codePointAt(0)!),bb=Array.from(b,character=>character.codePointAt(0)!);for(let i=0;i<Math.min(aa.length,bb.length);i++)if(aa[i]!==bb[i])return aa[i]!-bb[i]!;return aa.length-bb.length;});
 return '{'+keys.map(key=>JSON.stringify(key)+':'+pythonCanonical(value[key])).join(',')+'}';
}
function seedPhaseFor(plan:Record<string,unknown>,seedId:string,legacy:boolean):{phase:Record<string,unknown>;digest:string}|null {
 const steps=Array.isArray(plan.steps)?plan.steps.filter(isObject):[];
 const ids=steps.map(step=>step.id);if(ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)return null;
 const matching=steps.filter(step=>{
  const ids=step.seedSets??(isObject(step.inventorySubject)?step.inventorySubject.sets:undefined);
  return (step.kind==='seed'||step.operation==='apply-seeds')&&Array.isArray(ids)&&ids.includes(seedId)&&typeof step.id==='string';
 });
 if(matching.length!==1)return null;
 const stepId=matching[0]!.id,phases=Array.isArray(plan.phases)?plan.phases.filter(isObject):[];
 const owners=phases.filter(phase=>Array.isArray(phase.steps)&&phase.steps.includes(stepId));
 if(owners.length!==1)return null;
 const phase=owners[0]!,phaseStepIds=phase.steps as unknown[];
 if(phaseStepIds.some(id=>typeof id!=='string')||new Set(phaseStepIds).size!==phaseStepIds.length)return null;
 const byId=new Map(steps.map(step=>[step.id as string,step]));
 if(phaseStepIds.some(id=>!byId.has(id as string)))return null;
 const phaseSteps=(phaseStepIds as string[]).map(id=>byId.get(id)!);
 const selected=matching[0]!,selectedSets=selected.seedSets??(isObject(selected.inventorySubject)?selected.inventorySubject.sets:undefined);
 const execution=plan.seedExecution;
 if(!Array.isArray(selectedSets)||!exact(execution,['version','sets'])||execution.version!=='umf.table-seed-execution/0.1'||!Array.isArray(execution.sets)||JSON.stringify(selectedSets)!==JSON.stringify(execution.sets))return null;
 const preimage={phase,steps:phaseSteps};
 const digest=legacy?sha256Text(pythonCanonical(preimage)):hashCanonical(preimage);
 return {phase,digest};
}
function proof(value:unknown,entryDigest:string,plan:Record<string,unknown>,seedId:string):SeedProof {
 if(!isObject(value))return fail('PROOF_SHAPE');
 const phased=Array.isArray(plan.phases)&&plan.phases.length>0,legacy=typeof plan.version==='string'&&/^umf\.table-migration\/0\.[1-6]$/.test(plan.version),atomicLegacy=plan.version==='umf.table-migration/0.1'&&!phased;
 if(value.kind==='atomic-publication'&&exact(value,['kind','entryDigest'])&&atomicLegacy&&sha(value.entryDigest)&&value.entryDigest===entryDigest)return {kind:'atomic-publication',entryDigest:value.entryDigest};
 if(value.kind==='phase'&&exact(value,['kind','phaseId','phaseDigest','phaseReceiptDigest','entryDigest'])&&typeof value.phaseId==='string'&&sha(value.phaseDigest)&&sha(value.phaseReceiptDigest)&&sha(value.entryDigest)&&value.entryDigest===entryDigest){const phase=seedPhaseFor(plan,seedId,legacy);if(phase&&phase.phase.id===value.phaseId&&phase.digest===value.phaseDigest)return {kind:'phase',phaseId:value.phaseId,phaseDigest:value.phaseDigest,phaseReceiptDigest:value.phaseReceiptDigest,entryDigest};}
 return fail('PROOF_BINDING');
}
function readOutcome(value:unknown,entryDigest:string,plan:Record<string,unknown>):SeedOutcome {
 if(!exact(value,['id','definitionDigest','originalSourceDigest','execution','proof'])||typeof value.id!=='string'||!value.id||!sha(value.definitionDigest)||!sha(value.originalSourceDigest)||value.execution!=='confirmed')return fail('OUTCOME_SHAPE');
 return {id:value.id,definitionDigest:value.definitionDigest,originalSourceDigest:value.originalSourceDigest,execution:'confirmed',proof:proof(value.proof,entryDigest,plan,value.id)};
}
function consistentPhaseReceipts(outcomes:readonly SeedOutcome[]):void {
 const byPhase=new Map<string,{phaseDigest:string;receiptDigest:string}>();
 for(const outcome of outcomes){const value=outcome.proof;if(value.kind!=='phase')continue;const prior=byPhase.get(value.phaseId);if(prior&&(prior.phaseDigest!==value.phaseDigest||prior.receiptDigest!==value.phaseReceiptDigest))fail('PHASE_RECEIPT_CONFLICT');byPhase.set(value.phaseId,{phaseDigest:value.phaseDigest,receiptDigest:value.phaseReceiptDigest});}
}
function readLineage(value:unknown):SeedLineageEntry {
 if(!exact(value,['id','definitionDigest','originalSourceDigest','disposition','execution'])||typeof value.id!=='string'||!value.id||!sha(value.definitionDigest)||!sha(value.originalSourceDigest)||!['retain-definition','apply-once','retire-definition'].includes(String(value.disposition))||!['not-run','confirmed'].includes(String(value.execution)))return fail('ENTRY_SHAPE');
 return {id:value.id,definitionDigest:value.definitionDigest,originalSourceDigest:value.originalSourceDigest,disposition:value.disposition as SeedLineageEntry['disposition'],execution:value.execution as SeedLineageEntry['execution']};
}
function readIds(value:unknown,code:string):string[]{if(!Array.isArray(value)||value.some(x=>typeof x!=='string'||!x)||new Set(value).size!==value.length)return fail(code);return [...value];}
function idsFromPlan(plan:Record<string,unknown>):{selected:string[];retired:string[]} {
 if(typeof plan.version==='string'&&/^umf\.table-migration\/0\.[1-6]$/.test(plan.version)){
  const execution=plan.seedExecution;if(execution==='none')return {selected:[],retired:[]};
  if(!exact(execution,['version','sets'])||execution.version!=='umf.table-seed-execution/0.1')return fail('LEGACY_SEED_EXECUTION');
  return {selected:readIds(execution.sets,'LEGACY_SELECTED_IDS'),retired:[]};
 }
 const options=plan.options;
 if(!isObject(options)||options.version!=='umf.table-inventory-migration-options/0.1')return fail('PLAN_OPTIONS');
 const selected=readIds(options.seedSets,'SELECTED_IDS'),retired=readIds(options.retiredSeedSets,'RETIRED_IDS');
 const seedExecution=plan.seedExecution;
 if(selected.length===0){if(seedExecution!=='none')return fail('SEED_EXECUTION_EMPTY');}
 else if(!exact(seedExecution,['version','sets'])||seedExecution.version!=='umf.table-seed-execution/0.1'||JSON.stringify(readIds(seedExecution.sets,'EXECUTION_IDS'))!==JSON.stringify(selected))return fail('SEED_EXECUTION_BINDING');
 return {selected,retired};
}
function assertPlanShape(value:unknown,index:number,priorHistory:InventoryHistory,verifyG10?:import('./inventory-options').HistoricalG10PlanVerifier):Record<string,unknown> {
 if(isObject(value)&&typeof value.version==='string'&&/^umf\.table-migration\/0\.[1-6]$/.test(value.version)){
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
function expectedLineage(states:Map<string,State>,next:Map<string,SeedSet>,selected:string[],retired:string[]):SeedLineageEntry[]{
 const selectedSet=new Set(selected),retiredSet=new Set(retired);if(selectedSet.size!==selected.length||retiredSet.size!==retired.length)return fail('DUPLICATE_SELECTION');
 for(const id of selected){if(!next.has(id))return fail('SELECTED_NOT_IN_NEXT');const state=states.get(id);if(state?.retired||state?.execution==='confirmed')return fail('REPLAY_OR_RETIRED');}
 for(const id of retired){if(next.has(id)||!states.has(id)||states.get(id)!.retired)return fail('RETIREMENT_TARGET');}
 const ordered=[...states.keys()];
 for(const [id,definition]of next){if(!states.has(id)){states.set(id,{definition,definitionDigest:hashCanonical(definition),originalSourceDigest:'',execution:'not-run',retired:false});ordered.push(id);}else if(hashCanonical(states.get(id)!.definition)!==hashCanonical(definition))return fail('REDEFINITION');}
 for(const id of ordered){const state=states.get(id)!;if(state.retired&&next.has(id))return fail('RETIRED_ID_REUSED');if(retiredSet.has(id))state.retired=true;}
 return ordered.map(id=>{const state=states.get(id)!;const disposition:SeedLineageEntry['disposition']=state.retired?'retire-definition':selectedSet.has(id)?'apply-once':'retain-definition';return {id,definitionDigest:state.definitionDigest,originalSourceDigest:state.originalSourceDigest,disposition,execution:state.execution};});
}
function sameEntries(actual:unknown,expected:SeedLineageEntry[]):void {
 if(!Array.isArray(actual)||actual.length!==expected.length)return fail('LINEAGE_COUNT');
 for(let i=0;i<expected.length;i++){const found=readLineage(actual[i]);if(hashCanonical(found)!==hashCanonical(expected[i]))fail('LINEAGE_MISMATCH');}
}
function applyConfirmed(states:Map<string,State>,selected:string[],outcomes:SeedOutcome[]):void {
 const byId=new Map(outcomes.map(item=>[item.id,item]));if(byId.size!==outcomes.length||byId.size!==selected.length)return fail('OUTCOME_COUNT');
 for(const id of selected){const state=states.get(id),result=byId.get(id);if(!state||!result||result.definitionDigest!==state.definitionDigest||result.originalSourceDigest!==state.originalSourceDigest||state.retired||state.execution==='confirmed')return fail('OUTCOME_MISMATCH');state.execution='confirmed';}
}

/** Derive source lineage only. This never proves that a reported native outcome occurred. */
export function deriveInventorySeedLineage(history:InventoryHistory,current:CurrentSeedRequest,verifyG10?:import('./inventory-options').HistoricalG10PlanVerifier):SeedLineageEntry[] {
 if(!exact(history,['profile','plans','executions'])||history.profile!=='umf.table-inventory-source-history/0.1'||!Array.isArray(history.plans)||!Array.isArray(history.executions)||history.plans.length!==history.executions.length||history.plans.length>128)return fail('HISTORY_SHAPE');
 const states=new Map<string,State>();let priorPlan:Record<string,unknown>|null=null,priorBundle:TableDeploymentBundle|null=null;
 for(let i=0;i<history.plans.length;i++){
  const plan=assertPlanShape(history.plans[i],i,{profile:history.profile,plans:history.plans.slice(0,i),executions:history.executions.slice(0,i)},verifyG10),next=verifiedBundle(plan.next),previous=plan.previous===null?null:verifiedBundle(plan.previous);
  if(i===0){if(previous!==null||plan.predecessor!==null)return fail('FIRST_PLAN_NOT_INITIAL');}
  else {if(!priorPlan||!priorBundle||!previous||previous.bundleDigest!==priorBundle.bundleDigest||!exact(plan.predecessor,['id','digest'])||plan.predecessor.id!==priorPlan.id||plan.predecessor.digest!==priorPlan.digest)return fail('HISTORY_CHAIN');}
  const {selected,retired}=idsFromPlan(plan),nextSeeds=seedMap(next),beforeIds=[...states.keys()];
  for(const [id,definition] of nextSeeds){const found=states.get(id);if(!found){states.set(id,{definition,definitionDigest:hashCanonical(definition),originalSourceDigest:next.sourceDigest,execution:'not-run',retired:false});}else if(found.retired||found.definitionDigest!==hashCanonical(definition))return fail('HISTORICAL_REDEFINITION');}
  const expected=expectedLineage(states,nextSeeds,selected,retired);
  const legacy=typeof plan.version==='string'&&/^umf\.table-migration\/0\.[1-6]$/.test(plan.version);
  if(!legacy){if(!isObject(plan.inventory)||!Array.isArray(plan.inventory.seedLineage))return fail('PLAN_LINEAGE_MISSING');sameEntries(plan.inventory.seedLineage,expected);}
  const execution=history.executions[i];if(!exact(execution,['planDigest','entryDigest','seedOutcomes'])||execution.planDigest!==plan.digest||!sha(execution.entryDigest)||!Array.isArray(execution.seedOutcomes))return fail('HISTORY_EXECUTION_BINDING');
  const outcomes=execution.seedOutcomes.map(item=>readOutcome(item,execution.entryDigest as string,plan));consistentPhaseReceipts(outcomes);applyConfirmed(states,selected,outcomes);
  // A definition absent from next must be explicitly retired; keep its full original bytes in history.
  for(const id of beforeIds)if(!nextSeeds.has(id)&&!states.get(id)!.retired)return fail('UNDECLARED_REMOVAL');
  priorPlan=plan;priorBundle=next;
 }
 const previous=current.previous===null?null:verifiedBundle(current.previous),next=verifiedBundle(current.next);
 if(priorPlan===null){if(previous!==null)return fail('HISTORY_REQUIRED_FOR_PREVIOUS');}
 else if(!previous||!priorBundle||previous.bundleDigest!==priorBundle.bundleDigest)return fail('HISTORY_TERMINAL');
 const selected=readIds(current.options.seedSets,'CURRENT_SELECTED'),retired=readIds(current.options.retiredSeedSets,'CURRENT_RETIRED'),nextSeeds=seedMap(next);
 if(previous){const priorSeeds=seedMap(previous);for(const id of priorSeeds.keys())if(!nextSeeds.has(id)&&!retired.includes(id))return fail('CURRENT_UNDECLARED_REMOVAL');}
 const expected=expectedLineage(states,nextSeeds,selected,retired);
 for(const entry of expected){const state=states.get(entry.id)!;if(!state.originalSourceDigest)state.originalSourceDigest=next.sourceDigest;entry.originalSourceDigest=state.originalSourceDigest;}
 return expected;
}
