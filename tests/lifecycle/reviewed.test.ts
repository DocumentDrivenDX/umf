// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableMigration,discoverTableMigrationChanges,verifyTableMigration} from '../../src/table-migration';
import {compileTableDeployment} from '../../src/table-deployment';
import {legalSource,indexedLegalSource} from './legal-fixture';
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
  expect(verifyTableMigration(planned.plan)).toEqual(planned.plan);
  const changed=dropCourt();changed.modules[0]!.extensions['umf.tables'].tables.find(x=>x.id==='matters')!.name='matters_renamed';
  const changedBundle=deploy(changed);expect(compileTableMigration({id:'drop-reviewed',predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next:changedBundle,options}).status).toBe('blocked');
 }
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
 expect(compileTableMigration({id:'type-narrowing',predecessor:{id:'old',digest:'a'.repeat(64)},previous:before,next:deploy(unsafe),options}).status).toBe('blocked');
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
