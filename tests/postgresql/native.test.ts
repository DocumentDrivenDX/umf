import {test,expect} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {importPostgresqlSql,exportPostgresqlSql,getPostgresqlSource,getPostgresqlNode,proposePostgresqlNodeEdit,inspectPostgresql,readDocument,writeDocument} from '../../src';
test('US-015-AC1: PostgreSQL DDL source and native AST survive UMF and native round trips',async()=>{
 for(const file of ['domain.sql','advanced.sql']){
  const source=await Bun.file('fixtures/postgresql/'+file).text();const doc=await importPostgresqlSql(source,backend,{id:file});
  expect(inspectPostgresql(doc).complete).toBe(false);
  for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(doc,format),format);expect(getPostgresqlSource(restored)).toBe(source);expect(getPostgresqlNode(restored,'')).toEqual(getPostgresqlNode(doc,''));const sql=await exportPostgresqlSql(restored,backend);expect(sql.length).toBeGreaterThan(0);if(file==='domain.sql')expect(sql).toContain('9007199254740993.123456789');}
 }
});
test('US-015-AC2: native candidate edits propagate without modifying the original source',async()=>{
 const doc=await importPostgresqlSql('CREATE TABLE original (id integer);',backend,{id:'edit'});
 const edit=proposePostgresqlNodeEdit(doc,'/stmts/0/stmt/CreateStmt/relation/relname','"changed"');expect(edit.validation.complete).toBe(false);expect(await exportPostgresqlSql(edit.document,backend)).toContain('CREATE TABLE changed');expect(await exportPostgresqlSql(doc,backend)).toContain('CREATE TABLE original');expect(getPostgresqlSource(edit.document)).toBe('CREATE TABLE original (id integer);');
});
test('US-015-AC3: unknown AST and representation fields cannot disappear through Protobuf or deparse',async()=>{
 const doc=await importPostgresqlSql('CREATE TABLE original (id integer);',backend,{id:'unknown'});
 const root=getPostgresqlNode(doc,'');if(root.kind!=='object')throw new Error();root.members.future={kind:'string',value:'retain'};
 const edit=proposePostgresqlNodeEdit(doc,'',JSON.stringify({...JSON.parse((await import('../../src/model/native-json')).renderTree(root))}));
 expect(readDocument(writeDocument(edit.document,'yaml'),'yaml')).toEqual(edit.document);await expect(exportPostgresqlSql(edit.document,backend)).rejects.toThrow('drop or change');
 (doc.modules[0]!.elements[0]!.extensions['umf.postgresql'] as any).future={keep:true};expect(readDocument(writeDocument(doc,'yaml'),'yaml')).toEqual(doc);await expect(exportPostgresqlSql(doc,backend)).rejects.toThrow('Unknown representation');
 await expect(importPostgresqlSql('CREATE TABLE',backend,{id:'bad'})).rejects.toThrow();await expect(importPostgresqlSql('SELECT 1;\0DROP TABLE x;',backend,{id:'nul'})).rejects.toThrow('NUL');
});
test('US-015-AC3: typed AST schema covers native samples, unions and known field types without stripping unknowns',async()=>{
 const {validatePostgresqlAst}=await import('../../src');
 for(const file of ['domain.sql','advanced.sql'])expect(validatePostgresqlAst(await backend.parse(await Bun.file('fixtures/postgresql/'+file).text())).valid).toBe(true);
 const tree=await backend.parse('CREATE TABLE original (id integer);') as any;
 tree.future={retain:true};expect(validatePostgresqlAst(tree).valid).toBe(true);expect(tree.future).toEqual({retain:true});
 tree.stmts[0].stmt.CreateStmt.relation.relname=4;expect(validatePostgresqlAst(tree).valid).toBe(false);
 expect(validatePostgresqlAst({version:170004,stmts:[{stmt:{A_Const:{ival:{ival:1},fval:{fval:'2'}}}}]}).valid).toBe(false);
 expect(validatePostgresqlAst({version:170004,stmts:[{stmt:{A_Const:{ival:{ival:2147483648}}}}]}).valid).toBe(false);
 expect(validatePostgresqlAst({version:170004,stmts:[{stmt:{SelectStmt:{op:'UNKNOWN'}}}]}).valid).toBe(false);
});
test('US-015-AC3: typed Boolean construction repairs the wrapper without hiding raw codec loss',async()=>{
 // @ts-ignore generated native codec
 const {pg_query}=await import('@libpg-query/parser/proto.js');
 const raw={...backend,codecRoundTrip:(tree:unknown)=>pg_query.ParseResult.toObject(pg_query.ParseResult.fromObject(tree),{enums:String,longs:Number})};
 for(const sql of ['SELECT TRUE;','SELECT FALSE;','CREATE TABLE flags (active boolean DEFAULT true CHECK (active IS TRUE));']){
  const doc=await importPostgresqlSql(sql,backend,{id:'boolean-codec'});const before=getPostgresqlNode(doc,'');
  if(sql!=='SELECT FALSE;')await expect(exportPostgresqlSql(doc,raw)).rejects.toThrow('drop or change');
  expect((await exportPostgresqlSql(doc,backend)).length).toBeGreaterThan(0);expect(getPostgresqlNode(doc,'')).toEqual(before);
 }
});
test('US-015-AC2: Boolean candidate edit uses the native false representation',async()=>{
 const source=await importPostgresqlSql('SELECT TRUE;',backend,{id:'boolean-edit'});
 const path='/stmts/0/stmt/SelectStmt/targetList/0/ResTarget/val/A_Const/boolval';
 const edit=proposePostgresqlNodeEdit(source,path,'{}');
 expect(await exportPostgresqlSql(edit.document,backend)).toContain('false');
 expect(await exportPostgresqlSql(source,backend)).toContain('true');
 expect(getPostgresqlSource(edit.document)).toBe('SELECT TRUE;');
});
