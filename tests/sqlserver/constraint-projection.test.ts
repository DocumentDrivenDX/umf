import {test,expect} from 'bun:test';
import {importSqlServerCatalog,getSqlServerColumnMetadata,projectSqlServerToAvro,exportAvroSchema,writeDocument,readDocument,coreSchema,type SqlServerAvroPolicy} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/projections/sqlserver-avro.schema.json';
const source=importSqlServerCatalog(await Bun.file('fixtures/sqlserver/constraints-catalog.json').text(),{id:'constraints'}),ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(schema);
test('CONTRACT-032 every captured SQL Server constraint has a source-addressable projection loss',async()=>{
 const cases=[];
 for(const table of ['Child','Parent','Untrusted']){
  const fields=Object.fromEntries(getSqlServerColumnMetadata(source).filter(c=>c.table.name===table).map(c=>[c.element.name!,{name:c.element.name!,representation:'value' as const}]));
  const policy:SqlServerAvroPolicy={id:'avro-'+table,recordName:table,namespace:'example.constraints',table:{schema:'sales',name:table},fields,lossPolicy:'allow-reported-loss'},result=projectSqlServerToAvro(source,policy);
  expect(result.status).toBe('projected');expect(check(result)).toBe(true);expect(result.source).toEqual(source);expect(result.issues.some(i=>i.code==='CONSTRAINT_COVERAGE_UNAVAILABLE')).toBe(false);
  const observed=JSON.parse(await Bun.file('fixtures/sqlserver/constraints-catalog.json').text()).tables.find((t:any)=>t.name===table);
  for(const [section,code] of [['keys','KEY_NOT_ENFORCED'],['foreign_keys','FOREIGN_KEY_NOT_ENFORCED'],['checks','CHECK_NOT_ENFORCED']] as const){
   const losses=result.issues.filter(i=>i.code===code);expect(losses.length).toBe(observed[section].length);for(const [index,loss] of losses.entries()){expect(loss.path.endsWith('/'+section+'/'+index)).toBe(true);expect(loss.detail).toContain(observed[section][index].name);expect(loss.retainedInSource).toBe(true);}
  }
  const exports=[];for(const format of ['json','yaml'] as const){const text=exportAvroSchema(readDocument(writeDocument(result.target!,format),format));expect(JSON.parse(text)).toEqual(JSON.parse(result.nativeSchema!));exports.push({format,schema:text});}
  expect(projectSqlServerToAvro(source,{...policy,lossPolicy:'strict'}).status).toBe('blocked');cases.push({table,policy,result,exports});
 }
 await Bun.write('fixtures/sqlserver/constraint-projections.json',JSON.stringify({cases},null,2)+'\n');
});
test('CONTRACT-032 uncaptured v1 constraints never masquerade as an unconstrained table',async()=>{
 const old=importSqlServerCatalog(await Bun.file('fixtures/sqlserver/catalog.json').text(),{id:'v1'}),result=projectSqlServerToAvro(old,{id:'target',recordName:'Legacy',namespace:'example',table:{schema:'sales',name:'Types'},fields:{id:{name:'id',representation:'value'}},lossPolicy:'allow-reported-loss'});
 expect(result.status).toBe('projected');expect(result.issues.filter(i=>i.code==='CONSTRAINT_COVERAGE_UNAVAILABLE').map(i=>i.path.split('/').at(-1))).toEqual(['keys','foreign_keys','checks']);expect(result.issues.some(i=>i.code==='KEY_NOT_ENFORCED')).toBe(false);
});
