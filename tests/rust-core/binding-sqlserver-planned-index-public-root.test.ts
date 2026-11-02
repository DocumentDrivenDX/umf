// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import type {Document} from '../../src/model/types';
import {projectBindingIndexesAgainstSqlServerPlan} from '../../src/index-node-v4';

const fixture=await Bun.file('fixtures/binding/sqlserver-indexes/case.json').json();
const plannedColumns=[
 {schema:'sales',table:'Items',column:'id',maxLength:4},
 {schema:'sales',table:'Items',column:'email',maxLength:320},
 {schema:'sales',table:'Items',column:'active',maxLength:1},
 {schema:'sales',table:'Items',column:'payload',maxLength:8000},
];
test('public SQL Server planned-index route emits supported indexes and blocks strict residuals',()=>{
 const report=projectBindingIndexesAgainstSqlServerPlan(fixture.logical as Document,fixture.binding as Document,plannedColumns,'report');
 expect(report.status).toBe('reported');expect(report.residuals).toHaveLength(5);
 expect(report.candidate).toContain('CREATE NONCLUSTERED INDEX [umf_email_btree] ON [sales].[Items] ([email]) INCLUDE ([payload]);');
 expect(report.candidate).toContain('CREATE UNIQUE NONCLUSTERED INDEX [umf_id_unique]');
 expect(report.candidate).toContain('WHERE [active] = 1');
 const strict=projectBindingIndexesAgainstSqlServerPlan(fixture.logical as Document,fixture.binding as Document,plannedColumns,'strict');
 expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();expect(strict.binding).toEqual(fixture.binding);expect(strict.logical).toEqual(fixture.logical);
},60_000);
