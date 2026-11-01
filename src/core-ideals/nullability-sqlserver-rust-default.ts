// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {CoreNullabilityDeclaration} from '../model/nullability';
import type {NullabilitySqlServerProjection,NullabilitySqlServerRequest} from './nullability-sqlserver-projection';

type Engine={['nullability-sqlserver-projection']:{
 projectNullabilityToSqlServer(fields:{author:CoreNullabilityDeclaration;request:NullabilitySqlServerRequest}):unknown;
 recoverNullabilityFromSqlServer(fields:{receipt:NullabilitySqlServerProjection;nativeText:string}):unknown;
}};
type NativeGuard=(error:unknown)=>boolean;
const CONTROL=new Set(['LIMIT','CAPACITY','RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createNullabilitySqlServerRustDefault(engine:Engine,isNative:NativeGuard=()=>false){
 function call<T>(operation:()=>unknown):T {try{return operation() as T;}catch(error){if(!isNative(error))throw error;const native=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof native.code!=='string'||CONTROL.has(native.code)||!native.code.startsWith('NULLABILITY_SQLSERVER_')&&!native.code.startsWith('SQLSERVER_'))throw error;throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');}}
 return Object.freeze({
  projectNullabilityToSqlServer(author:CoreNullabilityDeclaration,request:NullabilitySqlServerRequest):NullabilitySqlServerProjection{return call(()=>engine['nullability-sqlserver-projection'].projectNullabilityToSqlServer({author,request}) as NullabilitySqlServerProjection);},
  recoverNullabilityFromSqlServer(receipt:NullabilitySqlServerProjection,nativeText:string):Document{return call(()=>engine['nullability-sqlserver-projection'].recoverNullabilityFromSqlServer({receipt,nativeText}) as Document);},
 });
}
