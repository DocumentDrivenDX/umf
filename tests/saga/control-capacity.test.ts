// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {SagaProtocolCoordinator} from '../../scripts/saga-reference/protocol';
import {withSagaNativeCluster} from './native-harness';
import {installSagaProvider,sagaRuntimePlan} from './provider-fixture';

test('control reservations are scoped, durable and serialized before mutation',async()=>withSagaNativeCluster(async cluster=>{
 const [a,b]=await Promise.all([installSagaProvider(cluster.providers[0],'capacity-a'),installSagaProvider(cluster.providers[1],'capacity-b')]);
 try{
  const plan=sagaRuntimePlan(a,b),target={module:plan.module,saga:plan.id,revision:plan.revision},plans=new Map([[JSON.stringify([target.module,target.saga,target.revision]),plan]]),actor={tenant:'tenant-a',principal:'worker',service:'saga-test-worker',worker:'worker'},protocol='umf.actions.saga/1',adapter=new SagaProtocolCoordinator(cluster.coordinator,plans,async who=>who.tenant===actor.tenant&&who.principal===actor.principal);
  const submit=async(key:string)=>adapter.invoke(actor,{protocol,operation:'submit',key,target,inputs:{order:a.request('reserve',key).inputs.order}}) as Promise<any>;
  const one=await submit('one'),two=await submit('two');expect(one.status).toBe('submitted');expect(two.status).toBe('submitted');
  let enter!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>enter=r),gate=new Promise<void>(r=>release=r);
  const mutable={protocol,operation:'claim',instance:structuredClone(two.instance)},cap=await adapter.prepareControl(actor,mutable);
  const gated=new SagaProtocolCoordinator(cluster.coordinator,plans,async()=>{enter();await gate;return true;});
  const work=gated.handle(actor,mutable,cap);await ready;mutable.instance.id='caller-mutated-after-auth-start';release();
  const original=await work as any;expect(original.status).toBe('claimed');expect(original.instance).toEqual(two.instance);
  const request={protocol,operation:'claim',instance:one.instance};
  const scope=JSON.stringify([actor.tenant,actor.principal,'one']);
  await cluster.coordinator.sql`update saga_control_budget set attempts=4096 where scope=${scope}`;
  const before=(await cluster.coordinator.sql`select count(*)::int as n from saga_control_capability`)[0]!.n;
  await expect(adapter.prepareControl(actor,request)).rejects.toThrow('SAGA_LIMIT');
  expect((await cluster.coordinator.sql`select count(*)::int as n from saga_control_capability`)[0]!.n).toBe(before);
  expect(await adapter.prepareControl(actor,{...request,instance:two.instance})).toBeString();
  await expect(adapter.prepareControl({...actor,principal:'outsider'},request)).rejects.toThrow('AUTHORIZATION');
  // Exhaust storage independently of count, allowing exactly one more promise.
  const probe=await adapter.prepareControl(actor,{...request,instance:two.instance});
  const reserve=Number((await cluster.coordinator.sql`select retained_bytes from saga_control_capability where capability=${probe}`)[0]!.retained_bytes);
  await cluster.coordinator.sql`update saga_control_budget set attempts=1 where scope=${scope}`;
  await cluster.coordinator.sql`update saga_instance set max_retained_bytes=retained_bytes+${reserve} where id=${one.instance.id}`;
  const restarted=new SagaProtocolCoordinator(cluster.coordinator,plans,async()=>true);
  const results=await Promise.allSettled([restarted.prepareControl(actor,request),restarted.prepareControl(actor,request)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  const [row]=await cluster.coordinator.sql`select retained_bytes,max_retained_bytes,lease_fence::text from saga_instance where id=${one.instance.id}`;
  expect(String(row!.retained_bytes)).toBe(String(row!.max_retained_bytes));expect(row!.lease_fence).toBe('0');
  const [budget]=await cluster.coordinator.sql`select attempts from saga_control_budget where scope=${scope}`;expect(budget!.attempts).toBe(2);
 }finally{await Promise.all([a.gateway.close(),b.gateway.close()]);}
}),{timeout:120000});
