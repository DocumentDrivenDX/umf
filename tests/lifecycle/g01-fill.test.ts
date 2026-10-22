// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment,type TableDeploymentBundle} from '../../src/table-deployment';
import {compileTableMigration,discoverTableMigrationChanges,verifyTableMigration} from '../../src/table-migration';
import {hashCanonical} from '../../src/compilation/bundle/hash';
import {createValidator} from '../../src/validation/schema';
import deploymentSchema from '../../spec/extensions/tables/deployment.schema.json';
import tablesSchema from '../../spec/extensions/tables/schema.json';
import migrationSchema from '../../spec/extensions/tables/migration-0.3.schema.json';
import historicalV02NullBackfill from './fixtures/g01-historical-v0.2-null-backfill.json';
import fixture from '../binding/fixtures/table-lifecycle-note.json';

const configuration={module:'demo',schema:'plugin_demo',ownerRole:'plugin_owner',personRole:'plugin_person',batchRole:'plugin_batch',groupRoles:{readers:'plugin_readers'}};
const source=(withFill=true)=>{
 const doc=structuredClone(fixture) as any,module=doc.modules[0]!,table=module.extensions['umf.tables'].tables[0]!;
 module.elements.push({id:'summary',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}});
 module.elements.find((element:any)=>element.id==='Note')!.members.push({module:'demo',element:'summary'});
 table.columns.push({field:{module:'demo',element:'summary'},name:'summary',nativeType:{kind:'text'}});
 if(withFill)module.extensions['umf.tables'].commands.push({version:'umf.table-operation/0.1',id:'fill_summary',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'notes',where:{op:'isNull',field:{module:'demo',element:'summary'}},values:[{field:{module:'demo',element:'summary'},value:{kind:'literal',value:{string:'filled'}}}],returning:[],maxRows:100}});
 return doc;
};
function bundle(doc:any):TableDeploymentBundle{const result=compileTableDeployment({text:JSON.stringify(doc),configuration});if(result.status!=='compiled')throw Error(JSON.stringify(result));return result.bundle;}
function transition(change?:(doc:any)=>void){
 const old=source(false),next=source();next.modules[0]!.elements.find((element:any)=>element.id==='summary')!.nullability='required';change?.(next);
 const previous=bundle(old),fresh=bundle(next),candidate=discoverTableMigrationChanges(previous,fresh).find(item=>item.kind==='tighten-not-null');
 if(!candidate)throw Error('No tightening marker candidate');
 const {oldValue:_old,newValue:_new,...marker}=candidate;
 const input={id:'g01-fill-002',predecessor:{id:'g01-fill-001',digest:'a'.repeat(64)},previous,next:fresh,options:{version:'umf.table-migration-options/0.3' as const,backfills:[{table:'notes',column:{module:'demo',element:'summary'},operation:'fill_summary',scopedRows:true as const}],concurrentIndexes:[],reviewedChanges:[marker],validations:[]}};
 return {previous,next:fresh,input};
}

test('G01 compiles exact existing-field backfill and NOT NULL into one ordered required phase',()=>{
 const {input}=transition(),result=compileTableMigration(input);
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw Error(JSON.stringify(result));
 expect(result.plan.version).toBe('umf.table-migration/0.3');
 expect(result.plan.approvalProfile).toEqual({version:'umf.table-migration-approval/0.1',relation:'umf_lifecycle_approvals',ownerOnly:true});
 expect(result.plan.executionProfile).toEqual({version:'umf.table-migration-execution/0.2',progressRelation:'umf_lifecycle_progress',ownerOnly:true});
 expect(result.plan.phases).toEqual([{id:'phase-00001',kind:'backfill-tighten',transaction:'required',steps:result.plan.steps.map(step=>step.id)}]);
 expect(result.plan.steps).toHaveLength(2);
 expect(result.plan.steps[0]).toMatchObject({kind:'backfill',transaction:'required',sql:'',operation:'fill_summary',phaseOperation:'backfill',phaseTarget:{table:'notes',field:{module:'demo',element:'summary'}}});
 expect(result.plan.steps[1]).toMatchObject({kind:'table',transaction:'required',phaseOperation:'tighten-not-null',phaseTarget:{table:'notes',field:{module:'demo',element:'summary'}},sql:'ALTER TABLE "plugin_demo"."notes" ALTER COLUMN "summary" SET NOT NULL'});
 const validator=createValidator();validator.addSchema(tablesSchema);validator.addSchema(deploymentSchema);expect(validator.compile(migrationSchema)(result.plan)).toBe(true);
 expect(verifyTableMigration(result.plan)).toEqual(result.plan);
});

test('the frozen released v0.2 NULL-literal append plan still verifies byte-for-byte',()=>{
 const verified=verifyTableMigration(historicalV02NullBackfill);
 expect(verified.version).toBe('umf.table-migration/0.2');
 expect(verified.digest).toBe('6b1ee25f2861877e1bc8c48e9df16afffc3d266c36a3d2413f34ca494b0c78d7');
 expect(verified).toEqual(historicalV02NullBackfill as any);
});

test('G01 rejects unreviewed, stale, wrong-selector and unsafe fill sources',()=>{
 const {input,previous,next}=transition(),options=input.options;
 const unreviewed={...input,options:{...options,reviewedChanges:[]}};
 expect(compileTableMigration(unreviewed).status).toBe('blocked');
 const stale=structuredClone(input);stale.options.reviewedChanges[0]!.newDigest='0'.repeat(64);expect(compileTableMigration(stale).status).toBe('blocked');
 const wrongField=structuredClone(input);wrongField.options.backfills[0]!.column.element='owner';expect(compileTableMigration(wrongField).status).toBe('blocked');
 const wrongPredicate=source();wrongPredicate.modules[0]!.extensions['umf.tables'].commands[0]!.body.where={op:'all'};
 expect(compileTableMigration({...input,next:bundle(wrongPredicate)}).status).toBe('blocked');
 const nullValue=source();nullValue.modules[0]!.extensions['umf.tables'].commands[0]!.body.values[0]!.value={kind:'literal',value:null};
 expect(compileTableMigration({...input,next:bundle(nullValue)}).status).toBe('blocked');
 const parameters=source();parameters.modules[0]!.extensions['umf.tables'].commands[0]!.parameters=[{id:'value',field:{module:'demo',element:'summary'}}];parameters.modules[0]!.extensions['umf.tables'].commands[0]!.body.values[0]!.value={kind:'parameter',parameter:'value'};
 expect(compileTableMigration({...input,next:bundle(parameters)}).status).toBe('blocked');
 const staleSource=structuredClone(input);staleSource.previous=previous;staleSource.next=next;staleSource.options.backfills[0]!.operation='missing';expect(compileTableMigration(staleSource).status).toBe('blocked');
 const unrelatedCommand=transition(doc=>doc.modules[0]!.extensions['umf.tables'].commands.push({version:'umf.table-operation/0.1',id:'other',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'notes',where:{op:'all'},values:[{field:{module:'demo',element:'owner'},value:{kind:'literal',value:{string:'elsewhere'}}}],returning:[],maxRows:1}})).input;
 expect(compileTableMigration(unrelatedCommand).status).toBe('blocked');
});

test('G01 refuses clock-domain mismatches and composite effects before emitting a partial plan',()=>{
 const date=source();date.modules[0]!.elements.find((element:any)=>element.id==='summary')!.scalarType='date';date.modules[0]!.extensions['umf.tables'].tables[0]!.columns.find((item:any)=>item.name==='summary')!.nativeType={kind:'date'};date.modules[0]!.extensions['umf.tables'].commands[0]!.body.values[0]!.value={kind:'currentTimestamp'};
 expect(()=>bundle(date)).toThrow();
 const composite:any=transition().input;composite.options.validations.push({table:'notes',constraint:'new-check',kind:'check'});
 expect(compileTableMigration(composite).status).toBe('blocked');
});

test('G01 plan digest covers approval, phase pairing and exact source',()=>{
 const result=compileTableMigration(transition().input);if(result.status!=='compiled')throw Error(JSON.stringify(result));
 for(const mutate of [(plan:any)=>plan.approvalProfile.relation='other',(plan:any)=>plan.steps[1].phaseOperation='backfill',(plan:any)=>plan.options.backfills[0].operation='other']){
  const plan=structuredClone(result.plan);mutate(plan);const {digest,...body}=plan;plan.digest=hashCanonical(body);expect(()=>verifyTableMigration(plan)).toThrow();
 }
});
