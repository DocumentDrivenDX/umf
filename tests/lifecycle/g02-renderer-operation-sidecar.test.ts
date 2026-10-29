// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment} from '../../src/table-deployment';
import {compileTableMigration} from '../../src/table-migration';
import {compileG02FieldEffects,compileTableMigrationWithOperations} from '../../src/table-migration/internal';
import {projectG10BundleWithAccounting} from '../../src/table-migration/inventory-projection';
import {R2WorkLimitError,R2WorkMeter} from '../../src/table-migration/inventory-r2-context';
import {withVerifiedG10BundleScope} from '../../src/table-migration/inventory-verified-deployment';
import type {G02FieldEffectRole} from '../../src/table-migration/g02-field-effects';
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
 const shared=compileG02FieldEffects({previous,next,options:input.options,createdTables:[]}),g02Roles=new Set<string>(['add-column','target-check','backfill','install-default','tighten-not-null']),legacySteps=publicResult.plan.steps.filter((step):step is typeof step&{phaseOperation:G02FieldEffectRole}=>typeof step.phaseOperation==='string'&&g02Roles.has(step.phaseOperation)&&step.phaseTarget?.field.element==='summary');
 expect(shared.map(item=>{if(typeof item.sourcePath!=='string'||typeof item.sql!=='string')throw Error('G02 effect source binding or SQL is missing');return [item.role,item.sourcePath,item.sql] as const;})).toEqual(legacySteps.map(step=>{if(typeof step.phaseOperation!=='string'||typeof step.sourcePath!=='string'||typeof step.sql!=='string')throw Error('Legacy G02 source binding or SQL is missing');return [step.phaseOperation,step.sourcePath,step.sql] as const;}));
});

test('metered G02 reuses only the exact bundles already projected in its active G10 scope',()=>{
 const previous=bundle(source(false,false)),next=bundle(source(true)),options={version:'umf.table-migration-options/0.4' as const,backfills:[{table:'notes',column:field('summary'),operation:'derive_summary',scopedRows:true as const}],concurrentIndexes:[],reviewedChanges:[],validations:[]},meter=new R2WorkMeter();
 const expected=compileG02FieldEffects({previous,next,options,createdTables:[]}).map(item=>[item.role,item.sourcePath,item.sql]);
 const expectGuardFailure=(run:()=>unknown)=>{let failure:unknown;try{run();}catch(error){failure=error;}expect(failure).toBeDefined();expect(failure).not.toBeInstanceOf(R2WorkLimitError);return failure;};
 withVerifiedG10BundleScope(meter,()=>{
  const previousProjection=projectG10BundleWithAccounting(previous,'previous',meter),nextProjection=projectG10BundleWithAccounting(next,'next',meter);
  const actual=compileG02FieldEffects({previous:previousProjection.bundle,next:nextProjection.bundle,options,createdTables:[],accounting:meter}).map(item=>[item.role,item.sourcePath,item.sql]);
  expect(actual).toEqual(expected);
  const changed=structuredClone(nextProjection.bundle);changed.source.utf8+=' ';
  expectGuardFailure(()=>compileG02FieldEffects({previous:previousProjection.bundle,next:changed,options,createdTables:[],accounting:meter}));
  expect(expectGuardFailure(()=>compileG02FieldEffects({previous:previousProjection.bundle,next:nextProjection.bundle,options:{...options,version:'umf.table-migration-options/0.5' as const},createdTables:[],accounting:meter}))).toMatchObject({message:'table-migration-internal-g02-profile'});
  expect(expectGuardFailure(()=>compileG02FieldEffects({previous:previousProjection.bundle,next:nextProjection.bundle,options,createdTables:['unclaimed-table'],accounting:meter}))).toMatchObject({message:'G10 create identities must exactly bind the complete before/after source pair'});
  const wrongFieldOptions={...options,backfills:[{...options.backfills[0]!,column:field('id')}]};
  expectGuardFailure(()=>compileG02FieldEffects({previous:previousProjection.bundle,next:nextProjection.bundle,options:wrongFieldOptions,createdTables:[],accounting:meter}));
 });
});
