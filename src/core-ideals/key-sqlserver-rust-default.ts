// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {CoreKeyDeclaration} from '../model/keys';
import type {KeySqlServerProjection,KeySqlServerRequest} from './key-sqlserver-projection';
type Engine={['key-sqlserver-projection']:{
 projectKeysToSqlServer(fields:{source:Document;authors:CoreKeyDeclaration[];request:KeySqlServerRequest}):unknown;
 verifyKeysSqlServerProjection(fields:{receipt:KeySqlServerProjection;current:NonNullable<KeySqlServerProjection['target']>}):unknown;
 recoverKeysSqlServerIdeal(fields:{receipt:KeySqlServerProjection;current:NonNullable<KeySqlServerProjection['target']>}):unknown;
}};
type NativeGuard=(error:unknown)=>boolean;
const CONTROL=new Set(['LIMIT','CAPACITY','RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createKeySqlServerRustDefault(engine:Engine,isNative:NativeGuard=()=>false){
 function call<T>(operation:()=>unknown):T {try{return operation() as T;}catch(error){if(!isNative(error))throw error;const native=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof native.code!=='string'||CONTROL.has(native.code)||!native.code.startsWith('KEY_SQLSERVER_')&&!native.code.startsWith('SQLSERVER_'))throw error;throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');}}
 return Object.freeze({
  projectKeysToSqlServer(source:Document,authors:CoreKeyDeclaration[],request:KeySqlServerRequest):KeySqlServerProjection{return call(()=>engine['key-sqlserver-projection'].projectKeysToSqlServer({source,authors,request}) as KeySqlServerProjection);},
  verifyKeysSqlServerProjection(receipt:KeySqlServerProjection,current:NonNullable<KeySqlServerProjection['target']>):KeySqlServerProjection{return call(()=>engine['key-sqlserver-projection'].verifyKeysSqlServerProjection({receipt,current}) as KeySqlServerProjection);},
  recoverKeysSqlServerIdeal(receipt:KeySqlServerProjection,current:NonNullable<KeySqlServerProjection['target']>):Document{return call(()=>engine['key-sqlserver-projection'].recoverKeysSqlServerIdeal({receipt,current}) as Document);},
 });
}
