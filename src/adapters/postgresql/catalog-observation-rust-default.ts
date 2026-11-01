// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../../model/types';
import type {PostgresqlBackend} from './index';
import type {PostgresqlKeyRequest} from '../../core-ideals/key-postgresql';

type Guard=(error:unknown)=>boolean;
type KeyInspection=ReturnType<typeof import('./key-catalog').inspectPostgresqlKeyCatalog>;
type KeyCorrelation=Awaited<ReturnType<typeof import('./key-correlation').correlatePostgresqlKeyCatalog>>;
type CardinalityInspection=ReturnType<typeof import('./cardinality-catalog').inspectPostgresqlCardinalityCatalog>;
type CardinalityResolution=ReturnType<typeof import('./cardinality-catalog').resolvePostgresqlCardinalityType>;
type CardinalityCorrelation=ReturnType<typeof import('./cardinality-catalog').correlatePostgresqlCardinalityCatalog>;
interface Engine {postgresql:{
 keyCatalog(fields:{source:string}):unknown;
 keyCorrelate(fields:{source:Document;request:PostgresqlKeyRequest;parser:{responses:{id:string;sql:string;ast:unknown}[]}}):unknown;
 prepareKeyCorrelation(fields:{source:Document;request:PostgresqlKeyRequest}):unknown;
 export(fields:{document:Document}):unknown;
 cardinalityCatalog(fields:{source:string}):unknown;
 cardinalityType(fields:{source:string;schema:string;relation:string;name:string}):unknown;
 cardinalityCorrelate(fields:{document:Document;source:string}):unknown;
}}
const CONTROL=new Set(['LIMIT','CAPACITY','RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function call<T>(run:()=>unknown,isNative:Guard):T{
 try{return run() as T}catch(error){
  if(!isNative(error)||CONTROL.has((error as {code?:string})?.code??''))throw error;
  const e=error as {code?:unknown;message?:unknown;path?:unknown};
  if(typeof e.code==='string'&&(e.code.startsWith('POSTGRESQL_')||e.code==='REQUEST'))throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');
  throw error;
 }
}
export function createPostgresqlCatalogObservationRustDefault(engine:Engine,isNativeUmfCoreError:Guard=()=>false){
 return Object.freeze({
  inspectPostgresqlKeyCatalog(text:string):KeyInspection{return call(()=>engine.postgresql.keyCatalog({source:text}),isNativeUmfCoreError)},
  async correlatePostgresqlKeyCatalog(document:Document,text:string,backend:PostgresqlBackend):Promise<KeyCorrelation>{
   if(backend?.identity!=='@libpg-query/parser@17.6.10'||typeof backend.parse!=='function')throw new UmfError('POSTGRESQL_KEY_CORRELATION','Pinned PostgreSQL parser backend required');
   const nativeSource=call<string>(()=>engine.postgresql.export({document}),isNativeUmfCoreError);
   const request:PostgresqlKeyRequest={nativeSource,supplement:text,mode:'report',profile:'captured-stored-values'};
   const prepared=call<{queries:{id:string;sql:string}[]}>(()=>engine.postgresql.prepareKeyCorrelation({source:document,request}),isNativeUmfCoreError);
   const responses:{id:string;sql:string;ast:unknown}[]=[];
   for(const query of prepared.queries){const ast=await backend.parse(query.sql);responses.push({id:query.id,sql:query.sql,ast});}
   return call<KeyCorrelation>(()=>engine.postgresql.keyCorrelate({source:document,request,parser:{responses}}),isNativeUmfCoreError);
  },
  inspectPostgresqlCardinalityCatalog(text:string):CardinalityInspection{return call(()=>engine.postgresql.cardinalityCatalog({source:text}),isNativeUmfCoreError)},
  resolvePostgresqlCardinalityType(text:string,column:{schema:string;relation:string;name:string}):CardinalityResolution{return call(()=>engine.postgresql.cardinalityType({source:text,...column}),isNativeUmfCoreError)},
  correlatePostgresqlCardinalityCatalog(document:Document,text:string):CardinalityCorrelation{return call(()=>engine.postgresql.cardinalityCorrelate({document,source:text}),isNativeUmfCoreError)},
 });
}
