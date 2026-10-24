// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment} from '../../src/table-deployment';
import {compileTableMigration,discoverTableMigrationChanges,verifyTableMigration} from '../../src/table-migration';
import {createValidator} from '../../src/validation/schema';
import {writeDocument} from '../../src/model/document';
import tablesSchema from '../../spec/extensions/tables/schema.json';
import deploymentSchema from '../../spec/extensions/tables/deployment.schema.json';
import migrationSchema from '../../spec/extensions/tables/migration-0.4.schema.json';
import fixture from '../binding/fixtures/table-lifecycle-note.json';

const configuration={module:'demo',schema:'g02_demo',ownerRole:'g02_owner',personRole:'g02_person',batchRole:'g02_batch',groupRoles:{}};
const ref=(element:string)=>({module:'demo',element});
const expression={op:'concat',args:[{op:'field',field:ref('owner')},{op:'literal',value:{string:' / '}},{op:'field',field:ref('id')}]} as const;
function source({append=false,operation=true,existingOptional=false,futureDefault=false}: {append?:boolean;operation?:boolean;existingOptional?:boolean;futureDefault?:boolean}={}){
 const doc=structuredClone(fixture) as any,module=doc.modules[0]!,payload=module.extensions['umf.tables'],table=payload.tables[0]!;
 if(append||existingOptional){
  module.elements.push({id:'summary',kind:'field',scalarType:'string',cardinality:'one',nullability:append?'required':'absent-allowed',...(append?{facets:{length:{min:1,max:100,unit:'unicode-scalar'}}}:{}),extensions:{}});
  module.elements.find((item:any)=>item.id==='Note')!.members.push(ref('summary'));
  table.columns.push({field:ref('summary'),name:'summary',nativeType:{kind:'text'},...(futureDefault?{default:{kind:'literal',value:{string:'future'}}}:{})});
 }
 if(operation)payload.commands.push({version:'umf.table-operation/0.2',id:'derive_summary',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'update',table:'notes',where:{op:'isNull',field:ref('summary')},values:[{field:ref('summary'),value:{kind:'rowExpression',expression}}],returning:[],maxRows:100}});
 return doc;
}
function bundle(doc:any){const result=compileTableDeployment({text:JSON.stringify(doc),configuration});if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));return result.bundle;}
function yamlBundle(doc:any){const result=compileTableDeployment({text:writeDocument(doc,'yaml'),format:'yaml',configuration});if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));return result.bundle;}

test('G02 appends, derives, and tightens one required target in the exact ordered native phase',()=>{
 const previous=bundle(source({operation:false})),next=bundle(source({append:true}));
 const result=compileTableMigration({id:'g02-append-002',predecessor:{id:'g02-initial-001',digest:'a'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.4',backfills:[{table:'notes',column:ref('summary'),operation:'derive_summary',scopedRows:true}],concurrentIndexes:[],reviewedChanges:[],validations:[]}});
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
 expect(result.plan.version).toBe('umf.table-migration/0.4');
 expect(result.plan.executionProfile).toEqual({version:'umf.table-migration-execution/0.3',progressRelation:'umf_lifecycle_progress',ownerOnly:true});
 expect(result.plan.phases?.[0]).toEqual({id:'phase-00001',kind:'backfill-add',transaction:'required',steps:result.plan.steps.filter(step=>step.phaseTarget?.field.element==='summary').map(step=>step.id)});
 expect(result.plan.phases?.slice(1).every(phase=>phase.kind==='transaction')).toBe(true);
 expect(result.plan.steps.map(step=>step.phaseOperation)).toEqual(['add-column','target-check','backfill','tighten-not-null']);
 expect(result.plan.steps[1]!.sql).toContain('CHECK (pg_catalog.char_length("summary") >= 1');
 expect(result.plan.steps[1]!.sql).not.toContain('NOT NULL');
 expect(result.plan.steps[0]!.sql).toBe('ALTER TABLE "g02_demo"."notes" ADD COLUMN "summary" pg_catalog."text" COLLATE pg_catalog."C"');
 expect(result.plan.steps[2]).toMatchObject({kind:'backfill',sql:'',operation:'derive_summary',phaseOperation:'backfill'});
 expect(result.plan.steps[3]!.sql).toBe('ALTER TABLE "g02_demo"."notes" ALTER COLUMN "summary" SET NOT NULL');
 const validator=createValidator();validator.addSchema(tablesSchema);validator.addSchema(deploymentSchema);expect(validator.compile(migrationSchema)(result.plan)).toBe(true);
 expect(verifyTableMigration(result.plan)).toEqual(result.plan);
});

test('G02 puts a declared future default after the derived fill inside the required phase',()=>{
 const previous=bundle(source({operation:false})),next=bundle(source({append:true,futureDefault:true}));
 const result=compileTableMigration({id:'g02-default-002',predecessor:{id:'g02-default-001',digest:'d'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.4',backfills:[{table:'notes',column:ref('summary'),operation:'derive_summary',scopedRows:true}],concurrentIndexes:[],reviewedChanges:[],validations:[]}});
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
 expect(result.plan.steps.map(step=>step.phaseOperation)).toEqual(['add-column','target-check','backfill','install-default','tighten-not-null']);
 expect(result.plan.phases?.[0]?.steps).toEqual(result.plan.steps.filter(step=>step.phaseTarget?.field.element==='summary').map(step=>step.id));
 expect(verifyTableMigration(result.plan)).toEqual(result.plan);
});

test('G02 preserves the existing optional-field fill/tighten pair under the successor profile',()=>{
 const previous=bundle(source({existingOptional:true,operation:false})),candidate=bundle(source({existingOptional:true}));
 const nextDoc=source({existingOptional:true});nextDoc.modules[0]!.elements.find((item:any)=>item.id==='summary')!.nullability='required';
 const next=bundle(nextDoc),marker=discoverTableMigrationChanges(previous,next).find(item=>item.kind==='tighten-not-null');
 expect(marker).toBeDefined();if(!marker)throw Error('missing requiredness marker');
 const {oldValue:_old,newValue:_new,...review}=marker;
 const result=compileTableMigration({id:'g02-existing-002',predecessor:{id:'g02-existing-001',digest:'b'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.4',backfills:[{table:'notes',column:ref('summary'),operation:'derive_summary',scopedRows:true}],concurrentIndexes:[],reviewedChanges:[review],validations:[]}});
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
 expect(result.plan.phases).toEqual([{id:'phase-00001',kind:'backfill-tighten',transaction:'required',steps:result.plan.steps.map(step=>step.id)}]);
 expect(result.plan.steps.map(step=>step.phaseOperation)).toEqual(['backfill','tighten-not-null']);
 expect(verifyTableMigration(result.plan)).toEqual(result.plan);
});

test('G02 existing-target backfill retains its nonempty future default exactly',()=>{
 const previous=bundle(source({existingOptional:true,futureDefault:true,operation:false}));
 const candidate=source({existingOptional:true,futureDefault:true});candidate.modules[0]!.elements.find((item:any)=>item.id==='summary')!.nullability='required';
 const next=bundle(candidate),marker=discoverTableMigrationChanges(previous,next).find(item=>item.kind==='tighten-not-null');
 expect(marker).toBeDefined();if(!marker)throw Error('missing requiredness marker');
 const {oldValue:_old,newValue:_new,...review}=marker;
 const options={version:'umf.table-migration-options/0.4' as const,backfills:[{table:'notes',column:ref('summary'),operation:'derive_summary',scopedRows:true as const}],concurrentIndexes:[],reviewedChanges:[review],validations:[]};
 const result=compileTableMigration({id:'g02-existing-default-002',predecessor:{id:'g02-existing-default-001',digest:'9'.repeat(64)},previous,next,options});
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
 expect(result.plan.steps.map(step=>step.phaseOperation)).toEqual(['backfill','tighten-not-null']);
 expect(result.plan.next.expectedCatalog.columns.find(column=>column.name==='summary')?.definitionSql).toContain("DEFAULT (E'future'");
 expect(verifyTableMigration(result.plan)).toEqual(result.plan);
 const wrongDefault=structuredClone(candidate);wrongDefault.modules[0]!.extensions['umf.tables'].tables[0]!.columns.find((column:any)=>column.name==='summary')!.default={kind:'literal',value:{string:'different'}};
 expect(compileTableMigration({id:'g02-existing-default-003',predecessor:{id:'g02-existing-default-001',digest:'9'.repeat(64)},previous,next:bundle(wrongDefault),options}).status).toBe('blocked');
});

test('G02 does not rewrite retained creates: required append needs an existing create input or declared default',()=>{
 const previousDoc=source({operation:false}),previous=bundle(previousDoc);
 const omitted=source({append:true});
 omitted.modules[0]!.extensions['umf.tables'].commands.unshift({version:'umf.table-operation/0.1',id:'create_note',parameters:[],consistency:'transaction',replay:'caller-key-required',body:{kind:'insert',table:'notes',values:[{field:ref('id'),value:{kind:'literal',value:{string:'new'}}},{field:ref('owner'),value:{kind:'literal',value:{string:'g02_alice'}}}],returning:[],maxRows:1}});
 const refused=compileTableDeployment({text:JSON.stringify(omitted),configuration});
 expect(refused.status).toBe('blocked');
 if(refused.status==='blocked')expect(refused.diagnostics.some(item=>item.code==='TABLES_OPERATION_REQUIRED'&&item.path.endsWith('/body/values'))).toBe(true);
 const predecessor=structuredClone(previousDoc);predecessor.modules[0]!.extensions['umf.tables'].commands=[];
 const commandFreePrevious=bundle(predecessor),selectedOnly=source({append:true});
 const candidateCommands=selectedOnly.modules[0]!.extensions['umf.tables'].commands;
 expect(candidateCommands.map((command:any)=>command.id)).toEqual(['derive_summary']);
 const next=bundle(selectedOnly);
 const result=compileTableMigration({id:'g02-no-default-002',predecessor:{id:'g02-no-default-001',digest:'7'.repeat(64)},previous:commandFreePrevious,next,options:{version:'umf.table-migration-options/0.4',backfills:[{table:'notes',column:ref('summary'),operation:'derive_summary',scopedRows:true}],concurrentIndexes:[],reviewedChanges:[],validations:[]}});
 expect(result.status).toBe('compiled');
 if(result.status==='compiled')expect(result.plan.steps.map(step=>step.phaseOperation)).toEqual(['add-column','target-check','backfill','tighten-not-null']);
 expect(previous.source).toEqual(commandFreePrevious.source);
});

test('G02 refuses a target self-reference, a newly appended input, and a second effect',()=>{
 const previous=bundle(source({operation:false})),base=source({append:true}),next=bundle(base);
 const compile=(doc:any,backfills:any[]=[{table:'notes',column:ref('summary'),operation:'derive_summary',scopedRows:true}])=>compileTableMigration({id:'g02-refuse-002',predecessor:{id:'g02-refuse-001',digest:'c'.repeat(64)},previous,next:bundle(doc),options:{version:'umf.table-migration-options/0.4',backfills,concurrentIndexes:[],reviewedChanges:[],validations:[]}});
 const self=structuredClone(base);self.modules[0]!.extensions['umf.tables'].commands[0]!.body.values[0]!.value.expression={op:'field',field:ref('summary')};expect(()=>bundle(self)).toThrow();
 const extra=structuredClone(base);extra.modules[0]!.elements.push({id:'fresh',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}});extra.modules[0]!.elements.find((item:any)=>item.id==='Note')!.members.push(ref('fresh'));extra.modules[0]!.extensions['umf.tables'].tables[0]!.columns.push({field:ref('fresh'),name:'fresh',nativeType:{kind:'text'}});expect(compile(extra).status).toBe('blocked');
 expect(compile(base,[{table:'notes',column:ref('summary'),operation:'derive_summary',scopedRows:true},{table:'notes',column:ref('summary'),operation:'derive_summary',scopedRows:true}]).status).toBe('blocked');
});

test('G02 refuses raw source meaning changes even when they emit no selected DDL',()=>{
 const previous=bundle(source({operation:false})),base=source({append:true});
 const candidate=(doc:any)=>compileTableMigration({id:'g02-source-002',predecessor:{id:'g02-source-001',digest:'e'.repeat(64)},previous,next:bundle(doc),options:{version:'umf.table-migration-options/0.4',backfills:[{table:'notes',column:ref('summary'),operation:'derive_summary',scopedRows:true}],concurrentIndexes:[],reviewedChanges:[],validations:[]}});
 const retained=structuredClone(base);retained.modules[0]!.elements.find((item:any)=>item.id==='owner')!.description='Same DDL, different retained source meaning';expect(candidate(retained).status).toBe('blocked');
});

test('G02 refuses retained YAML sources at portable admission with source-specific paths',()=>{
 const previousDoc=source({operation:false}),nextDoc=source({append:true});
 const jsonPrevious=bundle(previousDoc),jsonNext=bundle(nextDoc),yamlPrevious=yamlBundle(previousDoc),yamlNext=yamlBundle(nextDoc);
 const options={version:'umf.table-migration-options/0.4' as const,backfills:[{table:'notes',column:ref('summary'),operation:'derive_summary',scopedRows:true as const}],concurrentIndexes:[],reviewedChanges:[],validations:[]};
 const compile=(previous:any,next:any)=>compileTableMigration({id:'g02-yaml-002',predecessor:{id:'g02-yaml-001',digest:'f'.repeat(64)},previous,next,options});
 const previousYaml=compile(yamlPrevious,jsonNext);
 expect(previousYaml.status).toBe('blocked');
 if(previousYaml.status==='blocked')expect(previousYaml.diagnostics.map(item=>item.path)).toContain('/previous/source/format');
 const nextYaml=compile(jsonPrevious,yamlNext);
 expect(nextYaml.status).toBe('blocked');
 if(nextYaml.status==='blocked')expect(nextYaml.diagnostics.map(item=>item.path)).toContain('/next/source/format');
 expect(yamlPrevious.source.format).toBe('yaml');expect(yamlNext.source.format).toBe('yaml');
});

test('G02 format admission leaves historical 0.3 YAML source behavior unchanged',()=>{
 const previousDoc=source({existingOptional:true,operation:false}),nextDoc=source({existingOptional:true});
 nextDoc.modules[0]!.elements.find((item:any)=>item.id==='summary')!.nullability='required';
 const fill=nextDoc.modules[0]!.extensions['umf.tables'].commands[0]!;
 fill.version='umf.table-operation/0.1';fill.body.values[0]!.value={kind:'literal',value:{string:'filled'}};
 const previous=yamlBundle(previousDoc),next=yamlBundle(nextDoc),marker=discoverTableMigrationChanges(previous,next).find(item=>item.kind==='tighten-not-null');
 expect(marker).toBeDefined();if(!marker)throw Error('missing requiredness marker');
 const {oldValue:_old,newValue:_new,...review}=marker;
 const result=compileTableMigration({id:'g02-yaml-003',predecessor:{id:'g02-yaml-old',digest:'8'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.3',backfills:[{table:'notes',column:ref('summary'),operation:'derive_summary',scopedRows:true}],concurrentIndexes:[],reviewedChanges:[review],validations:[]}});
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
 expect(result.plan.version).toBe('umf.table-migration/0.3');
});
