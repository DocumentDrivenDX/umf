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
import type {DddPostgresqlTablePolicy,DddPostgresqlTableProjection} from './ddd-postgresql/tables';

type NativeErrorGuard=(error:unknown)=>boolean;
export interface DddPostgresqlNativeFamily {
 ['ddd-json-schema-projection']:{
  prepareDddPostgresqlProjection(fields:{document:Document;binding:Document;policy:DddPostgresqlPolicy}):unknown;
  blockDddPostgresqlProjection(fields:{document:Document;binding:Document;policy:DddPostgresqlPolicy;path:string;message:string}):unknown;
  completeDddPostgresqlProjection(fields:{document:Document;binding:Document;policy:DddPostgresqlPolicy;candidateSource:string;candidateArchive:Document;nativeSource:string;targetArchive:Document}):unknown;
  verifyDddPostgresqlProjection(fields:{receipt:DddPostgresqlProjection;currentTarget:Document;candidateSource:string;candidateArchive:Document}):unknown;
  recoverDddPostgresqlIdeal(fields:{receipt:DddPostgresqlProjection;currentTarget:Document;candidateSource:string;candidateArchive:Document}):unknown;
  recoverDddPostgresqlNative(fields:{receipt:DddPostgresqlProjection;currentTarget:Document;candidateSource:string;candidateArchive:Document}):unknown;
  prepareDddPostgresqlTables(fields:{document:Document;binding:Document;tablePolicy:DddPostgresqlTablePolicy;lossPolicy:'strict'|'report'}):unknown;
  completeDddPostgresqlTables(fields:{document:Document;binding:Document;tablePolicy:DddPostgresqlTablePolicy;lossPolicy:'strict'|'report';archive:Document}):unknown;
  blockDddPostgresqlTables(fields:{document:Document;binding:Document;tablePolicy:DddPostgresqlTablePolicy;lossPolicy:'strict'|'report'}):unknown;
  prepareDddPostgresqlTablesAndIndexes(fields:{document:Document;binding:Document;tablePolicy:DddPostgresqlTablePolicy;tableArchive:Document}):unknown;
  prepareDddPostgresqlTablesAndIndexesCombined(fields:{document:Document;binding:Document;tablePolicy:DddPostgresqlTablePolicy;tableArchive:Document;lossPolicy:'strict'|'report';indexArchives:(Document|null)[]}):unknown;
  completeDddPostgresqlTablesAndIndexes(fields:{document:Document;binding:Document;tablePolicy:DddPostgresqlTablePolicy;tableArchive:Document;lossPolicy:'strict'|'report';indexArchives:(Document|null)[];combinedArchive:Document|null}):unknown;
 };
}
const CONTROL_CODES=new Set(['LIMIT','CAPACITY','RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createDddPostgresqlRustDefault(engine:DddPostgresqlNativeFamily, postgresql:PostgresqlHostAdapter, isNativeError:NativeErrorGuard=()=>false){
 function call<T>(operation:()=>unknown):T{try{return operation() as T;}catch(error){if(!isNativeError(error))throw error;const native=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof native.code!=='string'||CONTROL_CODES.has(native.code)||!(native.code.startsWith('DDD_POSTGRESQL_')||native.code.startsWith('POSTGRESQL_TABLE_')||native.code.startsWith('POSTGRESQL_INDEX_')||native.code.startsWith('BINDING_')||native.code==='DDD_DOCUMENT'))throw error;throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');}}
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
 async function projectTables(logical:Document,binding:Document,backend:PostgresqlBackend,policy:DddPostgresqlTablePolicy,lossPolicy:'strict'|'report'):Promise<DddPostgresqlTableProjection>{
  const document=copyJson(logical) as unknown as Document, physical=copyJson(binding) as unknown as Document, tablePolicy=copyJson(policy) as unknown as DddPostgresqlTablePolicy;
  const fields={document,binding:physical,tablePolicy,lossPolicy};
  const prepared=call<DddPostgresqlTableProjection>(()=>engine['ddd-json-schema-projection'].prepareDddPostgresqlTables(fields));
  if(prepared.status==='blocked')return prepared;
  if(typeof prepared.candidate!=='string')throw new UmfError('POSTGRESQL_TABLE_RECEIPT','Rust table proposal omitted SQL');
  let archive:Document;
  try{
   archive=await postgresql.importPostgresqlSql(prepared.candidate,backend,{id:'ddd-postgresql-tables-target'});
   await postgresql.exportPostgresqlSql(archive,backend);
  }catch(error){
   const code=error&&typeof error==='object'&&'code'in error?(error as {code?:unknown}).code:undefined;
   if(typeof code==='string'&&CONTROL_CODES.has(code))throw error;
   return call<DddPostgresqlTableProjection>(()=>engine['ddd-json-schema-projection'].blockDddPostgresqlTables(fields));
  }
  return call<DddPostgresqlTableProjection>(()=>engine['ddd-json-schema-projection'].completeDddPostgresqlTables({...fields,archive}));
 }
 async function projectTablesAndIndexes(logical:Document,binding:Document,backend:PostgresqlBackend,policy:DddPostgresqlTablePolicy,lossPolicy:'strict'|'report'):Promise<DddPostgresqlTableProjection>{
  const table=await projectTables(logical,binding,backend,policy,'report');
  const {candidate:_tableCandidate,targetArchive:_tableArchive,...base}=table;
  if(!table.targetArchive||!table.candidate)return {...base,status:'blocked'};
  const fields={document:copyJson(logical) as unknown as Document,binding:copyJson(binding) as unknown as Document,tablePolicy:copyJson(policy) as unknown as DddPostgresqlTablePolicy,tableArchive:table.targetArchive};
  const prepared=call<{indexCandidates:{path:string;sql:string;choice:unknown}[]}>(()=>engine['ddd-json-schema-projection'].prepareDddPostgresqlTablesAndIndexes(fields));
  const indexArchives:(Document|null)[]=[];
  for(const [i,row] of prepared.indexCandidates.entries()){
   try{
    const archive=await postgresql.importPostgresqlSql(row.sql,backend,{id:`binding-index-${i}`});
    await postgresql.exportPostgresqlSql(archive,backend);
    indexArchives.push(archive);
   }catch(error){
    const code=error&&typeof error==='object'&&'code'in error?(error as {code?:unknown}).code:undefined;
    if(typeof code==='string'&&CONTROL_CODES.has(code))throw error;
    indexArchives.push(null);
   }
  }
  const combined=call<{candidate:string}>(()=>engine['ddd-json-schema-projection'].prepareDddPostgresqlTablesAndIndexesCombined({...fields,lossPolicy,indexArchives}));
  const candidate=combined.candidate;
  let combinedArchive:Document|undefined;
  try{
   combinedArchive=await postgresql.importPostgresqlSql(candidate,backend,{id:'ddd-postgresql-tables-indexes-target'});
   await postgresql.exportPostgresqlSql(combinedArchive,backend);
  }catch(error){
   const code=error&&typeof error==='object'&&'code'in error?(error as {code?:unknown}).code:undefined;
   if(typeof code==='string'&&CONTROL_CODES.has(code))throw error;
  }
  return call<DddPostgresqlTableProjection>(()=>engine['ddd-json-schema-projection'].completeDddPostgresqlTablesAndIndexes({...fields,lossPolicy,indexArchives,combinedArchive:combinedArchive??null}));
 }
 return Object.freeze({
  projectDddToPostgresql:project,
  projectDddTablesToPostgresql:projectTables,
  projectDddTablesAndIndexesToPostgresql:projectTablesAndIndexes,
  verifyDddPostgresqlProjection(receipt:DddPostgresqlProjection,currentTarget:Document,backend:PostgresqlBackend):Promise<DddPostgresqlProjection>{return withCandidate(x=>engine['ddd-json-schema-projection'].verifyDddPostgresqlProjection(x),receipt,currentTarget,backend);},
  recoverDddPostgresqlIdeal(receipt:DddPostgresqlProjection,currentTarget:Document,backend:PostgresqlBackend):Promise<{logical:Document;binding:Document;policy:DddPostgresqlPolicy}>{return withCandidate(x=>engine['ddd-json-schema-projection'].recoverDddPostgresqlIdeal(x),receipt,currentTarget,backend);},
  recoverDddPostgresqlNative(receipt:DddPostgresqlProjection,currentTarget:Document,backend:PostgresqlBackend):Promise<string>{return withCandidate(x=>engine['ddd-json-schema-projection'].recoverDddPostgresqlNative(x),receipt,currentTarget,backend);},
 });
}
