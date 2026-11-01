// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {PostgresqlFieldClassification,PostgresqlFieldRequest} from './postgresql-field';
import type {PostgresqlRecordClassification,PostgresqlRecordRequest} from './postgresql-record';
import type {PostgresqlCardinalityClassification,PostgresqlCardinalityRequest} from './cardinality-postgresql';
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
}}
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function publicError(error:unknown,isNative:Guard):never{
 if(!isNative(error))throw error;
 const e=error as {code?:unknown;message?:unknown;path?:unknown};
 if(typeof e.code!=='string'||CONTROL.has(e.code)||!e.code.startsWith('POSTGRESQL_')&&e.code!=='REQUEST')throw error;
 throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');
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
 });
}
