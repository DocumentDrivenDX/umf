// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {
 declareCoreElementKind,getAvroFieldMetadata,importAvroSchema,
 classifyAvroField,classifyAvroRecord,projectFieldToAvro,projectRecordToAvro,
 inspectFieldClassification,verifyFieldClassificationInspection,
 inspectFieldProjection,verifyFieldProjectionInspection,
 inspectRecordProjection,verifyRecordProjectionInspection,
 inspectStructuredClassification,verifyStructuredClassificationInspection,
} from '../../src/index-node-v4';
import {CURRENT_CORE_VERSION,type Document} from '../../src/model/types';

test('Rust V4 common classification report recomputes one Avro Field receipt and rejects tampering',()=>{
 const nativeSource='{"type":"record","name":"Order","fields":[{"name":"id","type":"long"}]}\n';
 const source=importAvroSchema(nativeSource,{id:'avro-classification'});
 const field=getAvroFieldMetadata(source)[0]!;
 const receipt=classifyAvroField(source,{column:field.element.id,nativeSource,mode:'strict'});
 const report=inspectFieldClassification(receipt);
 expect(report.status).toBe('classified');
 expect(verifyFieldClassificationInspection(report)).toEqual(report);
 const changed=structuredClone(receipt);changed.mapping.nativePath='/forged';
 expect(()=>inspectFieldClassification(changed)).toThrow();
});

test('Rust V4 common Field and Record projection reports recompute Avro receipts',async()=>{
 const source:Document={umf:CURRENT_CORE_VERSION,id:'field-report',vocabularies:{},modules:[{id:'m',namespace:'sales',elements:[{id:'e',name:'value',extensions:{}}]}]};
 const author=declareCoreElementKind(source,{module:'m',element:'e'},'field');
 const fieldReceipt=projectFieldToAvro(author,{id:'field-target',namespace:'sales',recordName:'Example',fieldName:'value',nativeType:'string',mode:'strict'});
 const fieldReport=await inspectFieldProjection(fieldReceipt);
 expect(fieldReport.status).toBe('projected');
 expect(await verifyFieldProjectionInspection(fieldReport)).toEqual(fieldReport);

 const recordSource:Document={umf:CURRENT_CORE_VERSION,id:'record-report',vocabularies:{},modules:[{id:'m',namespace:'sales',elements:[{id:'r',name:'Orders',kind:'record',extensions:{},references:[{role:'member',module:'m',element:'id'}]},{id:'id',name:'id',kind:'field',scalarType:'integer',extensions:{}}]}]};
 const recordAuthor=declareCoreElementKind(recordSource,{module:'m',element:'r'},'record');
 const fieldAuthor=declareCoreElementKind(recordSource,{module:'m',element:'id'},'field');
 const recordReceipt=projectRecordToAvro(recordAuthor,{id:'record-target',namespace:'sales',recordName:'Orders',mode:'strict',fields:[{author:fieldAuthor,fieldName:'id',nativeType:'long'}]});
 const recordReport=await inspectRecordProjection(recordReceipt);
 expect(recordReport.status).toBe('projected');
 expect(await verifyRecordProjectionInspection(recordReport)).toEqual(recordReport);
 const changed=structuredClone(recordReceipt);changed.mappings[0]!.nativePath='/forged';
 await expect(inspectRecordProjection(changed)).rejects.toThrow();
});

test('Rust V4 structured classification report recomputes a native Record receipt',async()=>{
 const nativeSource='{"type":"record","name":"Order","fields":[{"name":"id","type":"long"}]}\n';
 const source=importAvroSchema(nativeSource,{id:'avro-record-classification'});
 const receipt=classifyAvroRecord(source,{recordModule:'avro.records',recordId:'Order',mode:'strict',nativeSource,path:''});
 const report=await inspectStructuredClassification(receipt);
 expect(report.status).toBe('classified');
 expect(await verifyStructuredClassificationInspection(report)).toEqual(report);
 const changed=structuredClone(receipt);changed.mappings[0]!.nativePath='/forged';
 await expect(inspectStructuredClassification(changed)).rejects.toThrow();
});
