// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {phaseTableMigrationSteps,type PhasedMigrationStep} from '../../src/table-migration/phases';

test('mixed phase plan keeps source order and puts durable effects behind individual barriers',()=>{
 const steps:PhasedMigrationStep[]=[
  {id:'step-00001',kind:'table',transaction:'required'},
  {id:'step-00002',kind:'backfill',transaction:'required',operation:'review'},
  {id:'step-00003',kind:'table',transaction:'required'},
  {id:'step-00004',kind:'constraint',transaction:'required',operation:'add-not-valid'},
  {id:'step-00005',kind:'index',transaction:'forbidden'},
  {id:'step-00006',kind:'constraint',transaction:'required',operation:'validate'},
 ];
 const result=phaseTableMigrationSteps(steps,{bundleDigest:'a'.repeat(64)} as never,{bundleDigest:'b'.repeat(64)} as never,undefined,{version:'umf.table-seed-execution/0.1',sets:['seed-a']});
 expect(result.phases).toEqual([
  {id:'phase-00001',kind:'transaction',transaction:'required',steps:['step-00001']},
  {id:'phase-00002',kind:'backfill',transaction:'required',steps:['step-00002']},
  {id:'phase-00003',kind:'transaction',transaction:'required',steps:['step-00003']},
  {id:'phase-00004',kind:'constraint-add',transaction:'required',steps:['step-00004']},
  {id:'phase-00005',kind:'concurrent-index',transaction:'forbidden',steps:['step-00005']},
  {id:'phase-00006',kind:'constraint-validation',transaction:'required',steps:['step-00006']},
  {id:'phase-00007',kind:'seed',transaction:'required',steps:['step-00007']},
 ]);
 expect(result.steps.slice(0,steps.length)).toEqual(steps);
 expect(result.steps.at(-1)).toMatchObject({id:'step-00007',kind:'seed',operation:'apply-seeds',seedSets:['seed-a']});
 expect(result.executionProfile).toEqual({version:'umf.table-migration-execution/0.1',progressRelation:'umf_lifecycle_progress',ownerOnly:true});
});
