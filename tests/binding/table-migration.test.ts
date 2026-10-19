// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment,type TableDeploymentBundle} from '../../src/table-deployment';
import {compileTableMigration,verifyTableMigration,type TableMigrationRequest} from '../../src/table-migration';
import {hashCanonical} from '../../src/compilation/bundle/hash';
import {createValidator} from '../../src/validation/schema';
import deploymentSchema from '../../spec/extensions/tables/deployment.schema.json';
import tableSchema from '../../spec/extensions/tables/schema.json';
import migrationSchema from '../../spec/extensions/tables/migration.schema.json';
import fixture from './fixtures/table-lifecycle-note.json';
import {appendedTableSource as appended} from '../unified/table-migration-fixture';
const configuration={module:'demo',schema:'plugin_demo',ownerRole:'plugin_owner',personRole:'plugin_person',batchRole:'plugin_batch',groupRoles:{readers:'plugin_readers'}};
const source=()=>structuredClone(fixture) as any;
function bundle(doc=source()):TableDeploymentBundle{const r=compileTableDeployment({text:JSON.stringify(doc),configuration});if(r.status!=='compiled')throw Error(JSON.stringify(r));return r.bundle;}
const initial=():TableMigrationRequest=>({id:'001',predecessor:null,previous:null,next:bundle()});
const forward=():TableMigrationRequest=>({id:'002',predecessor:{id:'001',digest:'a'.repeat(64)},previous:bundle(),next:bundle(appended())});
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
test('existing policy, logical, native and module changes require separate qualification',()=>{
 for(const mutate of [(d:any)=>d.modules[0].elements[0].name='renamed',(d:any)=>d.modules[0].extensions['umf.tables'].tables[0].name='renamed',(d:any)=>d.modules[0].extensions['umf.tables'].tables[0].policy.batch.select={kind:'deny'},(d:any)=>d.modules[0].namespace='renamed']){
  const input=forward(),d=appended();mutate(d);input.next=bundle(d);expect(compileTableMigration(input).status).toBe('blocked');
 }
});
test('migration schema is closed and seed/namespace transitions are explicit refusals',()=>{
 const v=createValidator();v.addSchema(tableSchema);v.addSchema(deploymentSchema);const validate=v.compile(migrationSchema);
 const r=compileTableMigration(forward());if(r.status!=='compiled')throw Error(JSON.stringify(r));expect(validate(r.plan)).toBe(true);expect(validate({...r.plan,extra:1})).toBe(false);expect(validate({...r.plan,requiresApproval:false})).toBe(false);
 const changed=forward(),doc=appended();doc.modules[0].extensions['umf.tables'].seedSets=[{id:'empty',conflict:'error',rows:[]}];
 changed.next=bundle(doc);expect(compileTableMigration(changed).status).toBe('blocked');
 const other=compileTableDeployment({text:JSON.stringify(appended()),configuration:{...configuration,schema:'plugin_other'}});if(other.status!=='compiled')throw Error(JSON.stringify(other));changed.next=other.bundle;expect(compileTableMigration(changed).status).toBe('blocked');
});
test('source-rehashed deployment mutations and removing existing tables never produce SQL plans',()=>{
 for(const which of ['previous','next'] as const){const r=forward(),b=r[which]!;b.steps[0]!.sql='DROP SCHEMA public CASCADE';const {bundleDigest,...body}=b;b.bundleDigest=hashCanonical(body);expect(compileTableMigration(r).status).toBe('blocked');}
 const r=forward();[r.previous,r.next]=[r.next,r.previous!];expect(compileTableMigration(r).status).toBe('blocked');
});
