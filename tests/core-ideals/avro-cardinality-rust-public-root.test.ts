// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyAvroCardinality,verifyAvroCardinalityClassification,recoverAvroCardinalityBundle,classifyAvroRecordType,recoverAvroRecordTypeBundle,classifyParquetRecordType,recoverParquetRecordTypeBytes} from '../../src/index-node-v4';
import type {AvroCardinalityRequest} from '../../src/core-ideals/avro-cardinality-types';
import {avroAvailabilitySource} from '../../scripts/core-ideals/nullability-avro-cases';
import {avroRecordTypeCases} from '../../scripts/core-ideals/avro-record-type-cases';
import {importAvroSchema,getAvroFieldMetadata} from '../../src/adapters/avro';
import {importParquetSchema,getParquetFieldMetadata} from '../../src/adapters/parquet/field-metadata';

test('Node V4 core-ideal defaults classify, verify, recover and refuse through Rust',async()=>{
 const schema=JSON.stringify({type:'record',name:'cardinality.Example',fields:[{name:'value',type:'long'}]});
 const prepared=avroAvailabilitySource(schema,[],'cardinality.Example');
 const request:AvroCardinalityRequest={column:prepared.column,nativeSource:schema,identity:{module:'logical',element:'value'},profile:'present-non-null-schema',mode:'strict'};
 const receipt=classifyAvroCardinality(prepared.source,request);
 expect(receipt.status).toBe('classified');
 expect(verifyAvroCardinalityClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverAvroCardinalityBundle(receipt,receipt.target!)).toEqual({schema:request.nativeSource,dependencies:request.dependencies??[]});
 expect(classifyAvroCardinality(prepared.source,{...request,profile:'unresolved'}).status).toBe('blocked');
 const avroCase=avroRecordTypeCases.find(row=>row.id==='direct')!;
 const avroSource=importAvroSchema(avroCase.schema,{id:avroCase.id,dependencies:avroCase.dependencies});
 const field=getAvroFieldMetadata(avroSource).find(row=>row.element.name==='child')!;
 const record=classifyAvroRecordType(avroSource,{column:field.element.id,nativeSource:avroCase.schema,dependencies:avroCase.dependencies,mode:'strict',recordModule:'records',recordId:'type'});
 expect(record.status).toBe('classified');
 expect(recoverAvroRecordTypeBundle(record,record.target!)).toEqual({schema:avroCase.schema,dependencies:avroCase.dependencies??[]});
 const parquetBytes=new Uint8Array(await Bun.file('fixtures/parquet/containers/list-tuple.parquet').arrayBuffer());
 const parquetSource=importParquetSchema(parquetBytes,{id:'list-tuple'});
 const parquet=classifyParquetRecordType(parquetSource,{index:2,recordModule:'records',recordId:'type',mode:'strict'});
 expect(parquet.status).toBe('classified');
 expect(recoverParquetRecordTypeBytes(parquet,parquet.target!)).toEqual(parquetBytes);
 const invalidBytes=new Uint8Array(await Bun.file('fixtures/parquet/containers/list-three-element.parquet').arrayBuffer());
 const invalidSource=importParquetSchema(invalidBytes,{id:'list-three-element'});
 expect(classifyParquetRecordType(invalidSource,{index:1,recordModule:'records',recordId:'type',mode:'strict'}).status).toBe('blocked');
});
