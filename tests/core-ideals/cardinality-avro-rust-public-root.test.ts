// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {declareCoreCardinality,projectCardinalityToAvro,recoverCardinalityFromAvro,type Document} from '../../src/index-node-v4';

test('Node V4 authors and recovers an Avro cardinality projection through Rust',()=>{
 const source:Document={umf:'0.10.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'f',kind:'field',extensions:{}}]}]};
 const author=declareCoreCardinality(source,{module:'m',element:'f'},{cardinality:'one'});
 const request:Parameters<typeof projectCardinalityToAvro>[1]={id:'projection',recordName:'Example',namespace:'',fieldName:'value',nativeType:'"long"',dependencies:[],availability:'avro-null-value',requireExactValues:false,mode:'strict'};
 const receipt=projectCardinalityToAvro(author,request);
 expect(receipt.status).toBe('projected');expect(receipt.mapping.cardinality).toBe('one');
 expect(recoverCardinalityFromAvro(receipt,receipt.nativeBundle!)).toEqual(author.target);
 const refused=projectCardinalityToAvro(author,{...request,nativeType:'{"type":"array","items":"long"}'});
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();
});
