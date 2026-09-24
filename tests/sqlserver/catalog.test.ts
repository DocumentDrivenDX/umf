import {test,expect} from 'bun:test';
import {importSqlServerCatalog,exportSqlServerCatalog,getSqlServerColumnMetadata,proposeSqlServerCatalogEdit,inspectSqlServer,readDocument,writeDocument} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/sqlserver/column-metadata.schema.json';
const source=await Bun.file('fixtures/sqlserver/catalog.json').text();
test('CONTRACT-031 SQL Server catalog recovery retains exact native qualifiers and core families',()=>{
 const raw=source.trim().slice(0,-1)+',"future":{"exact":9007199254740993.123456789}}',doc=importSqlServerCatalog(raw,{id:'sqlserver'}),view=getSqlServerColumnMetadata(doc);
 expect(createValidator().compile(schema)(view)).toBe(true);expect(inspectSqlServer(doc).complete).toBe(false);
 const type=(name:string)=>view.find(c=>c.table.name==='Types'&&c.element.name===name)!;
 for(const [name,family] of Object.entries({flag:'boolean',tiny:'integer',id:'integer',exact:'decimal',cash:'decimal',single:'float',words:'string',bytes:'binary',version_stamp:'binary',day:'date',clock:'time',instant:'timestamp',local_stamp:'timestamp',amount:'decimal'}))expect(type(name).element.scalarType).toBe(family);
 for(const name of ['identifier','document','variant'])expect(type(name).element.scalarType).toBeUndefined();
 expect(view.filter(c=>c.element.name==='version_stamp').every(c=>c.element.scalarType==='binary')).toBe(true);
 expect(type('unicode_words').nativeColumn).toMatchObject({members:{max_length:{value:'80'}}});
 expect(type('unlimited').nativeColumn).toMatchObject({members:{max_length:{value:'-1'}}});
 expect(type('id').nativeColumn).toMatchObject({members:{identity_seed:{value:'9007199254740993'}}});
 expect(type('amount').nativeColumn).toMatchObject({members:{type_schema:{value:'sales'},is_user_defined:{value:true}}});
 for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(doc,format),format);expect(getSqlServerColumnMetadata(back)).toEqual(view);expect(exportSqlServerCatalog(back)).toContain('9007199254740993.123456789');}
 view[0]!.element.name='mutated copy';expect(getSqlServerColumnMetadata(doc)[0]!.element.name).not.toBe('mutated copy');
});
test('CONTRACT-031 copied candidate edits synchronize metadata and cannot lose attachments',()=>{
 const doc=importSqlServerCatalog(source,{id:'edit'}),first=getSqlServerColumnMetadata(doc)[0]!;
 const edited=proposeSqlServerCatalogEdit(doc,first.path+'/description','"Edited description"');expect(edited.modules[0]!.elements[0]!.description).toBe('Edited description');expect(doc.modules[0]!.elements[0]!.description).not.toBe('Edited description');expect(JSON.parse(exportSqlServerCatalog(edited)).state).toBe('modified');
 doc.modules[0]!.elements[0]!.references=[{role:'self',module:'sqlserver.columns',element:first.element.id}];expect(()=>proposeSqlServerCatalogEdit(doc,first.path+'/name','"renamed"')).toThrow('reassociation');
 const stale=structuredClone(doc);stale.modules[0]!.elements[0]!.scalarType='future';expect(()=>exportSqlServerCatalog(stale)).toThrow('disagree');
 const unknown=structuredClone(doc);(unknown.extensions!['umf.sqlserver'] as any).future=true;expect(readDocument(writeDocument(unknown,'yaml'),'yaml')).toEqual(unknown);expect(()=>exportSqlServerCatalog(unknown)).toThrow('encoding');
 const duplicate=JSON.parse(source);duplicate.tables.push(duplicate.tables[0]);expect(()=>importSqlServerCatalog(JSON.stringify(duplicate),{id:'duplicate'})).toThrow('Duplicate');
});
test('CONTRACT-031 malformed captures reject and future type identities remain unclassified',()=>{
 const input=JSON.parse(source),column=input.tables[0].columns[0];
 column.system_type_id=250;column.base_type_name='int';
 const future=importSqlServerCatalog(JSON.stringify(input),{id:'future'});expect(getSqlServerColumnMetadata(future)[0]!.element.scalarType).toBeUndefined();expect(JSON.parse(exportSqlServerCatalog(future)).tables[0].columns[0].system_type_id).toBe(250);
 input.serverVersion='17.0.0';expect(inspectSqlServer(importSqlServerCatalog(JSON.stringify(input),{id:'version'})).diagnostics.some(d=>d.code==='SQLSERVER_VERSION')).toBe(true);
 column.max_length=40000;expect(()=>importSqlServerCatalog(JSON.stringify(input),{id:'bad'})).toThrow('SQLSERVER_CAPTURE_STRUCTURE');
});
