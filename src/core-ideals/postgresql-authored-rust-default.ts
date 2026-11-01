// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {PostgresqlBackend} from '../adapters/postgresql';
import type {FieldPostgresqlProjection,FieldPostgresqlRequest} from './field-postgresql-projection';
import type {RecordPostgresqlProjection,RecordPostgresqlRequest} from './record-postgresql-projection';
import type {CoreKindDeclaration} from '../model/field-kind';

type Guard=(error:unknown)=>boolean;
type Prepared<T> = T & {status:'projected'|'blocked';nativeSql?:string;request:{id:string}};
interface Engine {postgresql:{
 prepareFieldProjection(fields:{author:CoreKindDeclaration;request:FieldPostgresqlRequest}):unknown;
 completeFieldProjection(fields:{prepared:unknown;target:Document}):unknown;
 prepareFieldRecovery(fields:{receipt:FieldPostgresqlProjection}):unknown;
 recoverFieldProjection(fields:{receipt:FieldPostgresqlProjection;fresh:FieldPostgresqlProjection;nativeText:string}):unknown;
 prepareRecordProjection(fields:{author:CoreKindDeclaration;request:RecordPostgresqlRequest}):unknown;
 completeRecordProjection(fields:{prepared:unknown;target:Document}):unknown;
 prepareRecordRecovery(fields:{receipt:RecordPostgresqlProjection}):unknown;
 recoverRecordProjection(fields:{receipt:RecordPostgresqlProjection;fresh:RecordPostgresqlProjection;nativeText:string}):unknown;
}}
interface PostgresqlRuntime {importPostgresqlSql(source:string,backend:PostgresqlBackend,options:{id:string}):Promise<Document>}
const CONTROL=new Set(['LIMIT','RESOURCE_LIMIT','CAPACITY','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function nativeCall<T>(run:()=>unknown,isNative:Guard):T{
 try{return run() as T}catch(error){
  if(!isNative(error))throw error;
  const e=error as {code?:unknown;message?:unknown;path?:unknown};
  if(typeof e.code!=='string'||CONTROL.has(e.code)||!e.code.startsWith('FIELD_POSTGRESQL_')&&!e.code.startsWith('RECORD_POSTGRESQL_')&&!e.code.startsWith('POSTGRESQL_')&&e.code!=='REQUEST')throw error;
  throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');
 }
}
function requireBackend(backend:PostgresqlBackend):void{
 if(backend?.identity!=='@libpg-query/parser@17.6.10'||typeof backend.parse!=='function')throw new UmfError('POSTGRESQL_BACKEND','Expected the explicitly supplied pinned PostgreSQL parser backend');
}
export function createPostgresqlAuthoredRustDefault(engine:Engine,postgresql:PostgresqlRuntime,isNativeUmfCoreError:Guard=()=>false){
 async function project<T extends {request:{id:string};status:string;nativeSql?:string}>(
  author:CoreKindDeclaration,request:FieldPostgresqlRequest|RecordPostgresqlRequest,backend:PostgresqlBackend,
  prepare:(fields:any)=>unknown,complete:(fields:any)=>unknown,
 ):Promise<T>{
  requireBackend(backend);
  const prepared=nativeCall<Prepared<T>>(()=>prepare({author,request}),isNativeUmfCoreError);
  if(prepared.status==='blocked')return prepared;
  if(typeof prepared.nativeSql!=='string')throw new UmfError('POSTGRESQL_BACKEND','Rust omitted prepared PostgreSQL SQL');
  const target=await postgresql.importPostgresqlSql(prepared.nativeSql,backend,{id:request.id});
  return nativeCall<T>(()=>complete({prepared,target}),isNativeUmfCoreError);
 }
 return Object.freeze({
  projectFieldToPostgresql(author:CoreKindDeclaration,request:FieldPostgresqlRequest,backend:PostgresqlBackend):Promise<FieldPostgresqlProjection>{
   return project<FieldPostgresqlProjection>(author,request,backend,engine.postgresql.prepareFieldProjection.bind(engine.postgresql),engine.postgresql.completeFieldProjection.bind(engine.postgresql));
  },
  async recoverFieldFromPostgresql(receipt:FieldPostgresqlProjection,nativeText:string,backend:PostgresqlBackend):Promise<Document>{
   nativeCall<boolean>(()=>engine.postgresql.prepareFieldRecovery({receipt}),isNativeUmfCoreError);
   requireBackend(backend);
   const fresh=await project<FieldPostgresqlProjection>(receipt.author,receipt.request,backend,engine.postgresql.prepareFieldProjection.bind(engine.postgresql),engine.postgresql.completeFieldProjection.bind(engine.postgresql));
   return nativeCall<Document>(()=>engine.postgresql.recoverFieldProjection({receipt,fresh,nativeText}),isNativeUmfCoreError);
  },
  projectRecordToPostgresql(author:CoreKindDeclaration,request:RecordPostgresqlRequest,backend:PostgresqlBackend):Promise<RecordPostgresqlProjection>{
   return project<RecordPostgresqlProjection>(author,request,backend,engine.postgresql.prepareRecordProjection.bind(engine.postgresql),engine.postgresql.completeRecordProjection.bind(engine.postgresql));
  },
  async recoverRecordFromPostgresql(receipt:RecordPostgresqlProjection,nativeText:string,backend:PostgresqlBackend):Promise<Document>{
   nativeCall<boolean>(()=>engine.postgresql.prepareRecordRecovery({receipt}),isNativeUmfCoreError);
   requireBackend(backend);
   const fresh=await project<RecordPostgresqlProjection>(receipt.author,receipt.request,backend,engine.postgresql.prepareRecordProjection.bind(engine.postgresql),engine.postgresql.completeRecordProjection.bind(engine.postgresql));
   return nativeCall<Document>(()=>engine.postgresql.recoverRecordProjection({receipt,fresh,nativeText}),isNativeUmfCoreError);
  },
 });
}
