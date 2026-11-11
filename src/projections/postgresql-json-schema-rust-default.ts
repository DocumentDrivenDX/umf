// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {PostgresqlRowPolicy,PostgresqlRowProjection} from './postgresql-json-schema-types';
type Guard=(error:unknown)=>boolean;
interface Engine{['postgresql-json-schema-projection']:{projectPostgresqlRowToJsonSchema(fields:{source:Document;policy:PostgresqlRowPolicy}):unknown}}
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createPostgresqlRowJsonSchemaRustDefault(engine:Engine,isNativeUmfCoreError:Guard=()=>false){
 return Object.freeze({projectPostgresqlRowToJsonSchema(source:Document,policy:PostgresqlRowPolicy):PostgresqlRowProjection{
  try{return engine['postgresql-json-schema-projection'].projectPostgresqlRowToJsonSchema({source,policy}) as PostgresqlRowProjection}
  catch(error){if(!isNativeUmfCoreError(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROL.has(e.code)||(!e.code.startsWith('POSTGRESQL_')&&e.code!=='REQUEST'))throw error;throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'')}
 }});
}
