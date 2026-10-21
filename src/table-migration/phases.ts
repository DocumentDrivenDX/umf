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
):PhasedMigrationResult<TStep>{
 const phases:TableMigrationPhase[]=[];
 let current:TableMigrationPhase|undefined;
 const flush=()=>{if(current){phases.push(current);current=undefined;}};
 for(const step of steps){
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
 return {steps:[...steps],phases,executionProfile:EXECUTION_PROFILE};
}
