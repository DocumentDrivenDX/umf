// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {exportIcebergTable,importIcebergTable,projectBindingToIceberg,type Document} from '../../src/index-node-v4';
const fixture=await Bun.file('fixtures/binding/iceberg/case.json').json();
const source=await Bun.file(fixture.native).text();
const native=importIcebergTable(source,{id:'iceberg-native'});
const logical=fixture.logical as Document,binding=fixture.binding as Document;
test('public Iceberg binding projection proposes an explicit sort order and preserves source; strict mode refuses its approximation',()=>{
 const report=projectBindingToIceberg(logical,binding,native,'report');
 expect(report.status).toBe('reported');expect(report.residuals).toHaveLength(1);
 expect(exportIcebergTable(report.nativeArchive)).toBe(source);
 const candidate=JSON.parse(report.candidate!);
 expect(candidate['default-sort-order-id']).toBe(4);
 expect(candidate['sort-orders'].at(-1).fields).toEqual([{transform:'identity','source-id':2,direction:'asc','null-order':'nulls-first'}]);
 const strict=projectBindingToIceberg(logical,binding,native,'strict');
 expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
 expect(exportIcebergTable(strict.nativeArchive)).toBe(source);
});
