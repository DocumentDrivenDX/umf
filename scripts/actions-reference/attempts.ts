import {SQL} from 'bun';
import {copyJson} from '../../src/model/json';
import type {Json} from '../../src/model/types';
import {ReferenceActionPolicy} from './policy';
import {ReferenceActionAudit} from './audit';
import {encodeReferenceIdentity,encodeReferenceJson,decodeReferenceJson} from './codec';
export interface ReferenceAttemptEvent {attemptId:string;phase:'started'|'observed';decision:string;code?:string;metadata:Json}
export interface ReferenceAttemptSink {append(event:ReferenceAttemptEvent):Promise<void>}
/** Independent best-effort observation journal. Acknowledged append is durable; missing completion is unresolved knowledge. */
export class ReferenceAttemptJournal implements ReferenceAttemptSink {
 private lost=0;
 get unacknowledgedAppends():number{return this.lost;}
 constructor(readonly url:string,readonly onUnavailable?:(event:{attemptId:string;phase:'started'|'observed'})=>void){}
 async append(event:ReferenceAttemptEvent):Promise<void>{
  const sql=new SQL({url:this.url,max:1,connectionTimeout:1});let timer:ReturnType<typeof setTimeout>|undefined;
  const operation=(async()=>{await sql.begin(async tx=>{await tx`set local statement_timeout = '500ms'`;await tx`set local lock_timeout = '500ms'`;await tx`insert into action_attempt(attempt,phase,header,details,expires_at) values (${event.attemptId},${event.phase},${encodeReferenceJson({profile:{id:'umf.actions.attempt-observation',version:'1'},attemptId:event.attemptId,phase:event.phase,decision:event.decision,...(event.code?{code:event.code}:{})})},${encodeReferenceJson(event.metadata)},clock_timestamp()+make_interval(secs=>coalesce((select seconds from action_attempt_retention where singleton=true),2592000)))`;});})();
  try{await Promise.race([operation,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Append acknowledgement unavailable')),1500);})]);}
  catch{this.lost++;try{void Promise.resolve(this.onUnavailable?.(Object.freeze({attemptId:event.attemptId,phase:event.phase}))).catch(()=>{});}catch{/* Trusted diagnostics cannot change execution. */}}
  finally{if(timer)clearTimeout(timer);await sql.close({timeout:0}).catch(()=>{});}
 }
}
/** Installation-level operational access, bound by the trusted host to an administration store. */
export class ReferenceAttemptReader {
 constructor(readonly policy:ReferenceActionPolicy,readonly administrationStore:string){}
 async configure(readerRoles:unknown,detailRoles:unknown):Promise<void>{await new ReferenceActionAudit(this.policy).configureOperational(this.administrationStore,'attempt','observation',readerRoles,detailRoles);}
 async retention(seconds:number):Promise<void>{if(!Number.isInteger(seconds)||seconds<1||seconds>31536000)throw Error('Invalid attempt retention');await this.policy.store.sql`insert into action_attempt_retention(singleton,seconds) values (true,${seconds}) on conflict(singleton) do update set seconds=excluded.seconds`;}
 async read(credential:unknown,input:unknown):Promise<{status:string;code?:string;header?:Json;details?:Json}>{
  let request:{attemptId:string;phase:'started'|'observed';details?:boolean};try{request=copyJson(input) as unknown as typeof request;if(!request||Array.isArray(request)||Object.keys(request).some(k=>!['attemptId','phase','details'].includes(k))||typeof request.attemptId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(request.attemptId)||!['started','observed'].includes(request.phase)||Object.hasOwn(request,'details')&&typeof request.details!=='boolean')return {status:'unsupported',code:'PARAMETER'};}catch{return {status:'unsupported',code:'PARAMETER'};}
  let session;try{session=this.policy.issuer.authenticate(credential);}catch{return {status:'denied',code:'AUTHORIZATION'};}
  try{return await this.policy.store.transaction(this.administrationStore,async(tx,control)=>{
   if(control.invocation_fenced||session.tenant!==control.tenant)return {status:'denied',code:'AUTHORIZATION'};
   const identity=encodeReferenceIdentity(['umf.actions.operational','attempt','observation']),rows=await tx`select binding from action_audit_policy where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity}`;let config:any;try{config=rows.length===1?decodeReferenceJson(rows[0]!.binding):null;}catch{}
   if(!config||Object.keys(config).length!==3||config.profile?.id!=='umf.actions.audit-roles'||config.profile?.version!=='1'||Object.keys(config.profile).length!==2||![config.readerRoles,config.detailRoles].every(roles=>Array.isArray(roles)&&roles.length<=64&&new Set(roles).size===roles.length&&roles.every(role=>typeof role==='string'&&role.length>0&&role.length<=256)))return {status:'denied',code:'AUTHORIZATION'};
   for(const roles of [config.readerRoles,...(request.details?[config.detailRoles]:[])]){let allowed=false;for(const role of roles){const member=encodeReferenceIdentity([session.principal,role]);if((await tx`select id from action_membership where store=${control.id} and lookup=action_identity_lookup(${member}) and identity=${member}`).length===1){allowed=true;break;}}if(!allowed)return {status:'denied',code:'AUTHORIZATION'};}
   // Establish existence once under a row lock. Inserts do not take the admin
   // store lock: never discover a newly committed row after the expiry check.
   const existing=await tx`select id,expired from action_attempt where attempt=${request.attemptId} and phase=${request.phase} for update`;
   if(!existing.length)return {status:'not-found'};const row=existing[0]!;if(row.expired)return {status:'expired',code:'ATTEMPT_EXPIRED'};
   const expired=await tx`update action_attempt set expired=true where id=${row.id} and expired=false and expires_at<=statement_timestamp() returning id`;
   if(expired.length)return {status:'expired',code:'ATTEMPT_EXPIRED'};
   const payload=request.details?await tx`select header,details from action_attempt where id=${row.id}`:await tx`select header from action_attempt where id=${row.id}`;
   let header:any;try{header=decodeReferenceJson(payload[0]!.header);}catch{return {status:'unsupported',code:'ATTEMPT_PROFILE'};}
   const profile=header?.profile;
   if(!header||typeof header!=='object'||Array.isArray(header)||Object.keys(header).some(key=>!['profile','attemptId','phase','decision','code'].includes(key))||Object.keys(header).length!==(Object.hasOwn(header,'code')?5:4)||!profile||typeof profile!=='object'||Array.isArray(profile)||Object.keys(profile).length!==2||profile.id!=='umf.actions.attempt-observation'||profile.version!=='1'||header.attemptId!==request.attemptId||header.phase!==request.phase||typeof header.decision!=='string'||(request.phase==='started'?header.decision!=='pending':!['committed','rejected','conflict','unsupported','denied','failed','indeterminate','host-error','rolled-back','expired','not-found'].includes(header.decision))||Object.hasOwn(header,'code')&&(typeof header.code!=='string'||!header.code||header.code.length>256))return {status:'unsupported',code:'ATTEMPT_PROFILE'};
   let details:Json|undefined;if(request.details){try{details=decodeReferenceJson(payload[0]!.details);}catch{return {status:'unsupported',code:'ATTEMPT_PROFILE'};}}
   return {status:'observation',header:copyJson(header),...(request.details?{details:details!}:{})};
  });}catch(error){if(error instanceof Error&&error.message==='Reference store does not resolve')return {status:'denied',code:'AUTHORIZATION'};throw error;}
 }
}
