import {test,expect} from 'bun:test';
import {importPostgresqlCatalogCapture,exportPostgresqlCatalogCapture,getPostgresqlColumnMetadata,projectPostgresqlToAvro,proposePostgresqlCatalogEdit,exportAvroSchema,coreSchema,writeDocument,readDocument,type PostgresqlAvroPolicy,type PostgresqlAvroRepresentation} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/projections/postgresql-avro.schema.json';
const source=importPostgresqlCatalogCapture(await Bun.file('fixtures/postgresql/catalog-capture.json').text(),{id:'postgresql-avro'});
const columns=getPostgresqlColumnMetadata(source).filter(c=>c.relation.name==='scalar_types');
const fields=Object.fromEntries(columns.map(c=>[c.element.name!,{name:c.element.name!,representation:(c.element.name==='zoned_clock'||!c.element.scalarType?'sql-text':c.element.scalarType==='decimal'?'finite-decimal':['date','time','timestamp'].includes(c.element.scalarType)?'avro-temporal':'value') as PostgresqlAvroRepresentation}]));
const policy:PostgresqlAvroPolicy={id:'avro-record',recordName:'PgRecord',namespace:'example.sales',table:{schema:'sales',name:'scalar_types'},fields,lossPolicy:'allow-reported-loss'};
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(schema);
test('CONTRACT-034 PostgreSQL captured columns project with explicit restricted domains and native recovery',async()=>{
 const r=projectPostgresqlToAvro(source,policy);expect(r.status).toBe('projected');expect(check(r)).toBe(true);expect(r.mappings.length).toBe(20);expect(r.source).toEqual(source);
 const native=JSON.parse(r.nativeSchema!),field=(name:string)=>native.fields.find((f:any)=>f.name===name);
 expect(field('exact').type[1]).toEqual({type:'bytes',logicalType:'decimal',precision:20,scale:4});expect(field('large').type[1]).toBe('long');expect(field('clock').type[1].logicalType).toBe('time-micros');expect(field('local_stamp').type[1].logicalType).toBe('local-timestamp-micros');expect(field('instant').type[1].logicalType).toBe('timestamp-micros');
 for(const name of ['zoned_clock','items','domain_value','document','identifier'])expect(field(name).type[1]).toBe('string');
 for(const code of ['DECIMAL_SPECIAL_VALUES','TEMPORAL_DOMAIN','TEXT_REFINEMENTS','INTEGER_RANGE','SQL_TEXT_REPRESENTATION'])expect(r.issues.some(i=>i.code===code)).toBe(true);
 expect(native.fields.every((f:any)=>!Object.hasOwn(f,'default'))).toBe(true);
 const exports=[];for(const format of ['json','yaml'] as const){const text=exportAvroSchema(readDocument(writeDocument(r.target!,format),format));expect(JSON.parse(text)).toEqual(native);expect(exportPostgresqlCatalogCapture(readDocument(writeDocument(r.source,format),format)).json).toBe(exportPostgresqlCatalogCapture(source).json);exports.push({format,schema:text});}
 const strict=projectPostgresqlToAvro(source,{...policy,lossPolicy:'strict'});expect(strict.status).toBe('blocked');expect(check(strict)).toBe(true);
 await Bun.write('fixtures/postgresql/avro-projection.json',JSON.stringify({policy,result:r,exports},null,2)+'\n');
});
test('CONTRACT-034 numeric typmods are decoded without truncation or inventing unconstrained precision',()=>{
 const capture=JSON.parse(exportPostgresqlCatalogCapture(source).json);capture.provenance={kind:'authored',purpose:'projection boundary cases'};
 const col=capture.snapshot.relations.find((r:any)=>r.name==='scalar_types').columns.find((c:any)=>c.name==='exact');
 const binding={...policy,fields:{exact:{name:'amount',representation:'finite-decimal' as const}}};
 for(const [p,s,precision,scale] of [[2,-3,5,0],[3,5,5,5],[1000,-1000,2000,0],[1,0,1,0]]){
  col.nativeType.modifier=((p!<<16)|(s!&2047))+4;
  const r=projectPostgresqlToAvro(importPostgresqlCatalogCapture(JSON.stringify(capture),{id:'authored'}),binding);expect(r.status).toBe('projected');expect(JSON.parse(r.nativeSchema!).fields[0].type[1]).toEqual({type:'bytes',logicalType:'decimal',precision,scale});
 }
 for(const modifier of [-1,4,(1001<<16)+4,(1<<16)+1001+4,(1<<16)+2048+4]){col.nativeType.modifier=modifier;expect(projectPostgresqlToAvro(importPostgresqlCatalogCapture(JSON.stringify(capture),{id:'invalid-typmod'}),binding).status).toBe('blocked');}
});
test('CONTRACT-034 unsupported mappings, ambiguity, stale metadata and modified captures block',()=>{
 const bind=(column:string,representation:PostgresqlAvroRepresentation='value')=>({...policy,fields:{[column]:{name:'field',representation}}});
 for(const name of ['exact','day','clock','local_stamp','instant','items','domain_value','document','identifier','missing'])expect(projectPostgresqlToAvro(source,bind(name)).status).toBe('blocked');
 expect(projectPostgresqlToAvro(source,bind('zoned_clock','avro-temporal')).status).toBe('blocked');expect(projectPostgresqlToAvro(source,bind('flag','finite-decimal')).status).toBe('blocked');
 const edited=proposePostgresqlCatalogEdit(source,columns[0]!.path+'/comment','"candidate"');expect(projectPostgresqlToAvro(edited.document,policy).status).toBe('blocked');
 const stale=structuredClone(source);stale.modules.find(m=>m.id==='postgresql.columns')!.elements[0]!.scalarType='float';expect(()=>projectPostgresqlToAvro(stale,policy)).toThrow('disagree');
 expect(()=>projectPostgresqlToAvro(source,{...policy,fields:{x:{name:'same',representation:'value'},y:{name:'same',representation:'value'}}})).toThrow('duplicate');
 const missing=JSON.parse(exportPostgresqlCatalogCapture(source).json);for(const r of missing.snapshot.relations)for(const c of r.columns)delete c.nativeType;
 expect(projectPostgresqlToAvro(importPostgresqlCatalogCapture(JSON.stringify(missing),{id:'legacy'}),bind('ordinary')).status).toBe('blocked');
 missing.serverVersion=170005;expect(projectPostgresqlToAvro(importPostgresqlCatalogCapture(JSON.stringify(missing),{id:'other-version'}),bind('ordinary','sql-text')).status).toBe('blocked');
 const capture=JSON.parse(exportPostgresqlCatalogCapture(source).json),table=capture.snapshot.relations.find((r:any)=>r.name==='scalar_types');table.columns.push(table.columns[0]);
 expect(projectPostgresqlToAvro(importPostgresqlCatalogCapture(JSON.stringify(capture),{id:'duplicate-column'}),policy).status).toBe('blocked');
 capture.snapshot.relations.push(table);expect(()=>projectPostgresqlToAvro(importPostgresqlCatalogCapture(JSON.stringify(capture),{id:'duplicate-table'}),policy)).toThrow('Duplicate');
});
