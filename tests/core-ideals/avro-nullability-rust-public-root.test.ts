// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {projectNullabilityToAvro,recoverNullabilityFromAvro} from '../../src/index-node-v4';
import {avroNullabilityProjectionCases} from '../../scripts/core-ideals/nullability-avro-projection-cases';
import {exportAvroSchema} from '../../src/adapters/avro';

test('Node V4 authored Avro nullability projection and recovery run through Rust',()=>{
 const c=avroNullabilityProjectionCases().find(item=>item.nativeType==='int'&&item.label==='required')!;
 const before=structuredClone(c.author),report=projectNullabilityToAvro(c.author,c.request);
 expect(c.author).toEqual(before);expect(report.status).toBe('projected');expect(report.mapping).toMatchObject({nullability:'required',encoding:'non-null',outcome:'exact'});
 const text=exportAvroSchema(report.target!);expect(recoverNullabilityFromAvro(report,text)).toEqual(c.author.target);
});

test('Node V4 Avro nullability refuses a required null-only carrier through Rust',()=>{
 const c=avroNullabilityProjectionCases()[0]!;const report=projectNullabilityToAvro(c.author,c.request);
 expect(report.status).toBe('blocked');expect(report.residuals.some(item=>item.outcome==='not-expressible')).toBe(true);
});
