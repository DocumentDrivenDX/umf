import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import {ReferenceActionStore} from '../../scripts/actions-reference/store';
import {ReferenceActionIssuer} from '../../scripts/actions-reference/authentication';
import {ReferenceActionPolicy} from '../../scripts/actions-reference/policy';
import {ReferenceActionOutcomes} from '../../scripts/actions-reference/outcomes';
import type {ReferenceInvokeRequest} from '../../scripts/actions-reference/protocol';
import {encodeReferenceJson,encodeReferenceIdentity} from '../../scripts/actions-reference/codec';
import {withReferenceStore} from './native-harness';
test('native discovery permission protects token presence across changing revision policies before any token SQL access',async()=>{
 await withReferenceStore(async store=>{
  await store.create('s','tenant','epoch');const issuer=new ReferenceActionIssuer(),policy=new ReferenceActionPolicy(store,issuer),outcomes=new ReferenceActionOutcomes(policy),source=structuredClone(fixture) as unknown as Document;
  (source.modules[0]!.extensions!['umf.actions'] as any).actions[0].authorization={kind:'roles',profile:{id:'umf.actions.roles',version:'1'},roles:['v1']};
  const target={module:'sales',action:'approve',revision:'r1'},request:ReferenceInvokeRequest={protocol:'umf.actions.tx/1',target,key:'retained',inputs:{order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'o1'}]}}};
  await outcomes.revisions.retain('s',target,source);await policy.membership('s','person','v1',true);const credential=issuer.issue({tenant:'tenant',principal:'person',service:'A'});
  await policy.replayDiscovery('s','sales','approve',['discovery']);await policy.membership('s','person','discovery',true);
  await store.transaction('s',async(tx,control)=>{await outcomes.appendInTransaction(tx,control,issuer.authenticate(credential),await outcomes.revisions.readInTransaction(tx,control,target),request,{status:'rejected',code:'PRECONDITION'});await outcomes.appendInTransaction(tx,control,issuer.authenticate(credential),await outcomes.revisions.readInTransaction(tx,control,target),{...request,key:'expired'},{status:'rejected',code:'PRECONDITION'});const expired=encodeReferenceIdentity(['tenant','s','person','sales','approve','expired']);await tx`update action_outcome set tombstone=true where store=${control.id} and identity=${expired}`;});
  await policy.disableReplayDiscovery('s','sales','approve');await policy.membership('s','person','discovery',false);
  const replacement=structuredClone(source);(replacement.modules[0]!.extensions!['umf.actions'] as any).actions[0].authorization.roles=['v2'];await outcomes.revisions.retain('s',{...target,revision:'r2'},replacement);
  await policy.membership('s','person','v1',false);await policy.membership('s','person','v2',true);
  await store.sql`create role discovery_probe nologin`;await store.sql`grant select,update on action_store to discovery_probe`;await store.sql`grant select on action_replay_policy,action_membership to discovery_probe`;
  const probeUrl=new URL(store.url);probeUrl.searchParams.set('options','-c role=discovery_probe');const probe=new ReferenceActionStore(probeUrl.toString());
  try{
   await expect((async()=>{await probe.sql`select * from action_outcome`;})()).rejects.toThrow('permission denied');
   const protectedProbe=new ReferenceActionOutcomes(new ReferenceActionPolicy(probe,issuer));
   for(const candidate of [{...request,target:{...target,revision:'r2'}},{...request,target:{...target,revision:'r2'},key:'absent'},{...request,key:'expired'},{...request,target:{...target,revision:'unknown'}}])expect(await protectedProbe.lookup('s',credential,candidate)).toEqual({status:'denied',code:'AUTHORIZATION'});
   await policy.replayDiscovery('s','sales','approve',['discovery']);
   expect(await protectedProbe.lookup('s',credential,request)).toEqual({status:'denied',code:'AUTHORIZATION'});
  }finally{await probe.close();}
  await policy.membership('s','person','discovery',true);
  expect(await outcomes.lookup('s',credential,{...request,target:{...target,revision:'r2'}})).toEqual({status:'denied',code:'AUTHORIZATION'});
  expect(await outcomes.lookup('s',credential,{...request,target:{...target,revision:'r2'},key:'absent'})).toEqual({status:'not-found'});
  await policy.membership('s','person','v1',true);expect(await outcomes.lookup('s',credential,request)).toEqual({status:'rejected',code:'PRECONDITION'});
  const other=issuer.issue({tenant:'tenant',principal:'other',service:'A'});await policy.membership('s','other','discovery',true);await policy.membership('s','other','v1',true);expect(await outcomes.lookup('s',other,request)).toEqual({status:'not-found'});
  const crossTenant=issuer.issue({tenant:'other',principal:'person',service:'A'});expect(await outcomes.lookup('s',crossTenant,request)).toEqual({status:'denied',code:'AUTHORIZATION'});
  await expect(policy.replayDiscovery('s','sales','approve',['discovery','x'.repeat(257)])).rejects.toThrow();
  for(const binding of [{kind:'roles',profile:{id:'umf.actions.roles',version:'1'},roles:['discovery','discovery']},{kind:'roles',profile:{id:'umf.actions.roles',version:'future'},roles:['discovery']},{kind:'roles',profile:{id:'umf.actions.roles',version:'1',future:true},roles:['discovery']},{kind:'roles',profile:{id:'umf.actions.roles',version:'1'},roles:['discovery','x'.repeat(257)]}]){
   await store.transaction('s',async tx=>{await tx`update action_replay_policy set binding=${encodeReferenceJson(binding)}`;});expect(await outcomes.lookup('s',credential,request)).toEqual({status:'denied',code:'AUTHORIZATION'});
  }
  for(const malformed of ['{',JSON.stringify({kind:'roles',profile:{id:'umf.actions.roles',version:'1'},roles:['discovery']})+' ']){await store.transaction('s',async tx=>{await tx`update action_replay_policy set binding=${malformed}`;});expect(await outcomes.lookup('s',credential,request)).toEqual({status:'denied',code:'AUTHORIZATION'});}
  await policy.replayDiscovery('s','sales','approve',['discovery']);
  let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(resolve=>entered=resolve),hold=new Promise<void>(resolve=>release=resolve),authorize=policy.authorizeReplayDiscovery.bind(policy);
  policy.authorizeReplayDiscovery=async(...args)=>{await authorize(...args);entered();await hold;};
  const accepted=outcomes.lookup('s',credential,request);await ready;const disabled=policy.disableReplayDiscovery('s','sales','approve');
  try{let blocked=false;for(let i=0;i<100;i++){if((await store.sql`select pid from pg_stat_activity where datname=current_database() and wait_event_type='Lock'`).length){blocked=true;break;}await Bun.sleep(10);}expect(blocked).toBe(true);}finally{release();policy.authorizeReplayDiscovery=authorize;}
  expect(await accepted).toEqual({status:'rejected',code:'PRECONDITION'});await disabled;expect(await outcomes.lookup('s',credential,request)).toEqual({status:'denied',code:'AUTHORIZATION'});
 });
},60000);
