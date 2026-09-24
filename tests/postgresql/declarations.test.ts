import {test,expect} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {importPostgresqlSql,getPostgresqlDdlDeclarations,getPostgresqlNode,exportPostgresqlSql,proposePostgresqlNodeEdit,readDocument,writeDocument} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/postgresql/ddl-declarations.schema.json';
const text=await Bun.file('fixtures/postgresql/declarations.sql').text(),check=createValidator().compile(schema);
test('CONTRACT-015 raw DDL exposes copied declarations without resolving search_path, LIKE or ALTER state',async()=>{
 const source=await importPostgresqlSql(text,backend,{id:'declarations'}),view=getPostgresqlDdlDeclarations(source);expect(view.status).toBe('observed');expect(check(view)).toBe(true);expect(view.complete).toBe(false);expect(view.declarations.length).toBe(5);expect(view.unhandled.length).toBe(2);
 const orders=view.declarations.find(d=>d.kind==='create-table'&&d.columns.some(c=>c.element.name==='amount'))!;
 expect(orders.requiresCatalogExpansion).toBe(true);expect(orders.columns.map(c=>[c.element.name,c.element.scalarType??null])).toEqual([['id','integer'],['amount','decimal'],['label',null],['catalog_text','string'],['items',null],['custom',null],['flag','boolean'],['created','timestamp']]);
 const tickets=view.declarations.find(d=>d.schemaContext==='support')!;expect(tickets.columns.length).toBe(2);expect((tickets.relation as any).members.schemaname).toBeUndefined();
 const alters=view.declarations.filter(d=>d.kind==='alter-table');expect(alters.map(d=>d.columns[0]!.element.name)).toEqual(['extra','label']);expect(alters.every(d=>d.requiresCatalogExpansion)).toBe(true);
 for(const d of view.declarations){expect(d.nativeStatement).toEqual(getPostgresqlNode(source,d.path));for(const c of d.columns)expect(c.nativeColumn).toEqual(getPostgresqlNode(source,c.path));}
 const exports=[];for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(source,format),format);expect(getPostgresqlDdlDeclarations(back)).toEqual(view);exports.push({format,sql:await exportPostgresqlSql(back,backend)});}
 await Bun.write('fixtures/postgresql/ddl-declarations.json',JSON.stringify({source,view,exports},null,2)+'\n');
 orders.columns[0]!.element.name='mutated';expect(getPostgresqlDdlDeclarations(source).declarations[1]!.columns[0]!.element.name).toBe('id');
});
test('CONTRACT-015 DDL type inventory respects native edits, unknown type syntax, foreign tables and version guards',async()=>{
 const source=await importPostgresqlSql('CREATE FOREIGN TABLE sales.remote(id integer) SERVER remote_server;',backend,{id:'foreign'}),view=getPostgresqlDdlDeclarations(source);expect(view.declarations[0]!.kind).toBe('create-foreign-table');const path=view.declarations[0]!.columns[0]!.path;
 const edit=proposePostgresqlNodeEdit(source,path+'/colname','"renamed"');expect(getPostgresqlDdlDeclarations(edit.document).declarations[0]!.columns[0]!.element.name).toBe('renamed');expect(getPostgresqlDdlDeclarations(source).declarations[0]!.columns[0]!.element.name).toBe('id');
 const type={names:[{String:{sval:'pg_catalog'}},{String:{sval:'int4'}}],futureMeaning:'retain',typemod:-1};const unknown=proposePostgresqlNodeEdit(source,path+'/typeName',JSON.stringify(type)).document;
 expect(getPostgresqlDdlDeclarations(unknown).declarations[0]!.columns[0]!.typeResolution).toBe('unresolved');expect(readDocument(writeDocument(unknown,'yaml'),'yaml')).toEqual(unknown);
 const version=proposePostgresqlNodeEdit(source,'/version','180000').document;expect(getPostgresqlDdlDeclarations(version).status).toBe('blocked');expect(check(getPostgresqlDdlDeclarations(version))).toBe(true);
 const invalid=proposePostgresqlNodeEdit(source,path+'/colname','123').document;expect(getPostgresqlDdlDeclarations(invalid).status).toBe('blocked');
});
