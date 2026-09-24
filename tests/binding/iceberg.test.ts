import {expect,test} from 'bun:test';
import {exportIcebergTable,importIcebergTable,inspectIcebergTableContext,projectBindingToIceberg,type Document} from '../../src';

const fixture=await Bun.file('fixtures/binding/iceberg/case.json').json();
const source=await Bun.file(fixture.native).text();
const native=importIcebergTable(source,{id:'iceberg-native'});
const project=(binding=fixture.binding,policy:'strict'|'report'='report')=>projectBindingToIceberg(fixture.logical as Document,binding as Document,native,policy);

test('@covers US-046-AC4 @covers US-046-AC5 @covers US-046-AC7 @covers US-047-AC4 @covers US-047-AC5 @covers US-047-AC7: sort order is an explicit approximation and native source recovers',()=>{
  const strict=project(fixture.binding,'strict');
  expect(strict.status).toBe('blocked');
  expect(strict.candidate).toBeUndefined();
  const report=project();
  expect(report.status).toBe('reported');
  expect(report.residuals).toHaveLength(1);
  expect(exportIcebergTable(report.nativeArchive)).toBe(source);
  const candidate=JSON.parse(report.candidate!);
  expect(candidate['default-sort-order-id']).toBe(4);
  expect(candidate['sort-orders'].at(-1).fields).toEqual([{transform:'identity','source-id':2,direction:'asc','null-order':'nulls-first'}]);
  expect(inspectIcebergTableContext(importIcebergTable(report.candidate!,{id:'candidate'})).status).toBe('checked');
});

test('@covers US-046-AC3 @covers US-047-AC8: unsupported index and missing storage column remain residuals',()=>{
  const binding=structuredClone(fixture.binding);
  binding.extensions['umf.binding'].indexes.push({name:'gin',kind:'gin',on:[{field:{module:'data',element:'sort_key'}}],unique:false});
  binding.extensions['umf.binding'].fields[0].column='missing';
  const report=project(binding);
  expect(report.residuals.some(x=>x.path.endsWith('/indexes/1'))).toBe(true);
  expect(report.residuals.some(x=>x.path.endsWith('/fields/0'))).toBe(true);
  expect(project(binding,'strict').candidate).toBeUndefined();
});
