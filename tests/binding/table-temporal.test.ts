// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {compileTableDeployment,verifyTableDeployment,generatePythonClient} from '../../src/index-node-v4';
import {temporalSource} from '../unified/table-temporal-fixture';

const configuration={module:'demo',schema:'demo_schema',ownerRole:'demo_owner',personRole:'demo_person',batchRole:'demo_batch',groupRoles:{}};
test('deployment carries proven finite temporal/numeric checks and typed native methods',()=>{
 const source=temporalSource(),result=compileTableDeployment({text:JSON.stringify(source),configuration});
 expect(result.status).toBe('compiled');if(result.status!=='compiled')throw Error(JSON.stringify(result));
 expect(verifyTableDeployment(result.bundle)).toEqual(result.bundle);
 const checks=result.bundle.expectedCatalog.checks;
 expect(checks.filter(c=>c.id.startsWith('domain:'))).toHaveLength(3);
 expect(checks.some(c=>c.definitionSql.includes('NaN'))).toBe(true);
 expect(checks.some(c=>c.definitionSql.includes('9999-12-31T23:59:59.999999Z'))).toBe(true);
 const generated=generatePythonClient({text:JSON.stringify(source),package:'temporal_demo'});
 expect(generated.files.find(f=>f.path==='temporal_demo/models.py')!.text).toContain('day: date, at: ExactTimestamp, amount: Decimal');
 const column=source.modules[0].extensions['umf.tables'].tables[0].columns.find((c:any)=>c.name==='at');
 column.default={kind:'literal',value:{timestamp:'2026-01-01T00:00:00+01:00'}};
 const defaulted=compileTableDeployment({text:JSON.stringify(source),configuration});
 expect(defaulted.status).toBe('compiled');if(defaulted.status==='compiled')expect(defaulted.bundle.steps[0]!.sql).toContain('2025-12-31T23:00:00.000000Z');
 column.nativeType={kind:'timestamp'};
 expect(compileTableDeployment({text:JSON.stringify(source),configuration}).status).toBe('blocked');
});
