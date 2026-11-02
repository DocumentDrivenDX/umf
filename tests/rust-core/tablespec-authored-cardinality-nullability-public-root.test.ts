// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {CURRENT_CORE_VERSION,declareCoreCardinality,type Document} from '../../src/index-node-v4';
import {nullabilityTableSpecAuthor} from '../../scripts/core-ideals/nullability-tablespec-projection-cases';
import {exportTableSpec,projectCardinalityToTableSpec,recoverCardinalityFromTableSpec,projectNullabilityToTableSpec,recoverNullabilityFromTableSpec} from '../../src/index-node-v4';

test('Node V4 routes authored TableSpec Cardinality projection, refusal and recovery through Rust',()=>{
 const source:Document={umf:CURRENT_CORE_VERSION,id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'value',name:'value',kind:'field',extensions:{}}]}]};
 const author=declareCoreCardinality(source,{module:'m',element:'value'},{cardinality:'one'});
 const request={id:'native',tableName:'Shapes',columnName:'value',nativeType:'TEXT',dimension:null,profile:'generated-json',mode:'strict',requireExactValues:false} as const;
 const result=projectCardinalityToTableSpec(author,request);
 expect(result.status).toBe('projected');
 expect(recoverCardinalityFromTableSpec(result,exportTableSpec(result.target!))).toEqual(author.target);
 const refused=projectCardinalityToTableSpec(author,{...request,columnName:'different'});
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();
});

test('Node V4 routes authored TableSpec Nullability projection, refusal and recovery through Rust',()=>{
 const author=nullabilityTableSpecAuthor();
 const request={id:'native',tableName:'Orders',columnName:'value',nativeType:'VARCHAR',mode:'strict',profile:'runtime-model',context:null,carrier:'null-value'} as const;
 const result=projectNullabilityToTableSpec(author,request);
 expect(result.status).toBe('projected');
 expect(recoverNullabilityFromTableSpec(result,exportTableSpec(result.target!))).toEqual(author.target);
 const refused=projectNullabilityToTableSpec(author,{...request,columnName:'different'});
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();
});
