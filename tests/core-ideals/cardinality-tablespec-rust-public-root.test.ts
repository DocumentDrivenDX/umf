// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyTableSpecCardinality,classifyTableSpecField,declareCoreCardinality,importTableSpec,recoverTableSpecCardinalitySource,verifyTableSpecCardinalityClassification} from '../../src/index-node-v4';

const sourceText='{"version":"1.0","table_name":"Vectors","columns":[{"name":"value","data_type":"EMBEDDING","dimension":3,"future_shape":{"unknown":9007199254740993}}]}\n';
const request={column:0,mode:'strict',profile:'runtime-model'} as const;

test('Node V4 routes TableSpec Cardinality classification, verification and recovery through Rust',()=>{
 const imported=importTableSpec(sourceText,{id:'cardinality-public-root',format:'json'});
 const source=classifyTableSpecField(imported,{column:0,mode:'strict'}).target!;
 const receipt=classifyTableSpecCardinality(source,request);
 expect(receipt.status).toBe('classified');
 expect(receipt.mapping.cardinality).toBe('array');
 expect(receipt.target!.modules[0]!.elements[0]!.cardinality).toBe('array');
 expect(verifyTableSpecCardinalityClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverTableSpecCardinalitySource(receipt,receipt.target!)).toBe(sourceText);

 const authored=declareCoreCardinality(source,{module:'table',element:'column:0'},{cardinality:'one'});
 const refused=classifyTableSpecCardinality(authored.target,{...request,mode:'report',author:authored});
 expect(refused.status).toBe('blocked');
 expect(refused.target).toBeUndefined();
 expect(refused.diagnostics.some(diagnostic=>diagnostic.code==='TABLESPEC_CARDINALITY_CONFLICT')).toBe(true);
});
