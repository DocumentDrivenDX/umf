// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import type {PostgresqlBackend} from './index';
import type {PostgresqlKeyRequest} from '../../core-ideals/key-postgresql';
import type {ObservedType,PostgresqlTypeIdentity} from './cardinality-catalog';
import type {PostgresqlKeyIndex} from './key-catalog';

type Guard=(error:unknown)=>boolean;
type KeyInspection={
 root:NativeJson;nativeSource:string;serverVersion:170004;encoding:'UTF8';
 query:string;indexes:PostgresqlKeyIndex[];provenance:'unverified';
};
type KeyCorrelation={
 nativeSupplement:string;root:NativeJson;nativeCatalog:string;
 matches:{identity:{schema:string;table:string;index:string};relationPath:string;indexPath:string;componentPaths:(string|null)[]}[];
 sameSnapshotVerified:false;authenticated:false;idealEqualityVerified:false;
};
type CardinalityColumn={
 schema:string;relation:string;name:string;ordinal:number;declaredDimensions:number;type:PostgresqlTypeIdentity;
};
type CardinalityInspection={
 nativeSource:string;root:NativeJson;serverVersion:number;qualifiedVersion:boolean;
 columns:CardinalityColumn[];types:ObservedType[];
};
type CardinalityResolution={
 nativeSource:string;root:NativeJson;qualifiedVersion:boolean;column:CardinalityColumn;
 domains:ObservedType[];native:ObservedType;element:ObservedType|null;standardArray:boolean;
};
type CardinalityCorrelation={
 matches:{column:string;path:string;identity:{schema:string;relation:string;name:string};type:PostgresqlTypeIdentity}[];
 qualifiedVersion:boolean;sameSnapshotVerified:false;nativeSupplement:string;
};
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
