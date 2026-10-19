// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {createValidator} from '../../src/validation/schema';
import core from '../../spec/core/schema.json';import {coreKindOperationSchema as kinds} from '../../src/model/field-kind';
import {classifyTableSpecRecord} from '../../src/core-ideals/tablespec-record';
import {classifyTableSpecField} from '../../src/core-ideals/tablespec-field';import {importTableSpec} from '../../src/adapters/tablespec';
import {classifyPostgresqlField} from '../../src/core-ideals/postgresql-field';
import {classifyPostgresqlRecord} from '../../src/core-ideals/postgresql-record';
import {classifyPostgresqlComposite} from '../../src/core-ideals/postgresql-composite';
import {classifyPostgresqlDdlRecord} from '../../src/core-ideals/postgresql-ddl-kinds';
import {importPostgresqlCatalogCapture} from '../../src/adapters/postgresql/catalog';
import {importPostgresqlSql} from '../../src/adapters/postgresql';
import {getPostgresqlDdlDeclarations} from '../../src/adapters/postgresql/declarations';
import {backend} from '../../native/postgresql/runtime';
const table=await Bun.file('fixtures/validation/field-tablespec-classification.json').json(),pg=await Bun.file('fixtures/validation/field-postgresql-native.json').json();
const ddl=[] as any[];for(const sql of ['CREATE TABLE sales.t (id int);','CREATE TYPE sales.address AS (street text);','CREATE TABLE unqualified (id int);'])for(const mode of ['strict','report'] as const){const source=await importPostgresqlSql(sql,backend,{id:'policy-current'});ddl.push(await classifyPostgresqlDdlRecord(source,{module:'records',recordId:'r',mode,declaration:getPostgresqlDdlDeclarations(source).declarations[0]!.path},backend));}
const source=importPostgresqlCatalogCapture(pg.nativeSource,{id:'policy'});
const suites=[
 ...(()=>{const source=importTableSpec(table.rows[0].input,{id:'policy-current',format:table.rows[0].nativeFormat});return [
  {file:'tablespec-field-classification',value:classifyTableSpecField(source,{column:table.rows[0].column,mode:'strict'})},
  {file:'tablespec-record-classification',value:classifyTableSpecRecord(source,{recordModule:'records',recordId:'record',mode:'strict'})},
 ];})(),
 {file:'postgresql-field-classification',value:classifyPostgresqlField(source,{column:pg.rows[0].path,nativeSource:pg.nativeSource,mode:'strict'})},
 {file:'postgresql-record-classification',value:classifyPostgresqlRecord(source,{recordModule:'records',recordId:'record',relation:pg.records[0].relation,nativeSource:pg.nativeSource,mode:'strict'})},
 {file:'postgresql-composite-classification',value:classifyPostgresqlComposite(source,{recordModule:'records',recordId:'record',relation:pg.composites[0].relation,nativeSource:pg.nativeSource,mode:'strict'})},
 {file:'postgresql-ddl-kinds',value:ddl.find((r:any)=>r.status==='classified'&&!r.residuals.length)}
];
for(const suite of suites){const v=createValidator();v.addSchema(core);v.addSchema(kinds);const check=v.compile(await Bun.file('spec/core/'+suite.file+'.schema.json').json());
 test(suite.file+' rejects inconsistent success and blocked metadata',()=>{
  expect(check(suite.value)).toBe(true);const copy=():any=>JSON.parse(JSON.stringify(suite.value));
  let value=copy();if(value.mapping)value.mapping.outcome='unknown';else value.mappings[0].outcome='unknown';expect(check(value)).toBe(false);
  value.request.mode='report';expect(check(value)).toBe(false);
  value=copy();value.diagnostics=[{code:'CONFLICT',path:'',message:'Conflict',severity:'error'}];expect(check(value)).toBe(false);
  value=copy();value.status='blocked';expect(check(value)).toBe(false);delete value.target;expect(check(value)).toBe(false);
  if(suite.file==='postgresql-ddl-kinds'){
   for(const row of ddl)expect(check(row)).toBe(true);
   const report=JSON.parse(JSON.stringify(ddl.find((r:any)=>r.status==='classified'&&r.residuals.length)));report.request.mode='strict';expect(check(report)).toBe(false);
   const blocked=JSON.parse(JSON.stringify(ddl.find((r:any)=>r.status==='blocked')));blocked.diagnostics=blocked.diagnostics.map((d:any)=>({...d,severity:'warning'}));expect(check(blocked)).toBe(false);
  }
 });
}
