// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {projectCardinalityToSqlServer,recoverCardinalityFromSqlServer} from '../../src/index-node-v4';
import {sqlserverCardinalityProjectionCases} from '../../scripts/core-ideals/cardinality-sqlserver-projection-cases';

test('Rust SQL Server cardinality projection preserves a native scalar receipt and refuses strict JSON shape mismatch',()=>{
 const cases=sqlserverCardinalityProjectionCases();
 const normal=cases[0]!;
 const projected=projectCardinalityToSqlServer(normal.author,normal.request);
 expect(projected.status).toBe('projected');
 expect(projected.nativeSql).toContain('CREATE TABLE [dbo].[cardinality_0] ([value] int NULL);');
 expect(recoverCardinalityFromSqlServer(projected,projected.nativeSql!)).toEqual(normal.author.target);
 expect(()=>recoverCardinalityFromSqlServer(projected,projected.nativeSql+' ')).toThrow();
 const strictJson=cases[2]!;
 const refused=projectCardinalityToSqlServer(strictJson.author,strictJson.request);
 expect(refused.status).toBe('blocked');
 expect(refused.target).toBeUndefined();
 expect(refused.residuals.some(item=>item.reason.includes('does not express authored shape'))).toBe(true);
});
