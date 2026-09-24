import {expect,test} from 'bun:test';
import {exportSqlServerCatalog,projectBindingTablesAndIndexesFromPlanToSqlServer,projectBindingTablesAndIndexesToSqlServer,type Document} from '../../src';

const fixture=await Bun.file('fixtures/binding/sqlserver-tables-indexes/case.json').json();
const nativeSource=await Bun.file('fixtures/binding/sqlserver-tables/catalog.json').text();
const project=(binding=fixture.binding,source=nativeSource,loss:'strict'|'report'='report')=>projectBindingTablesAndIndexesToSqlServer(fixture.logical as Document,binding as Document,fixture.policy,source,loss);
const fromPlan=(binding=fixture.binding,policy=fixture.policy,loss:'strict'|'report'='report',source?:string)=>projectBindingTablesAndIndexesFromPlanToSqlServer(fixture.logical as Document,binding as Document,policy,loss,source);

test('@covers US-046-AC2 @covers US-047-AC4: authored inputs alone generate the same native-valid DDL',()=>{
  const report=fromPlan();
  expect(report.status).toBe('reported');expect(report.nativeArchive).toBeUndefined();
  expect(report.candidate).toBe(project().candidate);
  expect(report.candidate?.match(/CREATE (?:UNIQUE )?NONCLUSTERED INDEX/g)).toHaveLength(3);
  expect(report.residuals.filter(x=>x.path.startsWith('/extensions/umf.binding/indexes/'))).toHaveLength(3);
  expect(fromPlan(fixture.binding,fixture.policy,'strict').candidate).toBeUndefined();
  const checked=fromPlan(fixture.binding,fixture.policy,'report',nativeSource);
  expect(checked.candidate).toBe(report.candidate);
  expect(checked.nativeSource).toBe(nativeSource);
});

test('@covers US-046-AC3 @covers US-047-AC9: planned columns and predicates must be safe before index emission',()=>{
  const missing=structuredClone(fixture.policy);missing.fieldTypes[0].sqlType='nvarchar(80)';
  const partial=fromPlan(fixture.binding,missing);
  expect(partial.residuals.some(x=>x.path==='/extensions/umf.binding/indexes/0')).toBe(true);
  expect(partial.candidate).not.toContain('CREATE NONCLUSTERED INDEX [IX_Items_Id]');
  const unbounded=structuredClone(fixture.policy);unbounded.fieldTypes[1].sqlType='nvarchar(max)';
  const reported=fromPlan(fixture.binding,unbounded);
  expect(reported.residuals.some(x=>x.path==='/extensions/umf.binding/indexes/1'&&x.reason.includes('Unbounded'))).toBe(true);
  expect(reported.candidate).not.toContain('CREATE UNIQUE NONCLUSTERED INDEX [UX_Items_Email]');
  const unsafe=structuredClone(fixture.binding);unsafe.extensions['umf.binding'].indexes[2].predicate.expression='[missing] = 1';
  expect(fromPlan(unsafe).residuals.some(x=>x.reason.includes('predicate column'))).toBe(true);
});

test('@covers US-046-AC2 @covers US-047-AC4: generated tables and indexes compose with explicit catalog evidence',()=>{
  const strict=project(fixture.binding,nativeSource,'strict');
  expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
  const report=project();
  expect(report.status).toBe('reported');expect(report.residuals).toHaveLength(13);
  expect(report.candidate?.match(/CREATE TABLE/g)).toHaveLength(2);
  expect(report.candidate?.match(/CREATE (?:UNIQUE )?NONCLUSTERED INDEX/g)).toHaveLength(3);
  expect(report.candidate).toContain('ON [sales].[Items] ([id])');
  expect(report.candidate).toContain('WHERE [id] > 0');
  expect(report.residuals.filter(x=>x.path.startsWith('/extensions/umf.binding/indexes/')).map(x=>x.path)).toEqual([3,4,5].map(i=>`/extensions/umf.binding/indexes/${i}`));
  expect(report.nativeSource).toBe(nativeSource);
  expect(JSON.parse(exportSqlServerCatalog(report.nativeArchive!))).toEqual(JSON.parse(nativeSource));
  expect(report.logical).toEqual(fixture.logical);expect(report.binding).toEqual(fixture.binding);
});

test('@covers US-046-AC3 @covers US-047-AC9: stale column evidence and unknown binding block',()=>{
  const stale=JSON.parse(nativeSource);stale.tables.find((x:any)=>x.schema==='sales'&&x.name==='Items').columns.find((x:any)=>x.name==='email').max_length=80;
  expect(()=>project(fixture.binding,JSON.stringify(stale))).toThrow('Native catalog does not match');
  const unknown=structuredClone(fixture.binding);unknown.extensions['umf.binding'].unrecognized=true;
  expect(()=>project(unknown)).toThrow();
  const missing=structuredClone(fixture.policy);missing.fieldTypes[0].sqlType='nvarchar(80)';
  expect(()=>projectBindingTablesAndIndexesToSqlServer(fixture.logical as Document,fixture.binding as Document,missing,nativeSource,'report')).toThrow('generated table plan');
});
