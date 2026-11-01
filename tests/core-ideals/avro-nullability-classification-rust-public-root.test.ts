// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import * as u from '../../src/index-node-v4';
import type {AvroNullabilityRequest} from '../../src/core-ideals/nullability-avro';

function input() {
  const nativeSource='{"type":"record","name":"Example","fields":[{"name":"id","type":["null","string"]}]}';
  const imported=u.importAvroSchema(nativeSource,{id:'nullability-native'});
  const column=imported.modules.find(m=>m.id==='avro.fields')!.elements[0]!.id;
  const source=u.declareCoreElementKind(imported,{module:'avro.fields',element:column},'field').target!;
  const request:AvroNullabilityRequest={column,nativeSource,mode:'strict',scope:'underlying-field-value',carrier:'avro-null'};
  return {source,column,request};
}

test('Node V4 classifies an Avro null carrier against a matching authored availability receipt',()=>{
  const {source,column,request}=input();
  const author=u.declareCoreNullability(source,{module:'avro.fields',element:column},'absent-allowed');
  const receipt=u.classifyAvroNullability(author.target!,{...request,author});
  expect(receipt.status).toBe('classified');
  expect(receipt.mapping.nullability).toBe('absent-allowed');
  expect(u.verifyAvroNullabilityClassification(receipt,receipt.target!)).toEqual(receipt);
  expect(u.recoverAvroNullabilityBundle(receipt,receipt.target!)).toEqual({schema:request.nativeSource,dependencies:[]});
});

test('Node V4 refuses to map write-input omission to an Avro null value',()=>{
  const {source,request}=input();
  const receipt=u.classifyAvroNullability(source,{...request,scope:'write-input'});
  expect(receipt.status).toBe('blocked');
  expect(receipt.diagnostics.some(d=>d.code==='AVRO_NULLABILITY_UNRESOLVED')).toBe(true);
});
