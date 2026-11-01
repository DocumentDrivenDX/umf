// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {
 declareCoreKey,
 declareCoreRecordMembers,
 projectKeysToPostgresql,
 verifyKeysPostgresqlProjection,
 recoverKeysPostgresqlIdeal,
} from '../../src/index-node-v4';
import type {Document} from '../../src/model/types';
import {backend} from '../../native/postgresql/runtime';

function authoredKey(mode:'report'|'strict'='report') {
 const record={module:'sales',element:'orders'};
 const field={module:'sales',element:'id'};
 const source:Document={umf:'0.10.0',id:'orders',vocabularies:{},modules:[{id:'sales',namespace:'sales',elements:[
  {id:'orders',kind:'record',extensions:{}},
  {id:'id',name:'id',kind:'field',scalarType:'integer',nullability:'required',cardinality:'one',extensions:{}},
 ]}]};
 const members=declareCoreRecordMembers(source,record,[field]);
 const author=declareCoreKey(members.target,record,{id:'orders-key',name:'Orders primary key',fields:[field],primary:true});
 return {source:author.target,authors:[author],request:{id:'orders-native',record,namespace:'sales',tableName:'orders',scope:'new-table-stored-values' as const,keyNames:[{keyId:'orders-key',name:'orders_pk'}],mode,columns:[{field,name:'id',nativeType:'integer' as const}]}};
}

test('public V4 Rust authored PostgreSQL key projects, verifies and recovers one key',async()=>{
 const c=authoredKey();
 const receipt=await projectKeysToPostgresql(c.source,c.authors,c.request,backend);
 expect(receipt.status).toBe('projected');
 expect(receipt.mappings).toHaveLength(1);
 expect(receipt.residuals.some(r=>r.reason.includes('stable key IDs/names'))).toBe(true);
 expect((await verifyKeysPostgresqlProjection(receipt,receipt.target!,backend)).status).toBe('projected');
 expect(await recoverKeysPostgresqlIdeal(receipt,receipt.target!,backend)).toEqual(c.source);
 const changed={...receipt.target!,id:'tampered'};
 await expect(recoverKeysPostgresqlIdeal(receipt,changed,backend)).rejects.toMatchObject({code:'KEY_POSTGRESQL_STALE'});
},60000);

test('public V4 Rust authored PostgreSQL key preserves strict refusal without parsing',async()=>{
 const c=authoredKey('strict');
 let called=false;const guarded={...backend,parse:async()=>{called=true;throw new Error('strict refusal must not invoke parser');}};
 const receipt=await projectKeysToPostgresql(c.source,c.authors,c.request,guarded);
 expect(receipt.status).toBe('blocked');
 expect(receipt.nativeSql).toBeUndefined();
 expect(receipt.target).toBeUndefined();
 expect(called).toBe(false);
});
