// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {generatePythonClient,inspectTableLifecycle} from '../../src';
import {compileTableDeployment} from '../../src/table-deployment';
import {tableOperationSource} from '../unified/table-operation-fixture';
const ref=(element:string)=>({module:'demo',element});
function source(){
 const d:any=tableOperationSource(),m=d.modules[0];
 m.elements.push({id:'query_filter',kind:'field',name:'query_filter',scalarType:'string',cardinality:'one',nullability:'absent-allowed',extensions:{}},
  {id:'computed_average',kind:'field',scalarType:'float',cardinality:'one',nullability:'absent-allowed',extensions:{}});
 m.extensions['umf.tables'].commands.push({version:'umf.table-operation/0.1',id:'analytics',parameters:[{id:'filter',field:ref('query_filter')}],
  body:{kind:'query',language:'weft.pg-select/0.1',sql:'SELECT AVG(LENGTH(owner))::float8 AS average FROM notes WHERE :filter IS NULL OR owner = :filter',outputs:[{name:'average',field:ref('computed_average')}],maxRows:1},
  consistency:'statement',replay:'none'});
 return d;
}
const command=(d:any)=>d.modules[0].extensions['umf.tables'].commands.at(-1);
test('fixed query source retains owning DTO domains and generates ordinary typed read methods',()=>{
 const d=source(),before=structuredClone(d),i=inspectTableLifecycle(d);
 expect(i.diagnostics).toEqual([]);expect(i.complete).toBe(true);expect(i.nativeQualified).toBe(false);
 const generated=generatePythonClient({text:JSON.stringify(d),package:'query_demo'});
 const models=generated.files.find(f=>f.path==='query_demo/models.py')!.text;
 expect(models).toContain('average: float | None');
 expect(models).toContain('def analytics(self, *, filter: str | None) -> tuple[DemoAnalyticsRow, ...]:');
 expect(models).not.toContain('def analytics_observe');expect(models).not.toContain('SELECT AVG');
 const config={module:'demo',schema:'query_demo',ownerRole:'owner',personRole:'person',batchRole:'batch',groupRoles:{}};
 const deployment=compileTableDeployment({text:JSON.stringify(d),configuration:config});
 expect(deployment.status).toBe('compiled');expect(d).toEqual(before);
});
test('fixed query declared scope and derived frame identities are closed before lowering',()=>{
 for(const mutate of [(c:any)=>c.body.outputs.push(c.body.outputs[0]),(c:any)=>c.body.outputs[0].field=ref('missing'),
  (c:any)=>c.body.outputs[0].field.module='foreign',(c:any)=>c.parameters[0].field.module='foreign',
  (c:any)=>c.body.outputs[0].name='x'.repeat(64),(c:any)=>c.body.maxRows=1001,
  (c:any)=>c.replay='caller-key-required',(c:any)=>c.batch={maxItems:2}]){
  const d=source();mutate(command(d));const i=inspectTableLifecycle(d);expect(i.complete).toBe(false);
 }
 const d=source();command(d).body.future={retained:true};const i=inspectTableLifecycle(d);
 expect(i.valid).toBe(true);expect(i.complete).toBe(false);expect(i.source).toEqual(d);
});
