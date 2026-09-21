import {test,expect} from 'bun:test';
import {createValidator} from '../../src/validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import kinds from '../../spec/core/kind-operation.schema.json';
import {classifyTableSpecRecord} from '../../src/core-ideals/tablespec-record';
import {classifyPostgresqlField} from '../../src/core-ideals/postgresql-field';
import {classifyPostgresqlRecord} from '../../src/core-ideals/postgresql-record';
import {classifyPostgresqlComposite} from '../../src/core-ideals/postgresql-composite';
import {importPostgresqlCatalogCapture} from '../../src/adapters/postgresql/catalog';import {upgradeFieldEnvelope} from '../../src/model/field-transition';
const table=await Bun.file('fixtures/validation/field-tablespec-classification.json').json(),pg=await Bun.file('fixtures/validation/field-postgresql-native.json').json(),ddl=await Bun.file('fixtures/validation/postgresql-ddl-kinds-native.json').json();
const source=upgradeFieldEnvelope(importPostgresqlCatalogCapture(pg.nativeSource,{id:'policy'})).target;
const suites=[
 {file:'tablespec-field-classification',value:table.rows[0].result},
 {file:'tablespec-record-classification',value:classifyTableSpecRecord(table.rows[0].result.source,{recordModule:'records',recordId:'record',mode:'strict'})},
 {file:'postgresql-field-classification',value:classifyPostgresqlField(source,{column:pg.rows[0].path,nativeSource:pg.nativeSource,mode:'strict'})},
 {file:'postgresql-record-classification',value:classifyPostgresqlRecord(source,{recordModule:'records',recordId:'record',relation:pg.records[0].relation,nativeSource:pg.nativeSource,mode:'strict'})},
 {file:'postgresql-composite-classification',value:classifyPostgresqlComposite(source,{recordModule:'records',recordId:'record',relation:pg.composites[0].relation,nativeSource:pg.nativeSource,mode:'strict'})},
 {file:'postgresql-ddl-kinds',value:ddl.rows.find((r:any)=>r.result.status==='classified'&&!r.result.residuals.length).result}
];
for(const suite of suites){const v=createValidator();v.addSchema(legacy);v.addSchema(fields);v.addSchema(kinds);const check=v.compile(await Bun.file('spec/core/'+suite.file+'.schema.json').json());
 test(suite.file+' rejects inconsistent success and blocked metadata',()=>{
  expect(check(suite.value)).toBe(true);const copy=():any=>JSON.parse(JSON.stringify(suite.value));
  let value=copy();if(value.mapping)value.mapping.outcome='unknown';else value.mappings[0].outcome='unknown';expect(check(value)).toBe(false);
  value.request.mode='report';expect(check(value)).toBe(false);
  value=copy();value.diagnostics=[{code:'CONFLICT',path:'',message:'Conflict',severity:'error'}];expect(check(value)).toBe(false);
  value=copy();value.status='blocked';expect(check(value)).toBe(false);delete value.target;expect(check(value)).toBe(false);
  if(suite.file==='postgresql-ddl-kinds'){
   for(const row of ddl.rows)expect(check(row.result)).toBe(true);
   const report=JSON.parse(JSON.stringify(ddl.rows.find((r:any)=>r.result.status==='classified'&&r.result.residuals.length).result));report.request.mode='strict';expect(check(report)).toBe(false);
   const blocked=JSON.parse(JSON.stringify(ddl.rows.find((r:any)=>r.result.status==='blocked').result));blocked.diagnostics=blocked.diagnostics.map((d:any)=>({...d,severity:'warning'}));expect(check(blocked)).toBe(false);
  }
 });
}
