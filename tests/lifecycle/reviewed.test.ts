// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableMigration,discoverTableMigrationChanges,verifyTableMigration} from '../../src/table-migration';
import {compileTableDeployment} from '../../src/table-deployment';
import {createValidator} from '../../src/validation/schema';
import migrationV2Schema from '../../spec/extensions/tables/migration-0.2.schema.json';
import deploymentSchema from '../../spec/extensions/tables/deployment.schema.json';
import tableSchema from '../../spec/extensions/tables/schema.json';
import {legalSource,evolvedLegalSource,indexedLegalSource} from './legal-fixture';
const configuration={module:'legal_lifecycle',schema:'legal_demo',ownerRole:'legal_owner',personRole:'legal_person',batchRole:'legal_batch',groupRoles:{billing_admin:'legal_billing_admin'}};
function deploy(source:any){const result=compileTableDeployment({text:JSON.stringify(source),configuration});if(result.status!=='compiled')throw Error(JSON.stringify(result));return result.bundle;}

function dropCourt(source=legalSource()){
 const d=structuredClone(source),m=d.modules[0]!,p=m.extensions['umf.tables'],t=p.tables.find(x=>x.id==='matters')!,field={module:m.id,element:'matters__court'};
 t.columns=t.columns.filter((c:any)=>!(c.field.module===field.module&&c.field.element===field.element));
 m.elements.find((e:any)=>e.id==='matters')!.members=m.elements.find((e:any)=>e.id==='matters')!.members.filter((x:any)=>x.element!==field.element);
 const read=p.commands.find((c:any)=>c.id==='read_matters');read.body.fields=read.body.fields.filter((x:any)=>x.element!==field.element);
 for(const set of p.seedSets)for(const row of set.rows)if(row.table==='matters')row.values=row.values.filter(v=>v.field.element!==field.element);
 return d;
}
function marker(candidate:any){const {oldValue:_old,newValue:_new,...value}=candidate;return value;}
test('a column drop needs its exact review marker, compiles a digest-bound drop and rejects changed source',()=>{
 const before=deploy(legalSource()),after=deploy(dropCourt());
 const refused=compileTableMigration({id:'drop-unreviewed',predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next:after});
 expect(refused.status).toBe('blocked');if(refused.status==='blocked')expect(refused.diagnostics[0]!.code).toBe('destructive_change_unreviewed');
 const candidate=discoverTableMigrationChanges(before,after).find(x=>x.kind==='drop-column');
 expect(candidate).toBeTruthy();
 const options={version:'umf.table-migration-options/0.2' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[marker(candidate)]};
 const planned=compileTableMigration({id:'drop-reviewed',predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next:after,options});
 expect(planned.status).toBe('compiled');if(planned.status==='compiled'){
  expect(planned.plan.version).toBe('umf.table-migration/0.2');expect(planned.plan.review?.some(item=>item.code==='IRREVERSIBLE_COLUMN_PURGE'&&item.message.includes('Metadata history is not a data backup'))).toBe(true);expect(planned.plan.steps.some(s=>s.sql==='ALTER TABLE "legal_demo"."matters" DROP COLUMN "court"')).toBe(true);
  const validator=createValidator();validator.addSchema(tableSchema);validator.addSchema(deploymentSchema);expect(validator.compile(migrationV2Schema)(planned.plan)).toBe(true);
  expect(verifyTableMigration(planned.plan)).toEqual(planned.plan);
  const changed=dropCourt();changed.modules[0]!.extensions['umf.tables'].tables.find(x=>x.id==='matters')!.name='matters_renamed';
  const changedBundle=deploy(changed);expect(compileTableMigration({id:'drop-reviewed',predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next:changedBundle,options}).status).toBe('blocked');
 }
});
test('reviewed middle-column removal preserves unchanged trailing fields by stable Field identity',()=>{
 const source=legalSource(),next=structuredClone(source),module=next.modules[0]!,payload=module.extensions['umf.tables'],table=payload.tables.find((item:any)=>item.id==='matters')!,element='matters__jurisdiction';
 table.columns=table.columns.filter((column:any)=>column.field.element!==element);
 module.elements.find((item:any)=>item.id==='matters')!.members=module.elements.find((item:any)=>item.id==='matters')!.members.filter((field:any)=>field.element!==element);
 payload.commands.find((command:any)=>command.id==='read_matters')!.body.fields=payload.commands.find((command:any)=>command.id==='read_matters')!.body.fields.filter((field:any)=>field.element!==element);
 for(const set of payload.seedSets)for(const row of set.rows)if(row.table==='matters')row.values=row.values.filter((value:any)=>value.field.element!==element);
 const before=deploy(source),after=deploy(next),candidate=discoverTableMigrationChanges(before,after).find(item=>item.kind==='drop-column')!;
 const result=compileTableMigration({id:'drop-middle-field',predecessor:{id:'old',digest:'7'.repeat(64)},previous:before,next:after,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[marker(candidate)]}});
 expect(result.status).toBe('compiled');if(result.status==='compiled')expect(result.plan.steps.some(step=>step.sql==='ALTER TABLE "legal_demo"."matters" DROP COLUMN "jurisdiction"')).toBe(true);
});
test('column removal and appended fields refuse before producing an incomplete plan at same or mixed counts',()=>{
 for(const addedCount of [1,2]){
  const source=legalSource(),oldMatters=source.modules[0]!.extensions['umf.tables'].tables.find((item:any)=>item.id==='matters')!;oldMatters.policy.person.update={kind:'deny'};
  const next=dropCourt(source),module=next.modules[0]!,payload=module.extensions['umf.tables'],table=payload.tables.find((item:any)=>item.id==='matters')!,record=module.elements.find((item:any)=>item.id==='matters')!;
  for(let index=0;index<addedCount;index++){
   const element='matters__replacement_'+index,field={module:module.id,element};
   module.elements.push({id:element,name:element,kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}} as any);
   record.members.push(field);table.columns.push({field,name:'replacement_'+index,nativeType:{kind:'text'}});
  }
  const before=deploy(source),after=deploy(next),drop=discoverTableMigrationChanges(before,after).find(candidate=>candidate.kind==='drop-column')!;
  const result=compileTableMigration({id:'drop-and-add-'+addedCount,predecessor:{id:'old',digest:'5'.repeat(64)},previous:before,next:after,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[marker(drop)]}});
  expect(result.status).toBe('blocked');if(result.status==='blocked')expect(result.diagnostics[0]!.message).toContain('Combining column removal with appended columns');
 }
});

test('column drops resolve nested policy references by stable field identity and require a reviewed policy rewrite',()=>{
 const old=legalSource(),oldTable=old.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id==='matters')!;
 oldTable.policy.person.select={kind:'owner',field:{element:'matters__court',module:'legal_lifecycle'}};
 const next=dropCourt(),nextTable=next.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id==='matters')!;nextTable.policy.person.select={kind:'owner',field:{module:'legal_lifecycle',element:'matters__matter_number'}};
 const before=deploy(old),after=deploy(next),candidates=discoverTableMigrationChanges(before,after),options={version:'umf.table-migration-options/0.2' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:candidates.filter(c=>c.kind==='drop-column'||c.kind==='change-policy').map(marker)};
 const refused=compileTableMigration({id:'drop-policy-unreviewed',predecessor:{id:'old',digest:'9'.repeat(64)},previous:before,next:after,options:{...options,reviewedChanges:options.reviewedChanges.filter((m:any)=>m.kind!=='change-policy')}});
 expect(refused.status).toBe('blocked');if(refused.status==='blocked')expect(refused.diagnostics[0]!.code).toBe('destructive_change_unreviewed');
 const result=compileTableMigration({id:'drop-policy-reviewed',predecessor:{id:'old',digest:'9'.repeat(64)},previous:before,next:after,options});
 expect(result.status).toBe('compiled');if(result.status==='compiled'){
  const policy=result.plan.steps.findIndex(step=>step.sql.startsWith('ALTER POLICY "umf_person_select"'));
  const drop=result.plan.steps.findIndex(step=>step.sql.includes('DROP COLUMN "court"'));
  expect(policy).toBeGreaterThan(-1);expect(drop).toBeGreaterThan(policy);
 }
});

test('column drops detect related-policy references from other selected tables and order reviewed rewrites first',()=>{
 const old=legalSource(),oldJoin=old.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id==='matter_teams')!;
 // Remove the fixture's reverse relation so this cross-table relation is acyclic.
 const oldMatters=old.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id==='matters')!;
 oldMatters.policy.person=Object.fromEntries(['select','insert','update','delete'].map(command=>[command,{kind:'allow'}]));
 oldJoin.policy.person.select={kind:'related',record:{module:'legal_lifecycle',element:'matters'},matches:[{source:{module:'legal_lifecycle',element:'matter_teams__matter_id'},target:{module:'legal_lifecycle',element:'matters__matter_id'}}],rule:{kind:'owner',field:{element:'matters__court',module:'legal_lifecycle'}}};
 const next=dropCourt(),nextTables=next.modules[0]!.extensions['umf.tables'].tables,nextJoin=nextTables.find((t:any)=>t.id==='matter_teams')!;
 nextTables.find((t:any)=>t.id==='matters')!.policy.person=structuredClone(oldMatters.policy.person);
 nextJoin.policy.person.select={kind:'related',record:{module:'legal_lifecycle',element:'matters'},matches:[{source:{module:'legal_lifecycle',element:'matter_teams__matter_id'},target:{module:'legal_lifecycle',element:'matters__matter_id'}}],rule:{kind:'owner',field:{module:'legal_lifecycle',element:'matters__matter_number'}}};
 const before=deploy(old),after=deploy(next),markers=discoverTableMigrationChanges(before,after).filter(c=>c.kind==='drop-column'||c.kind==='change-policy').map(marker);
 const options={version:'umf.table-migration-options/0.2' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:markers};
 const denied=compileTableMigration({id:'drop-cross-policy-denied',predecessor:{id:'old',digest:'3'.repeat(64)},previous:before,next:after,options:{...options,reviewedChanges:markers.filter(m=>m.kind!=='change-policy')}});
 expect(denied.status).toBe('blocked');if(denied.status==='blocked')expect(denied.diagnostics[0]!.code).toBe('destructive_change_unreviewed');
 const result=compileTableMigration({id:'drop-cross-policy-reviewed',predecessor:{id:'old',digest:'3'.repeat(64)},previous:before,next:after,options});
 expect(result.status).toBe('compiled');if(result.status==='compiled'){
  const rewrite=result.plan.steps.findIndex(step=>step.sql.startsWith('ALTER POLICY "umf_person_select" ON "legal_demo"."matter_teams"'));
  const drop=result.plan.steps.findIndex(step=>step.sql.includes('DROP COLUMN "court"'));
  expect(rewrite).toBeGreaterThan(-1);expect(drop).toBeGreaterThan(rewrite);
 }
 const unresolved=structuredClone(next);unresolved.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id==='matter_teams')!.policy.person.select=structuredClone(oldJoin.policy.person.select);
 const unresolvedResult=compileTableDeployment({text:JSON.stringify(unresolved),configuration});
 expect(unresolvedResult.status).toBe('blocked');
});

test('column drops resolve nested command references independent of object key order',()=>{
 const old=legalSource(),oldCommand=old.modules[0]!.extensions['umf.tables'].commands.find((c:any)=>c.id==='rename_matter')!;
 oldCommand.parameters.find((p:any)=>p.id==='id').field={element:'matters__court',module:'legal_lifecycle'};
 oldCommand.body.where={op:'eq',field:{element:'matters__court',module:'legal_lifecycle'},value:{kind:'parameter',parameter:'id'}};
 const next=dropCourt(),nextCommand=next.modules[0]!.extensions['umf.tables'].commands.find((c:any)=>c.id==='rename_matter')!;
 nextCommand.parameters.find((p:any)=>p.id==='id').field={module:'legal_lifecycle',element:'matters__matter_number'};
 nextCommand.body.where={op:'eq',field:{module:'legal_lifecycle',element:'matters__matter_number'},value:{kind:'parameter',parameter:'id'}};
 const before=deploy(old),after=deploy(next),candidate=discoverTableMigrationChanges(before,after).find(x=>x.kind==='drop-column')!;
 const options={version:'umf.table-migration-options/0.2' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[marker(candidate)]};
 const result=compileTableMigration({id:'drop-command-reviewed',predecessor:{id:'old',digest:'8'.repeat(64)},previous:before,next:after,options});
 expect(result.status).toBe('compiled');if(result.status==='compiled')expect(result.plan.steps.some(step=>step.sql.includes('DROP COLUMN "court"'))).toBe(true);
});

test('reviewed column rename and NOT NULL tightening compile only with exact source markers',()=>{
 const source=legalSource(),before=deploy(source),renamed=structuredClone(source),table=renamed.modules[0]!.extensions['umf.tables'].tables.find(x=>x.id==='matters')!;
 table.columns.find((c:any)=>c.field.element==='matters__court')!.name='court_name';
 const renamedBundle=deploy(renamed),renameCandidate=discoverTableMigrationChanges(before,renamedBundle).find(x=>x.kind==='rename-column')!;
 const options={version:'umf.table-migration-options/0.2' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[marker(renameCandidate)]};
 const refused=compileTableMigration({id:'rename-unreviewed',predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next:renamedBundle});
 expect(refused.status).toBe('blocked');if(refused.status==='blocked')expect(refused.diagnostics[0]!.code).toBe('destructive_change_unreviewed');
 const result=compileTableMigration({id:'rename-reviewed',predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next:renamedBundle,options});
 expect(result.status).toBe('compiled');if(result.status==='compiled')expect(result.plan.steps.some(s=>s.sql==='ALTER TABLE "legal_demo"."matters" RENAME COLUMN "court" TO "court_name"')).toBe(true);
 const strictBase=structuredClone(source);for(const set of strictBase.modules[0]!.extensions['umf.tables'].seedSets)for(const row of set.rows)for(const value of row.values)if(value.field.element==='matters__close_date')value.value={date:'2026-12-31'};
 const strictBefore=deploy(strictBase),strict=structuredClone(strictBase),field=strict.modules[0]!.elements.find(e=>e.id==='matters__close_date')!;field.nullability='required';
 const strictBundle=deploy(strict),notNullCandidate=discoverTableMigrationChanges(strictBefore,strictBundle).find(x=>x.kind==='tighten-not-null')!;
 const strictOptions={...options,reviewedChanges:[marker(notNullCandidate)]};
 const tightened=compileTableMigration({id:'not-null-reviewed',predecessor:{id:'old',digest:'a'.repeat(64)},previous:strictBefore,next:strictBundle,options:strictOptions});
 expect(tightened.status).toBe('compiled');if(tightened.status==='compiled'){
  expect(tightened.plan.steps.some(s=>s.sql==='ALTER TABLE "legal_demo"."matters" ALTER COLUMN "close_date" SET NOT NULL')).toBe(true);
  expect(verifyTableMigration(tightened.plan)).toEqual(tightened.plan);
 }
 const relaxedCandidate=discoverTableMigrationChanges(strictBundle,strictBefore).find(x=>x.kind==='relax-not-null')!;
 const relaxedOptions={...options,reviewedChanges:[marker(relaxedCandidate)]};
 const relaxed=compileTableMigration({id:'not-null-relaxed',predecessor:{id:'old',digest:'b'.repeat(64)},previous:strictBundle,next:strictBefore,options:relaxedOptions});
 if(relaxed.status==='blocked')throw Error(JSON.stringify(relaxed.diagnostics));expect(relaxed.status).toBe('compiled');if(relaxed.status==='compiled')expect(relaxed.plan.steps.some(s=>s.sql==='ALTER TABLE "legal_demo"."matters" ALTER COLUMN "close_date" DROP NOT NULL')).toBe(true);
});
test('renamed columns revoke old column grants before changing the physical name',()=>{
 const source=legalSource(),oldTable=source.modules[0]!.extensions['umf.tables'].tables.find((item:any)=>item.id==='matters')!;
 oldTable.policy.person.select={kind:'owner',field:{module:'legal_lifecycle',element:'matters__court'}};
 const before=deploy(source),nextSource=structuredClone(source),nextTable=nextSource.modules[0]!.extensions['umf.tables'].tables.find((item:any)=>item.id==='matters')!;
 nextTable.columns.find((column:any)=>column.field.element==='matters__court')!.name='court_name';
 const next=deploy(nextSource),candidate=discoverTableMigrationChanges(before,next).find(item=>item.kind==='rename-column')!,markerValue=marker(candidate);
 const result=compileTableMigration({id:'rename-with-column-grant',predecessor:{id:'old',digest:'1'.repeat(64)},previous:before,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[markerValue]}});
 expect(result.status).toBe('compiled');if(result.status==='compiled'){
  const rename=result.plan.steps.findIndex(step=>step.sql.includes('RENAME COLUMN "court" TO "court_name"'));
  const revoke=result.plan.steps.findIndex(step=>step.sql.includes('REVOKE')&&step.sql.includes('"court"'));
  expect(revoke).toBeGreaterThan(-1);expect(rename).toBeGreaterThan(revoke);
 }
});

test('type changes require a digest-bound explicit safe PostgreSQL widening conversion',()=>{
 const source=legalSource(),before=deploy(source),widened=structuredClone(source),module=widened.modules[0]!,table=module.extensions['umf.tables'].tables.find(x=>x.id==='timekeepers')!;
 const field=module.elements.find(e=>e.id==='timekeepers__billing_rate')!;field.facets={precision:12,scale:2};
 table.columns.find((c:any)=>c.field.element==='timekeepers__billing_rate')!.nativeType={kind:'numeric',precision:12,scale:2};
 const next=deploy(widened),candidate=discoverTableMigrationChanges(before,next).find(x=>x.kind==='change-column-type')!;
 const reviewed=marker(candidate);reviewed.conversion='pg-cast-v1';
 const options={version:'umf.table-migration-options/0.2' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[reviewed]};
 expect(compileTableMigration({id:'type-unreviewed',predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next}).status).toBe('blocked');
 const result=compileTableMigration({id:'type-reviewed',predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next,options});
 expect(result.status).toBe('compiled');if(result.status==='compiled')expect(result.plan.steps.some(s=>s.sql.includes('ALTER COLUMN "billing_rate" TYPE pg_catalog."numeric"(12,2) USING "billing_rate"::pg_catalog."numeric"(12,2)'))).toBe(true);
 const unsafe=structuredClone(widened);unsafe.modules[0]!.extensions['umf.tables'].tables.find((x:any)=>x.id==='timekeepers')!.columns.find((c:any)=>c.field.element==='timekeepers__billing_rate')!.nativeType={kind:'numeric',precision:5,scale:2};unsafe.modules[0]!.elements.find((e:any)=>e.id==='timekeepers__billing_rate')!.facets={precision:5,scale:2};
 const unsafeBundle=deploy(unsafe),unsafeCandidate=discoverTableMigrationChanges(before,unsafeBundle).find(x=>x.kind==='change-column-type')!;
 const unsafeMarker=marker(unsafeCandidate);unsafeMarker.conversion='pg-cast-v1';
 const unsafeOptions={...options,reviewedChanges:[unsafeMarker]};
 const narrowing=compileTableMigration({id:'type-narrowing',predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next:unsafeBundle,options:unsafeOptions});
 expect(narrowing.status).toBe('blocked');if(narrowing.status==='blocked')expect(narrowing.diagnostics[0]!.code).toBe('TABLE_MIGRATION_UNSUPPORTED');
 for(const [label,mutate] of [
  ['default',(column:any)=>{column.default={kind:'literal',value:{decimalToken:'99.00'}};}],
  ['immutable',(column:any)=>{column.immutable=true;}],
 ] as const){
  const hidden=structuredClone(widened),hiddenColumn=hidden.modules[0]!.extensions['umf.tables'].tables.find((item:any)=>item.id==='timekeepers')!.columns.find((column:any)=>column.field.element==='timekeepers__billing_rate');
  mutate(hiddenColumn);
  const hiddenBundle=deploy(hidden),hiddenCandidate=discoverTableMigrationChanges(before,hiddenBundle).find(item=>item.kind==='change-column-type')!;
  const hiddenMarker=marker(hiddenCandidate);hiddenMarker.conversion='pg-cast-v1';
  const hiddenResult=compileTableMigration({id:'type-plus-'+label,predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next:hiddenBundle,options:{...options,reviewedChanges:[hiddenMarker]}});
  expect(hiddenResult.status).toBe('blocked');if(hiddenResult.status==='blocked')expect(hiddenResult.diagnostics[0]!.code).toBe('TABLE_MIGRATION_UNSUPPORTED');
 }
});

test('reviewed index replacement emits an ordered drop and create for the exact source object',()=>{
 const indexed=indexedLegalSource(),before=deploy(indexed.source),changed=structuredClone(indexed.source),table=changed.modules[0]!.extensions['umf.tables'].tables.find(x=>x.id==='matters')!;
 table.indexes.find((x:any)=>x.id==='client_lookup')!.name='matters_client_lookup_v2';
 const next=deploy(changed),candidate=discoverTableMigrationChanges(before,next).find(x=>x.kind==='replace-index')!;
 const options={version:'umf.table-migration-options/0.2' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[marker(candidate)]};
 const result=compileTableMigration({id:'index-replace',predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next,options});
 expect(result.status).toBe('compiled');if(result.status==='compiled'){
  const drop=result.plan.steps.findIndex(s=>s.sql==='DROP INDEX "legal_demo"."matters_client_lookup"'),create=result.plan.steps.findIndex(s=>s.sql.includes('CREATE INDEX "matters_client_lookup_v2"'));
  expect(drop).toBeGreaterThan(-1);expect(create).toBeGreaterThan(drop);expect(verifyTableMigration(result.plan)).toEqual(result.plan);
 }
});
test('stable-ID index replacement emits both drop and create at the same array position',()=>{
 const source=indexedLegalSource().source,before=deploy(source),changed=structuredClone(source),table=changed.modules[0]!.extensions['umf.tables'].tables.find((item:any)=>item.id==='matters')!;
 const index=table.indexes.find((item:any)=>item.id==='client_lookup')!;index.id='client_lookup_v2';index.name='matters_client_lookup_v2';
 const next=deploy(changed),candidate=discoverTableMigrationChanges(before,next).find(item=>item.kind==='replace-index')!,review=marker(candidate);
 const result=compileTableMigration({id:'index-replace-new-id',predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[review]}});
 expect(result.status).toBe('compiled');if(result.status==='compiled'){
  expect(result.plan.steps.some(step=>step.sql==='DROP INDEX "legal_demo"."matters_client_lookup"')).toBe(true);
  expect(result.plan.steps.some(step=>step.sql.includes('CREATE INDEX "matters_client_lookup_v2"'))).toBe(true);
 }
});

test('reviewed index removal names unreviewed objects and emits an explicit DROP INDEX',()=>{
 const source=indexedLegalSource().source,before=deploy(source),changed=structuredClone(source),table=changed.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id==='matters')!;
 table.indexes=table.indexes.filter((index:any)=>index.id!=='client_lookup');const next=deploy(changed),candidate=discoverTableMigrationChanges(before,next).find(x=>x.kind==='replace-index')!;
 const denied=compileTableMigration({id:'index-drop-denied',predecessor:{id:'old',digest:'6'.repeat(64)},previous:before,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[]}});
 expect(denied.status).toBe('blocked');if(denied.status==='blocked'){expect(denied.diagnostics[0]!.code).toBe('destructive_change_unreviewed');expect(denied.diagnostics[0]!.message).toContain('matters_client_lookup');}
 const result=compileTableMigration({id:'index-drop-reviewed',predecessor:{id:'old',digest:'6'.repeat(64)},previous:before,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[marker(candidate)]}});
 if(result.status==='blocked')throw Error(JSON.stringify(result.diagnostics));expect(result.status).toBe('compiled');if(result.status==='compiled')expect(result.plan.steps.some(s=>s.sql==='DROP INDEX "legal_demo"."matters_client_lookup"')).toBe(true);
});

test('policy revisions require old/new policy digests and update stored policy plus grants',()=>{
 const source=legalSource(),before=deploy(source),changed=structuredClone(source),clients=changed.modules[0]!.extensions['umf.tables'].tables.find((x:any)=>x.id==='clients')!;
 clients.policy.person.select={kind:'deny'};
 const next=deploy(changed),candidate=discoverTableMigrationChanges(before,next).find(x=>x.kind==='change-policy')!;
 const options={version:'umf.table-migration-options/0.2' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[marker(candidate)]};
 const unreviewedOptions={version:'umf.table-migration-options/0.2' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[]};
 const unreviewed=compileTableMigration({id:'policy-unreviewed',predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next,options:unreviewedOptions});expect(unreviewed.status).toBe('blocked');if(unreviewed.status==='blocked')expect(unreviewed.diagnostics[0]!.code).toBe('destructive_change_unreviewed');
 const result=compileTableMigration({id:'policy-reviewed',predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next,options});
 expect(result.status).toBe('compiled');if(result.status==='compiled'){
  expect(result.plan.steps.some(step=>step.sql.startsWith('ALTER POLICY "umf_person_select"'))).toBe(true);
  expect(result.plan.steps.some(step=>step.sql.startsWith('REVOKE SELECT ON TABLE "legal_demo"."clients"'))).toBe(true);
 }
});

test('primary-key replacement requires an exact marker and refuses dependent foreign keys by name',()=>{
 const source=legalSource(),before=deploy(source),changed=structuredClone(source),record=changed.modules[0]!.elements.find((e:any)=>e.id==='matters')!;
 record.keys[0]!.fields=[{module:'legal_lifecycle',element:'matters__client_id'}];
 changed.modules[0]!.extensions['umf.tables'].commands.find((c:any)=>c.id==='read_matters').body.orderBy=[{field:{module:'legal_lifecycle',element:'matters__client_id'},direction:'asc'}];
 const next=deploy(changed),candidate=discoverTableMigrationChanges(before,next).find(x=>x.kind==='replace-primary-key')!;
 const refused=compileTableMigration({id:'pk-unreviewed',predecessor:{id:'old',digest:'c'.repeat(64)},previous:before,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[]}});
 expect(refused.status).toBe('blocked');if(refused.status==='blocked')expect(refused.diagnostics[0]!.code).toBe('destructive_change_unreviewed');
 const result=compileTableMigration({id:'pk-reviewed',predecessor:{id:'old',digest:'c'.repeat(64)},previous:before,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[marker(candidate)]}});
 expect(result.status).toBe('blocked');if(result.status==='blocked')expect(result.diagnostics[0]!.message).toContain('inbound foreign-key dependents');
});

test('reviewed primary-key replacement emits ordered DROP and ADD when dependency closure is empty',()=>{
 const source=legalSource(),before=deploy(source),changed=structuredClone(source),record=changed.modules[0]!.elements.find((e:any)=>e.id==='matter_teams')!;
 record.keys.find((k:any)=>k.primary)!.fields=[{module:'legal_lifecycle',element:'matter_teams__matter_id'},{module:'legal_lifecycle',element:'matter_teams__database_role'}];
 changed.modules[0]!.extensions['umf.tables'].commands.find((c:any)=>c.id==='read_matter_teams').body.orderBy=[{field:{module:'legal_lifecycle',element:'matter_teams__matter_id'},direction:'asc'},{field:{module:'legal_lifecycle',element:'matter_teams__database_role'},direction:'asc'}];
 const next=deploy(changed),candidate=discoverTableMigrationChanges(before,next).find(x=>x.kind==='replace-primary-key')!;
 const result=compileTableMigration({id:'pk-reviewed-no-dependents',predecessor:{id:'old',digest:'d'.repeat(64)},previous:before,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[marker(candidate)]}});
 expect(result.status).toBe('compiled');if(result.status==='compiled'){
  const drop=result.plan.steps.findIndex(s=>s.sql.includes('DROP CONSTRAINT "umf_k_'));
  const add=result.plan.steps.findIndex(s=>s.sql.includes('ADD CONSTRAINT "umf_k_')&&s.sql.includes('PRIMARY KEY'));
  expect(drop).toBeGreaterThan(-1);expect(add).toBeGreaterThan(drop);expect(verifyTableMigration(result.plan)).toEqual(result.plan);
 }
});

test('reviewed foreign-key replacement drops the old constraint before adding the exact successor',()=>{
 const source=legalSource(),before=deploy(source),changed=structuredClone(source),fk=changed.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id==='matter_teams')!.foreignKeys[0]!;
 fk.onDelete='cascade';const next=deploy(changed),candidate=discoverTableMigrationChanges(before,next).find(x=>x.kind==='replace-foreign-key')!;
 const result=compileTableMigration({id:'fk-reviewed',predecessor:{id:'old',digest:'e'.repeat(64)},previous:before,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[marker(candidate)]}});
 expect(result.status).toBe('compiled');if(result.status==='compiled'){
  const drop=result.plan.steps.findIndex(s=>s.sql.includes('DROP CONSTRAINT "matter_teams_fk_0"'));
  const add=result.plan.steps.findIndex(s=>s.sql.includes('ADD CONSTRAINT "matter_teams_fk_0"')&&s.sql.includes('ON DELETE CASCADE'));
  expect(drop).toBeGreaterThan(-1);expect(add).toBeGreaterThan(drop);expect(verifyTableMigration(result.plan)).toEqual(result.plan);
 }
});
test('stable-ID foreign-key replacement emits drop and add at the same array position',()=>{
 const source=legalSource(),before=deploy(source),changed=structuredClone(source),table=changed.modules[0]!.extensions['umf.tables'].tables.find((item:any)=>item.id==='matter_teams')!;
 const foreignKey=table.foreignKeys[0]!;foreignKey.id='fk_replacement';foreignKey.name='matter_teams_fk_replacement';
 const next=deploy(changed),candidate=discoverTableMigrationChanges(before,next).find(item=>item.kind==='replace-foreign-key')!,review=marker(candidate);
 const result=compileTableMigration({id:'fk-replace-new-id',predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[review]}});
 expect(result.status).toBe('compiled');if(result.status==='compiled'){
  expect(result.plan.steps.some(step=>step.sql.includes('DROP CONSTRAINT "matter_teams_fk_0"'))).toBe(true);
  expect(result.plan.steps.some(step=>step.sql.includes('ADD CONSTRAINT "matter_teams_fk_replacement"'))).toBe(true);
 }
});

test('reviewed foreign-key removal requires a marker and emits an explicit constraint drop',()=>{
 const source=legalSource(),before=deploy(source),changed=structuredClone(source),table=changed.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id==='matter_teams')!;
 table.foreignKeys=table.foreignKeys.slice(1);const next=deploy(changed),candidate=discoverTableMigrationChanges(before,next).find(x=>x.kind==='replace-foreign-key')!;
 const denied=compileTableMigration({id:'fk-drop-denied',predecessor:{id:'old',digest:'5'.repeat(64)},previous:before,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[]}});
 expect(denied.status).toBe('blocked');if(denied.status==='blocked'){expect(denied.diagnostics[0]!.code).toBe('destructive_change_unreviewed');expect(denied.diagnostics[0]!.message).toContain('matter_teams_fk_0');}
 const result=compileTableMigration({id:'fk-drop-reviewed',predecessor:{id:'old',digest:'5'.repeat(64)},previous:before,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[marker(candidate)]}});
 expect(result.status).toBe('compiled');if(result.status==='compiled')expect(result.plan.steps.some(s=>s.sql.includes('DROP CONSTRAINT "matter_teams_fk_0"'))).toBe(true);
});

test('reviewed check-constraint replacement drops the old definition before adding its successor',()=>{
 const source=evolvedLegalSource().source,before=deploy(source),changed=structuredClone(source),check=changed.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id==='matters')!.checks.find((c:any)=>c.id==='positive_id')!;
 check.expression.right.value.integerToken='10';const next=deploy(changed),candidate=discoverTableMigrationChanges(before,next).find(x=>x.kind==='replace-check')!;
 const result=compileTableMigration({id:'check-reviewed',predecessor:{id:'old',digest:'7'.repeat(64)},previous:before,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[marker(candidate)]}});
 expect(result.status).toBe('compiled');if(result.status==='compiled'){
  const drop=result.plan.steps.findIndex(s=>s.sql.includes('DROP CONSTRAINT "matters_positive_id"'));
  const add=result.plan.steps.findIndex(s=>s.sql.includes('ADD CONSTRAINT "matters_positive_id"')&&s.sql.includes('E\'1e1\''));
  expect(drop).toBeGreaterThan(-1);expect(add).toBeGreaterThan(drop);expect(verifyTableMigration(result.plan)).toEqual(result.plan);
 }
});

test('reviewed check-constraint removal requires a marker and emits an explicit constraint drop',()=>{
 const source=evolvedLegalSource().source,before=deploy(source),changed=structuredClone(source),table=changed.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id==='matters')!;
 table.checks=[];const next=deploy(changed),candidate=discoverTableMigrationChanges(before,next).find(x=>x.kind==='replace-check')!;
 const result=compileTableMigration({id:'check-drop-reviewed',predecessor:{id:'old',digest:'4'.repeat(64)},previous:before,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[marker(candidate)]}});
 expect(result.status).toBe('compiled');if(result.status==='compiled')expect(result.plan.steps.some(s=>s.sql.includes('DROP CONSTRAINT "matters_positive_id"'))).toBe(true);
});

test('selected new foreign keys compile as add-not-valid and separate validation phases',()=>{
 const source=legalSource(),before=deploy(source),changed=structuredClone(source),table=changed.modules[0]!.extensions['umf.tables'].tables.find((t:any)=>t.id==='matters')!;
 table.foreignKeys.push({id:'client_fk',name:'matters_client_fk',fields:[{module:'legal_lifecycle',element:'matters__client_id'}],target:{record:{module:'legal_lifecycle',element:'clients'},key:'primary'},onUpdate:'noAction',onDelete:'restrict',deferrable:false});
 const next=deploy(changed),result=compileTableMigration({id:'fk-add-validated',predecessor:{id:'old',digest:'f'.repeat(64)},previous:before,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],reviewedChanges:[],validations:[{table:'matters',constraint:'client_fk',kind:'foreignKey'}]}});
 expect(result.status).toBe('compiled');if(result.status==='compiled'){
  expect(result.plan.steps.some(s=>s.operation==='add-not-valid'&&s.constraintKind==='foreignKey'&&s.sql.includes('ADD CONSTRAINT "matters_client_fk"')&&s.sql.endsWith('NOT VALID'))).toBe(true);
  expect(result.plan.steps.some(s=>s.operation==='validate'&&s.constraintKind==='foreignKey'&&s.sql.endsWith('VALIDATE CONSTRAINT "matters_client_fk"'))).toBe(true);
  expect(result.plan.phases?.some(p=>p.kind==='constraint-add')).toBe(true);expect(result.plan.phases?.some(p=>p.kind==='constraint-validation')).toBe(true);expect(verifyTableMigration(result.plan)).toEqual(result.plan);
 }
});

test('version 0.2 refuses table inventory changes the phase runtime cannot fence yet',()=>{
 const old=legalSource(),next=structuredClone(old),module=next.modules[0]!,tables=module.extensions['umf.tables'].tables;
 const field={module:module.id,element:'audit__id'};
 module.elements.push({id:'audit__id',name:'audit__id',kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}} as any);
 module.elements.push({id:'audit',name:'audit',kind:'record',members:[field],keys:[{id:'primary',name:'primary',primary:true,fields:[field]}],extensions:{}} as any);
 tables.push({id:'audit',record:{module:module.id,element:'audit'},name:'audit',columns:[{field,name:'id',nativeType:{kind:'int4'}}],indexes:[],checks:[],foreignKeys:[],policy:{mode:'native-rls',person:{select:{kind:'deny'},insert:{kind:'deny'},update:{kind:'deny'},delete:{kind:'deny'}},batch:{select:{kind:'allow'},insert:{kind:'deny'},update:{kind:'deny'},delete:{kind:'deny'}}}} as any);
 const before=deploy(old),after=deploy(next),result=compileTableMigration({id:'add-table-v02',predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next:after,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[]}});
 expect(result.status).toBe('blocked');if(result.status==='blocked')expect(result.diagnostics[0]!.message).toContain('cannot add or remove tables');
});
test('version 0.2 refuses initial publication until the mixed runtime supports it',()=>{
 const result=compileTableMigration({id:'initial-v02',predecessor:null,previous:null,next:deploy(legalSource()),options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:[]}});
 expect(result.status).toBe('blocked');if(result.status==='blocked')expect(result.diagnostics[0]!.message).toContain('initial publication is not supported');
});
