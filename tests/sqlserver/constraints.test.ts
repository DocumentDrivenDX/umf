import {test,expect} from 'bun:test';
import {importSqlServerCatalog,exportSqlServerCatalog,getSqlServerConstraintMetadata,proposeSqlServerCatalogEdit,inspectSqlServer,readDocument,writeDocument} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/sqlserver/constraint-metadata.schema.json';
const text=await Bun.file('fixtures/sqlserver/constraints-catalog.json').text(),source=importSqlServerCatalog(text,{id:'constraints'}),check=createValidator().compile(schema);
test('CONTRACT-031 v2 constraints retain ordering, actions, trust, disabled state and exact unknown content',()=>{
 const view=getSqlServerConstraintMetadata(source);expect(check(view)).toBe(true);expect(view.complete).toBe(false);expect(view.tables.length).toBe(3);
 const native=JSON.parse(text),parent=native.tables.find((t:any)=>t.name==='Parent'),child=native.tables.find((t:any)=>t.name==='Child');
 expect(parent.keys.find((k:any)=>k.kind==='PK').columns.map((c:any)=>[c.name,c.key_ordinal,c.is_descending_key])).toEqual([['a',1,false],['b',2,true]]);
 expect(child.foreign_keys[0].columns.map((c:any)=>[c.column_name,c.referenced_column_name,c.ordinal])).toEqual([['parent_b','b',1],['parent_a','a',2]]);expect(child.foreign_keys[0].delete_action).toBe('CASCADE');expect(child.foreign_keys[0].update_action).toBe('CASCADE');
 expect(child.checks.find((c:any)=>c.name==='CK_Child_other')).toMatchObject({is_disabled:false,is_not_trusted:true});expect(child.checks.find((c:any)=>c.name==='CK_Child_disabled').is_disabled).toBe(true);expect(child.checks.find((c:any)=>c.name==='CK_Child_qty').is_not_for_replication).toBe(true);
 expect(native.tables.find((t:any)=>t.name==='Untrusted').foreign_keys[0]).toMatchObject({is_disabled:false,is_not_trusted:true});
 for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(source,format),format);expect(getSqlServerConstraintMetadata(back)).toEqual(view);expect(JSON.parse(exportSqlServerCatalog(back))).toEqual(native);}
 const first=view.tables[0]!.keys[0]!;if(first.kind!=='object')throw Error();first.members.name={kind:'string',value:'mutated'};expect(getSqlServerConstraintMetadata(source)).not.toEqual(view);
 const exact=text.replace('"kind": "PK"','"kind": "PK", "future":9007199254740993.123456789');const unknown=importSqlServerCatalog(exact,{id:'unknown'});expect(exportSqlServerCatalog(readDocument(writeDocument(unknown,'yaml'),'yaml'))).toContain('9007199254740993.123456789');
});
test('CONTRACT-031 old coverage, malformed sections, duplicate observations and edits remain explicit',async()=>{
 const empty=importSqlServerCatalog(await Bun.file('fixtures/sqlserver/constraints-empty.json').text(),{id:'empty'});expect(getSqlServerConstraintMetadata(empty)).toEqual({complete:false,tables:[]});
 const old=importSqlServerCatalog(await Bun.file('fixtures/sqlserver/catalog.json').text(),{id:'v1'}),view=getSqlServerConstraintMetadata(old);expect(view.tables.every(t=>!t.available.keys&&!t.available.foreign_keys&&!t.available.checks)).toBe(true);expect(check(view)).toBe(true);
 const missing=JSON.parse(text);delete missing.tables[0].keys;expect(()=>importSqlServerCatalog(JSON.stringify(missing),{id:'missing'})).toThrow('STRUCTURE');
 missing.profile='sqlserver-catalog-v1';expect(getSqlServerConstraintMetadata(importSqlServerCatalog(JSON.stringify(missing),{id:'partial'})).tables[0]!.available).toEqual({keys:false,foreign_keys:true,checks:true});
 const duplicate=JSON.parse(text);duplicate.tables[0].keys.push(duplicate.tables[0].keys[0]);expect(()=>importSqlServerCatalog(JSON.stringify(duplicate),{id:'duplicate'})).toThrow('Duplicate');
 const columns=JSON.parse(text);columns.tables[0].foreign_keys[0].columns.push(columns.tables[0].foreign_keys[0].columns[0]);expect(()=>importSqlServerCatalog(JSON.stringify(columns),{id:'duplicate-columns'})).toThrow('Duplicate constraint');
 const future=JSON.parse(text);future.tables[0].foreign_keys[0].delete_action='FUTURE_ACTION';const doc=importSqlServerCatalog(JSON.stringify(future),{id:'future'});expect(inspectSqlServer(doc).diagnostics.some(d=>d.code==='SQLSERVER_CONSTRAINT_UNKNOWN')).toBe(true);expect(exportSqlServerCatalog(doc)).toContain('FUTURE_ACTION');
 const edited=proposeSqlServerCatalogEdit(source,'/tables/0/checks/0/definition','"([id]>(-100))"');expect(JSON.parse(exportSqlServerCatalog(edited)).state).toBe('modified');expect(getSqlServerConstraintMetadata(edited)).not.toEqual(getSqlServerConstraintMetadata(source));expect(exportSqlServerCatalog(source)).not.toContain('(-100)');
});
