// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {declareCoreCardinality,exportParquetCapture,projectCardinalityToParquet,recoverCardinalityFromParquet,type CardinalityParquetRequest,type Document} from '../../src/index-node-v4';

test('Node V4 authors and recovers a Parquet cardinality projection through Rust',()=>{
 const source:Document={umf:'0.10.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'f',kind:'field',extensions:{}}]}]};
 const author=declareCoreCardinality(source,{module:'m',element:'f'},{cardinality:'one'});
 const request:CardinalityParquetRequest={id:'projection',recordName:'Example',fieldName:'value',nativeType:{kind:'scalar',nativeType:'int64',nullable:false},availability:'definition-level',requireExactValues:false,mode:'strict'};
 const receipt=projectCardinalityToParquet(author,request);
 expect(receipt.status).toBe('projected');expect(receipt.mapping.cardinality).toBe('one');
 expect(recoverCardinalityFromParquet(receipt,exportParquetCapture(receipt.target!))).toEqual(author.target);
 const refused=projectCardinalityToParquet(author,{...request,nativeType:{kind:'array',nullable:false,item:{kind:'scalar',nativeType:'int64',nullable:false}}});
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();
});
