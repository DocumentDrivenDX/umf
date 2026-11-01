// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyTableSpecField,verifyTableSpecFieldClassification,importTableSpec} from '../../src/index-node-v4';
import {declareCoreElementKind} from '../../src/model/field-kind';

const sourceText='{"version":"1.0","table_name":"Orders","columns":[{"name":"id","data_type":"FUTURE","vendor":{"keep":true}}]}';

test('Node V4 classifies a checked TableSpec column and refuses conflicting author intent',()=>{
 const source=importTableSpec(sourceText,{id:'orders',format:'json'});
 const receipt=classifyTableSpecField(source,{column:0,mode:'strict'});
 expect(receipt.status).toBe('classified');
 expect(receipt.mapping.nativeFragment).toBeDefined();
 expect(receipt.target!.modules[0]!.elements[0]!.kind).toBe('field');
 expect(receipt.target!.modules[0]!.elements[0]!.scalarType).toBeUndefined();
 expect(verifyTableSpecFieldClassification(receipt,receipt.target!)).toEqual(receipt);

 const author=declareCoreElementKind(source,{module:'table',element:'column:0'},'record');
 const refused=classifyTableSpecField(author.target,{column:0,mode:'report',author});
 expect(refused.status).toBe('blocked');
 expect(refused.target).toBeUndefined();
 expect(refused.residuals[0]!.value).toBe('record');
});
