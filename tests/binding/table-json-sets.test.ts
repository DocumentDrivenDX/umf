// SPDX-License-Identifier: MIT OR Apache-2.0
// CONTRACT-081/084: core json and set Fields mapped to jsonb and text[] with
// GIN, per-field direction and partial indexes, through the public TS API.
import {expect,test} from 'bun:test';
import {applyJsonPatch,compileTableDeployment,inspectTableLifecycle,verifyTableDeployment} from '../../src/index-node-v4';
import deploymentSchema from '../../spec/extensions/tables/deployment.schema.json';
import tableSchema from '../../spec/extensions/tables/schema.json';
import {createValidator} from '../../src/validation/schema';
import space from '../../crates/umf-codegen/tests/fixtures/fireweed-space.json';

const configuration={module:'space',schema:'fireweed_space',ownerRole:'fireweed_owner',personRole:'fireweed_person',batchRole:'fireweed_batch',groupRoles:{}};
/** The space document without the host-owned stand-in extension. */
function source():any{
 const doc=structuredClone(space) as any;
 delete doc.vocabularies['fireweed.space'];delete doc.modules[0].extensions['fireweed.space'];
 for(const element of doc.modules[0].elements)if(element.extensions)delete element.extensions['fireweed.space'];
 return doc;
}
const table=(doc:any)=>doc.modules[0].extensions['umf.tables'].tables[0];

test('json and set Fields inspect as complete table declarations',()=>{
 const inspection=inspectTableLifecycle(source());
 expect(inspection.diagnostics).toEqual([]);expect(inspection.valid).toBe(true);expect(inspection.complete).toBe(true);
 const validator=createValidator();expect(validator.validate(tableSchema as object,source().modules[0].extensions['umf.tables'])).toBe(true);
});

test('deployment emits jsonb, text[] and GIN/partial/descending indexes and verifies',()=>{
 const result=compileTableDeployment({text:JSON.stringify(source()),configuration});
 if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
 const bundle=result.bundle,sql=bundle.steps.map(s=>s.sql).join('\n');
 const validator=createValidator();validator.addSchema(tableSchema);expect(validator.compile(deploymentSchema)(bundle)).toBe(true);
 expect(sql).toContain(`"body" pg_catalog."jsonb" NOT NULL DEFAULT E'{}'::pg_catalog.jsonb`);
 expect(sql).toContain(`"await_keys" pg_catalog."text"[] COLLATE pg_catalog."C" NOT NULL`);
 expect(sql).toContain('USING btree ("due_at", "priority" DESC, "id") WHERE (("state" IN (');
 expect(sql).toContain('USING gin ("await_keys")');expect(sql).toContain('USING gin ("body")');
 expect(bundle.expectedCatalog.columns.find(c=>c.name==='await_keys')?.typeName).toBe('_text');
 expect(verifyTableDeployment(bundle)).toEqual(bundle);
});

test('a host extension blocks deployment unless declared independent, and then needs host semantics',()=>{
 const text=JSON.stringify(space);
 expect(compileTableDeployment({text,configuration}).status).toBe('blocked');
 // The TS API has no host capabilities, so the registered-elsewhere extension stays unchecked.
 expect(compileTableDeployment({text,configuration:{...configuration,independentExtensions:[{id:'fireweed.space',version:'0.1.0'}]}}).status).toBe('blocked');
 for(const independentExtensions of [[{id:'umf.tables',version:'0.1.0'}],[{id:'x',version:'1'},{id:'x',version:'1'}],[{id:'x'}]])
  expect(compileTableDeployment({text:JSON.stringify(source()),configuration:{...configuration,independentExtensions} as any}).status).toBe('blocked');
});

test('invalid index and set declarations are diagnosed',()=>{
 const cases:[(doc:any)=>void,string][]=[
  [doc=>{table(doc).indexes[1].unique=true;},'TABLES_INDEX_METHOD'],
  [doc=>{table(doc).indexes[0].directions=['desc'];},'TABLES_INDEX_DIRECTIONS'],
  [doc=>{table(doc).indexes[0].where={op:'field',field:{module:'space',element:'state'}};},'TABLES_INDEX_PREDICATE'],
  [doc=>{table(doc).columns[6].nativeType={kind:'text'};},'TABLES_FIELD_SHAPE'],
  [doc=>{doc.modules[0].elements.find((e:any)=>e.id==='await_key').nullability='absent-allowed';},'SET_ITEM_EQUALITY'],
 ];
 for(const [mutate,code] of cases){const doc=source();mutate(doc);expect(inspectTableLifecycle(doc).diagnostics.map(d=>d.code)).toContain(code);}
});

test('GIN operator classes are explicit and type checked through the public binding',()=>{
 const doc=source();table(doc).indexes[2].operatorClasses=['jsonb_path_ops'];
 const result=compileTableDeployment({text:JSON.stringify(doc),configuration});
 if(result.status!=='compiled')throw Error(JSON.stringify(result.diagnostics));
 expect(result.bundle.steps.map(s=>s.sql).join('\n')).toContain('USING gin ("body" pg_catalog."jsonb_path_ops")');
 expect(verifyTableDeployment(result.bundle)).toEqual(result.bundle);
 for(const classes of [['array_ops'],['jsonb_ops','jsonb_path_ops']]){
  const bad=source();table(bad).indexes[2].operatorClasses=classes;
  expect(inspectTableLifecycle(bad).diagnostics.map(d=>d.code)).toContain('TABLES_INDEX_OPERATOR_CLASSES');
 }
});

test('RFC 6902 applies all operations atomically through the public binding',()=>{
 const document={items:[1,3],source:{a:1}};
 expect(applyJsonPatch(document,[
  {op:'add',path:'/items/1',value:2},
  {op:'copy',from:'/source',path:'/copied'},
  {op:'replace',path:'/source/a',value:2},
  {op:'move',from:'/items/0',path:'/items/2'},
  {op:'remove',path:'/source'},
  {op:'test',path:'/copied',value:{a:1}},
 ])).toEqual({present:true,value:{items:[2,3,1],copied:{a:1}}});
 expect(()=>applyJsonPatch(document,[{op:'add',path:'/new',value:true},{op:'test',path:'/items',value:[]}])).toThrow();
 expect(document).toEqual({items:[1,3],source:{a:1}});
 expect(applyJsonPatch(null,[{op:'remove',path:''}])).toEqual({present:false});
});
