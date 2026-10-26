// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment} from '../../src/table-deployment';
import {compileTableMigration,discoverTableMigrationChanges,verifyTableMigration} from '../../src/table-migration';
import {createValidator} from '../../src/validation/schema';
import deploymentSchema from '../../spec/extensions/tables/deployment.schema.json';
import g04MigrationSchema from '../../spec/extensions/tables/migration-0.7.schema.json';
import g04OptionsSchema from '../../spec/extensions/tables/migration-options-0.7.schema.json';
import g04DiscoverySchema from '../../spec/extensions/tables/migration-discovery-0.4.schema.json';
import g04PhasesSchema from '../../spec/extensions/tables/migration-phases-0.6.schema.json';
import fixture from '../binding/fixtures/table-lifecycle-note.json';

const configuration={module:'demo',schema:'plugin_demo',ownerRole:'plugin_owner',personRole:'plugin_person',batchRole:'plugin_batch',groupRoles:{readers:'plugin_readers'}};
const field={module:'demo',element:'rank'};
const selection={table:'notes',field,recipe:{version:'umf.conversion-recipe/0.1' as const,kind:'numeric-exact' as const,parameters:{}},nulls:'preserve' as const,invalid:'abort' as const};
function bundlePair(withIndex=false){
 const before=structuredClone(fixture) as any,after=structuredClone(fixture) as any;
 for(const document of [before,after]){
  const module=document.modules[0],table=module.extensions['umf.tables'].tables[0],record=module.elements.find((element:any)=>element.id==='Note');
  module.elements.splice(module.elements.findIndex((element:any)=>element.id==='Note'),0,{id:'rank',kind:'field',scalarType:'integer',cardinality:'one',nullability:'absent-allowed',extensions:{}});
  record.members.push(field);table.columns.push({field,name:'rank',nativeType:{kind:document===before?'int4':'int8'}});
  if(withIndex)table.indexes.push({id:'rank-index',name:'rank_index',fields:[field],unique:false,include:[]});
 }
 const compile=(document:any)=>{const result=compileTableDeployment({text:JSON.stringify(document),configuration});if(result.status!=='compiled')throw new Error(JSON.stringify(result));return result.bundle;};
 return {previous:compile(before),next:compile(after)};
}
function request(recovery:'retained-originals'|'irreversible'|'round-trip'='retained-originals',withIndex=false):any{
 const {previous,next}=bundlePair(withIndex),policySelection={...selection,recovery:recovery==='retained-originals'?{mode:'retained-originals',policy:{id:'archive-primary',revision:'v1'}}:recovery==='round-trip'?{mode:'round-trip',proofProfile:'umf.exact-integer-widening-roundtrip/0.1'}:{mode:'irreversible'}},cycleFree={version:'umf.table-migration-discovery/0.4' as const,conversionIntents:[policySelection]};
 const discovered=discoverTableMigrationChanges(previous,next,cycleFree) as any[];
 const effects=discovered.find(candidate=>candidate.kind==='conversion-effects');
 const conversions=[{...policySelection,recovery:recovery==='retained-originals'?policySelection.recovery:recovery==='round-trip'?policySelection.recovery:{mode:'irreversible',reviewMarker:effects.id}}];
 const options={version:'umf.table-migration-options/0.7' as const,backfills:[],concurrentIndexes:[],reviewedChanges:discovered.map(({oldValue:_old,newValue:_new,oldPath:_oldPath,newPath:_newPath,...marker})=>marker),validations:[],conversions};
 return {request:{id:'g04-conversion-001',predecessor:{id:'g04-installed-000',digest:'a'.repeat(64)},previous,next,options},cycleFree};
}

test('G04 .7 emits typed empty-SQL conversion phases and recompiles retained and irreversible recovery choices',()=>{
 for(const recovery of ['retained-originals','irreversible'] as const){
  const input=request(recovery),result=compileTableMigration(input.request);if(result.status!=='compiled')throw new Error(JSON.stringify(result));
  expect(result.plan.version).toBe('umf.table-migration/0.7');expect(result.plan.nativeQualified).toBe(false);
  expect(result.plan.executionProfile).toEqual({version:'umf.table-migration-execution/0.6',progressRelation:'umf_lifecycle_progress',ownerOnly:true,ingressProfile:'umf.table-generation-ingress/0.1',conversionProfile:'umf.checked-field-conversion/0.1',originalsProfile:recovery==='retained-originals'?'umf.pg-row-originals/0.1':null});
  expect(result.plan.steps.map(step=>step.operation)).toEqual(recovery==='retained-originals'?['capture-originals','convert-field','validate-conversion']:['convert-field','validate-conversion']);
  expect(result.plan.steps.every(step=>step.kind==='conversion'&&step.sql===''&&step.transaction==='required')).toBe(true);
  expect(result.plan.phases).toEqual([{id:'phase-00001',kind:'field-conversion',transaction:'required',steps:result.plan.steps.map(step=>step.id)}]);
  expect(verifyTableMigration(result.plan)).toEqual(result.plan);
  if(!result.plan.review)throw new Error('G04 plan omitted required review array');
  expect(result.plan.review.map(item=>item.code)).toEqual(recovery==='irreversible'?['IRREVERSIBLE_FIELD_CONVERSION']:[]);
 }
});

test('G04 discovery strips only irreversible marker references and binds complete source meaning',()=>{
 const input=request('irreversible'),candidates=discoverTableMigrationChanges(input.request.previous!,input.request.next,input.cycleFree) as any[];
 expect(()=>discoverTableMigrationChanges(input.request.previous!,input.request.next,{version:'umf.table-migration-discovery/0.4',conversionIntents:[]})).toThrow();
 const effect=candidates.find(candidate=>candidate.kind==='conversion-effects');
 expect(effect.id).toBe(input.request.options.conversions[0]!.recovery.reviewMarker);
 expect(effect.oldValue.version).toBe('umf.field-conversion-review/0.1');expect(effect.oldValue.side).toBe('previous');
 expect(effect.oldValue.source).toEqual({format:'json',sha256:expect.any(String)});
 expect(effect.oldValue.meaning).toHaveProperty('physical');expect(effect.oldValue.meaning).toHaveProperty('logical');expect(effect.oldValue.meaning).toHaveProperty('mapping');
 expect(effect.oldValue.conversionIntent.recovery).toEqual({mode:'irreversible'});
 expect(input.request.options.reviewedChanges.some((marker:any)=>marker.id===effect.id)).toBe(true);
});

test('G04 rejects unsupported round-trip proof issuance, dependent native closure, stale bindings and legacy conversion qualifiers',()=>{
 const roundTrip=request('round-trip');expect(discoverTableMigrationChanges(roundTrip.request.previous!,roundTrip.request.next,roundTrip.cycleFree)).toHaveLength(roundTrip.request.options.reviewedChanges.length);
 expect(compileTableMigration(roundTrip.request).status).toBe('blocked');
 const dependent=request('retained-originals',true);expect(compileTableMigration(dependent.request).status).toBe('blocked');
 const stale=request('irreversible');stale.request.options.conversions[0]!.recovery.reviewMarker='review-'+ '0'.repeat(24);expect(compileTableMigration(stale.request).status).toBe('blocked');
 const legacy=request('retained-originals');(legacy.request.options.reviewedChanges[0] as any).conversion='pg-cast-v1';expect(compileTableMigration(legacy.request).status).toBe('blocked');
});

test('G04 .7 schemas describe the closed discovery, options, plan and phase carriers',()=>{
 const input=request('retained-originals'),result=compileTableMigration(input.request);if(result.status!=='compiled')throw new Error(JSON.stringify(result));
 const validator=createValidator(false);validator.addSchema(deploymentSchema);validator.addSchema(g04OptionsSchema);validator.addSchema(g04PhasesSchema);
 expect(validator.compile(g04DiscoverySchema)(input.cycleFree)).toBe(true);
 expect(validator.compile(g04OptionsSchema)(result.plan.options)).toBe(true);
 expect(validator.compile(g04MigrationSchema)(result.plan)).toBe(true);
 expect(validator.compile(g04PhasesSchema)({executionProfile:result.plan.executionProfile,phases:result.plan.phases})).toBe(true);
 const crossedCapture=structuredClone(result.plan);crossedCapture.steps[0]!.phaseOperation='convert-field';
 expect(validator.compile(g04MigrationSchema)(crossedCapture)).toBe(false);
 const crossedConversion=structuredClone(result.plan);crossedConversion.steps[1]!.operation='capture-originals';
 expect(validator.compile(g04MigrationSchema)(crossedConversion)).toBe(false);
});
