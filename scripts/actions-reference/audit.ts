import type {SQL} from 'bun';
import {copyJson} from '../../src/model/json';
import {UmfError,type Json} from '../../src/model/types';
import {ReferenceActionPolicy} from './policy';
import type {TrustedActionSession} from './authentication';
import type {ReferenceStoreControl} from './store';
import {encodeReferenceIdentity,decodeReferenceJson} from './codec';
interface AuditBinding {profile:{id:'umf.actions.audit-roles';version:'1'};readerRoles:string[];detailRoles:string[]}
function roles(value:unknown):value is string[]{return Array.isArray(value)&&value.length<=64&&value.every(role=>typeof role==='string'&&role.length>0&&role.length<=256)&&new Set(value).size===value.length;}
function binding(value:unknown):value is AuditBinding{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;const object=value as Record<string,unknown>,profile=object.profile as Record<string,unknown>|undefined;
 return Object.keys(object).length===3&&Object.keys(object).every(key=>['profile','readerRoles','detailRoles'].includes(key))&&!!profile&&typeof profile==='object'&&!Array.isArray(profile)&&Object.keys(profile).length===2&&profile.id==='umf.actions.audit-roles'&&profile.version==='1'&&roles(object.readerRoles)&&roles(object.detailRoles);
}
function name(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.length<=256;}
export type ReferenceAuditRead={status:'denied'|'unsupported';code:string}|{status:'not-found'}|{status:'expired';code:'AUDIT_EXPIRED'}|{status:'audit';header:Json;details?:Json};
/** Host-only protected reader. Neither invoke roles nor replay authority grant audit access. */
export class ReferenceActionAudit {
 constructor(readonly policy:ReferenceActionPolicy){}
 /** Operator-owned reader configuration, serialized with access and membership changes. */
 async configure(store:string,module:string,action:string,readerRoles:unknown,detailRoles:unknown):Promise<void>{
  const config=copyJson({profile:{id:'umf.actions.audit-roles',version:'1'},readerRoles,detailRoles});if(!name(module)||!name(action)||!binding(config))throw Error('Invalid audit reader configuration');
  await this.configureIdentity(store,encodeReferenceIdentity([module,action]),config);
 }
 /** Separate three-component authority namespace; business audit families always have two components. */
 async configureOperational(store:string,domain:'projection'|'attempt',resource:string,readerRoles:unknown,detailRoles:unknown):Promise<void>{
  const config=copyJson({profile:{id:'umf.actions.audit-roles',version:'1'},readerRoles,detailRoles});if(!['projection','attempt'].includes(domain)||!name(resource)||!binding(config))throw Error('Invalid operational reader configuration');
  await this.configureIdentity(store,encodeReferenceIdentity(['umf.actions.operational',domain,resource]),config);
 }
 private async configureIdentity(store:string,identity:string,config:Json):Promise<void>{
  const payload=encodeReferenceIdentity(config);
  await this.policy.store.transaction(store,async(tx,control)=>{const rows=await tx`select id,binding from action_audit_policy where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity}`;if(rows.length&&rows[0]!.binding===payload)return;if(rows.length)await tx`update action_audit_policy set binding=${payload} where store=${control.id} and id=${rows[0]!.id}`;else await tx`insert into action_audit_policy(store,identity,binding) values (${control.id},${identity},${payload})`;await tx`update action_store set policy_version=policy_version+1 where id=${control.id}`;});
 }
 /** Published native-clock visibility horizon for future rows; existing deadlines stay immutable. */
 async retention(store:string,module:string,action:string,seconds:number):Promise<void>{
  if(!name(module)||!name(action)||!Number.isInteger(seconds)||seconds<1||seconds>31536000)throw Error('Invalid audit retention policy');const identity=encodeReferenceIdentity([module,action]);
  await this.policy.store.transaction(store,async(tx,control)=>{const rows=await tx`select id,seconds from action_audit_retention where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity}`;if(rows.length&&rows[0]!.seconds===seconds)return;if(rows.length)await tx`update action_audit_retention set seconds=${seconds} where store=${control.id} and id=${rows[0]!.id}`;else await tx`insert into action_audit_retention(store,identity,seconds) values (${control.id},${identity},${seconds})`;await tx`update action_store set policy_version=policy_version+1 where id=${control.id}`;});
 }
 private async role(tx:SQL,control:ReferenceStoreControl,session:TrustedActionSession,allowed:string[]):Promise<boolean>{for(const role of allowed){const identity=encodeReferenceIdentity([session.principal,role]);if((await tx`select id from action_membership where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity}`).length===1)return true;}return false;}
 async read(store:string,credential:unknown,input:unknown):Promise<ReferenceAuditRead>{
  let request:{module:string;action:string;attemptId:string;details?:boolean},session:TrustedActionSession;
  try{request=copyJson(input) as unknown as typeof request;if(!request||Array.isArray(request)||Object.keys(request).some(key=>!['module','action','attemptId','details'].includes(key))||!name(request.module)||!name(request.action)||typeof request.attemptId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(request.attemptId)||Object.hasOwn(request,'details')&&typeof request.details!=='boolean')return {status:'unsupported',code:'PARAMETER'};}catch{return {status:'unsupported',code:'PARAMETER'};}
  try{session=this.policy.issuer.authenticate(credential);}catch{return {status:'denied',code:'AUTHORIZATION'};}
  try{return await this.policy.store.transaction(store,async(tx,control)=>{
   if(session.tenant!==control.tenant)return {status:'denied',code:'AUTHORIZATION'};
   const family=encodeReferenceIdentity([request.module,request.action]),policies=await tx`select binding from action_audit_policy where store=${control.id} and lookup=action_identity_lookup(${family}) and identity=${family}`;let config:unknown;try{if(policies.length===1)config=decodeReferenceJson(policies[0]!.binding);}catch{}
   if(!binding(config)||!await this.role(tx,control,session,config.readerRoles)||request.details&&!await this.role(tx,control,session,config.detailRoles))return {status:'denied',code:'AUTHORIZATION'};
   if(control.invocation_fenced)return {status:'unsupported',code:'REVISION'};
   // Every denial above precedes the first query of protected audit rows.
   const identity=encodeReferenceIdentity(request.attemptId);
   // One native statement observes and irreversibly records expiry before visibility.
   await tx`update action_audit set expired=true where store=${control.id} and family=${family} and lookup=action_identity_lookup(${identity}) and identity=${identity} and expired=false and expires_at<=statement_timestamp()`;
   const visibility=await tx`select expired from action_audit where store=${control.id} and family=${family} and lookup=action_identity_lookup(${identity}) and identity=${identity}`;
   if(visibility.length!==1)return {status:'not-found'};if(visibility[0]!.expired)return {status:'expired',code:'AUDIT_EXPIRED'};
   const rows=request.details?await tx`select id,expired,expires_at::text,identity,actor,deployment,policy_version::text,decision,correlation,header,details from action_audit where store=${control.id} and family=${family} and lookup=action_identity_lookup(${identity}) and identity=${identity}`:await tx`select id,expired,expires_at::text,identity,actor,deployment,policy_version::text,decision,correlation,header from action_audit where store=${control.id} and family=${family} and lookup=action_identity_lookup(${identity}) and identity=${identity}`;
   if(rows.length!==1)return {status:'not-found'};const row=rows[0]!;if(row.expired)return {status:'expired',code:'AUDIT_EXPIRED'};let details:{target:Json;profile:Json;attemptId:Json};try{details=decodeReferenceJson(row.header) as typeof details;}catch(error){return {status:'unsupported',code:error instanceof UmfError&&error.code==='LIMIT'?'LIMIT':'AUDIT_PROFILE'};}
   const header=details as unknown as Record<string,unknown>,profile=header?.profile as Record<string,unknown>|undefined,target=header?.target as Record<string,unknown>|undefined;
   if(!header||typeof header!=='object'||Array.isArray(header)||Object.keys(header).length!==3||Object.keys(header).some(key=>!['attemptId','profile','target'].includes(key))||header.attemptId!==request.attemptId||!profile||Array.isArray(profile)||Object.keys(profile).length!==2||profile.id!=='umf.actions.tx'||profile.version!=='1'||!target||Array.isArray(target)||Object.keys(target).length!==3||Object.keys(target).some(key=>!['module','action','revision'].includes(key))||target.module!==request.module||target.action!==request.action||!name(target.revision))return {status:'unsupported',code:'AUDIT_PROFILE'};
   return {status:'audit',header:copyJson({attemptId:decodeReferenceJson(row.identity),actor:decodeReferenceJson(row.actor),deployment:row.deployment===null?null:decodeReferenceJson(row.deployment),policyVersion:row.policy_version,decision:row.decision,correlation:row.correlation===null?null:decodeReferenceJson(row.correlation),revision:details.target,profile:details.profile,retention:{clock:'postgresql.statement-time/1',expiresAt:row.expires_at}}),...(request.details?{details:decodeReferenceJson(row.details)}:{})};
  });}catch(error){if(error instanceof Error&&error.message==='Reference store does not resolve')return {status:'denied',code:'AUTHORIZATION'};throw error;}
 }
}
