// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {projectFacetsToAvro,recoverFacetsFromAvro} from '../../src/index-node-v4';
import {facetsAvroProjectionCases} from '../../scripts/core-ideals/facets-avro-projection-cases';

test('Node V4 projects and recovers authored integer facets through Rust',()=>{
 const row=facetsAvroProjectionCases().find(x=>x.id==='int-32-true-declared-schema-native-type-strict')!;
 const report=projectFacetsToAvro(row.author,row.request);
 expect(report.status).toBe('projected');expect(report.mapping.facets.integerWidth).toEqual({bits:32,signed:true});
 expect(recoverFacetsFromAvro(report,report.nativeSchema!)).toEqual(row.author.target);
});
test('Node V4 strictly refuses an integer facet the carrier cannot enforce',()=>{
 const row=facetsAvroProjectionCases().find(x=>x.id==='int-8-true-declared-schema-native-type-strict')!;
 const report=projectFacetsToAvro(row.author,row.request);
 expect(report.status).toBe('blocked');expect(report.residuals.some(x=>x.outcome==='not-expressible')).toBe(true);
});
