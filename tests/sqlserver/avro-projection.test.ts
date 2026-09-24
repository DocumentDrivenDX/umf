import {test,expect} from 'bun:test';
import {importSqlServerCatalog,exportSqlServerCatalog,getSqlServerColumnMetadata,projectSqlServerToAvro,proposeSqlServerCatalogEdit,exportAvroSchema,coreSchema,writeDocument,readDocument,type SqlServerAvroPolicy} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/projections/sqlserver-avro.schema.json';
const source=importSqlServerCatalog(await Bun.file('fixtures/sqlserver/catalog.json').text(),{id:'sqlserver-avro'});
const fields=Object.fromEntries(getSqlServerColumnMetadata(source).filter(c=>c.table.name==='Types').map(c=>[c.element.name!,{name:c.element.name!,representation:([undefined,'time','timestamp'].includes(c.element.scalarType)?'sql-text':'value') as 'value'|'sql-text'}]));
const policy:SqlServerAvroPolicy={id:'avro-record',recordName:'SqlRecord',namespace:'example.sales',table:{schema:'sales',name:'Types'},fields,lossPolicy:'allow-reported-loss'};
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(schema);
test('CONTRACT-032 all captured SQL Server fixture columns project with explicit representations and fidelity issues',async()=>{
 const result=projectSqlServerToAvro(source,policy);expect(result.status).toBe('projected');expect(check(result)).toBe(true);expect(result.mappings.length).toBe(30);expect(result.source).toEqual(source);
 const native=JSON.parse(result.nativeSchema!),field=(name:string)=>native.fields.find((f:any)=>f.name===name);
 expect(field('id').type).toBe('long');expect(field('tiny').type).toEqual(['null','int']);expect(field('version_stamp').type).toMatchObject({type:'fixed',size:8});expect(field('exact').type[1]).toEqual({type:'bytes',logicalType:'decimal',precision:38,scale:9});expect(field('amount').type).toEqual({type:'bytes',logicalType:'decimal',precision:18,scale:4});
 expect(field('instant').type).toEqual(['null','string']);expect(Object.hasOwn(field('flag'),'default')).toBe(false);
 for(const code of ['INTEGER_RANGE','MONEY_RANGE','TEXT_REFINEMENTS','GENERATED_BEHAVIOR','SQL_DEFAULT','ALIAS_IDENTITY','SQL_TEXT_REPRESENTATION'])expect(result.issues.some(i=>i.code===code)).toBe(true);
 const exports=[];for(const format of ['json','yaml'] as const){const target=readDocument(writeDocument(result.target!,format),format),text=exportAvroSchema(target);expect(JSON.parse(text)).toEqual(native);exports.push({format,schema:text});}
 const strict=projectSqlServerToAvro(source,{...policy,lossPolicy:'strict'});expect(strict.status).toBe('blocked');expect(check(strict)).toBe(true);expect(strict.target).toBeUndefined();
 await Bun.write('fixtures/sqlserver/avro-projection.json',JSON.stringify({policy,result,exports},null,2)+'\n');
});
test('CONTRACT-032 authored precision and fixed-width boundaries are enforced before projection',()=>{
 const capture=JSON.parse(exportSqlServerCatalog(source));capture.query='Authored projection-rule cases, not live server observations';capture.provenance={kind:'authored'};
 const table=capture.tables.find((t:any)=>t.name==='Types');for(const c of table.columns)if(['clock','local_stamp','instant'].includes(c.name))c.scale=6;
 const doc=importSqlServerCatalog(JSON.stringify(capture),{id:'authored'}),r=projectSqlServerToAvro(doc,{...policy,fields:Object.fromEntries(['clock','local_stamp','instant'].map(name=>[name,{name,representation:'value'}]))});
 expect(r.status).toBe('projected');expect(JSON.parse(r.nativeSchema!).fields.map((f:any)=>f.type[1].logicalType)).toEqual(['time-micros','local-timestamp-micros','timestamp-micros']);
 table.columns.find((c:any)=>c.name==='version_stamp').max_length=7;
 expect(projectSqlServerToAvro(importSqlServerCatalog(JSON.stringify(capture),{id:'bad-width'}),{...policy,fields:{version_stamp:{name:'value',representation:'value'}}}).status).toBe('blocked');
 table.columns.find((c:any)=>c.name==='exact').scale=39;
 expect(projectSqlServerToAvro(importSqlServerCatalog(JSON.stringify(capture),{id:'bad-scale'}),{...policy,fields:{exact:{name:'value',representation:'value'}}}).status).toBe('blocked');
});
test('CONTRACT-032 unsupported precision, source state and bindings cannot masquerade as value equivalence',()=>{
 const bind=(column:string)=>({...policy,fields:{[column]:{name:'value',representation:'value' as const}}});
 for(const column of ['clock','local_stamp','instant','legacy_stamp','small_stamp','identifier','document','variant']){const r=projectSqlServerToAvro(source,bind(column));expect(r.status).toBe('blocked');expect(r.issues.some(i=>i.classification==='unsupported')).toBe(true);}
 const first=getSqlServerColumnMetadata(source)[0]!,modified=proposeSqlServerCatalogEdit(source,first.path+'/description','"candidate"');expect(projectSqlServerToAvro(modified,policy).status).toBe('blocked');
 expect(()=>projectSqlServerToAvro(source,{...policy,fields:{a:{name:'same',representation:'value'},b:{name:'same',representation:'value'}}})).toThrow('duplicate');
 expect(()=>projectSqlServerToAvro(source,{...policy,unknown:true} as any)).toThrow('policy');
 expect(projectSqlServerToAvro(source,bind('missing')).status).toBe('blocked');
 const stale=structuredClone(source);stale.modules[0]!.elements[0]!.name='stale';expect(()=>projectSqlServerToAvro(stale,policy)).toThrow('disagree');
});
