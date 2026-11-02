// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {importPostgresqlCatalogCapture,classifyPostgresqlKeys,verifyPostgresqlKeyClassification,recoverPostgresqlKeySource} from '../../src/index-node-v4';
import proof from '../../fixtures/validation/key-postgresql-discovery-native.json';
// Derived focused input from existing evidence, not a fresh full native capture.
// Select one complete relation; retain shared definitions, dependencies, query
// and reconstruction without changing the original fixture.
const capture=JSON.parse(await Bun.file('fixtures/validation/key-postgresql-catalog-capture.json').text());
capture.snapshot.relations=capture.snapshot.relations.filter((relation:{schema:string;name:string})=>relation.schema==='umf_key_probe'&&relation.name==='enforced');
if(capture.snapshot.relations.length!==1)throw new Error('Expected ordinary enforced relation');
const nativeSource=JSON.stringify(capture);
const query=await Bun.file('native/postgresql/keys/query.sql').text();
const supplement=JSON.stringify({profile:'umf-postgresql-key-observations-17-v1',serverVersion:170004,encoding:'UTF8',query,indexes:proof.indexes.filter(index=>index.schema==='umf_key_probe'&&index.table==='enforced')});
const request={nativeSource,supplement,mode:'report',profile:'captured-stored-values'} as const;
test('Rust PostgreSQL keys public root classifies, verifies, and recovers retained native evidence',async()=>{
 const source=importPostgresqlCatalogCapture(nativeSource,{id:'postgresql-key-native'});const parsed:string[]=[];
 const parser={...backend,parse:async(sql:string)=>{parsed.push(sql);return backend.parse(sql)}};
 const result=await classifyPostgresqlKeys(source,request,parser);expect(result.status).toBe('classified');expect(result.observations).toHaveLength(2);
 expect((await verifyPostgresqlKeyClassification(result,result.target!,parser)).status).toBe('classified');
 expect(await recoverPostgresqlKeySource(result,result.target!,parser)).toEqual({nativeSource,supplement});expect(parsed.length).toBeGreaterThan(0);
});
test('Rust PostgreSQL keys preserve the selected parser callback failure',async()=>{
 const source=importPostgresqlCatalogCapture(nativeSource,{id:'postgresql-key-native'});const failure=new Error('caller parser failure');
 const parser={...backend,parse:async()=>{throw failure}};
 await expect(classifyPostgresqlKeys(source,request,parser)).rejects.toBe(failure);
});
test('Rust PostgreSQL keys public root refuses strict residual admission and mismatched archive',async()=>{
 const source=importPostgresqlCatalogCapture(nativeSource,{id:'postgresql-key-native'});
 const strict=await classifyPostgresqlKeys(source,{...request,mode:'strict'},backend);expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();
 await expect(classifyPostgresqlKeys(source,{...request,nativeSource:nativeSource.replace('170004','170005')},backend)).rejects.toMatchObject({code:'POSTGRESQL_KEY_ARCHIVE'});
});
