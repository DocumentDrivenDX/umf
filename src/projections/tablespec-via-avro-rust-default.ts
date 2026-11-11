// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {TableSpecViaAvroPolicy,TableSpecViaAvroProjection} from './tablespec-via-avro-types';

type Guard=(error:unknown)=>boolean;
interface Engine {
 ['tablespec-via-avro-projection']:{
  projectToTableSpecViaAvro(fields:{source:Document;policy:TableSpecViaAvroPolicy}):unknown;
 };
}
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createTableSpecViaAvroRustDefault(engine:Engine,isNativeUmfCoreError:Guard=()=>false){
 return Object.freeze({projectToTableSpecViaAvro(source:Document,policy:TableSpecViaAvroPolicy):TableSpecViaAvroProjection{
  try{return engine['tablespec-via-avro-projection'].projectToTableSpecViaAvro({source,policy}) as TableSpecViaAvroProjection}
  catch(error){if(!isNativeUmfCoreError(error))throw error;const native=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof native.code!=='string'||CONTROL.has(native.code)||(!native.code.startsWith('TABLESPEC_')&&!native.code.startsWith('AVRO_')&&!native.code.startsWith('POSTGRESQL_')&&!native.code.startsWith('SQLSERVER_')&&!native.code.startsWith('PARQUET_')&&native.code!=='REQUEST'))throw error;throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'')}
 }});
}
