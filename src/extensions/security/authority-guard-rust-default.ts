// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import {SecurityAuthorityGuard as HostScheduledSecurityAuthorityGuard} from './authority-guard';
import type {SecurityAuthorityGuardSession} from './authority-guard';

export interface SecurityAuthorityGuardEngine { createSession(generation:string):SecurityAuthorityGuardSession }

function publicSession(session:SecurityAuthorityGuardSession,isNativeError:(error:unknown)=>boolean):SecurityAuthorityGuardSession {
 const call=<T>(work:()=>T):T=>{
  try{return work();}
  catch(error){
   if(!isNativeError(error))throw error;
   const native=error as {code?:unknown;message?:unknown;path?:unknown};
   if(typeof native.code==='string')throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
   throw error;
  }
 };
 return Object.freeze({
  beginRead(){return call(()=>session.beginRead());},
  beginChange(generation:string){return call(()=>session.beginChange(generation));},
  completeChange(token:number,committed:boolean){return call(()=>session.completeChange(token,committed));},
  close(){return call(()=>session.close());},
 });
}

/** Keep the existing Promise/AbortSignal queue in JS; Rust retains generation state. */
export function createSecurityAuthorityGuardRustDefault(engine:SecurityAuthorityGuardEngine,isNativeError:(error:unknown)=>boolean):new(generation:string)=>HostScheduledSecurityAuthorityGuard {
 const call=<T>(work:()=>T):T=>{try{return work();}catch(error){if(!isNativeError(error))throw error;const native=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof native.code==='string')throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');throw error;}};
 return class SecurityAuthorityGuard extends HostScheduledSecurityAuthorityGuard {
  constructor(generation:string){
   if(typeof generation!=='string')throw new UmfError('SECURITY_GUARD_REFUSED','Authority guard unavailable');
   const session=call(()=>engine.createSession(generation));
   super(generation,publicSession(session,isNativeError));
  }
 };
}
