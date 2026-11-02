// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {PostgresqlBackend} from '../adapters/postgresql';
import type {CoreFacetDeclaration} from '../model/facets';
import type {CoreKindDeclaration} from '../model/field-kind';
import type {FacetsPostgresqlProjection,FacetsPostgresqlRequest} from './facets-postgresql-projection';

type Guard=(error:unknown)=>boolean;
type Prepared<T> = T & {status:'projected'|'blocked';nativeSql?:string;request:{id:string}};
interface Engine {postgresql:{
 prepareFacetsProjection(fields:{author:CoreFacetDeclaration|CoreKindDeclaration;request:FacetsPostgresqlRequest}):unknown;
 completeFacetsProjection(fields:{prepared:unknown;target:Document}):unknown;
 prepareFacetsRecovery(fields:{receipt:FacetsPostgresqlProjection}):unknown;
 recoverFacetsProjection(fields:{receipt:FacetsPostgresqlProjection;fresh:FacetsPostgresqlProjection;nativeText:string}):unknown;
}}
interface PostgresqlRuntime {importPostgresqlSql(source:string,backend:PostgresqlBackend,options:{id:string}):Promise<Document>}
const CONTROL=new Set(['LIMIT','RESOURCE_LIMIT','CAPACITY','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function nativeCall<T>(run:()=>unknown,isNative:Guard):T{
 try{return run() as T}catch(error){
  if(!isNative(error))throw error;
  const e=error as {code?:unknown;message?:unknown;path?:unknown};
  if(typeof e.code!=='string'||CONTROL.has(e.code)||!e.code.startsWith('FACETS_POSTGRESQL_')&&!e.code.startsWith('POSTGRESQL_')&&e.code!=='REQUEST')throw error;
  throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');
 }
}
function requireBackend(backend:PostgresqlBackend):void{
 if(backend?.identity!=='@libpg-query/parser@17.6.10'||typeof backend.parse!=='function')throw new UmfError('POSTGRESQL_BACKEND','Expected the explicitly supplied pinned PostgreSQL parser backend');
}
export function createPostgresqlAuthoredFacetsRustDefault(engine:Engine,postgresql:PostgresqlRuntime,isNativeUmfCoreError:Guard=()=>false){
 async function project(author:CoreFacetDeclaration|CoreKindDeclaration,request:FacetsPostgresqlRequest,backend:PostgresqlBackend):Promise<FacetsPostgresqlProjection>{
  requireBackend(backend);
  const prepared=nativeCall<Prepared<FacetsPostgresqlProjection>>(()=>engine.postgresql.prepareFacetsProjection({author,request}),isNativeUmfCoreError);
  if(prepared.status==='blocked')return prepared;
  if(typeof prepared.nativeSql!=='string')throw new UmfError('POSTGRESQL_BACKEND','Rust omitted prepared PostgreSQL SQL');
  const target=await postgresql.importPostgresqlSql(prepared.nativeSql,backend,{id:request.id});
  return nativeCall<FacetsPostgresqlProjection>(()=>engine.postgresql.completeFacetsProjection({prepared,target}),isNativeUmfCoreError);
 }
 return Object.freeze({
  projectFacetsToPostgresql(author:CoreFacetDeclaration|CoreKindDeclaration,request:FacetsPostgresqlRequest,backend:PostgresqlBackend):Promise<FacetsPostgresqlProjection>{return project(author,request,backend)},
  async recoverFacetsFromPostgresql(receipt:FacetsPostgresqlProjection,nativeText:string,backend:PostgresqlBackend):Promise<Document>{
   nativeCall<boolean>(()=>engine.postgresql.prepareFacetsRecovery({receipt}),isNativeUmfCoreError);
   requireBackend(backend);
   const fresh=await project(receipt.author,receipt.request,backend);
   return nativeCall<Document>(()=>engine.postgresql.recoverFacetsProjection({receipt,fresh,nativeText}),isNativeUmfCoreError);
  },
 });
}
