// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,type Document} from '../model/types';
import type {SqlServerDdlPolicy,SqlServerDdlProjection} from './sqlserver-ddl';
type Guard=(error:unknown)=>boolean;
interface Engine{['sqlserver-ddl-projection']:{projectSqlServerToDdl(fields:{source:Document;policy:SqlServerDdlPolicy}):unknown}}
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createSqlServerDdlRustDefault(engine:Engine,isNativeUmfCoreError:Guard=()=>false){
 return Object.freeze({projectSqlServerToDdl(source:Document,policy:SqlServerDdlPolicy):SqlServerDdlProjection{
  try{return engine['sqlserver-ddl-projection'].projectSqlServerToDdl({source,policy}) as SqlServerDdlProjection}
  catch(error){if(!isNativeUmfCoreError(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROL.has(e.code)||(!e.code.startsWith('SQLSERVER_')&&e.code!=='REQUEST'))throw error;throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'')}
 }});
}
