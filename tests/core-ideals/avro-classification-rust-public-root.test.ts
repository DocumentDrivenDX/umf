// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyAvroField,recoverAvroFieldBundle,classifyAvroRecord,recoverAvroRecordBundle} from '../../src/index-node-v4';
import {avroFieldCases} from '../../scripts/core-ideals/avro-field-cases';
import {importAvroSchema,getAvroFieldMetadata} from '../../src/adapters/avro';
import {avroRecords} from '../../src/core-ideals/avro-records';

test('Node V4 Avro Field and Record classifier defaults retain and recover exact bundles through Rust',()=>{
 const c=avroFieldCases[0]!,source=importAvroSchema(c.schema,{id:c.id,dependencies:c.dependencies});
 const field=getAvroFieldMetadata(source).find(item=>item.element.name==='items')!;
 const fieldReceipt=classifyAvroField(source,{column:field.element.id,nativeSource:c.schema,dependencies:c.dependencies,mode:'strict'});
 expect(fieldReceipt.status).toBe('classified');
 expect(fieldReceipt.target!.modules.find(module=>module.id==='avro.fields')!.elements.find(item=>item.id===field.element.id)!.kind).toBe('field');
 expect(recoverAvroFieldBundle(fieldReceipt,fieldReceipt.target!)).toEqual({schema:c.schema,dependencies:c.dependencies});
 const record=avroRecords(source)[0]!;
 const recordReceipt=classifyAvroRecord(source,{recordModule:'records',recordId:'selected',path:record.path,...(record.dependencyId?{dependencyId:record.dependencyId}:{}),nativeSource:c.schema,dependencies:c.dependencies,mode:'strict'});
 expect(recordReceipt.status).toBe('classified');
 expect(recordReceipt.target!.modules.at(-1)!.elements[0]!.kind).toBe('record');
 expect(recoverAvroRecordBundle(recordReceipt,recordReceipt.target!)).toEqual({schema:c.schema,dependencies:c.dependencies});
});

test('Node V4 Avro Field and Record refuse unresolved identities and stale recovery targets',()=>{
 const c=avroFieldCases[0]!,source=importAvroSchema(c.schema,{id:c.id,dependencies:c.dependencies});
 expect(()=>classifyAvroField(source,{column:'missing',nativeSource:c.schema,dependencies:c.dependencies,mode:'strict'})).toThrow();
 const field=getAvroFieldMetadata(source).find(item=>item.element.name==='items')!;
 const fieldReceipt=classifyAvroField(source,{column:field.element.id,nativeSource:c.schema,dependencies:c.dependencies,mode:'strict'});
 const alteredField=structuredClone(fieldReceipt.target!);alteredField.future=true;
 expect(()=>recoverAvroFieldBundle(fieldReceipt,alteredField)).toThrow();
 const record=avroRecords(source)[0]!;
 expect(()=>classifyAvroRecord(source,{recordModule:'records',recordId:'selected',path:'/missing',nativeSource:c.schema,dependencies:c.dependencies,mode:'strict'})).toThrow();
 const recordReceipt=classifyAvroRecord(source,{recordModule:'records',recordId:'selected',path:record.path,nativeSource:c.schema,dependencies:c.dependencies,mode:'strict'});
 const alteredRecord=structuredClone(recordReceipt.target!);alteredRecord.future=true;
 expect(()=>recoverAvroRecordBundle(recordReceipt,alteredRecord)).toThrow();
});
