// SPDX-License-Identifier: MIT OR Apache-2.0
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import {ReferenceActionIssuer} from '../../scripts/actions-reference/authentication';
import {ReferenceActionPolicy} from '../../scripts/actions-reference/policy';
import {ReferenceActionExecutor} from '../../scripts/actions-reference/executor';
import {ReferenceHandlerRegistry} from '../../scripts/actions-reference/handlers';
import {seedReferenceEntity} from '../../scripts/actions-reference/state';
import {decodeReferenceJson} from '../../scripts/actions-reference/codec';
import type {ReferenceActionStore} from '../../scripts/actions-reference/store';
export const alphabet=['invoke-A','invoke-B','lookup-A','revoke','grant','retire'] as const;
export type Step=typeof alphabet[number];
type Implementation={Policy:typeof ReferenceActionPolicy;Executor:typeof ReferenceActionExecutor};
const original:Implementation={Policy:ReferenceActionPolicy,Executor:ReferenceActionExecutor};
export function words(depth:number):Step[][]{return depth===0?[[]]:words(depth-1).flatMap(prefix=>alphabet.map(step=>[...prefix,step]));}
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));return value;}
export class NativeRefinementMismatch extends Error{constructor(readonly context:string,actual:unknown,expected:unknown){super('NATIVE_REFINEMENT '+context+' expected '+JSON.stringify(expected)+' got '+JSON.stringify(actual));}}
function equal(actual:unknown,expected:unknown,context:string):void{if(JSON.stringify(canonical(actual))!==JSON.stringify(canonical(expected)))throw new NativeRefinementMismatch(context,actual,expected);}
/** Independent finite semantics: one idempotent SET, two tokens, one role and retirement.
 * No executor/gateway/recipe/outcome/policy function implements the model. */
export async function trace(store:ReferenceActionStore,name:string,steps:Step[],implementation=original){
 await store.create(name,'tenant','epoch');const issuer=new ReferenceActionIssuer(),policy=new implementation.Policy(store,issuer),executor=new implementation.Executor(policy,new ReferenceHandlerRegistry(),{append:async()=>{}}),source=structuredClone(fixture) as unknown as Document,target={module:'sales',action:'approve',revision:'r'},credential=issuer.issue({tenant:'tenant',principal:'human',service:'model'});(source.modules[0]!.extensions!['umf.actions'] as any).actions[0].authorization.profile={id:'umf.actions.roles',version:'1'};
 await executor.admission.revisions.retain(name,target,source);await policy.membership(name,'human','approver',true);await policy.replayDiscovery(name,'sales','approve',['approver']);await store.transaction(name,(tx,control)=>seedReferenceEntity(tx,control,source,{module:'sales',element:'order'},{'["sales","id"]':{string:'one'},'["sales","status"]':{string:'pending'}},'initial'));
 let granted=true,retired=false,approved=false,terminals=0,calls=0,resourceVersion='initial';const retained=new Map<string,unknown>();
 const request=(key:string)=>({protocol:'umf.actions.tx/1',target,key,inputs:{order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'one'}]}}});
 for(let index=0;index<steps.length;index++){
  const step=steps[index]!,context=steps.slice(0,index+1).join(' → ');if(step==='revoke'||step==='grant'){await policy.membership(name,'human','approver',step==='grant');granted=step==='grant';}else if(step==='retire'){await executor.admission.revisions.lifecycle(name,target,'retired');retired=true;}else{
   const key=step==='invoke-B'?'B':'A';let actual:any;try{calls++;actual=step==='lookup-A'?await executor.outcomes.lookup(name,credential,request(key)):await executor.invoke(name,credential,request(key));}catch(error){throw new Error('Native execution error at '+context,{cause:error});}
   if(!granted)equal(actual,{status:'denied',code:'AUTHORIZATION'},context+' authorization');
   else if(retained.has(key))equal(actual,retained.get(key),context+' exact replay');
   else if(step==='lookup-A')equal(actual,{status:'not-found'},context);
   else if(retired)equal(actual,{status:'unsupported',code:'REVISION'},context);
   else {equal(actual.status,'committed',context);equal(actual.revision,target,context+' revision');equal(actual.noOp,approved,context+' no-op');equal(actual.outputs,{},context+' outputs');equal(actual.changes,approved?[]:[{kind:'updated',entity:request(key).inputs.order}],context+' changes');equal(actual.verification,{kind:'recipe',effects:[{effect:'approve-status',status:'verified',outcome:approved?'no-op':'changed'}],postconditions:[],frames:'enforced',constraints:'verified'},context+' verification');equal(actual.receipt,{store:name,epoch:'epoch',version:actual.version},context+' receipt');if(typeof actual.version!=='string'||!actual.version)throw Error('NATIVE_REFINEMENT missing opaque version');if(approved)equal(actual.version,resourceVersion,context+' no-op version');else {if(actual.version===resourceVersion)throw new NativeRefinementMismatch(context+' changed resource version',actual.version,'a fresh opaque stamp');resourceVersion=actual.version;}retained.set(key,structuredClone(actual));approved=true;terminals++;}
  }
  // Observe durable native state independently after every transition, not only a final response.
  const [row]=await store.sql`select business_sequence::text as sequence,(select fields from action_entity where store=s.id) as fields,(select version from action_entity where store=s.id) as version,(select count(*)::int from action_outcome where store=s.id) as outcomes,(select count(*)::int from action_audit where store=s.id) as audits,(select count(*)::int from action_outbox where store=s.id) as outbox,(select count(*)::int from action_receipt where store=s.id) as receipts from action_store s where identity=${JSON.stringify(name)}`;
  equal(row!.sequence,approved?'1':'0',context+' sequence');equal((decodeReferenceJson(row!.fields) as any)['["sales","status"]'],{string:approved?'approved':'pending'},context+' state');equal(decodeReferenceJson(row!.version),resourceVersion,context+' resource version');equal(row!.outcomes,terminals,context+' terminal outcomes');equal(row!.audits,terminals,context+' atomic audit');equal(row!.outbox,approved?1:0,context+' atomic outbox');equal(row!.receipts,approved?2:1,context+' exact receipt count');if(approved){const receipts=await store.sql`select r.sequence::text as sequence,r.epoch from action_receipt r join action_store s on s.id=r.store where s.identity=${JSON.stringify(name)} and r.version=${JSON.stringify(resourceVersion)}`;equal(receipts.map((row:any)=>({sequence:row.sequence,epoch:decodeReferenceJson(row.epoch)})),[{sequence:'1',epoch:'epoch'}],context+' exact receipt mapping');}
 }
 return {calls,transitions:steps.length};
}
