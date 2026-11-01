// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {projectKeysToAvro,verifyKeysAvroProjection,recoverKeysAvroIdeal} from '../../src/index-node-v4';
import {avroKeyProjectionCases} from '../../scripts/core-ideals/key-avro-projection-cases';

test('Node V4 projects, verifies and recovers authored Key meaning through Rust',()=>{
 const row=avroKeyProjectionCases().find(x=>x.name==='primary-report')!;
 const result=projectKeysToAvro(row.source,row.authors,row.request);
 expect(result.status).toBe('projected');expect(result.mappings).toHaveLength(row.authors.length);
 expect(verifyKeysAvroProjection(result,result.target!)).toEqual(result);
 expect(recoverKeysAvroIdeal(result,result.target!)).toEqual(row.source);
});
test('Node V4 blocks a column carrier with conflicting scalar family through Rust',()=>{
 const row=avroKeyProjectionCases().find(x=>x.name==='family-conflict')!;
 const result=projectKeysToAvro(row.source,row.authors,row.request);
 expect(result.status).toBe('blocked');expect(result.residuals.some(x=>x.outcome==='not-expressible')).toBe(true);
});
