// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {PostgresqlBackend} from '../adapters/postgresql';
import type {CoreKeyDeclaration} from '../model/keys';
import type {KeyPostgresqlProjection,KeyPostgresqlRequest} from './key-postgresql-projection';

type Guard=(error:unknown)=>boolean;
interface Engine {postgresql:{
 prepareKeysProjection(fields:{source:Document;authors:CoreKeyDeclaration[];request:KeyPostgresqlRequest}):unknown;
 completeKeysProjection(fields:{prepared:unknown;target:Document}):unknown;
 prepareKeysRecovery(fields:{receipt:KeyPostgresqlProjection}):unknown;
 verifyKeysProjection(fields:{receipt:KeyPostgresqlProjection;current:Document;fresh:KeyPostgresqlProjection}):unknown;
 recoverKeysProjection(fields:{receipt:KeyPostgresqlProjection;current:Document;fresh:KeyPostgresqlProjection}):unknown;
}}
interface PostgresqlRuntime {importPostgresqlSql(source:string,backend:PostgresqlBackend,options:{id:string}):Promise<Document>;}
const CONTROL=new Set(['LIMIT','RESOURCE_LIMIT','CAPACITY','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function nativeCall<T>(run:()=>unknown,isNative:Guard):T{try{return run() as T}catch(error){if(!isNative(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROL.has(e.code)||!e.code.startsWith('KEY_POSTGRESQL_')&&!e.code.startsWith('POSTGRESQL_')&&e.code!=='REQUEST')throw error;throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');}}
function requireBackend(backend:PostgresqlBackend):void{if(backend?.identity!=='@libpg-query/parser@17.6.10'||typeof backend.parse!=='function')throw new UmfError('POSTGRESQL_BACKEND','Expected the explicitly supplied pinned PostgreSQL parser backend');}
export function createPostgresqlAuthoredKeysRustDefault(engine:Engine,postgresql:PostgresqlRuntime,isNativeUmfCoreError:Guard=()=>false){
 async function project(source:Document,authors:CoreKeyDeclaration[],request:KeyPostgresqlRequest,backend:PostgresqlBackend):Promise<KeyPostgresqlProjection>{
  requireBackend(backend);const prepared=nativeCall<KeyPostgresqlProjection>(()=>engine.postgresql.prepareKeysProjection({source,authors,request}),isNativeUmfCoreError);
  if(prepared.status==='blocked')return prepared;if(typeof prepared.nativeSql!=='string')throw new UmfError('POSTGRESQL_BACKEND','Rust omitted prepared PostgreSQL SQL');
  const target=await postgresql.importPostgresqlSql(prepared.nativeSql,backend,{id:request.id});
  return nativeCall<KeyPostgresqlProjection>(()=>engine.postgresql.completeKeysProjection({prepared,target}),isNativeUmfCoreError);
 }
 return Object.freeze({
  projectKeysToPostgresql(source:Document,authors:CoreKeyDeclaration[],request:KeyPostgresqlRequest,backend:PostgresqlBackend):Promise<KeyPostgresqlProjection>{return project(source,authors,request,backend)},
  async verifyKeysPostgresqlProjection(receipt:KeyPostgresqlProjection,current:Document,backend:PostgresqlBackend):Promise<KeyPostgresqlProjection>{
   nativeCall<boolean>(()=>engine.postgresql.prepareKeysRecovery({receipt}),isNativeUmfCoreError);const fresh=await project(receipt.source,receipt.authors,receipt.request,backend);
   return nativeCall<KeyPostgresqlProjection>(()=>engine.postgresql.verifyKeysProjection({receipt,current,fresh}),isNativeUmfCoreError);
  },
  async recoverKeysPostgresqlIdeal(receipt:KeyPostgresqlProjection,current:Document,backend:PostgresqlBackend):Promise<Document>{
   nativeCall<boolean>(()=>engine.postgresql.prepareKeysRecovery({receipt}),isNativeUmfCoreError);requireBackend(backend);
   const fresh=await project(receipt.source,receipt.authors,receipt.request,backend);
   return nativeCall<Document>(()=>engine.postgresql.recoverKeysProjection({receipt,current,fresh}),isNativeUmfCoreError);
  },
 });
}
