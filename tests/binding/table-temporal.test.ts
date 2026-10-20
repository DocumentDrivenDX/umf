// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {nativeDate,nativeInstant} from '../../src/extensions/tables/temporal';
import {compileTableDeployment,verifyTableDeployment} from '../../src/table-deployment';
import {generatePythonClient} from '../../src/access';
import {temporalSource} from '../unified/table-temporal-fixture';

const configuration={module:'demo',schema:'demo_schema',ownerRole:'demo_owner',personRole:'demo_person',batchRole:'demo_batch',groupRoles:{}};
test('native temporal calendar/UTC precision rules preserve exact meaning',()=>{
 for(const text of ['0001-01-01','2000-02-29','9999-12-31'])expect(nativeDate(text)).toBe(text);
 expect(nativeInstant('2026-01-01T00:30:00.123456000+01:00')).toBe('2025-12-31T23:30:00.123456Z');
 expect(nativeInstant('2000-02-28T23:30:00-01:00')).toBe('2000-02-29T00:30:00.000000Z');
 for(const text of ['0000-01-01','1900-02-29','2000-02-30','infinity','2026-1-01'])expect(()=>nativeDate(text)).toThrow();
 for(const text of ['0001-01-01T00:00:00+00:01','9999-12-31T23:59:59-00:01','2026-01-01T00:00:00.0000001Z','2026-01-01T00:00:00-00:00','2026-01-01T00:00:60Z','2026-01-01T24:00:00Z','2026-01-01T00:00:00','2026-01-01T00:00:00+24:00'])expect(()=>nativeInstant(text)).toThrow();
});
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
