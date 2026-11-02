// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {declareCoreNullability,projectNullabilityToPostgresql,recoverNullabilityFromPostgresql,type Document,type NullabilityPostgresqlRequest} from '../../src/index-node-v4';
import {backend} from '../../native/postgresql/runtime';

test('public authored PostgreSQL nullability projection verifies, recovers, and refuses unsupported meaning',async()=>{
 const source:Document={umf:'0.10.0',id:'nullability-source',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'value',kind:'field',extensions:{}}]}]};
 const author=declareCoreNullability(source,{module:'m',element:'value'},'required');
 const request:NullabilityPostgresqlRequest={id:'native-nullability',namespace:'public',tableName:'values',columnName:'value',nativeType:'integer',mode:'report',scope:'stored-relation',carrier:'sql-null'};
 const receipt=await projectNullabilityToPostgresql(author,request,backend);
 expect(receipt.status).toBe('projected');expect(receipt.mapping.encoding).toBe('not-null');expect(receipt.nativeSql).toContain(' NOT NULL');
 expect(await recoverNullabilityFromPostgresql(receipt,receipt.nativeSql!,backend)).toEqual(author.target);
 const refused=await projectNullabilityToPostgresql(author,{...request,scope:'write-input',mode:'strict'},backend);
 expect(refused.status).toBe('blocked');expect(refused.diagnostics.some(d=>d.code==='NULLABILITY_MEANING_NOT_PROJECTED'&&d.severity==='error')).toBe(true);expect(Object.hasOwn(refused,'target')).toBe(false);
},60_000);
