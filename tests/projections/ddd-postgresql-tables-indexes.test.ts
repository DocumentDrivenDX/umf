import {expect,test} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {getPostgresqlSource,projectDddTablesAndIndexesToPostgresql,type Document} from '../../src';

const fixture=await Bun.file('fixtures/projections/ddd-postgresql-tables/case.json').json();
const project=(binding=fixture.binding,loss:'strict'|'report'='report')=>projectDddTablesAndIndexesToPostgresql(fixture.logical as Document,binding as Document,backend,fixture.policy,loss);

test('@covers US-048-AC1 @covers US-048-AC3 @covers US-047-AC3: qualified DDD tables carry only native-valid bound indexes',async()=>{
  const strict=await project(fixture.binding,'strict');
  expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
  const report=await project();
  expect(report.status).toBe('reported');
  expect(report.candidate?.match(/CREATE (?:UNIQUE )?INDEX/g)).toHaveLength(4);
  expect(report.candidate).toContain('ON "sales"."orders" USING btree');
  expect(report.candidate).toContain('ON "sales"."orders" USING hash');
  expect(report.candidate).toContain('"payload" #>> ARRAY[\'customer\',\'region\']::text[]');
  expect(report.residuals.filter(x=>x.path.startsWith('/extensions/umf.binding/indexes/')).map(x=>x.path)).toEqual([2,3,6,7].map(i=>`/extensions/umf.binding/indexes/${i}`));
  expect(getPostgresqlSource(report.targetArchive!)).toBe(report.candidate!);
  expect(report.logical).toEqual(fixture.logical);expect(report.binding).toEqual(fixture.binding);
});

test('@covers US-048-AC3 @covers US-047-AC9: unknown binding and invalid index evidence never produce DDL',async()=>{
  const unknown=structuredClone(fixture.binding);unknown.extensions['umf.binding'].unrecognized=true;
  await expect(project(unknown)).rejects.toThrow();
  const invalid=structuredClone(fixture.binding);invalid.extensions['umf.binding'].indexes[0].on[0].field.field='missing';
  await expect(project(invalid)).rejects.toThrow('BINDING_INDEX');
});
