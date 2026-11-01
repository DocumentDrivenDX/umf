// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyTableSpecField,classifyTableSpecNullability,declareCoreNullability,importTableSpec,recoverTableSpecNullabilitySource,verifyTableSpecNullabilityClassification} from '../../src/index-node-v4';

const sourceText='{"version":"1.0","table_name":"Vectors","columns":[{"name":"value","data_type":"INTEGER","nullable":{"provider":false},"future_shape":{"unknown":9007199254740993}}]}\n';
const request={column:0,mode:'strict',profile:'runtime-model',context:'provider',carrier:'null-value'} as const;

test('Node V4 routes TableSpec Nullability classification, verification, recovery and refusal through Rust',()=>{
 const imported=importTableSpec(sourceText,{id:'nullability-public-root',format:'json'});
 const source=classifyTableSpecField(imported,{column:0,mode:'strict'}).target!;
 const receipt=classifyTableSpecNullability(source,request);
 expect(receipt.status).toBe('classified');
 expect(receipt.mapping.nullability).toBe('required');
 expect(receipt.target!.modules[0]!.elements[0]!.nullability).toBe('required');
 expect(verifyTableSpecNullabilityClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverTableSpecNullabilitySource(receipt,receipt.target!)).toBe(sourceText);

 const authored=declareCoreNullability(source,{module:'table',element:'column:0'},'absent-allowed');
 const refused=classifyTableSpecNullability(authored.target,{...request,mode:'report',author:authored});
 expect(refused.status).toBe('blocked');
 expect(refused.target).toBeUndefined();
 expect(refused.diagnostics.some(diagnostic=>diagnostic.code==='TABLESPEC_NULLABILITY_CONFLICT')).toBe(true);
});
