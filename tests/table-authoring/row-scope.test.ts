import {describe,expect,test} from 'bun:test';
import {normalizeRowScope} from '../../src/table-authoring/row-scope';
import type {RowScopeBindingContext} from '../../src/table-authoring/row-scope';
const context:RowScopeBindingContext={record:{module:'legal',element:'case'},ownerColumns:{owner:{module:'legal',element:'owner'}},via:[{name:'case_member',record:{module:'legal',element:'case_member'},personColumnName:'member_person',keyColumnName:'member_case_key',sourceField:{module:'legal',element:'case_key'},personField:{module:'legal',element:'member_person'},keyField:{module:'legal',element:'member_case_key'}}],groups:{reviewers:'case_reviewers'}};
const supplied={row_scope:{owner_column:'owner',commands:['select','insert','update','delete'],via:[{table:'case_member',person_column:'member_person',key_column:'member_case_key'}],batch:['select','insert'],groups:[{name:'reviewers',commands:['select']} ]}};
describe('row_scope authoring normalization',()=>{
 test('normalizes explicit owner/via, trusted group, and exact batch subset',()=>{
  const result=normalizeRowScope(supplied,context);expect(result.valid).toBe(true);expect(result.source).toEqual(supplied);expect(result.policy?.person.update.kind).toBe('any');expect(result.policy?.person.select).toEqual({kind:'any',rules:[{kind:'any',rules:[{kind:'owner',field:{module:'legal',element:'owner'}},{kind:'related',record:context.via[0]!.record,matches:[{source:context.via[0]!.sourceField,target:context.via[0]!.keyField}],rule:{kind:'owner',field:context.via[0]!.personField}}]},{kind:'memberOfRole',role:'case_reviewers'}]});expect(result.policy?.batch).toEqual({select:{kind:'allow'},insert:{kind:'allow'},update:{kind:'deny'},delete:{kind:'deny'}});
 });
 test('omitted commands deny and open read requires explicit reference binding',()=>{
  const closed=normalizeRowScope({owner_column:'owner',commands:['select'],batch:[]},context);expect(closed.policy?.person.update).toEqual({kind:'deny'});expect(closed.policy?.batch.select).toEqual({kind:'deny'});
  const open=normalizeRowScope({owner_column:'owner',commands:['select'],batch:[],open_reference_read:true},{...context,openReferenceRead:true});expect(open.policy?.person.select).toEqual({kind:'allow'});
  expect(normalizeRowScope({owner_column:'owner',commands:['select'],batch:[],open_reference_read:true},context).valid).toBe(false);
 });
 test('unknown content and unresolved aliases or joins are preserved and refuse',()=>{
  const unknown={owner_column:'owner',commands:['select'],batch:[],future:{x:1}};const result=normalizeRowScope(unknown,context);expect(result.valid).toBe(false);expect(result.source).toEqual(unknown);expect(result.diagnostics.some(d=>d.path==='/row_scope/future')).toBe(true);
  const group=normalizeRowScope({owner_column:'owner',commands:['select'],batch:[],groups:[{name:'untrusted',commands:['select']}]},context);expect(group.valid).toBe(false);expect(group.diagnostics[0]?.path).toBe('/row_scope/groups/0/name');
  const join=normalizeRowScope({owner_column:'owner',commands:['select'],batch:[],via:[{table:'case_member',person_column:'member_person',key_column:'other_key'}]},context);expect(join.valid).toBe(false);expect(join.diagnostics[0]?.path).toBe('/row_scope/via/0');
 });
});
