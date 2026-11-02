// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {PostgresqlBackend} from '../adapters/postgresql';
import type {CoreCardinalityDeclaration} from '../model/cardinality';
import type {CardinalityPostgresqlProjection,CardinalityPostgresqlRequest} from './cardinality-postgresql-projection';

type Guard=(error:unknown)=>boolean;
type Prepared<T> = T & {status:'projected'|'blocked';nativeSql?:string;request:{id:string}};
interface Engine {postgresql:{
 prepareCardinalityProjection(fields:{author:CoreCardinalityDeclaration;request:CardinalityPostgresqlRequest}):unknown;
 completeCardinalityProjection(fields:{prepared:unknown;target:Document}):unknown;
 prepareCardinalityRecovery(fields:{receipt:CardinalityPostgresqlProjection}):unknown;
 recoverCardinalityProjection(fields:{receipt:CardinalityPostgresqlProjection;fresh:CardinalityPostgresqlProjection;nativeText:string}):unknown;
}}
interface PostgresqlRuntime {importPostgresqlSql(source:string,backend:PostgresqlBackend,options:{id:string}):Promise<Document>}
const CONTROL=new Set(['LIMIT','RESOURCE_LIMIT','CAPACITY','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function nativeCall<T>(run:()=>unknown,isNative:Guard):T{
 try{return run() as T}catch(error){
  if(!isNative(error))throw error;
  const e=error as {code?:unknown;message?:unknown;path?:unknown};
  if(typeof e.code!=='string'||CONTROL.has(e.code)||!e.code.startsWith('CARDINALITY_POSTGRESQL_')&&!e.code.startsWith('POSTGRESQL_')&&e.code!=='REQUEST')throw error;
  throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');
 }
}
function requireBackend(backend:PostgresqlBackend):void{
 if(backend?.identity!=='@libpg-query/parser@17.6.10'||typeof backend.parse!=='function')throw new UmfError('POSTGRESQL_BACKEND','Expected the explicitly supplied pinned PostgreSQL parser backend');
}
export function createPostgresqlAuthoredCardinalityRustDefault(engine:Engine,postgresql:PostgresqlRuntime,isNativeUmfCoreError:Guard=()=>false){
 async function project(author:CoreCardinalityDeclaration,request:CardinalityPostgresqlRequest,backend:PostgresqlBackend):Promise<CardinalityPostgresqlProjection>{
  requireBackend(backend);
  const prepared=nativeCall<Prepared<CardinalityPostgresqlProjection>>(()=>engine.postgresql.prepareCardinalityProjection({author,request}),isNativeUmfCoreError);
  if(prepared.status==='blocked')return prepared;
  if(typeof prepared.nativeSql!=='string')throw new UmfError('POSTGRESQL_BACKEND','Rust omitted prepared PostgreSQL SQL');
  const target=await postgresql.importPostgresqlSql(prepared.nativeSql,backend,{id:request.id});
  return nativeCall<CardinalityPostgresqlProjection>(()=>engine.postgresql.completeCardinalityProjection({prepared,target}),isNativeUmfCoreError);
 }
 return Object.freeze({
  projectCardinalityToPostgresql(author:CoreCardinalityDeclaration,request:CardinalityPostgresqlRequest,backend:PostgresqlBackend):Promise<CardinalityPostgresqlProjection>{return project(author,request,backend)},
  async recoverCardinalityFromPostgresql(receipt:CardinalityPostgresqlProjection,nativeText:string,backend:PostgresqlBackend):Promise<Document>{
   nativeCall<boolean>(()=>engine.postgresql.prepareCardinalityRecovery({receipt}),isNativeUmfCoreError);
   requireBackend(backend);
   const fresh=await project(receipt.author,receipt.request,backend);
   return nativeCall<Document>(()=>engine.postgresql.recoverCardinalityProjection({receipt,fresh,nativeText}),isNativeUmfCoreError);
  },
 });
}
