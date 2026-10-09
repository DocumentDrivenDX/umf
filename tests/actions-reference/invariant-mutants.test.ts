import {test, expect} from 'bun:test';
import {cp, mkdir, mkdtemp, rm, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import {ReferenceActionIssuer} from '../../scripts/actions-reference/authentication';
import {ReferenceActionPolicy} from '../../scripts/actions-reference/policy';
import {ReferenceActionExecutor} from '../../scripts/actions-reference/executor';
import {ReferenceRevisionRepository} from '../../scripts/actions-reference/revisions';
import {prepareReferenceAction} from '../../scripts/actions-reference/preparation';
import {freezeReferenceState, seedReferenceEntity} from '../../scripts/actions-reference/state';
import {ReferenceActionProjection, type ReferenceProjectionGraph} from '../../scripts/actions-reference/projection';
import type {ReferenceActionStore} from '../../scripts/actions-reference/store';
import {decodeReferenceJson, encodeReferenceIdentity} from '../../scripts/actions-reference/codec';
import {withReferenceStore} from './native-harness';

class InvariantSemanticMismatch extends Error {
 constructor(readonly boundary:string, readonly actual:unknown, readonly expected:unknown) {
  super('INVARIANT_MISMATCH '+boundary+' expected '+JSON.stringify(expected)+' got '+JSON.stringify(actual));
 }
}
function canonical(value:unknown):unknown {
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical(item)]));
 return value;
}
function equal(actual:unknown,expected:unknown,boundary:string):void {
 if(JSON.stringify(canonical(actual))!==JSON.stringify(canonical(expected)))throw new InvariantSemanticMismatch(boundary,actual,expected);
}
/** Only the specified observed invariant can kill a mutant; execution/setup errors escape. */
async function requireSemanticKill(operation:()=>Promise<void>,boundary:string):Promise<InvariantSemanticMismatch> {
 try{await operation();}catch(error){
  if(error instanceof InvariantSemanticMismatch&&error.boundary===boundary)return error;
  throw error;
 }
 throw Error('Implementation mutant survived '+boundary);
}
const record={module:'sales',element:'order'}, target={module:'sales',action:'approve',revision:'r'};
const input=(id:string)=>({key:{...record,key:'pk'},components:[{string:id}]});
const fields=(id:string)=>({'["sales","id"]':{string:id},'["sales","status"]':{string:'pending'}});
function document():Document {
 const source=structuredClone(fixture) as unknown as Document;
 (source.modules[0]!.extensions!['umf.actions'] as any).actions[0].authorization.profile={id:'umf.actions.roles',version:'1'};
 return source;
}

/** Native aliases are the independent identity oracle; the consumer still performs real lookup/freeze. */
async function aliasHistory(store:ReferenceActionStore,name:string,freeze:typeof freezeReferenceState):Promise<void> {
 await store.create(name,'tenant','epoch');
 const source=document(),module=source.modules[0]!,action=(module.extensions!['umf.actions'] as any).actions[0],model=module.elements.find(item=>item.id==='order')!;
 module.elements.push({id:'external',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});
 (model.members as any[]).push({module:'sales',element:'external'});
 (model.keys as any[]).push({id:'external',name:'external',primary:false,fields:[{module:'sales',element:'external'}]});
 action.parameters.push({id:'alternate',kind:'entity',target:{...record,key:'external'},required:true});
 action.reads=[{...structuredClone(action.writes[0]),id:'alternate-read',selector:{language:'umf.actions.keys',version:'1',expression:'{"entity":"alternate"}',references:[{parameter:'alternate'}]}}];
 const revisions=new ReferenceRevisionRepository(store);
 await revisions.retain(name,target,source);
 await store.transaction(name,(tx,control)=>seedReferenceEntity(tx,control,source,record,{...fields('one'),'["sales","external"]':{string:'external-one'}},'original-version'));
 const prepared=prepareReferenceAction(await revisions.read(name,target),{protocol:'umf.actions.tx/1',target,inputs:{order:input('one'),alternate:{key:{...record,key:'external'},components:[{string:'external-one'}]}}});
 const observed=await store.transaction(name,async(tx,control)=>{
  const aliases=await tx`select entity::text from action_key_alias where store=${control.id} order by id`;
  if(aliases.length!==2||new Set(aliases.map((row:any)=>row.entity)).size!==1)throw Error('Native alias setup did not establish two Keys for one entity');
  const state=await freeze(tx,control,prepared);
  return {nativeId:aliases[0]!.entity as string,state};
 });
 equal(observed.state.missingInputs,[],'alias selected input existence');
 equal(observed.state.frames.map(frame=>frame.identity.key.key),['external','pk'],'alias distinct selected Keys');
 equal(observed.state.frames.map(frame=>frame.entity!.id),[observed.nativeId,observed.nativeId],'alias native entity resolution');
 equal(observed.state.frames.map(frame=>frame.entity!.version),['original-version','original-version'],'alias shared resource stamp');
 equal(observed.state.frames.map(frame=>frame.access),['read','write'],'alias permission separation');
 equal(observed.state.frames.map(frame=>frame.canonical),['entity:'+observed.nativeId,'entity:'+observed.nativeId],'alias canonical identity');
}

/** Full native graph read; neither projection snapshot nor event fold computes the expectation. */
async function nativeGraph(store:ReferenceActionStore,name:string):Promise<ReferenceProjectionGraph> {
 const entities=await store.sql`select e.id::text,e.record,e.fields,e.version from action_entity e join action_store s on s.id=e.store where s.identity=${encodeReferenceIdentity(name)} order by e.id`;
 const links=await store.sql`select l.relationship,l.source_entity::text,l.target_entity::text from action_link l join action_store s on s.id=l.store where s.identity=${encodeReferenceIdentity(name)} order by l.id`;
 return {profile:{id:'umf.actions.native-graph',version:'1'},entities:entities.map((row:any)=>({id:row.id,record:decodeReferenceJson(row.record),fields:decodeReferenceJson(row.fields),version:decodeReferenceJson(row.version)})),links:links.map((row:any)=>({relationship:decodeReferenceJson(row.relationship),sourceEntity:row.source_entity,targetEntity:row.target_entity}))} as ReferenceProjectionGraph;
}
/** Two independent entity updates make skipping event1 observably incomplete, never a last-value coincidence. */
async function prefixHistory(store:ReferenceActionStore,name:string,Projection:typeof ReferenceActionProjection):Promise<void> {
 await store.create(name,'tenant','epoch');
 const issuer=new ReferenceActionIssuer(),policy=new ReferenceActionPolicy(store,issuer),executor=new ReferenceActionExecutor(policy,undefined,{append:async()=>{}}),view=new Projection(policy),source=document(),credential=issuer.issue({tenant:'tenant',principal:'human',service:'invariant-model'});
 await executor.admission.revisions.retain(name,target,source);
 await policy.membership(name,'human','approver',true);
 await policy.replayDiscovery(name,'sales','approve',['approver']);
 for(const id of ['one','two'])await store.transaction(name,(tx,control)=>seedReferenceEntity(tx,control,source,record,fields(id),'original-version'));
 await view.register(name,'primary',['approver']);
 const baseline=await nativeGraph(store,name),receipts=[];
 for(const id of ['one','two']){
  const result=await executor.invoke(name,credential,{protocol:'umf.actions.tx/1',target,key:id,inputs:{order:input(id)}});
  if(result.status!=='committed')throw Error('Native prefix setup invocation did not commit: '+JSON.stringify(result));
  receipts.push(result.receipt);
 }
 const complete=await nativeGraph(store,name);
 equal(complete.entities.map(entity=>entity.fields['["sales","status"]']),[{string:'approved'},{string:'approved'}],'prefix native setup changes');
 const delivery=await view.deliver(name,'primary',{epoch:'epoch',sequence:'2'});
 const [row]=await store.sql`select p.prefix::text,p.content from action_projection p join action_store s on s.id=p.store where s.identity=${encodeReferenceIdentity(name)}`;
 const queued=await store.sql`select e.sequence::text from action_projection_event e join action_store s on s.id=e.store where s.identity=${encodeReferenceIdentity(name)} order by e.sequence`;
 const read=await view.readAtLeast(name,credential,{projection:'primary',receipt:receipts[1]!});
 equal({delivery,prefix:row!.prefix,content:decodeReferenceJson(row!.content),queued:queued.map((entry:any)=>entry.sequence),readStatus:read.status},
  {delivery:{status:'delivered',prefix:'0'},prefix:'0',content:baseline,queued:['2'],readStatus:'pending'},'projection missing-prefix visibility');
 // Positive progress prevents an implementation that simply refuses all delivery from passing the control.
 equal(await view.deliver(name,'primary',{epoch:'epoch',sequence:'1'}),{status:'delivered',prefix:'2'},'projection contiguous progress');
 const visible=await view.readAtLeast(name,credential,{projection:'primary',receipt:receipts[1]!});
 equal(visible.status,'visible','projection complete visibility');
 if(visible.status!=='visible')throw Error('Expected complete projection');
 equal(visible.content,complete,'projection complete native content');
 equal(await view.deliver(name,'primary',{epoch:'epoch',sequence:'2'}),{status:'delivered',prefix:'2'},'projection duplicate idempotency');
}

/** @covers US-056-AC8 @covers US-056-AC12 */
test('native alias and projection histories kill actual canonicalization and prefix-gap implementation mutants',async()=>{
 const root=new URL('../../',import.meta.url).pathname,directory=await mkdtemp(join(tmpdir(),'umf-action-invariant-mutants-'));
 try{await withReferenceStore(async(store,nativeVersion)=>{
  const definitions=[
   {id:'per-key-canonical-identity',file:'state.ts',from:"canonical:entity?'entity:'+entity.id:",to:"canonical:entity?'key:'+referenceAliasIdentity(identity.entity,identity.tupleHex):",boundary:'alias canonical identity'},
   {id:'skip-missing-projection-prefix',file:'projection.ts',from:'const next=prefix+1n,id=',to:'const next=applied===0?BigInt(request.sequence):prefix+1n,id=',boundary:'projection missing-prefix visibility'}
  ] as const;
  const witnesses=[];
  for(const definition of definitions){
   if(definition.file==='state.ts')await aliasHistory(store,'control-'+definition.id,freezeReferenceState);
   else await prefixHistory(store,'control-'+definition.id,ReferenceActionProjection);
   const home=join(directory,definition.id);await mkdir(home+'/scripts',{recursive:true});
   await cp(root+'scripts/actions-reference',home+'/scripts/actions-reference',{recursive:true});await symlink(root+'src',home+'/src','dir');
   const path=home+'/scripts/actions-reference/'+definition.file,source=await Bun.file(path).text();
   if(source.split(definition.from).length-1!==1)throw Error('Mutation source anchor count differs for '+definition.id);
   const changed=source.replace(definition.from,definition.to);await Bun.write(path,changed);
   let operation:()=>Promise<void>;
   if(definition.file==='state.ts'){
    const copied=await import(path) as typeof import('../../scripts/actions-reference/state');
    operation=()=>aliasHistory(store,'mutant-'+definition.id,copied.freezeReferenceState);
   }else{
    const copied=await import(path) as typeof import('../../scripts/actions-reference/projection');
    operation=()=>prefixHistory(store,'mutant-'+definition.id,copied.ReferenceActionProjection);
   }
   const mismatch=await requireSemanticKill(operation,definition.boundary);
   expect(mismatch.boundary).toBe(definition.boundary);
   witnesses.push({id:definition.id,sourceSha256:createHash('sha256').update(source).digest('hex'),mutantSha256:createHash('sha256').update(changed).digest('hex'),baseline:'passed',boundary:mismatch.boundary,expected:mismatch.expected,actual:mismatch.actual});
  }
  // Deliberately fail the same native freeze boundary: a runtime error must not count as an invariant witness.
  let calls=0;const fault=new Error('INJECTED_NATIVE_FREEZE_RUNTIME_FAILURE');
  const runtimeFreeze:typeof freezeReferenceState=async()=>{calls++;throw fault;};
  await expect(requireSemanticKill(()=>aliasHistory(store,'runtime-control',runtimeFreeze),'alias canonical identity')).rejects.toBe(fault);
  expect(calls).toBe(1);
  const unrelated=new InvariantSemanticMismatch('unrelated boundary',false,true);
  await expect(requireSemanticKill(async()=>{throw unrelated;},'alias canonical identity')).rejects.toBe(unrelated);
  expect(witnesses).toHaveLength(2);
  console.log(JSON.stringify({nativeInvariantMutation:{bun:Bun.version,nativeVersion,killed:2,total:2,witnesses,scope:'One native primary/alternate alias pair and two disjoint SET commits delivered 2-before-1; actual copied implementations, exact semantic failures only; no universal refinement claim'}}));
 });}finally{await rm(directory,{recursive:true,force:true});}
},60000);
