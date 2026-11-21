// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import * as u from '../../src/index-node-v4';
import space from '../../crates/umf-codegen/tests/fixtures/fireweed-space.json';
const configuration={module:'space',schema:'fireweed_space',ownerRole:'fireweed_owner',personRole:'fireweed_person',batchRole:'fireweed_batch',groupRoles:{}};
function source():any {const d=structuredClone(space) as any;delete d.vocabularies['fireweed.space'];delete d.modules[0].extensions['fireweed.space'];for(const e of d.modules[0].elements)if(e.extensions)delete e.extensions['fireweed.space'];return d;}
const table=(d:any)=>d.modules[0].extensions['umf.tables'].tables[0];
function bundle(d:any){const r=u.compileTableDeployment({text:JSON.stringify(d),configuration});if(r.status!=='compiled')throw Error(JSON.stringify(r));return r.bundle;}

test('array and set defaults retain order or canonicalize, with native item checks',()=>{
 for(const cardinality of ['array','set']){
  const d=source(),m=d.modules[0],item=m.elements.find((e:any)=>e.id==='await_key'),f=m.elements.find((e:any)=>e.id==='await_keys'),c=table(d).columns.find((c:any)=>c.name==='await_keys');
  item.facets={length:{min:1,max:2,unit:'unicode-scalar'}};item.allowedValues=[{string:'a'},{string:'b'}];
  f.cardinality=cardinality;f.default={on:'missing',value:{array:[{string:'b'},{string:'a'}]}};c.default={kind:'literal',value:f.default.value};
  const b=bundle(d),sql=b.steps.map(s=>s.sql).join('\n');
  const definition=sql.split('\n').find(line=>line.includes('NOT NULL DEFAULT')&&line.includes('"await_keys"'))!;
  expect(definition).toContain('ARRAY[');expect(definition).toContain('::pg_catalog."text"[]');
  expect(definition.indexOf("E'b'")).toBeLessThan(definition.indexOf("E'a'"));
  expect(sql).toContain('jsonb_path_exists');expect(sql).toContain('<@ ARRAY');
  expect(sql.includes('DEFAULT pg_catalog.array_sort')).toBe(cardinality==='set');
  expect(u.verifyTableDeployment(b)).toEqual(b);
  f.default.value={array:[]};c.default.value=f.default.value;expect(bundle(d).steps.map(s=>s.sql).join('\n')).toContain('ARRAY[]::pg_catalog."text"[]');
 }
});

test('numeric item constraints apply to all array items, and defaults validate native capacity',()=>{
 const d=source(),m=d.modules[0],item=m.elements.find((e:any)=>e.id==='await_key'),f=m.elements.find((e:any)=>e.id==='await_keys'),c=table(d).columns.find((c:any)=>c.name==='await_keys');
 item.scalarType='integer';item.facets={integerWidth:{bits:8,signed:true},range:{min:{integerToken:'-5'},max:{integerToken:'10'}}};
 c.nativeType.element={kind:'int8'};f.default={on:'missing',value:{array:[{integerToken:'2'}]}};c.default={kind:'literal',value:f.default.value};
 const b=bundle(d),sql=b.steps.map(s=>s.sql).join('\n');expect(sql).toContain('array_sort');expect(sql).toContain('>= -128');expect(sql).toContain('<= 127');expect(sql).toContain('::pg_catalog.numeric');
 item.facets={};f.default.value={array:[{integerToken:'9223372036854775808'}]};c.default.value=f.default.value;
 expect(u.inspectTableLifecycle(d).diagnostics.some(d=>d.code==='TABLES_NATIVE_CAPACITY')).toBe(true);
 expect(u.compileTableDeployment({text:JSON.stringify(d),configuration}).status).toBe('blocked');
});

test('existing tables append jsonb and array columns through verified migration plans',()=>{
 const before=source(),previous=bundle(before),d=source(),m=d.modules[0],t=table(d);
 m.elements.push({id:'new_item',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});
 for(const [id,field,nativeType] of [
  ['extra_json',{scalarType:'json',cardinality:'one'},{kind:'jsonb'}],
  ['extra_array',{cardinality:'array',itemType:{module:'space',element:'new_item'}},{kind:'array',element:{kind:'text'}}],
 ] as const){
  m.elements.push({id,kind:'field',...field,nullability:'absent-allowed',extensions:{}});m.elements.find((e:any)=>e.id==='QueueItem').members.push({module:'space',element:id});t.columns.push({field:{module:'space',element:id},name:id,nativeType});
 }
 const next=bundle(d),reviewedChanges=u.discoverTableMigrationChanges(previous,next).map(({oldValue,newValue,...marker})=>marker);
 const r=u.compileTableMigration({id:'json-array-002',predecessor:{id:'json-array-001',digest:'a'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges}});
 if(r.status!=='compiled')throw Error(JSON.stringify(r));
 expect(r.plan.steps.map(s=>s.sql).join('\n')).toContain('ADD COLUMN "extra_json" pg_catalog."jsonb"');
 expect(r.plan.steps.map(s=>s.sql).join('\n')).toContain('ADD COLUMN "extra_array" pg_catalog."text"[]');
 expect(u.verifyTableMigration(r.plan)).toEqual(r.plan);
});

test('array timestamp capacity widens only with an exact reviewed cast',()=>{
 const old=source(),m=old.modules[0],item=m.elements.find((e:any)=>e.id==='await_key'),f=m.elements.find((e:any)=>e.id==='await_keys'),c=table(old).columns.find((c:any)=>c.name==='await_keys');
 item.scalarType='timestamp';f.cardinality='array';c.nativeType.element={kind:'timestamptz',precision:3};
 const previous=bundle(old),d=structuredClone(old);table(d).columns.find((c:any)=>c.name==='await_keys').nativeType.element.precision=6;
 const next=bundle(d),base={id:'timestamp-array-002',predecessor:{id:'timestamp-array-001',digest:'b'.repeat(64)},previous,next};
 expect(u.compileTableMigration(base).status).toBe('blocked');
 const reviewedChanges=u.discoverTableMigrationChanges(previous,next).map(({oldValue,newValue,...marker})=>({...marker,...(marker.kind==='change-column-type'?{conversion:'pg-cast-v1' as const}:{})}));
 const r=u.compileTableMigration({...base,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges}});
 if(r.status!=='compiled')throw Error(JSON.stringify(r));
 expect(r.plan.steps.map(s=>s.sql).join('\n')).toContain('TYPE pg_catalog."timestamptz"(6)[]');expect(u.verifyTableMigration(r.plan)).toEqual(r.plan);
 const reverse=u.compileTableMigration({...base,previous:next,next:previous,options:{version:'umf.table-migration-options/0.2',backfills:[],concurrentIndexes:[],validations:[],reviewedChanges}});expect(reverse.status).toBe('blocked');
});

test('millisecond defaults refuse rounding and mismatched collection defaults',()=>{
 const d=source(),f=d.modules[0].elements.find((e:any)=>e.id==='due_at'),c=table(d).columns.find((c:any)=>c.name==='due_at');
 c.nativeType.precision=3;c.default={kind:'literal',value:{timestamp:'2026-11-17T01:02:03.123Z'}};
 expect(bundle(d).steps.map(s=>s.sql).join('\n')).toContain('pg_catalog."timestamptz"(3)');
 c.default.value={timestamp:'2026-11-17T01:02:03.1234Z'};
 expect(u.inspectTableLifecycle(d).diagnostics.some(d=>d.code==='TABLES_NATIVE_CAPACITY')).toBe(true);
 const arrays=source(),af=arrays.modules[0].elements.find((e:any)=>e.id==='await_keys'),ac=table(arrays).columns.find((c:any)=>c.name==='await_keys');
 af.cardinality='array';af.default={on:'missing',value:{array:[{string:'a'},{string:'b'}]}};ac.default={kind:'literal',value:{array:[{string:'b'},{string:'a'}]}};
 expect(u.inspectTableLifecycle(arrays).diagnostics.some(d=>d.code==='TABLES_LOGICAL_DEFAULT')).toBe(true);
 af.cardinality='set';expect(bundle(arrays).steps.map(s=>s.sql).join('\n')).toContain('DEFAULT pg_catalog.array_sort');
});

test('reviewed JSON and set default changes reuse typed canonical rendering',()=>{
 for(const name of ['body','await_keys']){
  const old=source(),d=source(),f=d.modules[0].elements.find((e:any)=>e.id===name),c=table(d).columns.find((c:any)=>c.name===name);
  const value=name==='body'?{json:{changed:true}}:{array:[{string:'b'},{string:'a'}]};f.default={on:'missing',value};c.default={kind:'literal',value};
  const previous=bundle(old),next=bundle(d),reviewedChanges=u.discoverTableMigrationChanges(previous,next,{version:'umf.table-migration-discovery/0.2'}).filter(c=>c.kind==='change-default').map(({oldValue,newValue,...marker})=>marker);
  const input={id:'default-'+name,predecessor:{id:'previous-'+name,digest:'c'.repeat(64)},previous,next,options:{version:'umf.table-migration-options/0.5' as const,backfills:[],concurrentIndexes:[],validations:[],reviewedChanges}};
  const r=u.compileTableMigration(input);if(r.status!=='compiled')throw Error(JSON.stringify(r));
  expect(r.plan.steps).toHaveLength(1);expect(r.plan.steps[0]!.operation).toBe('set-default');expect(r.plan.steps[0]!.sql).toContain(name==='body'?'::pg_catalog.jsonb':'pg_catalog.array_sort');
  expect(u.verifyTableMigration(r.plan)).toEqual(r.plan);
  expect(u.compileTableMigration({...input,options:{...input.options,reviewedChanges:[]}}).status).toBe('blocked');
 }
});
