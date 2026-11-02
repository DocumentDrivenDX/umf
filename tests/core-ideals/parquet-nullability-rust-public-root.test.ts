// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyParquetNullability,verifyParquetNullabilityClassification,recoverParquetNullabilityBytes,declareCoreElementKind,importParquetSchema} from '../../src/index-node-v4';

test('Node V4 Parquet nullability classifies a row leaf and retains its physical source through Rust',async()=>{
 const bytes=new Uint8Array(await Bun.file('fixtures/parquet/nullability/scalar-0-0-present-1.parquet').arrayBuffer());
 const source=declareCoreElementKind(importParquetSchema(bytes,{id:'nullability'}),{module:'parquet.fields',element:'schema:1'},'field').target;
 const request={index:1,mode:'strict',scope:'row-leaf-value',carrier:'definition-level'} as const;
 const receipt=classifyParquetNullability(source,request);
 expect(receipt.status).toBe('classified');
 expect(receipt.mapping.interpretation).toBe('declared');
 expect(verifyParquetNullabilityClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverParquetNullabilityBytes(receipt,receipt.target!)).toEqual(bytes);
},60000);

test('Node V4 Parquet nullability refuses write-input inference and stale targets',async()=>{
 const bytes=new Uint8Array(await Bun.file('fixtures/parquet/nullability/scalar-0-0-present-1.parquet').arrayBuffer());
 const source=declareCoreElementKind(importParquetSchema(bytes,{id:'nullability-refusal'}),{module:'parquet.fields',element:'schema:1'},'field').target;
 const blocked=classifyParquetNullability(source,{index:1,mode:'strict',scope:'write-input',carrier:'definition-level'});
 expect(blocked.status).toBe('blocked');
 expect(blocked.diagnostics.some(d=>d.severity==='error')).toBe(true);
 const normal=classifyParquetNullability(source,{index:1,mode:'strict',scope:'row-leaf-value',carrier:'definition-level'});
 const stale=structuredClone(normal.target!);stale.future=true;
 expect(()=>verifyParquetNullabilityClassification(normal,stale)).toThrow();
},60000);
