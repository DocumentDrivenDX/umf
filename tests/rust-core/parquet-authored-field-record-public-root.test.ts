import {expect,test} from 'bun:test';
import {declareCoreElementKind,exportParquetCapture,projectFieldToParquet,recoverFieldFromParquet,projectRecordToParquet,recoverRecordFromParquet} from '../../src/index-node-v4';
import {CURRENT_CORE_VERSION,type Document} from '../../src/model/types';

test('Node V4 routes authored Parquet Field projection, refusal and byte recovery through Rust',()=>{
 const source:Document={umf:CURRENT_CORE_VERSION,id:'field',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'e',name:'value',extensions:{}}]}]};
 const author=declareCoreElementKind(source,{module:'m',element:'e'},'field');
 const request={id:'native-field',recordName:'Example',fieldName:'value',nativeType:'string' as const,repetition:'optional' as const,mode:'strict' as const};
 const result=projectFieldToParquet(author,request);
 expect(result.status).toBe('projected');
 expect(recoverFieldFromParquet(result,exportParquetCapture(result.target!))).toEqual(author.target);
 const refused=projectFieldToParquet(author,{...request,fieldName:'renamed'});
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();
});

test('Node V4 routes authored Parquet Record projection, missing-member refusal and byte recovery through Rust',()=>{
 const source:Document={umf:CURRENT_CORE_VERSION,id:'record',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'r',name:'Orders',kind:'record',extensions:{},references:[{role:'member',module:'m',element:'id'},{role:'member',module:'m',element:'active'}]},{id:'id',name:'id',kind:'field',scalarType:'integer',extensions:{}},{id:'active',name:'active',kind:'field',scalarType:'boolean',extensions:{}}]}]};
 const author=declareCoreElementKind(source,{module:'m',element:'r'},'record');
 const request={id:'native-record',recordName:'Orders',mode:'strict' as const,fields:[{author:declareCoreElementKind(source,{module:'m',element:'id'},'field'),fieldName:'id',nativeType:'int64' as const,repetition:'required' as const},{author:declareCoreElementKind(source,{module:'m',element:'active'},'field'),fieldName:'active',nativeType:'boolean' as const,repetition:'optional' as const}]};
 const result=projectRecordToParquet(author,request);
 expect(result.status).toBe('projected');
 expect(recoverRecordFromParquet(result,exportParquetCapture(result.target!))).toEqual(author.target);
 const refused=projectRecordToParquet(author,{...request,fields:request.fields.slice(0,-1)});
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();
});
