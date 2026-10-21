// SPDX-License-Identifier: MIT OR Apache-2.0
import {hashCanonical} from '../../src/compilation/bundle/hash';
import {expect,test} from 'bun:test';
import {compileTableDeployment,verifyTableDeployment} from '../../src/table-deployment';
import {compileTableMigration,verifyTableMigration} from '../../src/table-migration';
import {createValidator} from '../../src/validation/schema';
import tableSchema from '../../spec/extensions/tables/schema.json';
import deploymentSchema from '../../spec/extensions/tables/deployment.schema.json';
import migrationSchema from '../../spec/extensions/tables/migration.schema.json';
import {legalSource,evolvedLegalSource,indexedLegalSource,moduleId} from './legal-fixture';
export const configuration={module:moduleId,schema:'legal_demo',ownerRole:'legal_owner',personRole:'legal_person',batchRole:'legal_batch',groupRoles:{billing_admin:'legal_billing_admin'}};
export function deploy(source:any){const r=compileTableDeployment({text:JSON.stringify(source),configuration});if(r.status!=='compiled')throw Error(JSON.stringify(r));return r.bundle;}
export function cohort(){
 const source=legalSource(),initial=compileTableMigration({id:'001',predecessor:null,previous:null,next:deploy(source)});if(initial.status!=='compiled')throw Error(JSON.stringify(initial));
 const evolved=evolvedLegalSource(source),forward=compileTableMigration({id:'002',predecessor:{id:'001',digest:initial.plan.digest},previous:initial.plan.next,next:deploy(evolved.source),options:evolved.options});if(forward.status!=='compiled')throw Error(JSON.stringify(forward));
 const indexed=indexedLegalSource(evolved.source),concurrent=compileTableMigration({id:'003',predecessor:{id:'002',digest:forward.plan.digest},previous:forward.plan.next,next:deploy(indexed.source),options:indexed.options});if(concurrent.status!=='compiled')throw Error(JSON.stringify(concurrent));
 return {source,initial:initial.plan,forward:forward.plan,concurrent:concurrent.plan};
}
test('domain descriptions, reviewed scoped backfills, checks/FKs and concurrent phases have exact source custody',()=>{
 const {initial,forward,concurrent}=cohort();
 expect(initial.next.expectedCatalog.comments!.length).toBeGreaterThan(20);
 expect(initial.steps.filter(s=>s.kind==='comment').length).toBe(initial.next.expectedCatalog.comments!.length);
 const backfill=forward.steps.findIndex(s=>s.kind==='backfill');expect(backfill).toBeGreaterThan(0);
 expect(forward.steps[backfill]!.operation).toBe('backfill_review');
 expect(forward.steps.findIndex(s=>s.sql.includes('SET NOT NULL'))).toBeGreaterThan(backfill);
 expect(forward.steps.some(s=>s.kind==='foreignKey')).toBe(true);
 expect(forward.review!.map(n=>n.code)).toContain('SCOPED_BACKFILL');
 expect(concurrent.steps.every(s=>s.transaction==='forbidden'&&s.recovery==='inspect-index'&&s.sql.includes('INDEX CONCURRENTLY'))).toBe(true);
 const validator=createValidator();validator.addSchema(tableSchema);validator.addSchema(deploymentSchema);const valid=validator.compile(migrationSchema);
 for(const plan of [initial,forward,concurrent]){expect(verifyTableMigration(plan)).toEqual(plan);expect(valid(plan)).toBe(true);}
 expect(verifyTableDeployment(initial.next)).toEqual(initial.next);
});
test('unacknowledged, duplicate, unrelated or parameterized backfills refuse without erasing source',()=>{
 const {initial}=cohort(),evolved=evolvedLegalSource();
 const input={id:'002',predecessor:{id:'001',digest:initial.digest},previous:initial.next,next:deploy(evolved.source),options:evolved.options};
 for(const change of [(r:any)=>delete r.options,(r:any)=>r.options.backfills[0].scopedRows=false,(r:any)=>r.options.backfills.push(r.options.backfills[0]),(r:any)=>r.options.backfills[0].operation='unknown',(r:any)=>r.options.backfills[0].extra=true]){const r=structuredClone(input);change(r);expect(compileTableMigration(r).status).toBe('blocked');}
 const d=structuredClone(evolved.source);d.modules[0]!.extensions['umf.tables'].commands.find(c=>c.id==='backfill_review')!.body.where={op:'all'};
 expect(compileTableMigration({...input,next:deploy(d)}).status).toBe('blocked');
});
test('concurrent source selections refuse mixed effects and rehashed/unapproved phase substitution',()=>{
 const {forward,concurrent}=cohort();
 const forged=structuredClone(concurrent);forged.steps[0]!.transaction='required';expect(()=>verifyTableMigration(forged)).toThrow();
 const d=JSON.parse(concurrent.next.source.utf8);d.modules[0].extensions['umf.tables'].tables[0].policy.person.select={kind:'deny'};
 expect(compileTableMigration({id:'003',predecessor:{id:'002',digest:forward.digest},previous:forward.next,next:deploy(d),options:concurrent.options!}).status).toBe('blocked');
});
test('comments escape SQL text and multibyte identifier bounds are byte-based',()=>{
 const source=legalSource();source.modules[0]!.elements.find(e=>e.id==='matters')!.description="Owner's \\ private\ncomment";
 expect(deploy(source).steps.find(s=>s.kind==='comment'&&s.sql.includes('"matters" IS'))!.sql).toContain("Owner''s");
 const d=legalSource();d.modules[0]!.extensions['umf.tables'].tables[0]!.name='é'.repeat(31)+'x';expect(deploy(d)).toBeTruthy();
 d.modules[0]!.extensions['umf.tables'].tables[0]!.name+='x';expect(compileTableDeployment({text:JSON.stringify(d),configuration}).status).toBe('blocked');
});

test('legacy description-bearing deployment bundles retain exact verifier recovery',()=>{
 const {initial}=cohort();
 const legacy:any=structuredClone(initial.next);
 legacy.version='umf.table-deployment/0.1';delete legacy.expectedCatalog.comments;
 legacy.steps=legacy.steps.filter((s:any)=>s.kind!=='comment').map((s:any,i:number)=>({...s,id:'step-'+String(i+1).padStart(5,'0')}));
 const {bundleDigest,...body}=legacy;
 legacy.bundleDigest=hashCanonical(body);
 expect(verifyTableDeployment(legacy)).toEqual(legacy);
 const migrated=compileTableMigration({id:'comment-upgrade',predecessor:{id:'old',digest:'a'.repeat(64)},previous:legacy,next:initial.next});
 expect(migrated.status).toBe('compiled');
 if(migrated.status==='compiled')expect(migrated.plan.steps.every(s=>s.kind==='comment')).toBe(true);
});


test('removing an authored description explicitly clears its native comment',()=>{
 const source=legalSource(),previous=deploy(source);
 delete source.modules[0]!.elements.find(e=>e.id==='matters')!.description;
 const result=compileTableMigration({id:'comment-clear',predecessor:{id:'old',digest:'a'.repeat(64)},previous,next:deploy(source)});
 expect(result.status).toBe('compiled');
 if(result.status==='compiled')expect(result.plan.steps.map(s=>s.sql)).toEqual(['COMMENT ON TABLE "legal_demo"."matters" IS NULL']);
});

test('backfill column generation never parses SQL-looking identifier text',()=>{
 const {initial}=cohort(),evolved=evolvedLegalSource();
 const t=evolved.source.modules[0]!.extensions['umf.tables'].tables.find(t=>t.id==='matters')!;
 t.columns.find((c:any)=>c.name==='review_state')!.name='review NOT NULL DEFAULT state';
 const result=compileTableMigration({id:'quoted-backfill',predecessor:{id:'001',digest:initial.digest},previous:initial.next,next:deploy(evolved.source),options:evolved.options});
 expect(result.status).toBe('compiled');
 if(result.status==='compiled'){
  expect(result.plan.steps.some(s=>s.sql==='ALTER TABLE "legal_demo"."matters" ADD COLUMN "review NOT NULL DEFAULT state" pg_catalog."text" COLLATE pg_catalog."C"')).toBe(true);
  expect(result.plan.steps.some(s=>s.sql.includes('ALTER COLUMN "review NOT NULL DEFAULT state" SET DEFAULT'))).toBe(true);
 }
});
