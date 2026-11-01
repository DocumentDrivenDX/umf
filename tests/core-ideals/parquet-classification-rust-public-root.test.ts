// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyParquetRecord,recoverParquetRecordBytes,classifyParquetRecordType,recoverParquetRecordTypeBytes} from '../../src/index-node-v4';
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

test('Node V4 Parquet Record classifier admits nested unannotated struct groups through Rust',async()=>{
 const bytes=new Uint8Array(await Bun.file('fixtures/parquet/nullability/struct-1-1-child-null-0.parquet').arrayBuffer());
 const source=importParquetSchema(bytes,{id:'nested-struct'});
 const {inspectParquetContainers}=await import('../../src/adapters/parquet/containers');
 const view=inspectParquetContainers(source),schema=(view.metadata as any).schema as any[],containers=view.containers??[];
 const index=schema.findIndex((entry,i)=>i>0&&entry.num_children>0&&entry.type===undefined&&entry.logicalType===undefined&&entry.converted_type===undefined&&!containers.some(c=>c.index===i||c.repeatedIndex===i&&(c.kind==='map'||c.layout==='three-level')));
 expect(index).toBeGreaterThan(0);
 const receipt=classifyParquetRecord(source,{index,recordModule:'nested-records',recordId:'nested',mode:'strict'});
 expect(receipt.status).toBe('classified');expect(receipt.mappings.some(mapping=>mapping.kind==='record'&&mapping.nativePath==='/schema/'+index)).toBe(true);
 expect(recoverParquetRecordBytes(receipt,receipt.target!)).toEqual(bytes);
 const typed=classifyParquetRecordType(source,{index,recordModule:'nested-record-types',recordId:'nested-type',mode:'strict'});
 expect(typed.status).toBe('classified');expect(typed.mappings.some(mapping=>mapping.kind==='record-type'&&mapping.nativePath==='/schema/'+index)).toBe(true);
 expect(recoverParquetRecordTypeBytes(typed,typed.target!)).toEqual(bytes);
},60000);
