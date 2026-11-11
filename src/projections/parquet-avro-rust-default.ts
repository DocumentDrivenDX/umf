// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {ParquetAvroPolicy,ParquetAvroProjection} from './parquet-avro-types';

type Guard=(error:unknown)=>boolean;
interface Engine {
 ['parquet-avro-projection']:{
  projectParquetToAvro(fields:{source:Document;policy:ParquetAvroPolicy}):unknown;
 };
}
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createParquetAvroRustDefault(engine:Engine,isNativeUmfCoreError:Guard=()=>false){
 return Object.freeze({projectParquetToAvro(source:Document,policy:ParquetAvroPolicy):ParquetAvroProjection{
  try{return engine['parquet-avro-projection'].projectParquetToAvro({source,policy}) as ParquetAvroProjection}
  catch(error){if(!isNativeUmfCoreError(error))throw error;const native=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof native.code!=='string'||CONTROL.has(native.code)||(!native.code.startsWith('PARQUET_')&&native.code!=='REQUEST'))throw error;throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'')}
 }});
}
