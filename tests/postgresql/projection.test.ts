import {test,expect} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {createValidator} from '../../src/validation/schema';
import {importPostgresqlCatalogCapture,projectPostgresqlRowToJsonSchema,proposePostgresqlCatalogEdit,readDocument,writeDocument,exportJsonSchema,exportPostgresqlCatalogCapture,coreSchema,postgresqlRowProjectionSchema,type PostgresqlRowPolicy} from '../../src';
const source=importPostgresqlCatalogCapture(await Bun.file('fixtures/postgresql/catalog-capture.json').text(),{id:'rows'});
const policy:PostgresqlRowPolicy={id:'orders',schemaId:'urn:test:orders',relation:{schema:'sales',name:'orders'},columns:{id:'sql-text',total:'sql-text',details:'json-value'},lossPolicy:'allow-reported-loss'};
test('US-015-AC9: explicit PostgreSQL row encodings produce a qualified JSON Schema and quoted query',()=>{
 const out=projectPostgresqlRowToJsonSchema(source,policy);expect(out.status).toBe('projected');expect(out.complete).toBe(false);expect(out.sql).toContain('"sales"."orders"');expect(out.sql).toContain('r."total"::text');
 const valid=createValidator(false).compile(JSON.parse(out.nativeSchema!));expect(valid({id:'9007199254740993',total:'9007199254740993.123456789',details:null})).toBe(true);expect(valid({id:9007199254740992,total:'1',details:{}})).toBe(false);expect(valid({id:'1',total:null,details:{}})).toBe(true);expect(valid({id:'1',total:'1'})).toBe(false);
 expect(out.issues.some(x=>x.code==='POSTGRESQL_COLUMN_OMITTED')).toBe(true);expect(out.source).toEqual(source);
 for(const format of ['json','yaml'] as const)expect(exportJsonSchema(readDocument(writeDocument(out.target!,format),format))).toBe(exportJsonSchema(out.target!));
});
test('US-015-AC9: strict policy, unsafe encodings and edited metadata block projection',()=>{
 expect(projectPostgresqlRowToJsonSchema(source,{...policy,lossPolicy:'strict'}).status).toBe('blocked');
 const unsupported=projectPostgresqlRowToJsonSchema(source,{...policy,columns:{id:'json-int32'}});expect(unsupported.status).toBe('blocked');expect(unsupported.sql).toBeUndefined();
 const edit=proposePostgresqlCatalogEdit(source,'/snapshot/types/0/name','"changed"');expect(projectPostgresqlRowToJsonSchema(edit.document,policy).status).toBe('blocked');
 expect(projectPostgresqlRowToJsonSchema(source,{...policy,columns:{missing:'sql-text'}}).status).toBe('blocked');
});
test('US-015-AC9: generated SQL quotes identifiers and keys instead of interpolating executable fragments',async()=>{
 const capture=JSON.parse(exportPostgresqlCatalogCapture(source).json);
 const relation=capture.snapshot.relations.find((r:any)=>r.schema==='sales'&&r.name==='orders');
 relation.schema='odd"schema';relation.name="t'; DROP TABLE x; --";relation.columns[0].name="key'\\quoted";
 const doc=importPostgresqlCatalogCapture(JSON.stringify(capture),{id:'quoted'});
 const out=projectPostgresqlRowToJsonSchema(doc,{...policy,relation:{schema:relation.schema,name:relation.name},columns:{[relation.columns[0].name]:'sql-text'}});
 expect(out.status).toBe('projected');expect(out.sql).toContain('"odd""schema"');expect(out.sql).toContain('"t\'; DROP TABLE x; --"');expect(out.sql).toContain("E'key''\\\\quoted'");expect((await backend.parse(out.sql!) as any).stmts.length).toBe(1);
});
test('US-015-AC9: projection result schema distinguishes blocked results from executable results',()=>{
 const ajv=createValidator(false);ajv.addSchema(coreSchema);const check=ajv.compile(postgresqlRowProjectionSchema);
 const projected=projectPostgresqlRowToJsonSchema(source,policy);const blocked=projectPostgresqlRowToJsonSchema(source,{...policy,lossPolicy:'strict'});
 expect(check(projected)).toBe(true);expect(check(blocked)).toBe(true);expect(check({...blocked,sql:'SELECT 1;'})).toBe(false);
});
test('US-015-AC9: boolean, smallint and SQL/JSON null encodings retain their distinct contracts',()=>{
 const out=projectPostgresqlRowToJsonSchema(source,{...policy,relation:{schema:'sales',name:'row_encodings'},columns:{active:'json-boolean',optional_flag:'json-boolean',required_json:'json-value',small_value:'json-int32'}});
 expect(out.status).toBe('projected');const validate=createValidator(false).compile(JSON.parse(out.nativeSchema!));
 expect(validate({active:false,optional_flag:null,required_json:null,small_value:-32768})).toBe(true);
 expect(validate({active:true,optional_flag:false,required_json:false,small_value:32767})).toBe(true);
 expect(validate({active:null,optional_flag:null,required_json:null,small_value:0})).toBe(false);
 expect(validate({active:'false',optional_flag:null,required_json:null,small_value:0})).toBe(false);
 expect(validate({active:true,optional_flag:null,required_json:null,small_value:32768})).toBe(false);
 expect(out.issues.some(i=>i.code==='POSTGRESQL_JSON_VALUE')).toBe(true);
});
