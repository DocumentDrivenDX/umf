import {test,expect} from 'bun:test';
import {createValidator} from '../../src/validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import kinds from '../../spec/core/kind-operation.schema.json';
const table=await Bun.file('fixtures/validation/field-tablespec-projection.json').json(),postgres=await Bun.file('fixtures/validation/field-postgresql-projection-native.json').json();
const suites=[{file:'field-tablespec',rows:table.rows},{file:'record-tablespec',rows:table.records},{file:'field-postgresql',rows:postgres.rows},{file:'record-postgresql',rows:postgres.recordRows}];
for(const suite of suites){const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(kinds);const check=validator.compile(await Bun.file('spec/core/'+suite.file+'-projection.schema.json').json());
 test(suite.file+' schema enforces strict/report loss and atomic candidate rules',()=>{
  for(const row of suite.rows)expect(check(row.result)).toBe(true);
  const clean=suite.rows.find((r:any)=>r.result.status==='projected'&&!r.result.residuals.length).result;
  const copy=()=>JSON.parse(JSON.stringify(clean));
  const residual={path:'/modules/0',value:{meaning:'retained'},reason:'Not expressed',outcome:'unknown',recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'};
  let value=copy();value.request.mode='strict';value.residuals=[residual];expect(check(value)).toBe(false);
  value.request.mode='report';value.diagnostics=[{code:'LOSS',path:'/modules/0',message:'Not expressed',severity:'warning'}];expect(check(value)).toBe(true);
  value.diagnostics[0].severity='error';expect(check(value)).toBe(false);
  value=copy();value.request.mode='strict';if(value.mapping)value.mapping.outcome='unknown';else value.mappings[0].outcome='unknown';expect(check(value)).toBe(false);
  value.request.mode='report';expect(check(value)).toBe(false);value.residuals=[residual];expect(check(value)).toBe(true);
  value.status='blocked';expect(check(value)).toBe(false);delete value.target;delete value.nativeSql;value.diagnostics=[{code:'LOSS',path:'/modules/0',message:'Not expressed',severity:'error'}];expect(check(value)).toBe(true);
  value.residuals=[];expect(check(value)).toBe(false);value.residuals=[residual];value.diagnostics=[];expect(check(value)).toBe(false);
  value.diagnostics=[{code:'LOSS',path:'/modules/0',message:'Not expressed',severity:'warning'}];expect(check(value)).toBe(false);
 });
}
