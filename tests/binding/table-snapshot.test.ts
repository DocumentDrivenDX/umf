// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {inspectTableLifecycle} from '../../src/extensions/tables';
import {compileTableDeployment} from '../../src/table-deployment';
import {generatePythonClient} from '../../src/access';
import {snapshotSource} from '../unified/table-snapshot-fixture';
const config={module:'demo',schema:'snapshot_schema',ownerRole:'snapshot_owner',personRole:'snapshot_person',batchRole:'snapshot_batch',groupRoles:{}};
const op=(source:any)=>source.modules[0].extensions['umf.tables'].commands.find((c:any)=>c.id==='capture');
test('atomic source snapshots and current principal have typed module-only authoring',()=>{
 const source=snapshotSource();expect(inspectTableLifecycle(source).diagnostics).toEqual([]);
 expect(compileTableDeployment({text:JSON.stringify(source),configuration:config}).status).toBe('compiled');
 const generated=generatePythonClient({text:JSON.stringify(source),package:'snapshot_demo'});
 const text=generated.files.find(f=>f.path==='snapshot_demo/models.py')!.text;
 expect(text).toContain('snapshot_id: str, source_id: str, comment: str | None');
 expect(text).toContain('actor: str');expect(text).toContain('observed_at: ExactTimestamp');
 expect(text).not.toContain('actor: str, idempotency_key:');
 expect(generated.description.nativeExecutionQualified).toBe(false);
});
test('source row fields cannot escape assignments or their original source table',()=>{
 for(const change of [
  (s:any)=>op(s).body.source.table='missing',
  (s:any)=>op(s).body.values[2].value.field={module:'demo',element:'actor'},
  (s:any)=>op(s).body.source.where.value={kind:'sourceField',field:{module:'demo',element:'id'}},
  (s:any)=>op(s).body.values[0].value={kind:'currentPrincipal',future:true},
  (s:any)=>op(s).body.values[4].value={kind:'currentPrincipal'},
  (s:any)=>s.modules[0].elements.find((e:any)=>e.id==='owner').nullability='absent-allowed',
 ]){const s=snapshotSource();change(s);expect(compileTableDeployment({text:JSON.stringify(s),configuration:config}).status).toBe('blocked');}
});
test('source copy proves target refinements and rejects native rounding or narrowing',()=>{
 const s=snapshotSource(),elements=s.modules[0].elements;
 elements.find((e:any)=>e.id==='owner').allowedValues=[{string:'a'},{string:'b'}];
 elements.find((e:any)=>e.id==='savedOwner').allowedValues=[{string:'a'}];
 expect(inspectTableLifecycle(s).valid).toBe(false);
 delete elements.find((e:any)=>e.id==='savedOwner').allowedValues;
 expect(inspectTableLifecycle(s).diagnostics).toEqual([]);
 const a=snapshotSource();a.modules[0].elements.find((e:any)=>e.id==='savedOwner').facets={length:{min:1,unit:'unicode-scalar'}};
 expect(inspectTableLifecycle(a).valid).toBe(false);
});

test('keyset ordering supports required mixed directions with a complete original Key suffix',()=>{
 const page=(s:any)=>s.modules[0].extensions['umf.tables'].commands.find((c:any)=>c.id==='recent_snapshots');
 expect(inspectTableLifecycle(snapshotSource()).diagnostics).toEqual([]);
 for(const change of [
  (s:any)=>page(s).body.orderBy.reverse(),
  (s:any)=>page(s).body.fields=page(s).body.fields.filter((f:any)=>f.element!=='observedAt'),
  (s:any)=>s.modules[0].elements.find((e:any)=>e.id==='observedAt').nullability='absent-allowed',
  (s:any)=>page(s).body.orderBy[0].field={module:'demo',element:'savedAmount'},
 ]){const s=snapshotSource();change(s);expect(compileTableDeployment({text:JSON.stringify(s),configuration:config}).status).toBe('blocked');}
});

test('related predicates retain original same-module matches and nested input domains',()=>{
 const related=(s:any)=>s.modules[0].extensions['umf.tables'].commands.find((c:any)=>c.id==='remove_related');
 expect(inspectTableLifecycle(snapshotSource()).diagnostics).toEqual([]);
 for(const change of [
  (s:any)=>related(s).body.where.table='external',
  (s:any)=>related(s).body.where.matches[0].target={module:'demo',element:'actor'},
  (s:any)=>related(s).body.where.matches[0].source={module:'demo',element:'observedAt'},
  (s:any)=>related(s).body.where.where.field={module:'demo',element:'actor'},
  (s:any)=>related(s).body.where.matches[0].future=true,
 ]){const s=snapshotSource();change(s);expect(compileTableDeployment({text:JSON.stringify(s),configuration:config}).status).toBe('blocked');}
});
