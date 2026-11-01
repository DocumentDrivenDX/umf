// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {PostgresqlBackend} from '../adapters/postgresql';
import type {CoreNullabilityDeclaration} from '../model/nullability';
import type {NullabilityPostgresqlProjection,NullabilityPostgresqlRequest} from './nullability-postgresql-projection';

type Guard=(error:unknown)=>boolean;
type Prepared<T> = T & {status:'projected'|'blocked';nativeSql?:string;request:{id:string}};
interface Engine {postgresql:{
 prepareNullabilityProjection(fields:{author:CoreNullabilityDeclaration;request:NullabilityPostgresqlRequest}):unknown;
 completeNullabilityProjection(fields:{prepared:unknown;target:Document}):unknown;
 prepareNullabilityRecovery(fields:{receipt:NullabilityPostgresqlProjection}):unknown;
 recoverNullabilityProjection(fields:{receipt:NullabilityPostgresqlProjection;fresh:NullabilityPostgresqlProjection;nativeText:string}):unknown;
}}
interface PostgresqlRuntime {importPostgresqlSql(source:string,backend:PostgresqlBackend,options:{id:string}):Promise<Document>}
const CONTROL=new Set(['LIMIT','RESOURCE_LIMIT','CAPACITY','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function nativeCall<T>(run:()=>unknown,isNative:Guard):T{
 try{return run() as T}catch(error){
  if(!isNative(error))throw error;
  const e=error as {code?:unknown;message?:unknown;path?:unknown};
  if(typeof e.code!=='string'||CONTROL.has(e.code)||!e.code.startsWith('NULLABILITY_POSTGRESQL_')&&!e.code.startsWith('POSTGRESQL_')&&e.code!=='REQUEST')throw error;
  throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');
 }
}
function requireBackend(backend:PostgresqlBackend):void{
 if(backend?.identity!=='@libpg-query/parser@17.6.10'||typeof backend.parse!=='function')throw new UmfError('POSTGRESQL_BACKEND','Expected the explicitly supplied pinned PostgreSQL parser backend');
}
export function createPostgresqlAuthoredNullabilityRustDefault(engine:Engine,postgresql:PostgresqlRuntime,isNativeUmfCoreError:Guard=()=>false){
 async function project(author:CoreNullabilityDeclaration,request:NullabilityPostgresqlRequest,backend:PostgresqlBackend):Promise<NullabilityPostgresqlProjection>{
  requireBackend(backend);
  const prepared=nativeCall<Prepared<NullabilityPostgresqlProjection>>(()=>engine.postgresql.prepareNullabilityProjection({author,request}),isNativeUmfCoreError);
  if(prepared.status==='blocked')return prepared;
  if(typeof prepared.nativeSql!=='string')throw new UmfError('POSTGRESQL_BACKEND','Rust omitted prepared PostgreSQL SQL');
  const target=await postgresql.importPostgresqlSql(prepared.nativeSql,backend,{id:request.id});
  return nativeCall<NullabilityPostgresqlProjection>(()=>engine.postgresql.completeNullabilityProjection({prepared,target}),isNativeUmfCoreError);
 }
 return Object.freeze({
  projectNullabilityToPostgresql(author:CoreNullabilityDeclaration,request:NullabilityPostgresqlRequest,backend:PostgresqlBackend):Promise<NullabilityPostgresqlProjection>{return project(author,request,backend)},
  async recoverNullabilityFromPostgresql(receipt:NullabilityPostgresqlProjection,nativeText:string,backend:PostgresqlBackend):Promise<Document>{
   nativeCall<boolean>(()=>engine.postgresql.prepareNullabilityRecovery({receipt}),isNativeUmfCoreError);
   requireBackend(backend);
   const fresh=await project(receipt.author,receipt.request,backend);
   return nativeCall<Document>(()=>engine.postgresql.recoverNullabilityProjection({receipt,fresh,nativeText}),isNativeUmfCoreError);
  },
 });
}
