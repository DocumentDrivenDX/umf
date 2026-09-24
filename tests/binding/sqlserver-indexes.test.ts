import {expect,test} from 'bun:test';
import {exportSqlServerCatalog,importSqlServerCatalog,projectBindingIndexesToSqlServer,type Document} from '../../src';

const fixture=await Bun.file('fixtures/binding/sqlserver-indexes/case.json').json();
const source=await Bun.file(fixture.native).text();
const native=importSqlServerCatalog(source,{id:'sqlserver-native'});
const project=(binding=fixture.binding,policy:'strict'|'report'='report')=>projectBindingIndexesToSqlServer(fixture.logical as Document,binding as Document,native,source,policy);

test('@covers US-047-AC4 @covers US-047-AC5 @covers US-047-AC8: rowstore, unique and filtered candidates have residuals for other kinds',()=>{
  const strict=project(fixture.binding,'strict');expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
  const report=project();expect(report.status).toBe('reported');
  expect(report.candidate?.match(/CREATE (?:UNIQUE )?NONCLUSTERED INDEX/g)).toHaveLength(3);
  expect(report.candidate).toContain('WHERE [active] = 1');
  expect(report.residuals).toHaveLength(5);
  expect(report.nativeSource).toBe(source);
  expect(JSON.parse(exportSqlServerCatalog(report.nativeArchive))).toEqual(JSON.parse(source));
});

test('@covers US-046-AC3 @covers US-047-AC9: unsafe filtered predicate and unknown catalog column are residuals',()=>{
  const binding=structuredClone(fixture.binding),payload=binding.extensions['umf.binding'];
  payload.indexes[2].predicate.expression='1=1; DROP TABLE sales.Items;';
  payload.fields[1].column='missing';
  const report=project(binding);
  expect(report.candidate).not.toContain('DROP TABLE');
  expect(report.residuals.some(x=>x.path.endsWith('/indexes/0'))).toBe(true);
  expect(report.residuals.some(x=>x.path.endsWith('/indexes/2'))).toBe(true);
  expect(project(binding,'strict').candidate).toBeUndefined();
});

test('@covers US-047-AC9: a filtered predicate must name an observed column',()=>{
  const binding=structuredClone(fixture.binding);
  binding.extensions['umf.binding'].indexes[2].predicate.expression='[missing] = 1';
  const report=project(binding);
  expect(report.residuals.some(x=>x.path.endsWith('/indexes/2')&&x.reason.includes('predicate column'))).toBe(true);
  expect(report.candidate).not.toContain('[missing]');
});
