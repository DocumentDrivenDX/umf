// SPDX-License-Identifier: MIT OR Apache-2.0
import type {TableDeploymentBundle} from '../table-deployment';
import type {MigrationPhaseKind,MigrationPhaseTransaction,TableMigrationExecutionProfile} from './phases-options';

export interface TableMigrationPhase {
 id:string;
 kind:MigrationPhaseKind;
 transaction:MigrationPhaseTransaction;
 steps:string[];
}

/** Step fields U1's compiler hook needs; concrete source types remain owned by the migration compiler. */
export interface PhasedMigrationStep {
 id:string;
 kind:string;
 transaction:MigrationPhaseTransaction;
 operation?:string;
 sql?:string;
 constraintKind?:'check'|'foreignKey';
 seedSets?:string[];
 phaseOperation?:'backfill'|'tighten-not-null'|'add-column'|'target-check'|'install-default'|'change-default';
 phaseTarget?:{table:string;field:{module:string;element:string}};
}

export interface SeedMigrationStep extends PhasedMigrationStep {
 kind:'seed';
 transaction:'required';
 sourcePath:'/seedExecution/sets';
 sql:'';
 operation:'apply-seeds';
 seedSets:string[];
 preconditions:{phase:'before-plan';kind:'installed-source-cohort';bundleDigest:string};
 expectedOutcome:{phase:'before-commit';kind:'complete-next-source-catalog';bundleDigest:string};
 verification:'native-catalog-privileges-and-role-scope';
 recovery:'rollback-transaction';
}

export interface PhasedMigrationResult<TStep extends PhasedMigrationStep> {
 steps:TStep[];
 phases:TableMigrationPhase[];
 executionProfile:TableMigrationExecutionProfile;
}

const EXECUTION_PROFILE_01:TableMigrationExecutionProfile={
 version:'umf.table-migration-execution/0.1',
 progressRelation:'umf_lifecycle_progress',
 ownerOnly:true,
};
const EXECUTION_PROFILE_02:TableMigrationExecutionProfile={
 version:'umf.table-migration-execution/0.2',
 progressRelation:'umf_lifecycle_progress',
 ownerOnly:true,
};
const EXECUTION_PROFILE_03:TableMigrationExecutionProfile={
 version:'umf.table-migration-execution/0.3',
 progressRelation:'umf_lifecycle_progress',
 ownerOnly:true,
};
const EXECUTION_PROFILE_04:TableMigrationExecutionProfile={
 version:'umf.table-migration-execution/0.4',
 progressRelation:'umf_lifecycle_progress',
 ownerOnly:true,
};

function phaseKind(step:PhasedMigrationStep):MigrationPhaseKind{
 if(step.kind==='backfill')return 'backfill';
 if(step.kind==='seed')return 'seed';
 if(step.kind==='index'&&step.transaction==='forbidden')return 'concurrent-index';
 if(step.operation==='add-not-valid')return 'constraint-add';
 if(step.operation==='validate')return 'constraint-validation';
 return 'transaction';
}

/**
 * Split source-ordered migration operations at durable recovery barriers.
 * No SQL is inspected or rewritten here. The compiler supplies explicit
 * operation metadata for constraints and already source-bound step IDs.
 */
export function phaseTableMigrationSteps<TStep extends PhasedMigrationStep>(
 steps:readonly TStep[],
 _previous:TableDeploymentBundle|null,
 _next:TableDeploymentBundle,
 _options?:unknown,
 seedExecution:'none'|{version:'umf.table-seed-execution/0.1';sets:string[]}|undefined='none',
):PhasedMigrationResult<TStep|SeedMigrationStep>{
 const plannedSteps:(TStep|SeedMigrationStep)[]=[...steps];
 if(seedExecution!=='none'&&seedExecution!==undefined){
  let nextId=1;
  for(const step of steps){const match=/^step-(\d{5})$/.exec(step.id);if(match)nextId=Math.max(nextId,Number(match[1])+1);}
  if(nextId>99999)throw new Error('migration-step-capacity');
  const bundleDigest=_next.bundleDigest;
  const previousDigest=_previous?.bundleDigest;
  if(!previousDigest)throw new Error('seed-phase-requires-predecessor');
  plannedSteps.push({id:'step-'+String(nextId).padStart(5,'0'),kind:'seed',transaction:'required',
   sourcePath:'/seedExecution/sets',sql:'',operation:'apply-seeds',seedSets:[...seedExecution.sets],
   preconditions:{phase:'before-plan',kind:'installed-source-cohort',bundleDigest:previousDigest},
   expectedOutcome:{phase:'before-commit',kind:'complete-next-source-catalog',bundleDigest},
   verification:'native-catalog-privileges-and-role-scope',recovery:'rollback-transaction'});
 }
 const isG01=!!_options&&typeof _options==='object'&&(_options as {version?:unknown}).version==='umf.table-migration-options/0.3';
 const isG02=!!_options&&typeof _options==='object'&&(_options as {version?:unknown}).version==='umf.table-migration-options/0.4';
 const isG03=!!_options&&typeof _options==='object'&&(_options as {version?:unknown}).version==='umf.table-migration-options/0.5';
 if(isG03){
  const step=plannedSteps[0];
  if(plannedSteps.length!==1||step?.kind!=='table'||step.transaction!=='required'||step.phaseOperation!=='change-default'||!step.phaseTarget||!step.sql||!['set-default','drop-default'].includes(step.operation??''))throw new Error('g03-default-change-step-invalid');
  return {steps:plannedSteps,phases:[{id:'phase-00001',kind:'default-change',transaction:'required',steps:[step.id]}],executionProfile:EXECUTION_PROFILE_04};
 }
 const phases:TableMigrationPhase[]=[];
 let current:TableMigrationPhase|undefined;
 const flush=()=>{if(current){phases.push(current);current=undefined;}};
 for(let i=0;i<plannedSteps.length;i++){
  const step=plannedSteps[i]!;
  if(isG02&&step.phaseOperation==='add-column'){
   const target=step.phaseTarget;
   const group=[step];let j=i+1;
   while(j<plannedSteps.length&&plannedSteps[j]!.phaseTarget?.table===target?.table&&plannedSteps[j]!.phaseTarget?.field.module===target?.field.module&&plannedSteps[j]!.phaseTarget?.field.element===target?.field.element&&plannedSteps[j]!.phaseOperation){group.push(plannedSteps[j]!);j++;}
   const roles=group.map(item=>item.phaseOperation);
   const backfillIndex=roles.indexOf('backfill'),defaultIndex=roles.indexOf('install-default');
   if(!target||step.kind!=='table'||step.transaction!=='required'||roles[0]!=='add-column'||roles.filter(role=>role==='backfill').length!==1||roles.filter(role=>role==='tighten-not-null').length!==1||roles.at(-1)!=='tighten-not-null'||roles.filter(role=>role==='install-default').length>1||roles.some(role=>!['add-column','target-check','backfill','install-default','tighten-not-null'].includes(role!))||roles.slice(1,backfillIndex).some(role=>role!=='target-check')||defaultIndex!==-1&&defaultIndex<backfillIndex||roles.slice(backfillIndex+1,-1).some(role=>role!=='install-default'))throw new Error('g02-add-fill-tighten-correspondence-invalid');
   const backfill=group.find(item=>item.phaseOperation==='backfill'),tighten=group.at(-1);
   if(group.length<3||backfill?.kind!=='backfill'||backfill.sql!==''||tighten?.kind!=='table'||backfill.transaction!=='required'||tighten.transaction!=='required'||group.some(item=>item.transaction!=='required'||item.phaseTarget?.table!==target.table||item.phaseTarget.field.module!==target.field.module||item.phaseTarget.field.element!==target.field.element))throw new Error('g02-add-fill-tighten-correspondence-invalid');
   flush();phases.push({id:'phase-'+String(phases.length+1).padStart(5,'0'),kind:'backfill-add',transaction:'required',steps:group.map(item=>item.id)});i=j-1;continue;
  }
  if((isG01||isG02)&&step.phaseOperation==='backfill'){
   const tighten=plannedSteps[i+1];
   if(step.kind!=='backfill'||step.transaction!=='required'||!step.phaseTarget||!tighten||tighten.phaseOperation!=='tighten-not-null'||tighten.kind!=='table'||tighten.transaction!=='required'||tighten.phaseTarget?.table!==step.phaseTarget.table||tighten.phaseTarget.field.module!==step.phaseTarget.field.module||tighten.phaseTarget.field.element!==step.phaseTarget.field.element)throw new Error('g01-backfill-tighten-pair-invalid');
   flush();
   phases.push({id:'phase-'+String(phases.length+1).padStart(5,'0'),kind:'backfill-tighten',transaction:'required',steps:[step.id,tighten.id]});
   i++;
   continue;
  }
  const kind=phaseKind(step),isolated=kind!=='transaction';
  if(isolated)flush();
  if(!current){
   current={id:'phase-'+String(phases.length+1).padStart(5,'0'),kind,
    transaction:step.transaction,steps:[]};
  }
  if(current.transaction!==step.transaction){flush();current={id:'phase-'+String(phases.length+1).padStart(5,'0'),kind,
   transaction:step.transaction,steps:[]};}
  current.steps.push(step.id);
  if(isolated)flush();
 }
 flush();
 return {steps:plannedSteps,phases,executionProfile:isG02?EXECUTION_PROFILE_03:isG01?EXECUTION_PROFILE_02:EXECUTION_PROFILE_01};
}
