import {test,expect} from 'bun:test';
import {cp,mkdir,rm,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import {ReferenceActionIssuer} from '../../scripts/actions-reference/authentication';
import {ReferenceActionPolicy} from '../../scripts/actions-reference/policy';
import {ReferenceActionExecutor} from '../../scripts/actions-reference/executor';
import {ReferenceHandlerRegistry} from '../../scripts/actions-reference/handlers';
import {seedReferenceEntity} from '../../scripts/actions-reference/state';
import {decodeReferenceJson} from '../../scripts/actions-reference/codec';
import type {ReferenceActionStore} from '../../scripts/actions-reference/store';
import {withReferenceStore} from './native-harness';
const alphabet=['invoke-A','invoke-B','lookup-A','revoke','grant','retire'] as const;
type Step=typeof alphabet[number];
type Implementation={Policy:typeof ReferenceActionPolicy;Executor:typeof ReferenceActionExecutor};
const original:Implementation={Policy:ReferenceActionPolicy,Executor:ReferenceActionExecutor};
function words(depth:number):Step[][]{return depth===0?[[]]:words(depth-1).flatMap(prefix=>alphabet.map(step=>[...prefix,step]));}
function canonical(value:unknown):unknown{if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)]));return value;}
class NativeRefinementMismatch extends Error{constructor(readonly context:string,actual:unknown,expected:unknown){super('NATIVE_REFINEMENT '+context+' expected '+JSON.stringify(expected)+' got '+JSON.stringify(actual));}}
function equal(actual:unknown,expected:unknown,context:string):void{if(JSON.stringify(canonical(actual))!==JSON.stringify(canonical(expected)))throw new NativeRefinementMismatch(context,actual,expected);}
/** Independent finite semantics: one idempotent SET, two tokens, one role and retirement.
 * No executor/gateway/recipe/outcome/policy function implements the model. */
async function trace(store:ReferenceActionStore,name:string,steps:Step[],implementation=original){
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
/** @covers US-901-AC2 @covers US-901-AC4 @covers US-901-AC5 @covers US-901-AC6 @covers US-901-AC11 */
test('native bounded traces refine independent authorization, token, retirement and atomic-state semantics',async()=>{
 await withReferenceStore(async(store,version)=>{let checked=0,transitions=0;for(const word of words(3)){const result=await trace(store,'finite-'+checked,word);checked++;transitions+=result.transitions;}expect(checked).toBe(216);expect(transitions).toBe(648);console.log(JSON.stringify({nativeRefinement:{profile:'umf.actions.finite-idempotent-set/1',nativeVersion:version,alphabet,depth:3,traces:checked,transitions,mismatches:0,scope:'One scalar SET, two tokens, one human/role, serial schedules; no universal graph or concurrent refinement claim'}}));});
},180000);
/** Execute real copied consumer mutations; only a semantic mismatch kills a mutant.
 * Import/setup/runtime failures before trace execution are qualification failures. */
test('native refinement kills replay, authorization and terminal-audit implementation mutants',async()=>{
 const root=new URL('../../',import.meta.url).pathname,directory=root+'.cache/action-refinement-mutants/'+crypto.randomUUID();await mkdir(directory,{recursive:true});const definitions=[
  {id:'skip-replay',file:'executor.ts',from:'if(request.key){const replay=',to:'if(false&&request.key){const replay=',word:['invoke-A','invoke-A'] as Step[],reason:'invoke-A → invoke-A exact replay'},
  {id:'ignore-role-membership',file:'policy.ts',from:'if(rows.length===1)return;',to:'return;',occurrences:2,word:['invoke-A','revoke','invoke-A'] as Step[],reason:'invoke-A → revoke → invoke-A authorization'},
  {id:'omit-terminal-audit',file:'executor.ts',from:'   await tx`insert into action_audit(',to:'   if(false)await tx`insert into action_audit(',word:['invoke-A'] as Step[],reason:'invoke-A atomic audit'}
 ];
 try{await withReferenceStore(async(store,version)=>{const witnesses=[];for(const definition of definitions){await trace(store,'control-'+definition.id,definition.word);const home=directory+'/'+definition.id;await mkdir(home+'/scripts',{recursive:true});await cp(root+'scripts/actions-reference',home+'/scripts/actions-reference',{recursive:true});await symlink(root+'src',home+'/src','dir');const path=home+'/scripts/actions-reference/'+definition.file,source=await Bun.file(path).text();if(source.split(definition.from).length-1!==('occurrences' in definition?definition.occurrences:1))throw Error('Mutation source anchor count differs');const changed=source.replaceAll(definition.from,definition.to);await Bun.write(path,changed);const {ReferenceActionExecutor:Executor}=await import(home+'/scripts/actions-reference/executor.ts'),{ReferenceActionPolicy:Policy}=await import(home+'/scripts/actions-reference/policy.ts');let killed=false,reason='';try{await trace(store,'mutant-'+definition.id,definition.word,{Policy,Executor});}catch(error){reason=String(error);if(!(error instanceof NativeRefinementMismatch)||error.context!==definition.reason)throw error;killed=true;}expect(killed).toBe(true);witnesses.push({id:definition.id,sourceSha256:createHash('sha256').update(source).digest('hex'),mutantSha256:createHash('sha256').update(changed).digest('hex'),trace:definition.word,reason});}expect(witnesses).toHaveLength(3);let invocations=0;class RuntimeFaultExecutor extends ReferenceActionExecutor{override async invoke(...args:Parameters<ReferenceActionExecutor['invoke']>){if(++invocations===2)throw Error('INJECTED_RUNTIME_FAILURE');return super.invoke(...args);}}await expect(trace(store,'runtime-failure-control',['invoke-A','invoke-A'],{Policy:ReferenceActionPolicy,Executor:RuntimeFaultExecutor})).rejects.toThrow('Native execution error');expect(invocations).toBe(2);console.log(JSON.stringify({nativeMutation:{nativeVersion:version,killed:3,total:3,witnesses}}));});}finally{await rm(directory,{recursive:true,force:true});}
},90000);
