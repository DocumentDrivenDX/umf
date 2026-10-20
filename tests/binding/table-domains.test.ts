// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment,verifyTableDeployment} from '../../src/table-deployment';
import {generatePythonClient} from '../../src/access';
import {inspectTableLifecycle} from '../../src/extensions/tables';
import {domainSource} from '../unified/table-domain-fixture';
const configuration={module:'demo',schema:'demo_schema',ownerRole:'demo_owner',personRole:'demo_person',batchRole:'demo_batch',groupRoles:{}};
test('blocking logical domains and transaction-clock assignments retain their exact source',()=>{
 const doc=domainSource(),inspection=inspectTableLifecycle(doc);
 expect(inspection.diagnostics).toEqual([]);
 const result=compileTableDeployment({text:JSON.stringify(doc),configuration});
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw Error(JSON.stringify(result));
 expect(verifyTableDeployment(result.bundle)).toEqual(result.bundle);
 const sql=result.bundle.steps.map(s=>s.sql).join('\n');
 expect(sql).toContain('"status" IN (');expect(sql).toContain('pg_catalog.char_length("status") >= 1');
 expect(sql).toContain('"rank" >= 0 AND "rank" <= 255');expect(sql).toContain('"rank" <');
 expect(sql).toContain("'0'::pg_catalog.numeric");expect(sql).toContain('"active" IN (TRUE)');
 const generated=generatePythonClient({text:JSON.stringify(doc),package:'domain_demo'});
 const text=generated.files.find(f=>f.path==='domain_demo/models.py')!.text;
 expect(text).toContain('status: Literal["draft", "ready"]');expect(text).toContain('rank: Literal[1, 2, 9]');
 expect(text).toContain('async def touch(');
 const unknown=structuredClone(doc);unknown.modules[0].elements.find((e:any)=>e.id==='amount').facets.range.future={retained:true};
 expect(compileTableDeployment({text:JSON.stringify(unknown),configuration}).status).toBe('blocked');
 expect(unknown.modules[0].elements.find((e:any)=>e.id==='amount').facets.range.future).toEqual({retained:true});
 const bad=structuredClone(doc),clock=bad.modules[0].extensions['umf.tables'].commands.find((c:any)=>c.id==='touch');
 clock.body.values.at(-1).field={module:'demo',element:'amount'};
 expect(inspectTableLifecycle(bad).diagnostics.some(d=>d.code==='TABLES_OPERATION_DOMAIN')).toBe(true);
});
