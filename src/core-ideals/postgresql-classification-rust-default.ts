// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {PostgresqlFieldClassification,PostgresqlFieldRequest} from './postgresql-field';
import type {PostgresqlRecordClassification,PostgresqlRecordRequest} from './postgresql-record';
import type {PostgresqlCardinalityClassification,PostgresqlCardinalityRequest} from './cardinality-postgresql';
import type {PostgresqlNullabilityClassification,PostgresqlNullabilityRequest} from './nullability-postgresql';
import type {PostgresqlKeyClassification,PostgresqlKeyRequest} from './key-postgresql';
import type {PostgresqlBackend} from '../adapters/postgresql';
type Guard=(error:unknown)=>boolean;
interface Engine { postgresql:{
 classifyField(fields:{source:Document;request:PostgresqlFieldRequest}):unknown;
 verifyFieldClassification(fields:{receipt:PostgresqlFieldClassification;current:Document}):unknown;
 recoverFieldCapture(fields:{receipt:PostgresqlFieldClassification;current:Document}):unknown;
 classifyRecord(fields:{source:Document;request:PostgresqlRecordRequest}):unknown;
 verifyRecordClassification(fields:{receipt:PostgresqlRecordClassification;current:Document}):unknown;
 recoverRecordCapture(fields:{receipt:PostgresqlRecordClassification;current:Document}):unknown;
 classifyCardinality(fields:{source:Document;request:PostgresqlCardinalityRequest}):unknown;
 verifyCardinalityClassification(fields:{receipt:PostgresqlCardinalityClassification;current:Document}):unknown;
 recoverCardinalitySource(fields:{receipt:PostgresqlCardinalityClassification;current:Document}):unknown;
 classifyNullability(fields:{source:Document;request:PostgresqlNullabilityRequest}):unknown;
 verifyNullabilityClassification(fields:{receipt:PostgresqlNullabilityClassification;current:Document}):unknown;
 recoverNullabilitySource(fields:{receipt:PostgresqlNullabilityClassification;current:Document}):unknown;
 prepareKeyParserRequests(fields:{source:Document;request:PostgresqlKeyRequest}):unknown;
 classifyKeys(fields:{source:Document;request:PostgresqlKeyRequest;parser:{responses:{id:string;sql:string;ast:unknown}[]}}):unknown;
 verifyKeyClassification(fields:{receipt:PostgresqlKeyClassification;current:Document;parser:{responses:{id:string;sql:string;ast:unknown}[]}}):unknown;
 recoverKeySource(fields:{receipt:PostgresqlKeyClassification;current:Document;parser:{responses:{id:string;sql:string;ast:unknown}[]}}):unknown;
}}
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function publicError(error:unknown,isNative:Guard):never{
 if(!isNative(error))throw error;
 const e=error as {code?:unknown;message?:unknown;path?:unknown};
 if(typeof e.code!=='string'||CONTROL.has(e.code)||!e.code.startsWith('POSTGRESQL_')&&e.code!=='REQUEST')throw error;
 throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');
}
async function parserEvidence(engine:Engine,source:Document,request:PostgresqlKeyRequest,backend:PostgresqlBackend,isNative:Guard){
 if(backend?.identity!=='@libpg-query/parser@17.6.10'||typeof backend.parse!=='function')throw new UmfError('POSTGRESQL_KEY_PARSER','Pinned PostgreSQL parser backend required');
 let prepared:{queries:{id:string;sql:string}[]};
 try{prepared=engine.postgresql.prepareKeyParserRequests({source,request}) as {queries:{id:string;sql:string}[]}}catch(error){publicError(error,isNative)}
 const responses=[];
 for(const query of prepared.queries){const ast=await backend.parse(query.sql);responses.push({id:query.id,sql:query.sql,ast});}
 return {responses};
}
export function createPostgresqlClassificationRustDefault(engine:Engine,isNativeUmfCoreError:Guard=()=>false){
 return Object.freeze({
  classifyPostgresqlField(source:Document,request:PostgresqlFieldRequest):PostgresqlFieldClassification{try{return engine.postgresql.classifyField({source,request}) as PostgresqlFieldClassification}catch(error){publicError(error,isNativeUmfCoreError)}},
  verifyPostgresqlFieldClassification(receipt:PostgresqlFieldClassification,current:Document):PostgresqlFieldClassification{try{return engine.postgresql.verifyFieldClassification({receipt,current}) as PostgresqlFieldClassification}catch(error){publicError(error,isNativeUmfCoreError)}},
  recoverPostgresqlFieldCapture(receipt:PostgresqlFieldClassification,current:Document):string{try{return engine.postgresql.recoverFieldCapture({receipt,current}) as string}catch(error){publicError(error,isNativeUmfCoreError)}},
  classifyPostgresqlRecord(source:Document,request:PostgresqlRecordRequest):PostgresqlRecordClassification{try{return engine.postgresql.classifyRecord({source,request}) as PostgresqlRecordClassification}catch(error){publicError(error,isNativeUmfCoreError)}},
  verifyPostgresqlRecordClassification(receipt:PostgresqlRecordClassification,current:Document):PostgresqlRecordClassification{try{return engine.postgresql.verifyRecordClassification({receipt,current}) as PostgresqlRecordClassification}catch(error){publicError(error,isNativeUmfCoreError)}},
  recoverPostgresqlRecordCapture(receipt:PostgresqlRecordClassification,current:Document):string{try{return engine.postgresql.recoverRecordCapture({receipt,current}) as string}catch(error){publicError(error,isNativeUmfCoreError)}},
  classifyPostgresqlCardinality(source:Document,request:PostgresqlCardinalityRequest):PostgresqlCardinalityClassification{try{return engine.postgresql.classifyCardinality({source,request}) as PostgresqlCardinalityClassification}catch(error){publicError(error,isNativeUmfCoreError)}},
  verifyPostgresqlCardinalityClassification(receipt:PostgresqlCardinalityClassification,current:Document):PostgresqlCardinalityClassification{try{return engine.postgresql.verifyCardinalityClassification({receipt,current}) as PostgresqlCardinalityClassification}catch(error){publicError(error,isNativeUmfCoreError)}},
  recoverPostgresqlCardinalitySource(receipt:PostgresqlCardinalityClassification,current:Document):{nativeSource:string;supplement:string}{try{return engine.postgresql.recoverCardinalitySource({receipt,current}) as {nativeSource:string;supplement:string}}catch(error){publicError(error,isNativeUmfCoreError)}},
  classifyPostgresqlNullability(source:Document,request:PostgresqlNullabilityRequest):PostgresqlNullabilityClassification{try{return engine.postgresql.classifyNullability({source,request}) as PostgresqlNullabilityClassification}catch(error){publicError(error,isNativeUmfCoreError)}},
  verifyPostgresqlNullabilityClassification(receipt:PostgresqlNullabilityClassification,current:Document):PostgresqlNullabilityClassification{try{return engine.postgresql.verifyNullabilityClassification({receipt,current}) as PostgresqlNullabilityClassification}catch(error){publicError(error,isNativeUmfCoreError)}},
  recoverPostgresqlNullabilitySource(receipt:PostgresqlNullabilityClassification,current:Document):string{try{return engine.postgresql.recoverNullabilitySource({receipt,current}) as string}catch(error){publicError(error,isNativeUmfCoreError)}},
  async classifyPostgresqlKeys(source:Document,request:PostgresqlKeyRequest,backend:PostgresqlBackend):Promise<PostgresqlKeyClassification>{const parser=await parserEvidence(engine,source,request,backend,isNativeUmfCoreError);try{return engine.postgresql.classifyKeys({source,request,parser}) as PostgresqlKeyClassification}catch(error){publicError(error,isNativeUmfCoreError)}},
  async verifyPostgresqlKeyClassification(receipt:PostgresqlKeyClassification,current:Document,backend:PostgresqlBackend):Promise<PostgresqlKeyClassification>{const parser=await parserEvidence(engine,receipt.source,receipt.request,backend,isNativeUmfCoreError);try{return engine.postgresql.verifyKeyClassification({receipt,current,parser}) as PostgresqlKeyClassification}catch(error){publicError(error,isNativeUmfCoreError)}},
  async recoverPostgresqlKeySource(receipt:PostgresqlKeyClassification,current:Document,backend:PostgresqlBackend):Promise<{nativeSource:string;supplement:string}>{const parser=await parserEvidence(engine,receipt.source,receipt.request,backend,isNativeUmfCoreError);try{return engine.postgresql.recoverKeySource({receipt,current,parser}) as {nativeSource:string;supplement:string}}catch(error){publicError(error,isNativeUmfCoreError)}},
 });
}
