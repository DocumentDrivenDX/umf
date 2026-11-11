// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {AvroTableSpecPolicy,AvroTableSpecProjection} from './avro-tablespec-types';
import type {TableSpecAvroPolicy,TableSpecAvroProjection} from './tablespec-avro-types';

type NativeErrorGuard=(error:unknown)=>boolean;
interface Engine {
 ['avro-tablespec-projection']:{
  projectAvroToTableSpec(fields:{source:Document;policy:AvroTableSpecPolicy}):unknown;
  projectTableSpecToAvro(fields:{source:Document;policy:TableSpecAvroPolicy}):unknown;
 };
}
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createAvroTableSpecRustDefault(engine:Engine,isNativeUmfCoreError:NativeErrorGuard=()=>false){
 function call<T>(operation:()=>unknown):T{try{return operation() as T;}catch(error){
  if(!isNativeUmfCoreError(error))throw error;
  const native=error as {code?:unknown;message?:unknown;path?:unknown};
  if(typeof native.code!=='string'||CONTROL_CODES.has(native.code)||(!native.code.startsWith('AVRO_')&&!native.code.startsWith('TABLESPEC_')&&native.code!=='REQUEST'))throw error;
  throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
 }}
 return Object.freeze({
  projectAvroToTableSpec(source:Document,policy:AvroTableSpecPolicy):AvroTableSpecProjection{return call(()=>engine['avro-tablespec-projection'].projectAvroToTableSpec({source,policy}));},
  projectTableSpecToAvro(source:Document,policy:TableSpecAvroPolicy):TableSpecAvroProjection{return call(()=>engine['avro-tablespec-projection'].projectTableSpecToAvro({source,policy}));},
 });
}
