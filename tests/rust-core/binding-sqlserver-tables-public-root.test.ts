// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {projectBindingTablesAndIndexesFromPlanToSqlServer,projectBindingTablesAndIndexesToSqlServer,projectBindingTablesToSqlServer,type Document} from '../../src/index-node-v4';
const fixture=await Bun.file('fixtures/binding/sqlserver-tables/case.json').json();
const logical=fixture.logical as Document,binding=fixture.binding as Document,policy=fixture.policy;
test('public SQL Server table projection retains its sources and reports selected physical losses',()=>{
 const report=projectBindingTablesToSqlServer(logical,binding,policy,'report');
 expect(report.status).toBe('reported');expect(report.logical).toEqual(logical);expect(report.binding).toEqual(binding);
 expect(report.candidate).toContain('CREATE TABLE [sales].[Items]');expect(report.candidate).toContain('ON [ps_umf_ship]([part])');
 expect(report.residuals.some(row=>row.reason.includes('text JSON'))).toBe(true);
 const strict=projectBindingTablesToSqlServer(logical,binding,policy,'strict');expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
});
test('public SQL Server table projection reports an unrecognized DDD scalar mapping',()=>{
 const bad=structuredClone(policy);bad.fieldTypes[0]!.sqlType='xml';
 const report=projectBindingTablesToSqlServer(logical,binding,bad,'report');
 expect(report.status).toBe('reported');expect(report.residuals.some(row=>row.reason.includes('No safe explicit SQL scalar type mapping'))).toBe(true);
});
const combinedFixture=await Bun.file('fixtures/binding/sqlserver-tables-indexes/case.json').json();
const catalogSource=await Bun.file('fixtures/binding/sqlserver-tables-indexes/catalog.json').text();
test('public SQL Server table and index composites preserve table-plan behavior and validate native columns',()=>{
 const sourceLogical=combinedFixture.logical as Document,sourceBinding=combinedFixture.binding as Document,sourcePolicy=combinedFixture.policy;
 const report=projectBindingTablesAndIndexesFromPlanToSqlServer(sourceLogical,sourceBinding,sourcePolicy,'report');
 expect(report.status).toBe('reported');expect(report.candidate).toContain('CREATE NONCLUSTERED INDEX [IX_Items_Id]');
 const observed=projectBindingTablesAndIndexesToSqlServer(sourceLogical,sourceBinding,sourcePolicy,catalogSource,'report');
 expect(observed.candidate).toBe(report.candidate);expect(observed.nativeSource).toBe(catalogSource);
 const strict=projectBindingTablesAndIndexesToSqlServer(sourceLogical,sourceBinding,sourcePolicy,catalogSource,'strict');
 expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
});
