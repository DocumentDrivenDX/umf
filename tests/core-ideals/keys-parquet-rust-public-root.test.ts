// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {declareCoreKey,projectKeysToParquet,verifyKeysParquetProjection,recoverKeysParquetIdeal,type Document,type KeyParquetRequest} from '../../src/index-node-v4';

test('Node V4 authors and recovers a Parquet key projection through Rust',()=>{
 const field={module:'m',element:'f'};
 const source:Document={umf:'0.10.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'r',kind:'record',members:[field],extensions:{}},{id:'f',kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}}]}]};
 const author=declareCoreKey(source,{module:'m',element:'r'},{id:'key-id',name:'Identity',fields:[field],primary:true});
 const request:KeyParquetRequest={id:'projection',record:{module:'m',element:'r'},recordName:'Example',mode:'report',columns:[{field,name:'id',carrier:{kind:'integer',bits:32,signed:true}}]};
 const receipt=projectKeysToParquet(author.target,[author],request);
 expect(receipt.status).toBe('projected');expect(receipt.mappings).toHaveLength(1);expect(receipt.mappings[0]!.enforcement).toBe('not-expressible');
 expect(verifyKeysParquetProjection(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverKeysParquetIdeal(receipt,receipt.target!)).toEqual(author.target);
 const refused=projectKeysToParquet(author.target,[author],{...request,mode:'strict'});
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();
});
