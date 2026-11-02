// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {projectFieldToTableSpec,recoverFieldFromTableSpec,projectRecordToTableSpec,recoverRecordFromTableSpec,exportTableSpec} from '../../src/index-node-v4';
import {recordCase} from '../../scripts/core-ideals/record-tablespec-cases';

test('V4 authored Field TableSpec projection recovers its source and refuses strict loss',()=>{
 const fixture=recordCase();
 const author=fixture.request.fields.find(f=>f.columnName==='id')!.author;
 const request={id:'native-id',tableName:'Orders',columnName:'id',nativeType:'INTEGER' as const,mode:'report' as const};
 const receipt=projectFieldToTableSpec(author,request);
 expect(receipt.status).toBe('projected');
 expect(recoverFieldFromTableSpec(receipt,exportTableSpec(receipt.target!))).toEqual(author.target);
 const refusal=projectFieldToTableSpec(author,{...request,columnName:'renamed',mode:'strict'});
 expect(refusal.status).toBe('blocked');
 expect(refusal.target).toBeUndefined();
});

test('V4 authored Record TableSpec projection recovers source and refuses missing member bindings',()=>{
 const fixture=recordCase();
 const request={...fixture.request,mode:'report' as const};
 const receipt=projectRecordToTableSpec(fixture.author,request);
 expect(receipt.status).toBe('projected');
 expect(exportTableSpec(receipt.target!)).toContain('"description":"Order record"');
 expect(recoverRecordFromTableSpec(receipt,exportTableSpec(receipt.target!))).toEqual(fixture.author.target);
 const missing={...request,fields:[]};
 const refusal=projectRecordToTableSpec(fixture.author,missing);
 expect(refusal.status).toBe('blocked');
 expect(refusal.target).toBeUndefined();
});
