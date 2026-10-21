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
 constraintKind?:'check'|'foreignKey';
 seedSets?:string[];
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

const EXECUTION_PROFILE:TableMigrationExecutionProfile={
 version:'umf.table-migration-execution/0.1',
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
 const phases:TableMigrationPhase[]=[];
 let current:TableMigrationPhase|undefined;
 const flush=()=>{if(current){phases.push(current);current=undefined;}};
 for(const step of plannedSteps){
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
 return {steps:plannedSteps,phases,executionProfile:EXECUTION_PROFILE};
}
