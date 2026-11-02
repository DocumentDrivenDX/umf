// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {sqlserverNullabilityProjectionCases} from '../../scripts/core-ideals/nullability-sqlserver-projection-cases';
import {projectNullabilityToSqlServer,recoverNullabilityFromSqlServer} from '../../src/index-node-v4';

const cases=sqlserverNullabilityProjectionCases();
const ordinary=cases.find(row=>row.variant==='plain'&&row.label==='required'&&row.nativeType==='int');
const refused=cases.find(row=>row.variant==='unknown'&&row.label==='required'&&row.nativeType==='int'&&row.request.mode==='strict');
if(!ordinary||!refused)throw new Error('Expected ordinary and strict-refusal SQL Server nullability fixtures');

test('Rust default authored SQL Server nullability projection and retained-source recovery',()=>{
 const projected=projectNullabilityToSqlServer(ordinary.author,ordinary.request);
 expect(projected.status).toBe('projected');
 expect(projected.mapping.encoding).toBe('not-null');
 expect(projected.target?.sql).toContain('int NOT NULL');
 expect(projected.nativeSql).toBe(projected.target?.sql);
 expect(projected.source).toEqual(ordinary.author.target);
 if(projected.nativeSql===undefined)throw new Error('Projected receipt must retain native SQL');
 expect(recoverNullabilityFromSqlServer(projected,projected.nativeSql)).toEqual(ordinary.author.target);

 const blocked=projectNullabilityToSqlServer(refused.author,refused.request);
 expect(blocked.status).toBe('blocked');
 expect(blocked.target).toBeUndefined();
 expect(blocked.nativeSql).toBeUndefined();
 expect(blocked.residuals.some(loss=>loss.path.endsWith('/future'))).toBe(true);
});
