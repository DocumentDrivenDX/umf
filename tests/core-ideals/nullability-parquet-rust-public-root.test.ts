// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {declareCoreNullability,exportParquetCapture,projectNullabilityToParquet,recoverNullabilityFromParquet,type Document} from '../../src/index-node-v4';

test('Node V4 authors and recovers a Parquet nullability projection through Rust',()=>{
 const source:Document={umf:'0.10.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'f',kind:'field',extensions:{}}]}]};
 const author=declareCoreNullability(source,{module:'m',element:'f'},'required');
 const request:Parameters<typeof projectNullabilityToParquet>[1]={id:'projection',recordName:'Example',fieldName:'value',nativeType:'int64',mode:'strict',scope:'row-leaf-value',carrier:'definition-level'};
 const receipt=projectNullabilityToParquet(author,request);
 expect(receipt.status).toBe('projected');expect(receipt.mapping.nullability).toBe('required');
 expect(recoverNullabilityFromParquet(receipt,exportParquetCapture(receipt.target!))).toEqual(author.target);
 const refused=projectNullabilityToParquet(author,{...request,scope:'write-input'});
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();
});
