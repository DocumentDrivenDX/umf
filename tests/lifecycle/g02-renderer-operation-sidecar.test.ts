// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment} from '../../src/table-deployment';
import {compileTableMigration} from '../../src/table-migration';
import {compileG02FieldEffects,compileTableMigrationWithOperations} from '../../src/table-migration/internal';
import fixture from '../binding/fixtures/table-lifecycle-note.json';

const configuration={module:'demo',schema:'g02_demo',ownerRole:'g02_owner',personRole:'g02_person',batchRole:'g02_batch',groupRoles:{}};
const field=(element:string)=>({module:'demo',element});

function source(append=false,operation=true){
 const doc=structuredClone(fixture) as any,module=doc.modules[0]!,payload=module.extensions['umf.tables'],table=payload.tables[0]!;
 if(append){
  module.elements.push({id:'summary',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',facets:{length:{min:1,max:100,unit:'unicode-scalar'}},extensions:{}});
  module.elements.find((item:any)=>item.id==='Note')!.members.push(field('summary'));
  table.columns.push({field:field('summary'),name:'summary',nativeType:{kind:'text'}});
 }
 if(operation)payload.commands.push({version:'umf.table-operation/0.2',id:'derive_summary',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'notes',where:{op:'isNull',field:field('summary')},values:[{field:field('summary'),value:{kind:'rowExpression',expression:{op:'concat',args:[{op:'field',field:field('owner')},{op:'literal',value:{string:' / '}},{op:'field',field:field('id')}]}}}],returning:[],maxRows:100}});
 return doc;
}

function bundle(doc:any){
 const result=compileTableDeployment({text:JSON.stringify(doc),configuration});
 if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
 return result.bundle;
}

test('G02 internal renderer sidecar reports typed source-site effects without changing public plan bytes',()=>{
 const previous=bundle(source(false,false)),next=bundle(source(true)),input={id:'g02-internal-sidecar',predecessor:{id:'g02-internal-previous',digest:'a'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.4' as const,backfills:[{table:'notes',column:field('summary'),operation:'derive_summary',scopedRows:true as const}],concurrentIndexes:[],reviewedChanges:[],validations:[]}};
 const publicResult=compileTableMigration(input),internal=compileTableMigrationWithOperations(input);
 if(publicResult.status!=='compiled')throw new Error(JSON.stringify(publicResult.diagnostics));
 if(internal.result.status!=='compiled')throw new Error(JSON.stringify(internal.result.diagnostics));
 expect(publicResult.status).toBe('compiled');expect(internal.result.status).toBe('compiled');
 if(publicResult.status!=='compiled'||internal.result.status!=='compiled')throw Error('G02 source fixture did not compile');
 expect(JSON.stringify(internal.result.plan)).toBe(JSON.stringify(publicResult.plan));
 expect(internal.result.plan.digest).toBe(publicResult.plan.digest);
 expect(internal.result.plan.steps.some(step=>Object.getOwnPropertySymbols(step).length>0)).toBe(false);
 const fieldEffects=internal.operations.filter(item=>item.subject.type==='field');
 expect(fieldEffects.map(item=>item.role)).toEqual(['add-column','target-check','backfill','tighten-not-null']);
 expect(fieldEffects.every(item=>item.subject.type==='field'&&item.subject.table==='notes'&&item.subject.field.module==='demo'&&item.subject.field.element==='summary')).toBe(true);
 expect(fieldEffects.find(item=>item.role==='backfill')).toMatchObject({sourcePath:'/options/backfills/0',rowOperationId:'derive_summary'});
 expect(fieldEffects.every(item=>internal.result.status==='compiled'&&internal.result.plan.steps.some(step=>step.id===item.stepId&&step.sourcePath===item.sourcePath))).toBe(true);
 const shared=compileG02FieldEffects({previous,next,options:input.options,createdTables:[]}),legacySteps=publicResult.plan.steps.filter(step=>['add-column','target-check','backfill','install-default','tighten-not-null'].includes(step.phaseOperation??'')&&step.phaseTarget?.field.element==='summary');
 expect(shared.map(item=>[item.role,item.sourcePath,item.sql])).toEqual(legacySteps.map(step=>[step.phaseOperation,step.sourcePath,step.sql]));
});
