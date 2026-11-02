// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {projectBindingToSqlServer,verifyBindingSqlServerProjection,recoverBindingSqlServerNative,recoverBindingSqlServerSources,type Document} from '../../src/index-node-v4';
const rows=(await Bun.file('fixtures/binding/sqlserver/cases.json').json()).cases as {logical:Document;binding:Document;policy:any}[];
const fixture=rows[0]!;
test('public SQL Server physical projection retains sources and verifies/recover receipts',()=>{
 const report=projectBindingToSqlServer(fixture.logical,fixture.binding,fixture.policy as never,'report');
 expect(report.status).toBe('reported');expect(report.logical).toEqual(fixture.logical);expect(report.binding).toEqual(fixture.binding);
 if(!report.candidate)throw new Error('Reported SQL Server projection must include candidate SQL');
 expect(report.candidate).toContain('CREATE TABLE');expect(report.candidate).toContain('FOREIGN KEY');
 expect(verifyBindingSqlServerProjection(report,report.candidate!).candidate).toBe(report.candidate);
 expect(recoverBindingSqlServerSources(report,report.candidate!)).toEqual({logical:fixture.logical,binding:fixture.binding,policy:fixture.policy});
 expect(recoverBindingSqlServerNative(report,report.candidate!).sql).toBe(report.candidate);
 const strict=projectBindingToSqlServer(fixture.logical,fixture.binding,fixture.policy as never,'strict');
 expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
});

const junction=rows.find(row=>row.policy.layout.relationshipLayouts.some((layout:any)=>layout.storage==='junction'&&!layout.associationRecord))!;
test('public SQL Server physical projection emits anonymous relationship tables, endpoint constraints and multiplicity indexes',()=>{
 const logical=structuredClone(junction.logical) as Document;
 const layout= junction.policy.layout.relationshipLayouts.find((x:any)=>x.storage==='junction'&&!x.associationRecord)!;
 const relationship:any=logical.modules.find(m=>m.id===layout.relationship.module)!.relationships!.find(r=>r.id===layout.relationship.id)!;
 relationship.sourceMultiplicity.max=1;
 const report=projectBindingToSqlServer(logical,junction.binding,junction.policy as never,'report');
 expect(report.status).toBe('reported');
 expect(report.candidate).toContain('CREATE TABLE [sales].[links]');
 expect(report.candidate).toContain('FOREIGN KEY');
 expect(report.candidate).toContain('CREATE UNIQUE NONCLUSTERED INDEX');
 expect(report.mappings.some(m=>m.kind==='relationship')).toBe(true);
 expect(verifyBindingSqlServerProjection(report,report.candidate!).candidate).toBe(report.candidate);
 expect(recoverBindingSqlServerSources(report,report.candidate!).logical).toEqual(logical);
 const strict=projectBindingToSqlServer(logical,junction.binding,junction.policy as never,'strict');
 expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
});
