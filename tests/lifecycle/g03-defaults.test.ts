// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment,type TableDeploymentBundle} from '../../src/table-deployment';
import {compileTableMigration,discoverTableMigrationChanges,verifyTableMigration} from '../../src/table-migration';
import {preflightG03DefaultLiteral} from '../../src/table-migration/g03-defaults';
import {createValidator} from '../../src/validation/schema';
import deploymentSchema from '../../spec/extensions/tables/deployment.schema.json';
import tablesSchema from '../../spec/extensions/tables/schema.json';
import migrationSchema from '../../spec/extensions/tables/migration-0.5.schema.json';
import phasesSchema from '../../spec/extensions/tables/migration-phases-0.4.schema.json';
import fixture from '../binding/fixtures/table-lifecycle-note.json';

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
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
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

test('G03 discovery selector is exact and legacy discovery stays unchanged',()=>{
 const {previous,next}=transition(undefined,literal('next'));
 expect(discoverTableMigrationChanges(previous,next).some(item=>item.kind==='change-default')).toBe(false);
 expect(discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.2'}).some(item=>item.kind==='change-default')).toBe(true);
 expect(()=>discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.2',extra:true} as any)).toThrow();
 expect(()=>discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.3'} as any)).toThrow();
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
