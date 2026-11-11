// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {PostgresqlAvroPolicy,PostgresqlAvroProjection} from './postgresql-avro-types';
type Guard=(error:unknown)=>boolean;
interface Engine{['postgresql-avro-projection']:{projectPostgresqlToAvro(fields:{source:Document;policy:PostgresqlAvroPolicy}):unknown}}
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createPostgresqlAvroRustDefault(engine:Engine,isNativeUmfCoreError:Guard=()=>false){
 return Object.freeze({projectPostgresqlToAvro(source:Document,policy:PostgresqlAvroPolicy):PostgresqlAvroProjection{
  try{return engine['postgresql-avro-projection'].projectPostgresqlToAvro({source,policy}) as PostgresqlAvroProjection}
  catch(error){if(!isNativeUmfCoreError(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROL.has(e.code)||(!e.code.startsWith('POSTGRESQL_')&&e.code!=='REQUEST'))throw error;throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'')}
 }});
}
