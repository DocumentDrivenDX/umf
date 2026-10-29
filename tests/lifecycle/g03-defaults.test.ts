// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment,type TableDeploymentBundle} from '../../src/table-deployment';
import {compileTableMigration,discoverTableMigrationChanges,verifyTableMigration} from '../../src/table-migration';
import {compileTableMigrationWithOperations} from '../../src/table-migration/internal';
import {preflightG03DefaultLiteral} from '../../src/table-migration/g03-defaults';
import {createValidator} from '../../src/validation/schema';
import deploymentSchema from '../../spec/extensions/tables/deployment.schema.json';
import tablesSchema from '../../spec/extensions/tables/schema.json';
import migrationSchema from '../../spec/extensions/tables/migration-0.5.schema.json';
import phasesSchema from '../../spec/extensions/tables/migration-phases-0.4.schema.json';
import fixture from '../binding/fixtures/table-lifecycle-note.json';
import {buildG03DefaultsNativeFixture,g03Configuration} from './g03-defaults-native-fixture';

const configuration={module:'demo',schema:'plugin_demo',ownerRole:'plugin_owner',personRole:'plugin_person',batchRole:'plugin_batch',groupRoles:{readers:'plugin_readers'}};
const source=(defaultValue?:unknown,immutable=false,nullable=false)=>{
 const doc=structuredClone(fixture) as any,table=doc.modules[0]!.extensions['umf.tables'].tables[0]!;
 const column=table.columns.find((item:any)=>item.field.element==='owner')!;
 if(defaultValue!==undefined)column.default=defaultValue;
 if(nullable||(defaultValue as any)?.kind==='literal'&&(defaultValue as any).value===null){doc.modules[0]!.elements.find((item:any)=>item.id==='owner')!.nullability='absent-allowed';}
 if(immutable){column.immutable=true;table.policy.person.update={kind:'deny'};}
 return doc;
};
function bundle(doc:any):TableDeploymentBundle{const result=compileTableDeployment({text:JSON.stringify(doc),configuration});if(result.status!=='compiled')throw Error(JSON.stringify(result));return result.bundle;}
function transition(before:unknown,after:unknown,immutable=false){
 const nullable=(before as any)?.kind==='literal'&&(before as any).value===null||(after as any)?.kind==='literal'&&(after as any).value===null;
 const previous=bundle(source(before,immutable,nullable)),next=bundle(source(after,immutable,nullable));
 const candidate=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.2'}).find(item=>item.kind==='change-default');
 if(!candidate)throw Error('No default-change candidate');
 const {oldValue:_old,newValue:_new,...marker}=candidate;
 return {previous,next,options:{version:'umf.table-migration-options/0.5' as const,backfills:[],concurrentIndexes:[],reviewedChanges:[marker],validations:[]}};
}
const literal=(value:string)=>({kind:'literal',value:{string:value}});
const numericSource=(value?:unknown)=>{
 const doc=source() as any,module=doc.modules[0]!,record=module.elements.find((item:any)=>item.id==='Note')!,table=module.extensions['umf.tables'].tables[0]!;
 const field={id:'measure',kind:'field',scalarType:'decimal',cardinality:'one',nullability:'absent-allowed',facets:{precision:8,scale:2},extensions:{}};
 module.elements.push(field);record.members.push({module:'demo',element:'measure'});
 const column:any={field:{module:'demo',element:'measure'},name:'measure',nativeType:{kind:'numeric',precision:8,scale:2}};
 if(value!==undefined)column.default=value;table.columns.push(column);return doc;
};
const typedSource=(scalarType:string,nativeType:unknown,value:unknown)=>{
 const doc=source() as any,module=doc.modules[0]!,record=module.elements.find((item:any)=>item.id==='Note')!,table=module.extensions['umf.tables'].tables[0]!;
 const field={id:'typed',kind:'field',scalarType,cardinality:'one',nullability:'absent-allowed',extensions:{}};
 module.elements.push(field);record.members.push({module:'demo',element:'typed'});
 const column:any={field:{module:'demo',element:'typed'},name:'typed',nativeType};
 if(value!==undefined)column.default=value;table.columns.push(column);return doc;
};

test('G03 changes one existing target default and preserves immutable target identity',()=>{
 const {previous,next,options}=transition(undefined,literal('new'),true);
 const result=compileTableMigration({id:'g03-default-002',predecessor:{id:'g03-default-001',digest:'a'.repeat(64)},previous,next,options});
 const internal=compileTableMigrationWithOperations({id:'g03-default-002',predecessor:{id:'g03-default-001',digest:'a'.repeat(64)},previous,next,options});
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
 expect(internal.result.status).toBe('compiled');if(internal.result.status!=='compiled')throw Error(JSON.stringify(internal.result.diagnostics));
 expect(JSON.stringify(internal.result.plan)).toBe(JSON.stringify(result.plan));
 expect(internal.operations).toHaveLength(1);
 expect(internal.operations[0]).toMatchObject({role:'change-default',sourcePath:result.plan.steps[0]!.sourcePath,subject:{type:'field',table:'notes',field:{module:'demo',element:'owner'}}});
 expect(result.plan.version).toBe('umf.table-migration/0.5');
 expect(result.plan.steps).toHaveLength(1);
 expect(result.plan.steps[0]?.operation).toBe('set-default');
 const validator=createValidator();validator.addSchema(tablesSchema);validator.addSchema(deploymentSchema);validator.addSchema(phasesSchema);
 const validate=validator.compile(migrationSchema);expect(validate(result.plan)).toBe(true);
 const validatePhase=validator.compile(phasesSchema);expect(validatePhase({executionProfile:result.plan.executionProfile,phases:result.plan.phases})).toBe(true);
 expect(validatePhase({executionProfile:result.plan.executionProfile,phases:[{...result.plan.phases![0],kind:'backfill-tighten'}]})).toBe(false);
 for(const mutate of [(plan:any)=>plan.steps[0].operation='apply-seeds',(plan:any)=>plan.phases![0].kind='backfill-tighten']){
  const changed=structuredClone(result.plan);mutate(changed);expect(validate(changed)).toBe(false);expect(()=>verifyTableMigration(changed)).toThrow();
 }
 for(const mutate of [(plan:any)=>plan.steps[0].phaseTarget.field.element='id',(plan:any)=>plan.steps[0].sql+='; SELECT 1']){
  const changed=structuredClone(result.plan);mutate(changed);expect(()=>verifyTableMigration(changed)).toThrow();
 }
 expect(result.plan.steps[0]).toMatchObject({phaseOperation:'change-default',phaseTarget:{table:'notes',field:{module:'demo',element:'owner'}},sql:'ALTER TABLE "plugin_demo"."notes" ALTER COLUMN "owner" SET DEFAULT (E\'new\'::pg_catalog.text COLLATE pg_catalog."C")'});
});

test('G03 marker binds full physical and logical target meaning',()=>{
 const {previous,next,options}=transition(undefined,literal('new'));
 const moved=structuredClone(next.source.utf8);
 const changed=JSON.parse(moved);changed.modules[0]!.extensions['umf.tables'].tables[0]!.columns[1]!.name='different';
 const other=bundle(changed);
 const result=compileTableMigration({id:'g03-default-003',predecessor:{id:'g03-default-002',digest:'b'.repeat(64)},previous,next:other,options});
 expect(result.status).toBe('blocked');
 const selected=discoverTableMigrationChanges(previous,other,{version:'umf.table-migration-discovery/0.2'}).find(item=>item.kind==='change-default');
 expect(selected?.id).not.toBe(options.reviewedChanges[0]!.id);
});

test('G03 supports SET and DROP and records an absent-to-literal-NULL change',()=>{
 const dropping=transition(literal('old'),undefined);
 const result=compileTableMigration({id:'g03-drop-001',predecessor:{id:'g03-drop-000',digest:'b'.repeat(64)},...dropping});
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
 expect(result.plan.steps[0]).toMatchObject({operation:'drop-default',sql:'ALTER TABLE "plugin_demo"."notes" ALTER COLUMN "owner" DROP DEFAULT'});
 const nullDefault=transition(undefined,{kind:'literal',value:null});
 expect(nullDefault.options.reviewedChanges).toHaveLength(1);
 expect(nullDefault.options.reviewedChanges[0]?.oldDigest).not.toBe(nullDefault.options.reviewedChanges[0]?.newDigest);
 const nullPlan=compileTableMigration({id:'g03-null-001',predecessor:{id:'g03-null-000',digest:'c'.repeat(64)},...nullDefault});
 expect(nullPlan.status).toBe('compiled');if(nullPlan.status!=='compiled')throw Error(JSON.stringify(nullPlan.diagnostics));
});

test('G03 plan compilation uses portable JSON copying without structuredClone',()=>{
 const input=transition(undefined,literal('new'));
 const original=globalThis.structuredClone;
 try{
  Object.defineProperty(globalThis,'structuredClone',{configurable:true,writable:true,value:undefined});
  const result=compileTableMigration({id:'g03-no-structured-clone',predecessor:{id:'g03-no-structured-clone-base',digest:'a'.repeat(64)},...input});
  expect(result.status).toBe('compiled');
 }finally{Object.defineProperty(globalThis,'structuredClone',{configurable:true,writable:true,value:original});}
});

test('G03 discovery selector is exact and legacy discovery stays unchanged',()=>{
 const {previous,next}=transition(undefined,literal('next'));
 expect(discoverTableMigrationChanges(previous,next).some(item=>item.kind==='change-default')).toBe(false);
 expect(discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.2'}).some(item=>item.kind==='change-default')).toBe(true);
 expect(()=>discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.2',extra:true} as any)).toThrow();
 expect(()=>discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.999'} as any)).toThrow('Unknown table-migration discovery selector');
});

test('G03 opt-in discovery refuses non-JSON sources while unselected legacy YAML behavior remains unchanged',()=>{
 const {previous,next}=transition(undefined,literal('new'));
 const yamlPrevious={...previous,source:{...previous.source,format:'yaml' as const}};
 const yamlNext={...next,source:{...next.source,format:'yaml' as const}};
 expect(()=>discoverTableMigrationChanges(yamlPrevious,next)).not.toThrow();
 expect(discoverTableMigrationChanges(yamlPrevious,next)).toEqual([]);
 expect(()=>discoverTableMigrationChanges(yamlPrevious,next,{version:'umf.table-migration-discovery/0.999'} as any)).toThrow('Unknown table-migration discovery selector');
 for(const [before,after,path] of [[yamlPrevious,next,'/previous/source/format'],[previous,yamlNext,'/next/source/format']] as const){
  try{discoverTableMigrationChanges(before,after,{version:'umf.table-migration-discovery/0.2'});throw Error('G03 selector admitted a non-JSON retained source');}
  catch(error){expect(error).toMatchObject({code:'TABLE_MIGRATION_OPTIONS',path});}
 }
});

test('G03 keeps logical-only default changes out of its selector and refuses unrelated source effects',()=>{
 const previous=bundle(source()),logicalOnly=source() as any;
 logicalOnly.modules[0]!.elements.find((item:any)=>item.id==='owner')!.default={on:'missing',value:{string:'new'}};
 const logicalNext={...previous,source:{...previous.source,utf8:JSON.stringify(logicalOnly)}} as TableDeploymentBundle;
 expect(discoverTableMigrationChanges(previous,logicalNext,{version:'umf.table-migration-discovery/0.2'}).some(item=>item.kind==='change-default')).toBe(false);
 const {next,options}=transition(undefined,literal('new')),unrelated=JSON.parse(next.source.utf8);
 unrelated.modules[0]!.extensions['umf.tables'].tables[0]!.columns[0]!.name='changed_id';
 const changed=bundle(unrelated),result=compileTableMigration({id:'g03-related-001',predecessor:{id:'g03-related-000',digest:'e'.repeat(64)},previous,next:changed,options});
 expect(result.status).toBe('blocked');
});

test('G03 numeric spellings bind separately while the typed DDL is canonical',()=>{
 const previous=bundle(numericSource()),nextA=bundle(numericSource({kind:'literal',value:{decimalToken:'1.0'}})),nextB=bundle(numericSource({kind:'literal',value:{decimalToken:'1e0'}}));
 const marker=(next:TableDeploymentBundle)=>discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.2'}).find(item=>item.kind==='change-default')!;
 const a=marker(nextA),b=marker(nextB);expect(a.id).not.toBe(b.id);
 const plan=compileTableMigration({id:'g03-numeric-001',predecessor:{id:'g03-numeric-000',digest:'f'.repeat(64)},previous,next:nextA,options:{version:'umf.table-migration-options/0.5',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[(({oldValue:_old,newValue:_new,...value})=>value)(a)]}});
 expect(plan.status).toBe('compiled');if(plan.status!=='compiled')throw Error(JSON.stringify(plan.diagnostics));
 expect(plan.plan.steps[0]?.sql).toBe("ALTER TABLE \"plugin_demo\".\"notes\" ALTER COLUMN \"measure\" SET DEFAULT E'1'::pg_catalog.numeric");
});

test('G03 typed clock and UUID defaults are accepted only on matching native domains',()=>{
 const timestampOld=bundle(typedSource('timestamp',{kind:'timestamptz'},undefined)),timestampNext=bundle(typedSource('timestamp',{kind:'timestamptz'},{kind:'currentTimestamp'}));
 const timestampCandidate=discoverTableMigrationChanges(timestampOld,timestampNext,{version:'umf.table-migration-discovery/0.2'}).find(item=>item.kind==='change-default')!;
 const timestampPlan=compileTableMigration({id:'g03-clock-001',predecessor:{id:'g03-clock-000',digest:'1'.repeat(64)},previous:timestampOld,next:timestampNext,options:{version:'umf.table-migration-options/0.5',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[(({oldValue:_old,newValue:_new,...value})=>value)(timestampCandidate)]}});
 expect(timestampPlan.status).toBe('compiled');if(timestampPlan.status!=='compiled')throw Error(JSON.stringify(timestampPlan.diagnostics));
 expect(timestampPlan.plan.steps[0]?.operation).toBe('set-default');expect(timestampPlan.plan.steps[0]?.sql).toContain('CURRENT_TIMESTAMP');
 const uuidOld=bundle(typedSource('uuid',{kind:'uuid'},undefined)),uuidNext=bundle(typedSource('uuid',{kind:'uuid'},{kind:'randomUuid'}));
 const uuidCandidate=discoverTableMigrationChanges(uuidOld,uuidNext,{version:'umf.table-migration-discovery/0.2'}).find(item=>item.kind==='change-default')!;
 const uuidPlan=compileTableMigration({id:'g03-uuid-001',predecessor:{id:'g03-uuid-000',digest:'2'.repeat(64)},previous:uuidOld,next:uuidNext,options:{version:'umf.table-migration-options/0.5',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[(({oldValue:_old,newValue:_new,...value})=>value)(uuidCandidate)]}});
 expect(uuidPlan.status).toBe('compiled');if(uuidPlan.status!=='compiled')throw Error(JSON.stringify(uuidPlan.diagnostics));
 expect(uuidPlan.plan.steps[0]?.sql).toContain('pg_catalog.gen_random_uuid()');
});

function typedMigration(beforeDoc:any,afterDoc:any,id:string){
 const previous=bundle(beforeDoc),next=bundle(afterDoc);
 const candidate=discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.2'}).find(item=>item.kind==='change-default');
 if(!candidate)throw Error('No typed default-change candidate');
 const {oldValue:_old,newValue:_new,...marker}=candidate;
 return compileTableMigration({id,predecessor:{id:id+'-previous',digest:'d'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.5',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[marker]}});
}
function deploymentRefusalText(doc:any):string{
 const result=compileTableDeployment({text:JSON.stringify(doc),configuration});
 return result.status==='blocked'?JSON.stringify(result.diagnostics):'';
}

test('G03 admits exact unrefined Gregorian date literals and preserves typed qualifiers',()=>{
 const valid=typedMigration(typedSource('date',{kind:'date'},undefined),typedSource('date',{kind:'date'},{kind:'literal',value:{date:'2000-02-29'}}),'g03-date-literal');
 expect(valid.status).toBe('compiled');if(valid.status!=='compiled')throw Error(JSON.stringify(valid.diagnostics));
 expect(valid.plan.steps[0]?.sql).toContain("E'2000-02-29'::pg_catalog.date");

 const invalidDate=typedSource('date',{kind:'date'},{kind:'literal',value:{date:'1900-02-29'}});
 expect(deploymentRefusalText(invalidDate)).toContain('Gregorian date outside native profile');
 const wrongCarrier=typedSource('date',{kind:'date'},{kind:'literal',value:{timestamp:'2000-02-29T00:00:00Z'}});
 expect(deploymentRefusalText(wrongCarrier)).toContain('Literal does not match scalar family');
 expect(deploymentRefusalText(typedSource('date',{kind:'timestamptz'},{kind:'literal',value:{date:'2000-02-29'}}))).toContain('Native type and logical scalar family differ');

 const qualified=typedSource('date',{kind:'date'},{kind:'literal',value:{date:'2000-01-01'}}) as any;
 qualified.modules[0]!.elements.find((item:any)=>item.id==='typed')!.allowedValues=[{date:'2000-01-01'}];
 const qualifiedBefore=typedSource('date',{kind:'date'},undefined) as any;
 qualifiedBefore.modules[0]!.elements.find((item:any)=>item.id==='typed')!.allowedValues=[{date:'2000-01-01'}];
 expect(deploymentRefusalText(qualified)).toContain('Value/default semantics for float/temporal domain are not defined');
 expect(deploymentRefusalText(qualifiedBefore)).toContain('Value/default semantics for float/temporal domain are not defined');

 const instant=typedMigration(typedSource('timestamp',{kind:'timestamptz'},undefined),typedSource('timestamp',{kind:'timestamptz'},{kind:'literal',value:{timestamp:'2000-02-29T12:30:00Z'}}),'g03-instant-literal');
 expect(instant.status).toBe('compiled');if(instant.status!=='compiled')throw Error(JSON.stringify(instant.diagnostics));
 expect(instant.plan.steps[0]?.sql).toContain('2000-02-29T12:30:00.000000Z');
 expect(deploymentRefusalText(typedSource('timestamp',{kind:'timestamptz'},{kind:'literal',value:{timestamp:'2000-01-01T00:00:00.1234567Z'}}))).toContain('Instant would round or exceed native clock profile');
 expect(deploymentRefusalText(typedSource('timestamp',{kind:'timestamptz'},{kind:'literal',value:{timestamp:'2000-01-01T00:00:00-00:00'}}))).toContain('Unknown or invalid instant offset');
});

test('G03 temporal literal support does not relax non-temporal refinements or logical defaults',()=>{
 const ranged=typedSource('decimal',{kind:'numeric',precision:8,scale:2},{kind:'literal',value:{decimalToken:'123.45'}}) as any;
 ranged.modules[0]!.elements.find((item:any)=>item.id==='typed')!.facets={precision:8,scale:2,range:{min:{decimalToken:'0.00'},max:{decimalToken:'10.00'}}};
 expect(deploymentRefusalText(ranged)).toContain('Literal outside numeric range');

 const refined=typedSource('string',{kind:'text'},{kind:'literal',value:{string:'x'}}) as any;
 refined.modules[0]!.elements.find((item:any)=>item.id==='typed')!.facets={length:{min:3,max:20,unit:'unicode-scalar'}};
 expect(deploymentRefusalText(refined)).toContain('Literal length outside bounds');

 const logical=typedSource('date',{kind:'date'},{kind:'literal',value:{date:'2000-02-29'}}) as any;
 logical.modules[0]!.elements.find((item:any)=>item.id==='typed')!.default={on:'missing',value:{date:'2000-02-29'}};
 expect(deploymentRefusalText(logical)).toContain('Value/default semantics for float/temporal domain are not defined');
});

test('G03 refuses retained unknown native and logical qualifiers before source verification',()=>{
 const nextSource=source({kind:'literal',value:{string:'new'},futureQualifier:true}) as any;
 const fake=(doc:any)=>({source:{format:'json',utf8:JSON.stringify(doc)},configuration} as any);
 const previous=fake(source()),next=fake(nextSource),options={version:'umf.table-migration-options/0.5' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[{id:'review-g03',kind:'change-default' as const,path:'/modules/0/extensions/umf.tables/tables/0/columns/1/default',oldDigest:'a'.repeat(64),newDigest:'b'.repeat(64)}]};
 const native=compileTableMigration({id:'g03-unknown-001',predecessor:{id:'g03-unknown-000',digest:'3'.repeat(64)},previous,next,options});
 expect(native.status).toBe('blocked');expect(native.status==='blocked'&&native.diagnostics[0]?.path).toBe('/next/source/modules/0/extensions/umf.tables/tables/0/columns/1/default');
 const logical=source(literal('new')) as any;logical.modules[0]!.elements.find((item:any)=>item.id==='owner')!.default={on:'missing',value:{string:'new'},futureQualifier:true};
 const logicalResult=compileTableMigration({id:'g03-unknown-002',predecessor:{id:'g03-unknown-001',digest:'4'.repeat(64)},previous:fake(source()),next:fake(logical),options});
 expect(logicalResult.status).toBe('blocked');expect(logicalResult.status==='blocked'&&logicalResult.diagnostics[0]?.path).toBe('/next/source/modules/0/elements/1/default');
});

test('G03 raw-source preflight rejects malformed retained bundles with located diagnostics',()=>{
 const good=(doc:any=source(),configurationValue:any=configuration)=>({source:{format:'json',utf8:JSON.stringify(doc)},configuration:configurationValue} as any);
 const old=good(),fresh=good(source(literal('new'))),options={version:'umf.table-migration-options/0.5' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[{id:'review-g03',kind:'change-default' as const,path:'/modules/0/extensions/umf.tables/tables/0/columns/1/default',oldDigest:'a'.repeat(64),newDigest:'b'.repeat(64)}]};
 const malformedElements=source(literal('new')) as any;malformedElements.modules[0]!.elements={};
 const cases:[string,any,any,string][]=[
  ['previous missing source',{},fresh,'/previous/source'],
  ['previous null source',{source:null},fresh,'/previous/source'],
  ['previous missing UTF-8',{source:{format:'json'}},fresh,'/previous/source/utf8'],
  ['next missing source',old,{},'/next/source'],
  ['next null source',old,{source:null},'/next/source'],
  ['previous parsed null',{source:{format:'json',utf8:'null'},configuration},fresh,'/previous/source'],
  ['next parsed null',old,{source:{format:'json',utf8:'null'},configuration},'/next/source'],
  ['next null configuration',old,{...fresh,configuration:null},'/next/configuration/schema'],
  ['next non-string schema',old,good(source(),{...configuration,schema:17}),'/next/configuration/schema'],
  ['selected module elements not array',old,good(malformedElements),'/next/source/modules/0/elements'],
 ];
 for(const [name,previous,next,path]of cases){
  const result=compileTableMigration({id:'g03-shape-'+name.replaceAll(' ','-'),predecessor:{id:'g03-shape-base',digest:'6'.repeat(64)},previous,next,options} as any);
  expect(result.status,'case '+name).toBe('blocked');
  expect(result.status==='blocked'&&result.diagnostics[0]?.path,'case '+name).toBe(path);
 }
});

test('G03 native numeric preflight bounds exact integer widths and numeric precision before coefficient allocation',()=>{
 const run=(nativeType:any,carrier:'integerToken'|'decimalToken',token:string)=>{
  const old=source(),fresh=source() as any,column=fresh.modules[0]!.extensions['umf.tables'].tables[0]!.columns[1]!;
  column.nativeType=nativeType;column.default={kind:'literal',value:{[carrier]:token}};
  const fake=(doc:any)=>({source:{format:'json',utf8:JSON.stringify(doc)},configuration} as any);
  const options={version:'umf.table-migration-options/0.5',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[{id:'review-g03',kind:'change-default',path:'/modules/0/extensions/umf.tables/tables/0/columns/1/default',oldDigest:'a'.repeat(64),newDigest:'b'.repeat(64)}]};
  return ()=>preflightG03DefaultLiteral({options,previous:fake(old),next:fake(fresh)});
 };
 for(const token of ['32767','-32768','327670e-1','0e'+'9'.repeat(80)])expect(run({kind:'int2'},token.includes('0e')?'integerToken':'decimalToken',token)).not.toThrow();
 for(const token of ['32768','-32769','1.2','1e'+'9'.repeat(80)])expect(run({kind:'int2'},token.includes('.')||token.startsWith('1e')?'decimalToken':'integerToken',token)).toThrow();
 for(const token of ['99.99','9999e-2','0e'+'9'.repeat(80)])expect(run({kind:'numeric',precision:4,scale:2},'decimalToken',token)).not.toThrow();
 for(const token of ['100.00','1.001','1e'+'9'.repeat(80)])expect(run({kind:'numeric',precision:4,scale:2},'decimalToken',token)).toThrow();
});

test('G03 bounds raw numeric native-type qualifiers before numeric preflight',()=>{
 for(const nativeType of [
  {kind:'numeric',precision:'bad',scale:0},
  {kind:'numeric'},
  {kind:'numeric',precision:8,scale:0.5},
  {kind:'numeric',precision:1001,scale:0},
  {kind:'numeric',precision:8,scale:0,future:true},
 ]){
  const previous=numericSource() as any,doc=numericSource({kind:'literal',value:{decimalToken:'1'}}) as any;
  doc.modules[0]!.extensions['umf.tables'].tables[0]!.columns.find((item:any)=>item.name==='measure')!.nativeType=nativeType;
  const targetIndex=doc.modules[0]!.extensions['umf.tables'].tables[0]!.columns.findIndex((item:any)=>item.name==='measure'),targetPath='/modules/0/extensions/umf.tables/tables/0/columns/'+targetIndex+'/default';
  const fake=(value:any)=>({source:{format:'json',utf8:JSON.stringify(value)},configuration} as any);
  try{preflightG03DefaultLiteral({options:{version:'umf.table-migration-options/0.5',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[{id:'review-g03',kind:'change-default',path:targetPath,oldDigest:'a'.repeat(64),newDigest:'b'.repeat(64)}]},previous:fake(previous),next:fake(doc)});throw Error('malformed numeric native type was admitted');}
  catch(error){expect((error as any).path).toBe('/next/source'+targetPath.replace(/\/default$/,'/nativeType'));}
 }
});

test('G03 preflight does not invoke accessors before the JSON-safety refusal',()=>{
 let reads=0;
 const normal=transition(undefined,literal('new'));
 const optionsAccessor:any={id:'g03-accessor-001',predecessor:{id:'g03-accessor-000',digest:'a'.repeat(64)},previous:normal.previous,next:normal.next};
 Object.defineProperty(optionsAccessor,'options',{enumerable:true,get(){reads++;return normal.options;}});
 const optionsResult=compileTableMigration(optionsAccessor);
 expect(optionsResult.status).toBe('blocked');expect(reads).toBe(0);
 for(const key of ['previous','next'] as const){
  const topLevel:any={id:'g03-top-getter',predecessor:null,next:normal.next,options:normal.options};
  Object.defineProperty(topLevel,key,{enumerable:true,get(){reads++;return normal[key];}});
  expect(compileTableMigration(topLevel).status).toBe('blocked');expect(reads).toBe(0);
 }
 const sourceAccessor=structuredClone({id:'g03-accessor-002',predecessor:{id:'g03-accessor-001',digest:'b'.repeat(64)},previous:normal.previous,next:normal.next,options:normal.options}) as any;
 Object.defineProperty(sourceAccessor.previous.source,'utf8',{enumerable:true,get(){reads++;return normal.previous.source.utf8;}});
 const sourceResult=compileTableMigration(sourceAccessor);
 expect(sourceResult.status).toBe('blocked');expect(reads).toBe(0);
 const configAccessor=structuredClone({id:'g03-accessor-003',predecessor:{id:'g03-accessor-002',digest:'c'.repeat(64)},previous:normal.previous,next:normal.next,options:normal.options}) as any;
 Object.defineProperty(configAccessor.previous.configuration,'schema',{enumerable:true,get(){reads++;return configuration.schema;}});
 const configResult=compileTableMigration(configAccessor);
 expect(configResult.status).toBe('blocked');expect(reads).toBe(0);
 const markerAccessor=structuredClone({id:'g03-accessor-005',predecessor:{id:'g03-accessor-004',digest:'e'.repeat(64)},previous:normal.previous,next:normal.next,options:normal.options}) as any;
 Object.defineProperty(markerAccessor.options.reviewedChanges[0],'id',{enumerable:true,get(){reads++;return 'review-g03';}});
 expect(compileTableMigration(markerAccessor).status).toBe('blocked');expect(reads).toBe(0);
 const legacy=structuredClone({id:'g03-accessor-004',predecessor:{id:'g03-accessor-003',digest:'d'.repeat(64)},previous:normal.previous,next:normal.next,options:{...normal.options,version:'umf.table-migration-options/0.4'}}) as any;
 Object.defineProperty(legacy.previous.source,'utf8',{enumerable:true,get(){reads++;return normal.previous.source.utf8;}});
 expect(compileTableMigration(legacy).status).toBe('blocked');expect(reads).toBe(0);
 const inheritedInput=Object.create({get options(){reads++;return normal.options;}});Object.assign(inheritedInput,{id:'g03-inherited-input',predecessor:null,previous:null,next:normal.next});
 expect(compileTableMigration(inheritedInput).status).toBe('blocked');expect(reads).toBe(0);
 const inheritedOptions=Object.create({get version(){reads++;return 'umf.table-migration-options/0.5';}});Object.assign(inheritedOptions,{backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[]});
 expect(compileTableMigration({id:'g03-inherited-options',predecessor:null,previous:null,next:normal.next,options:inheritedOptions} as any).status).toBe('blocked');expect(reads).toBe(0);
 const inheritedBundle=Object.assign(Object.create({get source(){reads++;return normal.previous.source;}}),{configuration:normal.previous.configuration});
 expect(compileTableMigration({id:'g03-inherited-bundle',predecessor:{id:'g03-x',digest:'f'.repeat(64)},previous:inheritedBundle,next:normal.next,options:normal.options} as any).status).toBe('blocked');expect(reads).toBe(0);
 const inheritedSource=Object.assign(Object.create({get utf8(){reads++;return normal.previous.source.utf8;}}),{format:'json'});
 const sourceBundle={...normal.previous,source:inheritedSource};
 expect(compileTableMigration({id:'g03-inherited-source',predecessor:{id:'g03-y',digest:'a'.repeat(64)},previous:sourceBundle,next:normal.next,options:normal.options}).status).toBe('blocked');expect(reads).toBe(0);
 const inheritedConfiguration=Object.assign(Object.create({get schema(){reads++;return configuration.schema;}}),{module:configuration.module,ownerRole:configuration.ownerRole,personRole:configuration.personRole,batchRole:configuration.batchRole,groupRoles:configuration.groupRoles});
 const configBundle={...normal.previous,configuration:inheritedConfiguration};
 expect(compileTableMigration({id:'g03-inherited-config',predecessor:{id:'g03-z',digest:'b'.repeat(64)},previous:configBundle,next:normal.next,options:normal.options}).status).toBe('blocked');expect(reads).toBe(0);
});

test('G03 preserves the historical .2 missing-predecessor refusal and handles null inputs',()=>{
 const next=bundle(source());
 const result=compileTableMigration({id:'g03-old-002',predecessor:null,previous:null,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],reviewedChanges:[],validations:[]}});
 expect(result.status).toBe('blocked');
 expect(result.status==='blocked'&&result.diagnostics[0]?.message).toBe('Version 0.2 phased plans require a previous installed source; initial publication is not supported');
 for(const input of [null,undefined])expect(()=>compileTableMigration(input as any)).not.toThrow();
});

test('G03 preflight preserves the predecessor-specific YAML refusal path',()=>{
 const next=bundle(source());
 const previous={source:{format:'yaml',utf8:'{}'}} as any;
 const options={version:'umf.table-migration-options/0.5' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[{id:'review-g03',kind:'change-default' as const,path:'/modules/0/extensions/umf.tables/tables/0/columns/1/default',oldDigest:'a'.repeat(64),newDigest:'b'.repeat(64)}]};
 const result=compileTableMigration({id:'g03-yaml-001',predecessor:{id:'g03-yaml-000',digest:'c'.repeat(64)},previous,next,options});
 expect(result.status).toBe('blocked');
 expect(result.status==='blocked'&&result.diagnostics[0]?.path).toBe('/previous/source/format');
});

test('G03 preflight refuses an oversized predecessor literal even when the new source drops it',()=>{
 const next=bundle(source()),sourceDoc=source(literal('x'.repeat(1_048_577)));
 const previous={source:{format:'json',utf8:JSON.stringify(sourceDoc)},configuration} as any;
 const options={version:'umf.table-migration-options/0.5' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[{id:'review-g03',kind:'change-default' as const,path:'/modules/0/extensions/umf.tables/tables/0/columns/1/default',oldDigest:'a'.repeat(64),newDigest:'b'.repeat(64)}]};
 const result=compileTableMigration({id:'g03-default-004',predecessor:{id:'g03-default-003',digest:'c'.repeat(64)},previous,next,options});
 expect(result.status).toBe('blocked');
 expect(result.status==='blocked'&&result.diagnostics[0]?.path).toContain('/previous/source/');
});

test('G03 reports logical-default errors at the actual module element pointer',()=>{
 const malformed=source(literal('native'));
 malformed.modules[0]!.elements.find((item:any)=>item.id==='owner')!.default={on:'always',value:{string:'native'}};
 const options={version:'umf.table-migration-options/0.5' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[{id:'review-g03',kind:'change-default' as const,path:'/modules/0/extensions/umf.tables/tables/0/columns/1/default',oldDigest:'a'.repeat(64),newDigest:'b'.repeat(64)}]};
 const fake=(doc:any)=>({source:{format:'json',utf8:JSON.stringify(doc)},configuration} as any);
 const result=compileTableMigration({id:'g03-default-005',predecessor:{id:'g03-default-004',digest:'d'.repeat(64)},previous:fake(source()),next:fake(malformed),options});
 expect(result.status).toBe('blocked');
 expect(result.status==='blocked'&&result.diagnostics[0]?.path).toBe('/next/source/modules/0/elements/1/default');
});

test('G03 native fixture retains complete sources and admits one exact default phase',()=>{
 const fixture=buildG03DefaultsNativeFixture();
 expect(fixture.status).toBe('SOURCE_ONLY_ALL_NATIVE_CASES_UNRUN');
 const compile=(sourceValue:any)=>{
  const result=compileTableDeployment({text:sourceValue.utf8,configuration:g03Configuration});
  expect(result.status).toBe('compiled');
  if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
  return result.bundle;
 };
 const before=compile(fixture.variants.absent),set=compile(fixture.variants.set5),drop=compile(fixture.variants.drop);
 expect(before.source.utf8).toContain('synthetic-table-lifecycle');
 expect(JSON.parse(before.source.utf8).modules[0].elements.find((item:any)=>item.id==='Note').members).toContainEqual({module:'demo',element:'measure'});
 expect(JSON.parse(before.source.utf8).modules[0].extensions['umf.tables'].tables[0].columns.at(-1)).toMatchObject({name:'measure',nativeType:{kind:'int4'}});
 expect(JSON.parse(before.source.utf8).modules[0].extensions['umf.tables'].tables[0].columns.at(-1)).not.toHaveProperty('default');
 const set9=compile(fixture.variants.set9);
 for(const complete of [before,set,set9,drop]){
  expect(JSON.parse(complete.source.utf8).modules[0].extensions['umf.tables'].commands.map((item:any)=>item.id)).toEqual([
   'read_notes','create_note_omitted','create_note_explicit','update_measure',
  ]);
 }
 const candidates=discoverTableMigrationChanges(before,set,{version:'umf.table-migration-discovery/0.2'}).filter(item=>item.kind==='change-default');
 expect(candidates).toHaveLength(1);
 const {oldValue:_old,newValue:_new,...marker}=candidates[0]!;
 const result=compileTableMigration({id:'g03-fixture-default-001',predecessor:{id:'g03-fixture-base',digest:'a'.repeat(64)},previous:before,next:set,options:{version:'umf.table-migration-options/0.5',backfills:[],concurrentIndexes:[],reviewedChanges:[marker],validations:[]}});
 expect(result.status).toBe('compiled');
 if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
 expect(result.plan.version).toBe('umf.table-migration/0.5');
 if(!result.plan.executionProfile)throw Error('G03 execution profile is missing');
 expect(result.plan.executionProfile.version).toBe('umf.table-migration-execution/0.4');
 expect(result.plan.phases).toHaveLength(1);
 expect(result.plan.steps).toHaveLength(1);
 expect(result.plan.steps[0]).toMatchObject({phaseOperation:'change-default',operation:'set-default',phaseTarget:{table:'notes',field:{module:'demo',element:'measure'}}});
 expect(()=>verifyTableMigration(result.plan)).not.toThrow();
 const removed=discoverTableMigrationChanges(set,drop,{version:'umf.table-migration-discovery/0.2'}).filter(item=>item.kind==='change-default');
 expect(removed).toHaveLength(1);
 expect(fixture.historicalRows).toEqual([['a','Alice',null],['b','Bob',2],['c','Alice',9]]);
 expect(fixture.requiredHistoricalRows).toEqual([['ra','Alice',1],['rb','Bob',2],['rc','Alice',9]]);
 expect(fixture.chains.required).toEqual(['requiredSet5','requiredSet9','requiredDrop']);
 const decimalFixture=JSON.parse(fixture.variants.decimal.utf8);
 expect(decimalFixture.modules[0].elements.find((item:any)=>item.id==='measure').facets).toEqual({precision:8,scale:2});
 for(const name of ['date','text','decimal','uuid','currentTimestamp'] as const){
  const compiled=compile(fixture.variants[name]);
  const parsed=JSON.parse(compiled.source.utf8);
  const mapping=parsed.modules[0].extensions['umf.tables'].tables[0].columns.at(-1);
  expect(mapping.name).toBe('measure');
  expect(mapping).toHaveProperty('default');
 }
 for(const control of fixture.compileOnlyControls){
  const refused=compileTableDeployment({text:control.source.utf8,configuration:g03Configuration});
  expect(refused.status,control.id).toBe('blocked');
 }
 expect(fixture.compileOnlyControls.map((control:any)=>control.id)).toEqual([
  'invalid-gregorian-date','wrong-date-carrier','wrong-date-native-domain',
  'temporal-logical-default','numeric-capacity-overflow',
 ]);
 const logical5=compile(fixture.variants.matchingLogical5);
 expect(JSON.parse(logical5.source.utf8).modules[0].elements.find((item:any)=>item.id==='measure').default).toEqual({on:'missing',value:{integerToken:'5'}});
 expect(fixture.caseStatus).toEqual({
  'G03-N01':'TRANSITIONS_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
  'G03-N02':'EMPTY_TABLE_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
  'G03-N03':'REQUIRED_SET_REPLACE_DROP_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
  'G03-N04':'RETAINED_OMISSION_SOURCE_REFUSAL_AND_READONLY_NATIVE_ABSENCE_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
  'G03-N05':'NULL_AND_DECIMAL_SPELLING_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
  'G03-N06':'KNOWN_ABORT_RETRY_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
  'G03-N07':'COMMIT_AND_PREPUBLICATION_RECOVERY_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
  'G03-N08':'UNKNOWN_UNCOMMITTED_FENCE_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
  'G03-N09':'WRITER_BARRIER_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
  'G03-N10':'DATE_TEXT_DECIMAL_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
  'G03-N11':'UUID_AND_TRANSACTION_TIMESTAMP_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
  'G03-N12':'UNQUALIFIED_COMPATIBLE_WEFT_02_COHORT_REQUIRED',
  'G03-N13':'FULL_PRE_EFFECT_TAMPERING_MATRIX_SOURCE_IMPLEMENTED_NATIVE_UNRUN',
  'G03-N14':'SERIAL_CLEANUP_CAMPAIGN_SOURCE_IMPLEMENTED_NATIVE_UNRUN_FULL_CASE_OPEN',
 });
 expect(fixture.caseStatus['G03-N12']).toBe('UNQUALIFIED_COMPATIBLE_WEFT_02_COHORT_REQUIRED');
 expect(fixture.campaignExpectedManifestProfile).toBe('umf.g03-native-campaign-expected-data/0.1');
 expect(fixture.campaignRoster.map((item:any)=>item.caseId)).toEqual(Array.from({length:14},(_,index)=>`G03-N${String(index+1).padStart(2,'0')}`));
 expect(fixture.campaignRoster[10]?.scenarios).toEqual(['domain-uuid','domain-currentTimestamp']);
 expect(fixture.campaignRoster[11]?.scenarios).toEqual(['ordinary']);
 expect(fixture.campaignRoster[13]?.scenarios).toEqual(['campaign-cleanup']);
});

test('G03 required target keeps explicit-only commands and rejects retained omission',()=>{
 const fixture=buildG03DefaultsNativeFixture();
 const compile=(sourceValue:any)=>compileTableDeployment({text:sourceValue.utf8,configuration:g03Configuration});
 const valid=compile(fixture.variants.requiredSet5);
 expect(valid.status).toBe('compiled');
 if(valid.status!=='compiled')throw Error(JSON.stringify(valid.diagnostics));
 const validCommands=JSON.parse(valid.bundle.source.utf8).modules[0].extensions['umf.tables'].commands;
 expect(validCommands.map((item:any)=>item.id)).toEqual(['read_notes','create_note_explicit','update_measure']);
 const invalid=compile(fixture.variants.requiredDropRetainedOmission);
 expect(invalid.status).toBe('blocked');
 expect(fixture.variants.requiredDrop.utf8).not.toBe(fixture.variants.requiredDropRetainedOmission.utf8);
});

test('G03 N04 compares retained-omission sources before any native lifecycle effect',()=>{
 const fixture=buildG03DefaultsNativeFixture();
 const good=JSON.parse(fixture.variants.requiredSet5RetainedOmission.utf8);
 const bad=JSON.parse(fixture.variants.requiredDropRetainedOmission.utf8);
 const table=(doc:any)=>doc.modules[0].extensions['umf.tables'].tables[0];
 const field=(doc:any)=>doc.modules[0].elements.find((item:any)=>item.id==='measure');
 expect(good.modules[0].extensions['umf.tables'].commands).toEqual(bad.modules[0].extensions['umf.tables'].commands);
 expect(field(good)).toEqual(field(bad));
 expect(table(good).columns.slice(0,-1)).toEqual(table(bad).columns.slice(0,-1));
 expect(table(good).columns.at(-1)).toMatchObject({name:'measure',default:{kind:'literal',value:{integerToken:'5'}}});
 expect(table(bad).columns.at(-1)).not.toHaveProperty('default');
 const configuration={...g03Configuration};
 const compile=(sourceValue:any)=>compileTableDeployment({text:sourceValue.utf8,configuration});
 const accepted=compile(fixture.variants.requiredSet5RetainedOmission);
 expect(accepted.status).toBe('compiled');
 if(accepted.status!=='compiled')throw Error(JSON.stringify(accepted.diagnostics));
 const refused=compile(fixture.variants.requiredDropRetainedOmission);
 expect(refused.status).toBe('blocked');
 if(refused.status==='blocked')expect(refused.diagnostics.some((item:any)=>item.code==='TABLES_OPERATION_REQUIRED'&&item.path.endsWith('/body/values'))).toBe(true);
});
