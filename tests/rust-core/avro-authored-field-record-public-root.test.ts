import {expect,test} from 'bun:test';
import {exportAvroSchema,projectFieldToAvro,recoverFieldFromAvro,projectRecordToAvro,recoverRecordFromAvro} from '../../src/index-node-v4';
import {CURRENT_CORE_VERSION,type Document} from '../../src/model/types';
import {declareCoreElementKind} from "../../src/index-node-v4";

test('Node V4 routes authored Avro Field projection, refusal and receipt recovery through Rust',()=>{
 const source:Document={umf:CURRENT_CORE_VERSION,id:'field',vocabularies:{},modules:[{id:'m',namespace:'sales',elements:[{id:'e',name:'value',description:'Unicode 雪',extensions:{}}]}]};
 const author=declareCoreElementKind(source,{module:'m',element:'e'},'field');
 const request={id:'native-field',namespace:'sales',recordName:'Example',fieldName:'value',nativeType:'string' as const,mode:'strict' as const};
 const result=projectFieldToAvro(author,request);
 expect(result.status).toBe('projected');
 expect(recoverFieldFromAvro(result,exportAvroSchema(result.target!))).toEqual(author.target);
 const refused=projectFieldToAvro(author,{...request,fieldName:'renamed'});
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();
});

test('Node V4 routes authored Avro Record projection, missing-member refusal and receipt recovery through Rust',()=>{
 const source:Document={umf:CURRENT_CORE_VERSION,id:'record',vocabularies:{},modules:[{id:'m',namespace:'sales',elements:[{id:'r',name:'Orders',kind:'record',extensions:{},references:[{role:'member',module:'m',element:'id'},{role:'member',module:'m',element:'active'}]},{id:'id',name:'id',kind:'field',scalarType:'integer',extensions:{}},{id:'active',name:'active',kind:'field',scalarType:'boolean',extensions:{}}]}]};
 const author=declareCoreElementKind(source,{module:'m',element:'r'},'record');
 const request={id:'native-record',namespace:'sales',recordName:'Orders',mode:'strict' as const,fields:[{author:declareCoreElementKind(source,{module:'m',element:'id'},'field'),fieldName:'id',nativeType:'long' as const},{author:declareCoreElementKind(source,{module:'m',element:'active'},'field'),fieldName:'active',nativeType:'boolean' as const}]};
 const result=projectRecordToAvro(author,request);
 expect(result.status).toBe('projected');
 expect(recoverRecordFromAvro(result,exportAvroSchema(result.target!))).toEqual(author.target);
 const refused=projectRecordToAvro(author,{...request,fields:request.fields.slice(0,-1)});
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();
});
