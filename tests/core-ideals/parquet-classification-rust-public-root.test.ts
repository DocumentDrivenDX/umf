// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyParquetRecord,recoverParquetRecordBytes} from '../../src/index-node-v4';
import {importParquetSchema} from '../../src/adapters/parquet/field-metadata';

test('Node V4 Parquet Record classifier defaults classify and recover source bytes through Rust',async()=>{
 const bytes=new Uint8Array(await Bun.file('fixtures/parquet/containers/list-tuple.parquet').arrayBuffer());
 const source=importParquetSchema(bytes,{id:'list-tuple'});
 const receipt=classifyParquetRecord(source,{index:0,recordModule:'records',recordId:'root',mode:'strict'});
 expect(receipt.status).toBe('classified');
 expect(receipt.target!.modules.at(-1)!.elements[0]!.kind).toBe('record');
 expect(recoverParquetRecordBytes(receipt,receipt.target!)).toEqual(bytes);
 expect(()=>classifyParquetRecord(source,{index:999,recordModule:'records',recordId:'missing',mode:'strict'})).toThrow();
},30000);
