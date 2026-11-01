// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import {copyJson} from '../model/json';
import type {PostgresqlBackend} from '../adapters/postgresql';
import type {Document as PostgresqlDocument} from '../model/types';

type PostgresqlHostAdapter = {
 importPostgresqlSql(source:string,backend:PostgresqlBackend,options:{id:string}):Promise<PostgresqlDocument>;
 exportPostgresqlSql(document:PostgresqlDocument,backend:PostgresqlBackend):Promise<string>;
};
import type {DddPostgresqlPolicy,DddPostgresqlProjection} from './ddd-postgresql/index';

type NativeErrorGuard=(error:unknown)=>boolean;
export interface DddPostgresqlNativeFamily {
 ['ddd-json-schema-projection']:{
  prepareDddPostgresqlProjection(fields:{document:Document;binding:Document;policy:DddPostgresqlPolicy}):unknown;
  blockDddPostgresqlProjection(fields:{document:Document;binding:Document;policy:DddPostgresqlPolicy;path:string;message:string}):unknown;
  completeDddPostgresqlProjection(fields:{document:Document;binding:Document;policy:DddPostgresqlPolicy;candidateSource:string;candidateArchive:Document;nativeSource:string;targetArchive:Document}):unknown;
  verifyDddPostgresqlProjection(fields:{receipt:DddPostgresqlProjection;currentTarget:Document;candidateSource:string;candidateArchive:Document}):unknown;
  recoverDddPostgresqlIdeal(fields:{receipt:DddPostgresqlProjection;currentTarget:Document;candidateSource:string;candidateArchive:Document}):unknown;
  recoverDddPostgresqlNative(fields:{receipt:DddPostgresqlProjection;currentTarget:Document;candidateSource:string;candidateArchive:Document}):unknown;
 };
}
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createDddPostgresqlRustDefault(engine:DddPostgresqlNativeFamily, postgresql:PostgresqlHostAdapter, isNativeError:NativeErrorGuard=()=>false){
 function call<T>(operation:()=>unknown):T{try{return operation() as T;}catch(error){if(!isNativeError(error))throw error;const native=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof native.code!=='string'||CONTROL_CODES.has(native.code)||!native.code.startsWith('DDD_POSTGRESQL_'))throw error;throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');}}
 async function project(logical:Document,binding:Document,policy:DddPostgresqlPolicy,backend:PostgresqlBackend):Promise<DddPostgresqlProjection>{
  const source=copyJson(logical) as unknown as Document, physical=copyJson(binding) as unknown as Document, selected=copyJson(policy) as unknown as DddPostgresqlPolicy;
  const prepared=call<DddPostgresqlProjection>(()=>engine['ddd-json-schema-projection'].prepareDddPostgresqlProjection({document:source,binding:physical,policy:selected}));
  if(prepared.status==='blocked')return prepared;
  if(typeof prepared.nativeSource!=='string')throw new UmfError('DDD_POSTGRESQL_RECEIPT','Rust projection omitted candidate SQL');
  let candidateArchive:Document, nativeSource:string, targetArchive:Document;
  try{
   candidateArchive=await postgresql.importPostgresqlSql(prepared.nativeSource,backend,{id:'ddd-postgresql-projection-candidate'});
   await postgresql.exportPostgresqlSql(candidateArchive,backend);
   nativeSource=prepared.nativeSource;
   targetArchive=await postgresql.importPostgresqlSql(nativeSource,backend,{id:'ddd-postgresql-projection-target-final'});
  }catch(error){
   const code=error&&typeof error==='object'&&'code'in error?(error as {code?:unknown}).code:undefined;
   if(typeof code==='string'&&CONTROL_CODES.has(code))throw error;
   return call<DddPostgresqlProjection>(()=>engine['ddd-json-schema-projection'].blockDddPostgresqlProjection({document:source,binding:physical,policy:selected,path:'/policy',message:'Complete DDL failed parser/deparser/codec: '+String(error)}));
  }
  return call<DddPostgresqlProjection>(()=>engine['ddd-json-schema-projection'].completeDddPostgresqlProjection({document:source,binding:physical,policy:selected,candidateSource:prepared.nativeSource!,candidateArchive,nativeSource,targetArchive}));
 }
 async function withCandidate<T>(operation:(fields:{receipt:DddPostgresqlProjection;currentTarget:Document;candidateSource:string;candidateArchive:Document})=>unknown,receipt:DddPostgresqlProjection,currentTarget:Document,backend:PostgresqlBackend):Promise<T>{
  const prepared=call<DddPostgresqlProjection>(()=>engine['ddd-json-schema-projection'].prepareDddPostgresqlProjection({document:copyJson(receipt.source) as unknown as Document,binding:copyJson(receipt.binding) as unknown as Document,policy:copyJson(receipt.policy) as unknown as DddPostgresqlPolicy}));
  if(prepared.status!=='projected'||typeof prepared.nativeSource!=='string')throw new UmfError('DDD_POSTGRESQL_RECEIPT','Retained inputs no longer produce a complete candidate');
  const candidateArchive=await postgresql.importPostgresqlSql(prepared.nativeSource,backend,{id:'ddd-postgresql-projection-candidate'});
  return call<T>(()=>operation({receipt:copyJson(receipt) as unknown as DddPostgresqlProjection,currentTarget:copyJson(currentTarget) as unknown as Document,candidateSource:prepared.nativeSource!,candidateArchive}));
 }
 return Object.freeze({
  projectDddToPostgresql:project,
  verifyDddPostgresqlProjection(receipt:DddPostgresqlProjection,currentTarget:Document,backend:PostgresqlBackend):Promise<DddPostgresqlProjection>{return withCandidate(x=>engine['ddd-json-schema-projection'].verifyDddPostgresqlProjection(x),receipt,currentTarget,backend);},
  recoverDddPostgresqlIdeal(receipt:DddPostgresqlProjection,currentTarget:Document,backend:PostgresqlBackend):Promise<{logical:Document;binding:Document;policy:DddPostgresqlPolicy}>{return withCandidate(x=>engine['ddd-json-schema-projection'].recoverDddPostgresqlIdeal(x),receipt,currentTarget,backend);},
  recoverDddPostgresqlNative(receipt:DddPostgresqlProjection,currentTarget:Document,backend:PostgresqlBackend):Promise<string>{return withCandidate(x=>engine['ddd-json-schema-projection'].recoverDddPostgresqlNative(x),receipt,currentTarget,backend);},
 });
}
