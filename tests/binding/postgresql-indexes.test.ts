import {expect,test} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {getPostgresqlSource,importPostgresqlSql,projectBindingIndexesToPostgresql,type Document} from '../../src';

const fixture=await Bun.file('fixtures/binding/postgresql-indexes/case.json').json();
const source=await Bun.file(fixture.native).text();
const native=await importPostgresqlSql(source,backend,{id:'native-table'});
const project=(binding=fixture.binding,policy:'strict'|'report'='report')=>projectBindingIndexesToPostgresql(fixture.logical as Document,binding as Document,native,backend,policy);

test('@covers US-047-AC3 @covers US-047-AC4 @covers US-047-AC5: PostgreSQL kinds, document path and clustering residual',async()=>{
  const strict=await project(fixture.binding,'strict');
  expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
  const report=await project();
  expect(report.status).toBe('reported');
  expect(report.residuals.map(x=>x.path)).toEqual(['/extensions/umf.binding/indexes/7']);
  expect(report.candidate?.match(/CREATE (?:UNIQUE )?INDEX/g)).toHaveLength(7);
  expect(report.candidate).toContain(`"payload" #>> ARRAY['customer','region']::text[]`);
  expect(report.candidate).toContain(`WHERE ("status" = 'paid')`);
  expect(getPostgresqlSource(report.nativeArchive)).toBe(source);
});

test('@covers US-046-AC3 @covers US-047-AC9: absent native column and unsafe predicate are not emitted',async()=>{
  const binding=structuredClone(fixture.binding),payload=binding.extensions['umf.binding'];
  payload.fields[4].column='missing';
  payload.indexes[5].predicate.expression='TRUE); DROP TABLE orders; --';
  const report=await project(binding);
  expect(report.residuals.some(x=>x.path.endsWith('/indexes/3'))).toBe(true);
  expect(report.residuals.some(x=>x.path.endsWith('/indexes/5'))).toBe(true);
  expect(report.candidate).not.toContain('DROP TABLE');
  expect((await project(binding,'strict')).candidate).toBeUndefined();
});

test('@covers US-047-AC9: identifiers that PostgreSQL would truncate are refused',async()=>{
  const binding=structuredClone(fixture.binding);
  binding.extensions['umf.binding'].indexes[0].name='x'.repeat(64);
  await expect(project(binding,'report')).rejects.toThrow('Identifier');
});
