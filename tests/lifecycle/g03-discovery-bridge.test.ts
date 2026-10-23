// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import '../../scripts/codegen/entry';
import fixture from '../binding/fixtures/table-lifecycle-note.json';
import {compileTableDeployment} from '../../src/table-deployment';
import {discoverTableMigrationChanges} from '../../src/table-migration';

const configuration={module:'demo',schema:'plugin_demo',ownerRole:'plugin_owner',personRole:'plugin_person',batchRole:'plugin_batch',groupRoles:{readers:'plugin_readers'}};
const selector={version:'umf.table-migration-discovery/0.2'} as const;
function bundle(withDefault:boolean){
 const source=structuredClone(fixture) as any;
 if(withDefault){
  source.modules[0]!.elements.find((item:any)=>item.id==='owner')!.default={on:'missing',value:{string:'future'}};
  source.modules[0]!.extensions['umf.tables'].tables[0]!.columns.find((item:any)=>item.field.element==='owner')!.default={kind:'literal',value:{string:'future'}};
 }
 const result=compileTableDeployment({text:JSON.stringify(source),configuration});
 if(result.status!=='compiled')throw Error(JSON.stringify(result));
 return result.bundle;
}
const bridge=(request:unknown)=>JSON.parse((globalThis as any).__umf_table_migration_changes(JSON.stringify(request)));

test('discovery bridge keeps the unselected request/output historical and adds defaults only by selector',()=>{
 const previous=bundle(false),next=bundle(true);
 const legacy=bridge({previous,next});
 expect(legacy.ok).toBe(true);
 expect(legacy.result.changes).toEqual([]);
 expect(legacy.result.changes).toEqual(discoverTableMigrationChanges(previous,next));
 expect(legacy.result.changes.some((item:any)=>item.kind==='change-default')).toBe(false);
 const selected=bridge({previous,next,options:selector});
 expect(selected.ok).toBe(true);
 expect(selected.result.changes).toEqual(discoverTableMigrationChanges(previous,next,selector));
 expect(selected.result.changes.filter((item:any)=>item.kind==='change-default')).toHaveLength(1);
});

test('discovery bridge refuses null, wrong and unknown selectors and unknown request members',()=>{
 const previous=bundle(false),next=bundle(true);
 for(const options of [null,{}, {version:'umf.table-migration-discovery/0.1'},
  {version:'umf.table-migration-discovery/0.2',extra:true}]){
  const result=bridge({previous,next,options});
  expect(result.ok).toBe(false);
  expect(result.error.code).toBe('MIGRATION_CHANGES_FAILED');
 }
 const extra=bridge({previous,next,selector});
 expect(extra.ok).toBe(false);
 expect(extra.error.code).toBe('MIGRATION_CHANGES_FAILED');
 expect(extra.error.message).toBe('Expected exact previous and next deployment bundle members');
});
