// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyParquetCardinality,verifyParquetCardinalityClassification,recoverParquetCardinalityBytes} from '../../src/index-node-v4';
import {importParquetSchema} from '../../src/adapters/parquet/field-metadata';

test('Node V4 Parquet cardinality classify, verify, recover, and refuse through Rust',async()=>{
 const bytes=new Uint8Array(await Bun.file('fixtures/parquet/cardinality/array-nested-1.parquet').arrayBuffer());
 const source=importParquetSchema(bytes,{id:'cardinality-native'});
 const request={index:1,identity:{module:'logical',element:'value'},profile:'present-value-schema',mode:'strict'} as const;
 const receipt=classifyParquetCardinality(source,request);
 expect(receipt.status).toBe('classified');expect(receipt.mapping.cardinality).toBe('array');
 expect(verifyParquetCardinalityClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverParquetCardinalityBytes(receipt,receipt.target!)).toEqual(bytes);
 const refused=classifyParquetCardinality(source,{...request,profile:'unresolved'});
 expect(refused.status).toBe('blocked');expect(refused.mapping.cardinality).toBe('unspecified');
 expect(()=>verifyParquetCardinalityClassification(refused,source)).toThrow();
},60000);
