// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {SqlServerAvroPolicy,SqlServerAvroProjection} from './sqlserver-avro';
type Guard=(error:unknown)=>boolean;
interface Engine{['sqlserver-avro-projection']:{projectSqlServerToAvro(fields:{source:Document;policy:SqlServerAvroPolicy}):unknown}}
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createSqlServerAvroRustDefault(engine:Engine,isNativeUmfCoreError:Guard=()=>false){
 return Object.freeze({projectSqlServerToAvro(source:Document,policy:SqlServerAvroPolicy):SqlServerAvroProjection{
  try{return engine['sqlserver-avro-projection'].projectSqlServerToAvro({source,policy}) as SqlServerAvroProjection}
  catch(error){if(!isNativeUmfCoreError(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROL.has(e.code)||(!e.code.startsWith('SQLSERVER_')&&e.code!=='REQUEST'))throw error;throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'')}
 }});
}
