// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment,type TableDeploymentBundle} from '../../src/table-deployment';
import {compileTableMigration,discoverTableMigrationChanges,verifyTableMigration,type TableMigrationRequest} from '../../src/table-migration';
import {tableOperationSource} from '../unified/table-operation-fixture';
import {hashCanonical} from '../../src/compilation/bundle/hash';
import {createValidator} from '../../src/validation/schema';
import deploymentSchema from '../../spec/extensions/tables/deployment.schema.json';
import tableSchema from '../../spec/extensions/tables/schema.json';
import migrationSchema from '../../spec/extensions/tables/migration.schema.json';
import fixture from './fixtures/table-lifecycle-note.json';
import legacyPolicyMigration from './fixtures/legacy-policy-migration-v0.1.json';
import {appendedTableSource as appended,indexedTableSource as indexed} from '../unified/table-migration-fixture';
const configuration={module:'demo',schema:'plugin_demo',ownerRole:'plugin_owner',personRole:'plugin_person',batchRole:'plugin_batch',groupRoles:{readers:'plugin_readers'}};
const source=()=>structuredClone(fixture) as any;
function bundle(doc=source()):TableDeploymentBundle{const r=compileTableDeployment({text:JSON.stringify(doc),configuration});if(r.status!=='compiled')throw Error(JSON.stringify(r));return r.bundle;}
function reviewedOptions(previous:TableDeploymentBundle,next:TableDeploymentBundle){return {version:'umf.table-migration-options/0.2' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges:discoverTableMigrationChanges(previous,next).map(({oldValue:_old,newValue:_new,...marker})=>marker)};}
const initial=():TableMigrationRequest=>({id:'001',predecessor:null,previous:null,next:bundle()});
const forward=():TableMigrationRequest=>({id:'002',predecessor:{id:'001',digest:'a'.repeat(64)},previous:bundle(),next:bundle(appended())});
test('frozen 0.1 policy migration retains exact verifier recovery while new compilation requires reviewed markers',()=>{
 const plan=legacyPolicyMigration.plan as any,verified=verifyTableMigration(plan);
 expect(verified.digest).toBe(plan.digest);expect(verified).toEqual(plan);
 const current=compileTableMigration({id:plan.id,predecessor:plan.predecessor,previous:plan.previous,next:plan.next});
 expect(current.status).toBe('blocked');if(current.status==='blocked')expect(current.diagnostics[0]!.code).toBe('destructive_change_unreviewed');
});
test('initial plan retains exact source and ordered compiler steps; approval is not inferred',()=>{
 const input=initial(),r=compileTableMigration(input);expect(r.status).toBe('compiled');if(r.status!=='compiled')return;
 expect(r.plan.steps.map(({preconditions,expectedOutcome,verification,recovery,...step})=>step)).toEqual(input.next.steps);expect(r.plan.fromBundleDigest).toBeNull();expect(r.plan.requiresApproval).toBe(true);expect(r.plan.nativeQualified).toBe(false);expect(verifyTableMigration(r.plan)).toEqual(r.plan);
 r.plan.steps[0]!.sql='changed';expect(input.next.steps[0]!.sql).not.toBe('changed');
});
test('append table plans reuse only new table steps and preserve source order',()=>{
 const input=forward(),r=compileTableMigration(input);expect(r.status).toBe('compiled');if(r.status!=='compiled')throw Error(JSON.stringify(r));
 expect(r.plan.steps.length).toBeGreaterThan(10);expect(r.plan.steps.every(s=>s.sourcePath.includes('/tables/1'))).toBe(true);
 expect(r.plan.steps[0]!.sql).toStartWith('CREATE TABLE "plugin_demo"."extras"');expect(r.plan.fromBundleDigest).toBe(input.previous!.bundleDigest);expect(verifyTableMigration(r.plan)).toEqual(r.plan);
});
test('rehashed SQL, source, history pins, approval and unknown fields cannot forge a plan',()=>{
 const r=compileTableMigration(forward());if(r.status!=='compiled')throw Error(JSON.stringify(r));
 for(const mutate of [(p:any)=>p.steps[0].sql='DROP SCHEMA public CASCADE',(p:any)=>p.steps.reverse(),(p:any)=>p.fromBundleDigest='0'.repeat(64),(p:any)=>p.toBundleDigest='0'.repeat(64),(p:any)=>p.requiresApproval=false,(p:any)=>p.next.source.utf8+=' ',(p:any)=>p.extra=true]){
  const p=structuredClone(r.plan);mutate(p);const {digest,...body}=p;p.digest=hashCanonical(body);expect(()=>verifyTableMigration(p)).toThrow();
 }
});
test('initial/forward predecessor and exact request shapes refuse invalid histories',()=>{
 for(const change of [(r:any)=>r.predecessor={id:'before',digest:'a'.repeat(64)},(r:any)=>r.predecessor={},(r:any)=>r.extra=1,(r:any)=>r.id='',(r:any)=>r.id='x'.repeat(257)]){const r=initial();change(r);expect(compileTableMigration(r).status).toBe('blocked');}
 for(const change of [(r:any)=>r.predecessor=null,(r:any)=>r.predecessor.id=r.id,(r:any)=>r.predecessor.digest='not-a-digest',(r:any)=>r.next=r.previous]){const r=forward();change(r);expect(compileTableMigration(r).status).toBe('blocked');}
});
test('unsupported logical, native and module changes still require separate qualification',()=>{
 for(const mutate of [(d:any)=>d.modules[0].elements[0].name='renamed',(d:any)=>d.modules[0].extensions['umf.tables'].tables[0].name='renamed',(d:any)=>d.modules[0].namespace='renamed']){
  const input=forward(),d=appended();mutate(d);input.next=bundle(d);expect(compileTableMigration(input).status).toBe('blocked');
 }
});
test('migration schema is closed and seed/namespace transitions are explicit',()=>{
 const v=createValidator();v.addSchema(tableSchema);v.addSchema(deploymentSchema);const validate=v.compile(migrationSchema);
 const r=compileTableMigration(forward());if(r.status!=='compiled')throw Error(JSON.stringify(r));expect(validate(r.plan)).toBe(true);expect(validate({...r.plan,extra:1})).toBe(false);expect(validate({...r.plan,requiresApproval:false})).toBe(false);
 const changed=forward(),doc=appended();doc.modules[0].extensions['umf.tables'].seedSets=[{id:'empty',conflict:'error',rows:[]}];
 changed.next=bundle(doc);const seeded=compileTableMigration(changed);expect(seeded.status).toBe('compiled');if(seeded.status==='compiled')expect(seeded.plan.seedExecution).toEqual({version:'umf.table-seed-execution/0.1',sets:['empty']});
 const other=compileTableDeployment({text:JSON.stringify(appended()),configuration:{...configuration,schema:'plugin_other'}});if(other.status!=='compiled')throw Error(JSON.stringify(other));changed.next=other.bundle;expect(compileTableMigration(changed).status).toBe('blocked');
});
test('source-rehashed deployment mutations and removing existing tables never produce SQL plans',()=>{
 for(const which of ['previous','next'] as const){const r=forward(),b=r[which]!;b.steps[0]!.sql='DROP SCHEMA public CASCADE';const {bundleDigest,...body}=b;b.bundleDigest=hashCanonical(body);expect(compileTableMigration(r).status).toBe('blocked');}
 const r=forward();[r.previous,r.next]=[r.next,r.previous!];expect(compileTableMigration(r).status).toBe('blocked');
});

test('forward indexes reuse only original new-index compiler steps and preserve existing definitions',()=>{
 const input=forward();input.next=bundle(indexed());
 const result=compileTableMigration(input);if(result.status!=='compiled')throw Error(JSON.stringify(result));
 expect(result.plan.steps.map(({preconditions,expectedOutcome,verification,recovery,...step})=>step)).toEqual(input.next.steps.filter(step=>step.kind==='index'));
 expect(result.plan.steps).toHaveLength(1);expect(result.plan.steps[0]!.sql).toContain('CREATE INDEX "notes_owner_lookup"');
 expect(verifyTableMigration(result.plan)).toEqual(result.plan);
 const v=createValidator();v.addSchema(tableSchema);v.addSchema(deploymentSchema);expect(v.compile(migrationSchema)(result.plan)).toBe(true);
 const old=indexed(),changed=indexed();changed.modules[0].extensions['umf.tables'].tables[0].indexes[0].unique=true;
 expect(compileTableMigration({...input,previous:bundle(old),next:bundle(changed)}).status).toBe('blocked');
 expect(compileTableMigration({...input,previous:bundle(old),next:bundle()}).status).toBe('blocked');
 const both=compileTableMigration({...input,next:bundle(indexed(appended()))});if(both.status!=='compiled')throw Error(JSON.stringify(both));
 expect(both.plan.steps.filter(step=>step.sourcePath.includes('/tables/0'))).toHaveLength(1);
 expect(both.plan.steps.filter(step=>step.sourcePath.includes('/tables/1')).length).toBeGreaterThan(10);
});
test('nullable appended columns and grant-preserving policy revisions compile as ordered source DDL',()=>{
 const doc=source(),module=doc.modules[0]!,tables=module.extensions['umf.tables'],table=tables.tables[0]!;
 const field={id:'summary',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}};
 module.elements.push(field);module.elements.find((element:any)=>element.id==='Note')!.members.push({module:'demo',element:'summary'});
 table.columns.push({field:{module:'demo',element:'summary'},name:'summary',nativeType:{kind:'text'}});
 table.policy.person.select={kind:'allow'};
 const previous=bundle(),next=bundle(doc),input={id:'column-policy-002',predecessor:{id:'column-policy-001',digest:'c'.repeat(64)},previous,next,options:reviewedOptions(previous,next)};
 const result=compileTableMigration(input);if(result.status!=='compiled')throw Error(JSON.stringify(result));
 expect(result.plan.steps.map(step=>step.sql)).toEqual([
  'ALTER TABLE "plugin_demo"."notes" ADD COLUMN "summary" pg_catalog."text" COLLATE pg_catalog."C"',
  'ALTER POLICY "umf_person_select" ON "plugin_demo"."notes" USING (TRUE)',
  'REVOKE UPDATE ("owner") ON TABLE "plugin_demo"."notes" FROM "plugin_person"',
  'GRANT UPDATE ("owner", "summary") ON TABLE "plugin_demo"."notes" TO "plugin_person"',
 ]);
 expect(result.plan.steps[0]!.kind).toBe('table');expect(result.plan.steps[1]!.kind).toBe('policy');
 expect(result.plan.previous!.bundleDigest).toBe(previous.bundleDigest);expect(result.plan.next.bundleDigest).toBe(next.bundleDigest);
 expect(verifyTableMigration(result.plan)).toEqual(result.plan);
});
test('column evolution refuses backfill, defaults, and existing native meaning changes',()=>{
 const make=(field:any,column:any={})=>{const doc=source(),module=doc.modules[0]!,table=module.extensions['umf.tables'].tables[0]!;module.elements.push(field);module.elements.find((element:any)=>element.id==='Note')!.members.push({module:'demo',element:field.id});table.columns.push({field:{module:'demo',element:field.id},name:field.id,nativeType:{kind:'text'},...column});return doc;};
 const field={id:'summary',kind:'field',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}};
 const base=forward();
 const timestampField={id:'created',kind:'field',scalarType:'timestamp',cardinality:'one',nullability:'absent-allowed',extensions:{}};
 const timestampDefault=make(timestampField,{nativeType:{kind:'timestamptz'},default:{kind:'currentTimestamp'}});
 for(const candidate of [make({...field,nullability:'required'}),make(field,{default:{kind:'literal',value:{string:'filled'}}}),timestampDefault])expect(compileTableMigration({...base,next:bundle(candidate)}).status).toBe('blocked');
 const changedType=source();changedType.modules[0]!.extensions['umf.tables'].tables[0]!.columns[0]!.nativeType={kind:'varchar',length:10};
 expect(compileTableMigration({...base,next:bundle(changedType)}).status).toBe('blocked');
});
test('appended numeric and date fields carry their compiler-generated domain checks',()=>{
 const doc=source(),module=doc.modules[0]!,table=module.extensions['umf.tables'].tables[0]!,record=module.elements.find((element:any)=>element.id==='Note')!;
 module.elements.push(
  {id:'amount',kind:'field',scalarType:'decimal',cardinality:'one',nullability:'absent-allowed',facets:{precision:10,scale:2,range:{min:{decimalToken:'0.00'},max:{decimalToken:'999.99'}}},extensions:{}},
  {id:'day',kind:'field',scalarType:'date',cardinality:'one',nullability:'absent-allowed',extensions:{}},
 );
 record.members.push({module:'demo',element:'amount'},{module:'demo',element:'day'});
 table.columns.push({field:{module:'demo',element:'amount'},name:'amount',nativeType:{kind:'numeric',precision:10,scale:2}},{field:{module:'demo',element:'day'},name:'day',nativeType:{kind:'date'}});
 const previous=bundle(),next=bundle(doc),result=compileTableMigration({id:'domains-002',predecessor:{id:'domains-001',digest:'d'.repeat(64)},previous,next});
 if(result.status!=='compiled')throw Error(JSON.stringify(result));
 const additions=result.plan.steps.filter(step=>step.sql.includes('ADD CONSTRAINT'));
 const expected=next.expectedCatalog.checks.filter(check=>check.table==='notes'&&check.id.startsWith('domain:demo.'));
 expect(additions).toHaveLength(2);expect(additions.map(step=>step.sql)).toEqual(expected.map(check=>'ALTER TABLE "plugin_demo"."notes" ADD '+check.definitionSql));
 expect(result.plan.steps.findIndex(step=>step.sql.includes('ADD CONSTRAINT'))).toBeGreaterThan(result.plan.steps.findIndex(step=>step.sql.includes('ADD COLUMN')));
 expect(verifyTableMigration(result.plan)).toEqual(result.plan);
});
test('policy allow/deny transitions alter the source policy and reconcile its exact grant',()=>{
 const allowed=source(),denied=structuredClone(allowed);
 denied.modules[0]!.extensions['umf.tables'].tables[0]!.policy.person.insert={kind:'deny'};
 const first=bundle(allowed),second=bundle(denied);
 const disabled=compileTableMigration({id:'policy-002',predecessor:{id:'policy-001',digest:'e'.repeat(64)},previous:first,next:second,options:reviewedOptions(first,second)});
 if(disabled.status!=='compiled')throw Error(JSON.stringify(disabled));
 expect(disabled.plan.steps.map(step=>step.sql)).toEqual([
  'ALTER POLICY "umf_person_insert" ON "plugin_demo"."notes" WITH CHECK (FALSE)',
  'REVOKE INSERT ON TABLE "plugin_demo"."notes" FROM "plugin_person"',
 ]);
 const enabled=compileTableMigration({id:'policy-003',predecessor:{id:'policy-002',digest:disabled.plan.digest},previous:second,next:first,options:reviewedOptions(second,first)});
 if(enabled.status!=='compiled')throw Error(JSON.stringify(enabled));
 expect(enabled.plan.steps.map(step=>step.sql)).toEqual([
  'ALTER POLICY "umf_person_insert" ON "plugin_demo"."notes" WITH CHECK (("owner" COLLATE pg_catalog."C" = CURRENT_USER::pg_catalog.text COLLATE pg_catalog."C"))',
  'GRANT INSERT ON TABLE "plugin_demo"."notes" TO "plugin_person"',
 ]);
 expect(verifyTableMigration(enabled.plan)).toEqual(enabled.plan);
});
test('declared command revisions advance a source-bound generation without DDL or inferred data access',()=>{
 const doc:any=tableOperationSource(),previous=bundle(doc),changed=structuredClone(doc);
 changed.modules[0]!.extensions['umf.tables'].commands[0]!.body.maxRows=2;
 const input={id:'commands-002',predecessor:{id:'commands-001',digest:'b'.repeat(64)},previous,next:bundle(changed)};
 const result=compileTableMigration(input);if(result.status!=='compiled')throw Error(JSON.stringify(result));
 expect(result.plan.steps).toEqual([]);expect(result.plan.next.source.utf8).toBe(JSON.stringify(changed));
 expect(result.plan.requiresApproval).toBe(true);expect(result.plan.seedExecution).toBe('none');expect(verifyTableMigration(result.plan)).toEqual(result.plan);
 const v=createValidator();v.addSchema(tableSchema);v.addSchema(deploymentSchema);expect(v.compile(migrationSchema)(result.plan)).toBe(true);
 const forged=structuredClone(result.plan);forged.steps=[{sql:'unapproved'} as any];
 const {digest,...body}=forged;forged.digest=hashCanonical(body);expect(()=>verifyTableMigration(forged)).toThrow();
 Object.assign(changed.modules[0]!.elements[0]!,{name:'new meaning'});
 expect(compileTableMigration({...input,next:bundle(changed)}).status).toBe('blocked');
 const removed=structuredClone(doc);removed.modules[0]!.extensions['umf.tables'].commands=[];
 expect(compileTableMigration({...input,next:bundle(removed)}).status).toBe('compiled');
});

test('seed sets append immutably and source approval binds their exact ordered values',()=>{
 const doc=appended();doc.modules[0].extensions['umf.tables'].seedSets=[{id:'first',conflict:'error',rows:[]}];
 const old=bundle(doc),before=compileTableMigration({id:'one',predecessor:null,previous:null,next:old});if(before.status!=='compiled')throw Error(JSON.stringify(before));
 const request=(document:any)=>({id:'two',predecessor:{id:'one',digest:before.plan.digest},previous:old,next:bundle(document)});
 const next=structuredClone(doc);next.modules[0].extensions['umf.tables'].seedSets.push({id:'second',conflict:'ignore',rows:[]});
 const compiled=compileTableMigration(request(next));expect(compiled.status).toBe('compiled');if(compiled.status!=='compiled')return;
 expect(compiled.plan.steps).toEqual([]);expect(compiled.plan.seedExecution).toEqual({version:'umf.table-seed-execution/0.1',sets:['second']});
 for(const change of [(d:any)=>d.modules[0].extensions['umf.tables'].seedSets.shift(),(d:any)=>d.modules[0].extensions['umf.tables'].seedSets[0].conflict='ignore',(d:any)=>d.modules[0].extensions['umf.tables'].seedSets.reverse()]){const d=structuredClone(next);change(d);expect(compileTableMigration(request(d)).status).toBe('blocked');}
 const forged=structuredClone(compiled.plan);forged.seedExecution={version:'umf.table-seed-execution/0.1',sets:['first']};const {digest,...body}=forged;forged.digest=hashCanonical(body);expect(()=>verifyTableMigration(forged)).toThrow();
});
