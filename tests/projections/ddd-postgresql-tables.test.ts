import {expect,test} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {getPostgresqlSource,projectDddTablesToPostgresql,type Document} from '../../src';

const fixture=await Bun.file('fixtures/projections/ddd-postgresql-tables/case.json').json();
const project=(binding=fixture.binding,policy=fixture.policy,loss:'strict'|'report'='report')=>projectDddTablesToPostgresql(fixture.logical as Document,binding as Document,backend,policy,loss);

test('@covers US-048-AC1 @covers US-048-AC3 @covers US-048-AC5: order graph tables, JSONB and LIST partition pass the adapter',async()=>{
  const strict=await project(fixture.binding,fixture.policy,'strict');
  expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
  const report=await project();
  expect(report.status).toBe('reported');expect(report.residuals).toHaveLength(25);
  expect(report.residuals.filter(x=>x.path.startsWith('/extensions/umf.binding/indexes/'))).toHaveLength(8);
  expect(report.candidate?.match(/CREATE TABLE/g)).toHaveLength(5);
  expect(report.candidate).toContain('PARTITION BY LIST ("tenant")');
  expect(report.candidate).toContain('PARTITION OF "sales"."orders" DEFAULT');
  expect(report.candidate).toContain('jsonb_typeof("payload")');
  expect(getPostgresqlSource(report.targetArchive!)).toBe(report.candidate!);
  expect(report.logical).toEqual(fixture.logical);expect(report.binding).toEqual(fixture.binding);
});

test('@covers US-048-AC3 @covers US-048-AC4: stale and unknown bindings block; unqualified type cannot inject SQL',async()=>{
  const stale=structuredClone(fixture.binding);stale.extensions['umf.binding'].logical.documentId='other';
  await expect(project(stale)).rejects.toThrow();
  const unknown=structuredClone(fixture.binding);unknown.extensions['umf.binding'].unrecognized=true;
  await expect(project(unknown)).rejects.toThrow();
  const policy=structuredClone(fixture.policy);policy.fieldTypes[0].sqlType='bigint); DROP SCHEMA sales CASCADE;--';
  const report=await project(fixture.binding,policy);
  expect(report.residuals.some(x=>x.reason.includes('No safe explicit PostgreSQL scalar'))).toBe(true);
  expect(report.candidate).not.toContain('DROP SCHEMA');
  const duplicate=structuredClone(fixture.binding);duplicate.extensions['umf.binding'].elements[1].table='sales.orders';
  await expect(project(duplicate)).rejects.toThrow();
});

test('@covers US-048-AC3 @covers US-048-AC4: partition and embedded path losses are named',async()=>{
  const policy=structuredClone(fixture.policy);policy.partitionFamilies=[];
  const report=await project(fixture.binding,policy);
  expect(report.residuals.some(x=>x.path.endsWith('/partition'))).toBe(true);
  expect(report.candidate).not.toContain('PARTITION BY LIST');
  expect(report.residuals.some(x=>x.reason.includes('embedded path presence'))).toBe(true);
  expect(report.residuals.some(x=>x.reason.includes('does not emit a primary or unique key'))).toBe(true);
});
