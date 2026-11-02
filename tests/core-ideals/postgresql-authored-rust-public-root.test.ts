// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {CURRENT_CORE_VERSION,declareCoreElementKind,projectFieldToPostgresql,recoverFieldFromPostgresql,projectRecordToPostgresql,recoverRecordFromPostgresql,type Document} from '../../src/index-node-v4';
import type {RecordPostgresqlRequest} from '../../src/core-ideals/record-postgresql-projection';
import {backend} from '../../native/postgresql/runtime';

const fieldSource:Document={umf:CURRENT_CORE_VERSION,id:'field-source',vocabularies:{},modules:[{id:'fields',namespace:'sales',elements:[{id:'id',name:'id',scalarType:'integer',extensions:{}}]}]};
const fieldAuthor=declareCoreElementKind(fieldSource,{module:'fields',element:'id'},'field');
const fieldRequest={id:'native-field',namespace:'sales',tableName:'orders',columnName:'id',nativeType:'bigint',mode:'strict'} as const;
const recordSource:Document={umf:CURRENT_CORE_VERSION,id:'record-source',vocabularies:{},modules:[{id:'records',namespace:'sales',elements:[{id:'orders',name:'orders',kind:'record',references:[{role:'member',module:'fields',element:'id'}],extensions:{}}]},{id:'fields',namespace:'sales',elements:[{id:'id',name:'id',kind:'field',scalarType:'integer',extensions:{}}]}]};
const recordAuthor=declareCoreElementKind(recordSource,{module:'records',element:'orders'},'record');
const memberAuthor=declareCoreElementKind(recordSource,{module:'fields',element:'id'},'field');
const recordRequest:RecordPostgresqlRequest={id:'native-record',namespace:'sales',tableName:'orders',mode:'strict',fields:[{author:memberAuthor,columnName:'id',nativeType:'bigint'}]};

test('Rust public PostgreSQL Field projection binds parsed target and recovers retained source',async()=>{
 const result=await projectFieldToPostgresql(fieldAuthor,fieldRequest,backend);
 expect(result.status).toBe('projected');expect(result.residuals).toEqual([]);expect(result.nativeSql).toBe('CREATE TABLE "sales"."orders" ("id" pg_catalog.int8);\n');
 expect(await recoverFieldFromPostgresql(result,result.nativeSql!,backend)).toEqual(fieldAuthor.target);
 const altered={...result,target:{...result.target!,id:'altered-target'}};
 await expect(recoverFieldFromPostgresql(altered,result.nativeSql!,backend)).rejects.toThrow();
 const mismatchSource:Document={...fieldSource,modules:[{...fieldSource.modules[0]!,elements:[{...fieldSource.modules[0]!.elements[0]!,scalarType:'string',future:{keep:true}}]}]};
 const mismatched=declareCoreElementKind(mismatchSource,{module:'fields',element:'id'},'field');
 const blocked=await projectFieldToPostgresql(mismatched,fieldRequest,backend);expect(blocked.status).toBe('blocked');expect(Object.hasOwn(blocked,'target')).toBe(false);
},30000);

test('Rust public PostgreSQL Record projection binds member order and refuses missing member bindings',async()=>{
 const result=await projectRecordToPostgresql(recordAuthor,recordRequest,backend);
 expect(result.status).toBe('projected');expect(result.mappings.map(row=>row.kind)).toEqual(['record','field']);
 expect(result.nativeSql).toBe('CREATE TABLE "sales"."orders" ("id" pg_catalog.int8);\n');
 expect(await recoverRecordFromPostgresql(result,result.nativeSql!,backend)).toEqual(recordAuthor.target);
 const blocked=await projectRecordToPostgresql(recordAuthor,{...recordRequest,fields:[]},backend);expect(blocked.status).toBe('blocked');expect(Object.hasOwn(blocked,'nativeSql')).toBe(false);
},30000);
