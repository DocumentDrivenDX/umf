import {describe,expect,test} from 'bun:test';
import {normalizeRowScope} from '../../src/table-authoring/row-scope';
import {inspectTableLifecycle} from '../../src/extensions/tables';
import {compileTableDeployment} from '../../src/table-deployment';
import {relatedSource} from '../unified/table-related-fixture';
import type {RowScopeBindingContext} from '../../src/table-authoring/row-scope';
const context:RowScopeBindingContext={record:{module:'legal',element:'case'},ownerColumns:{owner:{module:'legal',element:'owner'}},via:[{name:'case_member',record:{module:'legal',element:'case_member'},personColumnName:'member_person',keyColumnName:'member_case_key',sourceField:{module:'legal',element:'case_key'},personField:{module:'legal',element:'member_person'},keyField:{module:'legal',element:'member_case_key'}}],groups:{reviewers:'case_reviewers'},admitPolicy:()=>[]};
const supplied={row_scope:{owner_column:'owner',commands:['select','insert','update','delete'],via:[{table:'case_member',person_column:'member_person',key_column:'member_case_key'}],batch:['select','insert'],groups:[{name:'reviewers',commands:['select']} ]}};
describe('row_scope authoring normalization',()=>{
 test('normalizes explicit owner/via, trusted group, and exact batch subset',()=>{
  const result=normalizeRowScope(supplied,context);expect(result.valid).toBe(true);expect(result.source).toEqual(supplied);expect(result.sourceToOutput['/row_scope/owner_column']).toEqual(['/policy/person/select/rules/0/rules/0','/policy/person/insert/rules/0','/policy/person/update/rules/0','/policy/person/delete/rules/0']);expect(result.sourceToOutput['/row_scope/groups/0/commands/0']).toEqual(['/policy/person/select/rules/1']);expect(result.policy?.person.update.kind).toBe('any');expect(result.policy?.person.select).toEqual({kind:'any',rules:[{kind:'any',rules:[{kind:'owner',field:{module:'legal',element:'owner'}},{kind:'related',record:context.via[0]!.record,matches:[{source:context.via[0]!.sourceField,target:context.via[0]!.keyField}],rule:{kind:'owner',field:context.via[0]!.personField}}]},{kind:'memberOfRole',role:'case_reviewers'}]});expect(result.policy?.batch).toEqual({select:{kind:'allow'},insert:{kind:'allow'},update:{kind:'deny'},delete:{kind:'deny'}});
 });
 test('omitted commands deny, group grants cannot widen subsets, and ownerless forms can be complete',()=>{
  const closed=normalizeRowScope({owner_column:'owner',commands:['select'],batch:[]},context);expect(closed.policy?.person.update).toEqual({kind:'deny'});expect(closed.policy?.batch.select).toEqual({kind:'deny'});
  const widening=normalizeRowScope({owner_column:'owner',commands:['select'],batch:[],groups:[{name:'reviewers',commands:['update']}]},context);expect(widening.valid).toBe(false);expect(widening.diagnostics.some(d=>d.code==='ROW_SCOPE_GROUP_COMMAND')).toBe(true);
  const groupOnly=normalizeRowScope({commands:['select'],batch:[],groups:[{name:'reviewers',commands:['select']}]},context);expect(groupOnly.valid).toBe(true);expect(groupOnly.policy?.person.insert).toEqual({kind:'deny'});
  const publicOnly=normalizeRowScope({commands:['select'],batch:[],open_reference_read:true},{...context,openReferenceRead:true});expect(publicOnly.valid).toBe(true);
  const open=normalizeRowScope({owner_column:'owner',commands:['select'],batch:[],open_reference_read:true},{...context,openReferenceRead:true});expect(open.policy?.person.select).toEqual({kind:'allow'});
  expect(normalizeRowScope({owner_column:'owner',commands:['select'],batch:[],open_reference_read:true},context).valid).toBe(false);
 });
 test('unknown content and unresolved aliases or joins are preserved and refuse; invalid JSON is never traversed',()=>{
  const unknown={row_scope:{owner_column:'owner',commands:['select'],batch:[],future:{x:1}}};const result=normalizeRowScope(unknown,context);expect(result.valid).toBe(false);expect(result.source).toEqual(unknown);expect(result.diagnostics.some(d=>d.path==='/row_scope/future')).toBe(true);
  const group=normalizeRowScope({row_scope:{owner_column:'owner',commands:['select'],batch:[],groups:[{name:'untrusted',commands:['select']}] }},context);expect(group.valid).toBe(false);expect(group.diagnostics[0]?.path).toBe('/row_scope/groups/0/name');
  let getterCalls=0;const invalid:any={};Object.defineProperty(invalid,'row_scope',{enumerable:true,get(){getterCalls++;return {commands:['select']};}});const rejected=normalizeRowScope(invalid,context);expect(rejected.valid).toBe(false);expect(getterCalls).toBe(0);expect(rejected.source).toBeUndefined();
  const join=normalizeRowScope({row_scope:{owner_column:'owner',commands:['select'],batch:[],via:[{table:'case_member',person_column:'member_person',key_column:'other_key'}]}},context);expect(join.valid).toBe(false);expect(join.diagnostics[0]?.path).toBe('/row_scope/via/0');
 });
});

const nativeConfig={module:'demo',schema:'row_scope_demo',ownerRole:'row_scope_owner',personRole:'row_scope_person',batchRole:'row_scope_batch',groupRoles:{reviewers:'row_scope_reviewers'}};
function nativeContext(document:any,tableId='notes'):RowScopeBindingContext{
 return {record:{module:'demo',element:'Note'},ownerColumns:{owner:{module:'demo',element:'owner'}},via:[{name:'membership',record:{module:'demo',element:'Membership'},personColumnName:'memberPerson',keyColumnName:'memberNote',sourceField:{module:'demo',element:'id'},keyField:{module:'demo',element:'memberNote'},personField:{module:'demo',element:'memberPerson'}}],groups:{reviewers:'reviewers'},lifecycleDocument:document,tableId,deploymentConfiguration:nativeConfig,admitPolicy(policy){
  const candidate=structuredClone(document),target=candidate.modules[0].extensions['umf.tables'].tables.find((t:any)=>t.id===tableId);target.policy=policy;
  const inspection=inspectTableLifecycle(candidate);if(!inspection.valid||!inspection.complete)return inspection.diagnostics.map((d:any)=>({code:d.code,path:d.path,message:d.message}));
  const deployment=compileTableDeployment({text:JSON.stringify(candidate),configuration:nativeConfig});return deployment.status==='blocked'?deployment.diagnostics.map((d:any)=>({code:d.code,path:d.path,message:d.message})):[];
 }};
}
test('normalized owner/via/group and audience subsets pass lifecycle and native policy admission',()=>{
 const document=relatedSource(),result=normalizeRowScope({row_scope:{owner_column:'owner',commands:['select','insert','update','delete'],via:[{table:'membership',person_column:'memberPerson',key_column:'memberNote'}],batch:['select','insert'],groups:[{name:'reviewers',commands:['select']}] }},nativeContext(document));
 expect(result.valid).toBe(true);const policy=result.policy!;expect(policy.batch).toEqual({select:{kind:'allow'},insert:{kind:'allow'},update:{kind:'deny'},delete:{kind:'deny'}});
 const candidate=structuredClone(document);candidate.modules[0].extensions['umf.tables'].tables[0].policy=policy;const compiled=compileTableDeployment({text:JSON.stringify(candidate),configuration:nativeConfig});expect(compiled.status).toBe('compiled');
});
test('dependency cycles and missing related-table SELECT refuse normalization',()=>{
 const cyclic=relatedSource(),membership=cyclic.modules[0].extensions['umf.tables'].tables[1];membership.policy.person.select={kind:'related',record:{module:'demo',element:'Note'},matches:[{source:{module:'demo',element:'memberNote'},target:{module:'demo',element:'id'}}],rule:{kind:'owner',field:{module:'demo',element:'owner'}}};
 const input={owner_column:'owner',commands:['select'],batch:[],via:[{table:'membership',person_column:'memberPerson',key_column:'memberNote'}]};const cycleResult=normalizeRowScope(input,nativeContext(cyclic));expect(cycleResult.valid).toBe(false);expect(cycleResult.diagnostics.some(d=>d.code==='TABLES_POLICY_CYCLE')).toBe(true);
 const noSelect=relatedSource();noSelect.modules[0].extensions['umf.tables'].tables[1].policy.person.select={kind:'deny'};const dependency=normalizeRowScope(input,nativeContext(noSelect));expect(dependency.valid).toBe(false);expect(dependency.diagnostics.length).toBeGreaterThan(0);
});
