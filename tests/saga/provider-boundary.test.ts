// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {randomUUID} from 'node:crypto';
import {SQL} from 'bun';
import {withSagaNativeCluster} from './native-harness';
import {installSagaProvider} from './provider-fixture';
import {ReferenceActionExecutor} from '../../scripts/actions-reference/executor';
import {decodeReferenceJson} from '../../scripts/actions-reference/codec';

test('saga gateway reserves native keys against direct caller execution',async()=>withSagaNativeCluster(async cluster=>{
 const provider=await installSagaProvider(cluster.providers[0],'reserved-key');
 try{
  const unguarded=new ReferenceActionExecutor(provider.policy);unguarded.reserveInvocationNamespace('saga1/');
  expect(()=>unguarded.reserveInvocationNamespace('saga1/',()=>{})).toThrow('Reserved namespace has no required commit guard');
  const key='reserved-'+randomUUID();await provider.seed('reserve',key);
  const request={...provider.request('reserve',key),key:`saga1/qualification/${randomUUID()}/0/f`};
  const direct=await provider.executor.invoke(provider.storeName,provider.credential,request);
  expect(direct).toEqual({status:'unsupported',code:'KEY_NAMESPACE_RESERVED'});
  const observer=new SQL({url:provider.store.url});try{const [count]=await observer`select count(*)::int as n from action_outcome`;expect(count.n).toBe(0);}finally{await observer.close();}
  const ticket=randomUUID();expect(await provider.gateway.register(ticket,'tenant-a',request,provider.credential)).toBe('registered');
  const delivered=await provider.gateway.deliver(ticket,provider.credential,request);expect(delivered.status).toBe('committed');
  // Direct delivery still cannot create a fresh execution after a retained saga outcome.
  expect((await provider.executor.invoke(provider.storeName,provider.credential,request)).status).toBe('unsupported');
 }finally{await provider.gateway.close();}
}),{timeout:120000});

test('oversized retained result rolls back business/outcome before gateway noncommit closure',async()=>withSagaNativeCluster(async cluster=>{
 const provider=await installSagaProvider(cluster.providers[0],'result-bound');
 try{
  const source=structuredClone(provider.source) as any,action=source.modules[0].extensions['umf.actions'].actions[0];
  const effect=structuredClone(action.binding.effects[0]);
  action.binding.effects=Array.from({length:256},(_,i)=>({...structuredClone(effect),id:'effect-'+String(i).padStart(3,'0')+'-'+ 'x'.repeat(240)}));
  const target={module:'sales',action:'reserve',revision:'large-result-r1'};
  await provider.executor.admission.revisions.retain(provider.storeName,target,source);
  const key='bounded-'+randomUUID();await provider.seed('reserve',key);
  const request={...provider.request('reserve',key),target,key:`saga1/qualification/${randomUUID()}/0/f`},ticket=randomUUID();
  expect(await provider.gateway.register(ticket,'tenant-a',request,provider.credential)).toBe('registered');
  const result=await provider.gateway.deliver(ticket,provider.credential,request);expect(result).toEqual({status:'failed',code:'SAGA_LIMIT'});
  const observer=new SQL({url:provider.store.url});try{
   const rows=await observer`select fields from action_entity`,outcomes=await observer`select count(*)::int as n from action_outcome`,attempts=await observer`select state from saga_provider_attempt where ticket=${ticket}`,tickets=await observer`select state from saga_provider_ticket where ticket=${ticket}`;
   expect(rows).toHaveLength(1);expect((decodeReferenceJson(rows[0]!.fields) as any)['["sales","status"]']).toEqual({string:'pending'});
   expect(outcomes[0]!.n).toBe(0);expect(attempts.map((row:{state:string})=>row.state)).toEqual(['rolled-back']);expect(tickets[0]!.state).toBe('closed');
  }finally{await observer.close();}
  expect(await provider.gateway.deliver(ticket,provider.credential,request)).toEqual(result);
 }finally{await provider.gateway.close();}
}),{timeout:120000});

test('original subject denial fences late admission while outsider refusal cannot close it',async()=>withSagaNativeCluster(async cluster=>{
 const provider=await installSagaProvider(cluster.providers[0],'subject-finality');
 try{
  const key=randomUUID();await provider.seed('reserve',key);
  const request={...provider.request('reserve',key),key:`saga1/qualification/${key}/0/f`},ticket=randomUUID();
  await provider.gateway.register(ticket,'tenant-a',request,provider.credential);
  const outsider=provider.issuer.issue({tenant:'tenant-a',principal:'outsider',service:'saga-test-worker'});
  expect(await provider.gateway.deliver(ticket,outsider,request)).toEqual({status:'denied',code:'AUTHORIZATION'});
  expect((await provider.gateway.sql`select state from saga_provider_ticket where ticket=${ticket}`)[0]!.state).toBe('open');
  await provider.policy.membership(provider.storeName,'worker','forward',false);
  const denied=await provider.gateway.deliver(ticket,provider.credential,request);
  expect(denied).toEqual({status:'denied',code:'AUTHORIZATION'});expect(provider.gateway.isOriginalDisposition(ticket,request,denied)).toBe(true);
  expect((await provider.gateway.sql`select state from saga_provider_ticket where ticket=${ticket}`)[0]!.state).toBe('closed');
  await provider.policy.membership(provider.storeName,'worker','forward',true);
  expect(await provider.gateway.deliver(ticket,provider.credential,request)).toEqual(denied);
  expect((await provider.gateway.sql`select count(*)::int as n from action_outcome`)[0]!.n).toBe(0);
  expect(provider.executor.reserveInvocationNamespace('saga1/')).toBe(provider.executor.reserveInvocationNamespace('saga1/'));
 }finally{await provider.gateway.close();}
}),{timeout:120000});

test('gateway snapshots nested inputs before awaiting admission and enforces UTF-16 input bound',async()=>withSagaNativeCluster(async cluster=>{
 let release!:()=>void,entered!:()=>void;const blocked=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>entered=r);
 const provider=await installSagaProvider(cluster.providers[0],'snapshot',undefined,{beforeAdmission:async()=>{entered();await blocked;}});
 try{
  const key=randomUUID();await provider.seed('reserve',key);
  const request={...provider.request('reserve',key),key:`saga1/qualification/${key}/0/f`},ticket=randomUUID(),original=structuredClone(request);
  await provider.gateway.register(ticket,'tenant-a',request,provider.credential);
  const pending=provider.gateway.deliver(ticket,provider.credential,request);await ready;
  (request.inputs.order as any).components[0].string='mutated';release();
  const result=await pending;expect(result.status).toBe('committed');expect(provider.gateway.isOriginalDisposition(ticket,original,result)).toBe(true);expect(provider.gateway.isOriginalDisposition(ticket,request,result)).toBe(false);
  // Astral characters consume two UTF-16 units. JSON envelope consumes 14.
  const boundary={...original,inputs:{padding:{string:'😀'.repeat(32754)+'x'.repeat(12)}}} as any;
  const base=JSON.stringify({padding:{string:''}}).length;boundary.inputs.padding.string='😀'.repeat(Math.floor((65536-base)/2))+'x'.repeat((65536-base)%2);
  expect(JSON.stringify(boundary.inputs).length).toBe(65536);
  expect(await provider.gateway.register(randomUUID(),'tenant-a',boundary,provider.credential)).toBe('registered');
  boundary.inputs.padding.string+='x';expect(JSON.stringify(boundary.inputs).length).toBe(65537);
  await expect(provider.gateway.register(randomUUID(),'tenant-a',boundary,provider.credential)).rejects.toMatchObject({code:'SAGA_LIMIT'});
 }finally{release();await provider.gateway.close();}
}),{timeout:120000});
