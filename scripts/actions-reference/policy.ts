import type {SQL} from 'bun';
import {copyJson} from '../../src/model/json';
import {admitAction} from '../../src/extensions/actions/structure';
import type {Action} from '../../src/extensions/actions';
import {ReferenceActionIssuer,type TrustedActionSession} from './authentication';
import {ReferenceActionStore,type ReferenceStoreControl} from './store';
import {encodeReferenceIdentity,encodeReferenceJson,decodeReferenceJson} from './codec';
interface ReplayBinding {kind:'roles';profile:{id:'umf.actions.roles';version:'1'};roles:string[]}
function validReplayBinding(input:unknown):input is ReplayBinding {
 if(!input||typeof input!=='object'||Array.isArray(input))return false;const binding=input as Record<string,unknown>,profile=binding.profile;
 if(Object.keys(binding).some(key=>!['kind','profile','roles'].includes(key))||binding.kind!=='roles'||!profile||typeof profile!=='object'||Array.isArray(profile))return false;
 const config=profile as Record<string,unknown>,roles=binding.roles;
 return !Object.keys(config).some(key=>!['id','version'].includes(key))&&config.id==='umf.actions.roles'&&config.version==='1'&&Array.isArray(roles)&&roles.length>0&&roles.length<=64&&roles.every(role=>typeof role==='string'&&role.length>0&&role.length<=256)&&new Set(roles).size===roles.length;
}
/** Trusted policy mutations and protected access share the qualified store control lock. */
export class ReferenceActionPolicy {
 constructor(readonly store:ReferenceActionStore,readonly issuer:ReferenceActionIssuer){}
 async membership(storeName:string,principal:string,role:string,allowed:boolean):Promise<void>{
  if(typeof principal!=='string'||!principal||principal.length>256||typeof role!=='string'||!role||role.length>256||typeof allowed!=='boolean')throw Error('Invalid policy membership');
  const identity=encodeReferenceIdentity([principal,role]);
  await this.store.transaction(storeName,async(tx,control)=>{
   const rows=await tx`select id from action_membership where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity}`;
   if(allowed&&!rows.length)await tx`insert into action_membership(store,identity,principal,role) values (${control.id},${identity},${encodeReferenceJson(principal)},${encodeReferenceJson(role)})`;
   if(!allowed&&rows.length)await tx`delete from action_membership where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity}`;
   if(allowed!==Boolean(rows.length))await tx`update action_store set policy_version=policy_version+1 where id=${control.id}`;
  });
 }
 /** Trusted deployment configuration; grants token-presence discovery, never protected results. */
 async replayDiscovery(storeName:string,module:string,action:string,rolesInput:string[]):Promise<void>{
  const roles=copyJson(rolesInput) as unknown as string[];
  const binding={kind:'roles',profile:{id:'umf.actions.roles',version:'1'},roles};
  if([module,action].some(value=>typeof value!=='string'||!value||value.length>256)||!validReplayBinding(binding))throw Error('Invalid replay discovery policy');
  const identity=encodeReferenceIdentity([module,action]),payload=encodeReferenceJson(binding);
  await this.store.transaction(storeName,async(tx,control)=>{
   const rows=await tx`select id,binding,enabled from action_replay_policy where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity}`;
   if(!rows.length)await tx`insert into action_replay_policy(store,identity,binding) values (${control.id},${identity},${payload})`;
   else if((rows[0]!.binding!==payload||!rows[0]!.enabled))await tx`update action_replay_policy set binding=${payload},enabled=true where store=${control.id} and id=${rows[0]!.id}`;
   if(!rows.length||(rows[0]!.binding!==payload||!rows[0]!.enabled))await tx`update action_store set policy_version=policy_version+1 where id=${control.id}`;
  });
 }
 async disableReplayDiscovery(storeName:string,module:string,action:string):Promise<void>{
  if([module,action].some(value=>typeof value!=='string'||!value||value.length>256))throw Error('Invalid replay discovery identity');const identity=encodeReferenceIdentity([module,action]);
  await this.store.transaction(storeName,async(tx,control)=>{const rows=await tx`update action_replay_policy set enabled=false where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity} and enabled returning id`;if(rows.length)await tx`update action_store set policy_version=policy_version+1 where id=${control.id}`;});
 }
 async authorizeReplayDiscovery(tx:SQL,control:ReferenceStoreControl,session:TrustedActionSession,module:string,action:string):Promise<void>{
  if(session.tenant!==control.tenant)throw Error('AUTHORIZATION');
  const identity=encodeReferenceIdentity([module,action]),policies=await tx`select binding,enabled from action_replay_policy where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity}`;
  if(policies.length!==1||!policies[0]!.enabled)throw Error('AUTHORIZATION');
  let binding:unknown;try{binding=decodeReferenceJson(policies[0]!.binding);}catch{throw Error('AUTHORIZATION');}
  if(!validReplayBinding(binding))throw Error('AUTHORIZATION');
  const roles=binding.roles;
  for(const role of roles){const membership=encodeReferenceIdentity([session.principal,role]);const rows=await tx`select id from action_membership where store=${control.id} and lookup=action_identity_lookup(${membership}) and identity=${membership}`;if(rows.length===1)return;}
  throw Error('AUTHORIZATION');
 }
 async authorize(tx:SQL,control:ReferenceStoreControl,session:TrustedActionSession,actionInput:Action):Promise<void>{
  const action=admitAction(actionInput),auth=action.authorization;
  if(session.tenant!==control.tenant)throw Error('AUTHORIZATION');
  if(Object.keys(auth).some(key=>!['kind','profile','roles'].includes(key))||Object.keys(auth.profile).some(key=>!['id','version'].includes(key))||auth.kind!=='roles'||auth.profile.id!=='umf.actions.roles'||auth.profile.version!=='1')throw Error('UNSUPPORTED_AUTHORIZATION');
  if(auth.roles.some((role:unknown)=>typeof role!=='string'||!role||role.length>256))throw Error('UNSUPPORTED_AUTHORIZATION');
  for(const role of auth.roles){const identity=encodeReferenceIdentity([session.principal,role]);const rows=await tx`select id from action_membership where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity}`;if(rows.length===1)return;}
  throw Error('AUTHORIZATION');
 }
 async protected<T>(storeName:string,credential:unknown,action:Action,operation:(tx:SQL,control:ReferenceStoreControl,session:TrustedActionSession)=>Promise<T>):Promise<T>{
  const session=this.issuer.authenticate(credential),snapshot=admitAction(action);
  return this.store.transaction(storeName,async(tx,control)=>{await this.authorize(tx,control,session,snapshot);return operation(tx,control,session);});
 }
}
