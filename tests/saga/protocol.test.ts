// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {SagaProtocolCoordinator} from '../../scripts/saga-reference/protocol';
import {SagaCoordinator} from '../../scripts/saga-reference/coordinator';
import {withSagaNativeCluster} from './native-harness';
import {installSagaProvider,sagaRuntimePlan} from './provider-fixture';
import {decodeReferenceJson,encodeReferenceIdentity,encodeReferenceJson} from '../../scripts/actions-reference/codec';
import type {ReferenceInvokeRequest} from '../../scripts/actions-reference/protocol';
import {verifyIndependentHistory,type ExpectedProviderFact,type ProviderObservation,type HistoryObservation} from './history-oracle';
import {referenceHandlerBuild} from '../../scripts/actions-reference/sandbox';

test('the native adapter validates and dispatches the closed ten-operation protocol',async()=>{
 await withSagaNativeCluster(async cluster=>{
  let pauseAfterNativeInvoke=false;
  let markNativeInvokeObserved!:(value:{ticket:string;result:any})=>void;
  let releaseNativeInvoke! :()=>void;
  let nativeInvokeObserved=new Promise<{ticket:string;result:any}>(resolve=>{markNativeInvokeObserved=resolve;});
  let nativeInvokeGate=new Promise<void>(resolve=>{releaseNativeInvoke=resolve;});
  const armNativeInvokePause=()=>{pauseAfterNativeInvoke=true;nativeInvokeObserved=new Promise(resolve=>{markNativeInvokeObserved=resolve;});nativeInvokeGate=new Promise(resolve=>{releaseNativeInvoke=resolve;});};
  const [inventory,allocation]=await Promise.all([
   installSagaProvider(cluster.providers[0],'provider-a',undefined,{afterFinality:async(ticket,result)=>{if(!pauseAfterNativeInvoke)return;pauseAfterNativeInvoke=false;markNativeInvokeObserved({ticket,result});await nativeInvokeGate;}}),
   installSagaProvider(cluster.providers[1],'provider-b'),
  ]);
  const definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision};
  const seededKey='protocol-order-1';
  await Promise.all([inventory.seed('reserve',seededKey),allocation.seed('allocate',seededKey)]);
  let workerPrivileged=true;
  const coordinator=new SagaProtocolCoordinator(cluster.coordinator,new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),async actor=>actor.tenant==='tenant-a'&&workerPrivileged);
  const actor={tenant:'tenant-a',principal:'worker',service:'saga-test-worker',worker:'worker'};
  const protocol='umf.actions.saga/1';
  const sameIntent={protocol,operation:'submit',key:'protocol-submit-key',target,inputs:{order:inventory.request('reserve',seededKey).inputs.order}};
  const [submitted,duplicate]=await Promise.all([coordinator.invoke(actor,sameIntent),coordinator.invoke(actor,sameIntent)]) as any[];
  expect(submitted.status).toBe('submitted');expect(duplicate).toEqual(submitted);
  const changedIntent=await coordinator.invoke(actor,{protocol,operation:'submit',key:'protocol-submit-key',target,inputs:{order:inventory.request('reserve','different-order').inputs.order}}) as any;
  expect(changedIntent).toEqual({status:'conflict',code:'TOKEN_REUSE'});
  const instance=submitted.instance;
  expect(await coordinator.handle({...actor,tenant:'tenant-b'},{protocol,operation:'status',instance})).toEqual({status:'denied',code:'AUTHORIZATION'});
  expect(await coordinator.handle(actor,{protocol,operation:'status',instance:{...instance,namespace:'forged-namespace'}})).toEqual({status:'denied',code:'AUTHORIZATION'});
  workerPrivileged=false;
  expect(await coordinator.handle(actor,{protocol,operation:'status',instance})).toEqual({status:'denied',code:'AUTHORIZATION'});
  workerPrivileged=true;
  expect((await coordinator.handle(actor,{protocol,operation:'status',instance}) as any).status).toBe('state');
  const claimed=await coordinator.invoke(actor,{protocol,operation:'claim',instance}) as any;
  expect(claimed.status).toBe('claimed');expect(claimed.invocation).toEqual({step:'reserve',direction:'forward'});
  await cluster.coordinator.sql`update saga_instance set lease_until=clock_timestamp()-interval '1 second' where id=${instance.id}`;
  const takeoverActor={...actor,worker:'worker-takeover'};
  const takeover=await coordinator.invoke(takeoverActor,{protocol,operation:'claim',instance}) as any;
  expect(takeover.status).toBe('claimed');expect(BigInt(takeover.fence)).toBeGreaterThan(BigInt(claimed.fence));
  const staleFence=await coordinator.invoke(actor,{protocol,operation:'execute',instance,invocation:claimed.invocation,fence:claimed.fence}) as any;
  expect(staleFence).toEqual({status:'denied',code:'SAGA_FENCE'});
  const outcome=await coordinator.invoke(takeoverActor,{protocol,operation:'execute',instance,invocation:takeover.invocation,fence:takeover.fence}) as any;
  expect(outcome.status).toBe('outcome');
  expect(outcome.result.status).toBe('committed');
  const cancelRequest={protocol,operation:'cancel',instance};
  const cancelCapability=await coordinator.prepareControl(actor,cancelRequest);
  await coordinator.handle(actor,cancelRequest,cancelCapability); // Simulate the response being lost after server completion.
  workerPrivileged=false;
  expect(await coordinator.handle(actor,{protocol,operation:'recover-control',recovery:{id:cancelCapability,operation:'cancel'}})).toEqual({status:'denied',code:'AUTHORIZATION'});
  workerPrivileged=true;
  const recoveredCancel=await coordinator.handle(actor,{protocol,operation:'recover-control',recovery:{id:cancelCapability,operation:'cancel'}}) as any;
  expect(recoveredCancel.status).toBe('recovered');expect(recoveredCancel.result.status).toBe('cancel-requested');
  expect(await coordinator.handle(actor,cancelRequest,cancelCapability)).toEqual(recoveredCancel.result);
  const compensation=await coordinator.invoke(takeoverActor,{protocol,operation:'claim',instance}) as any;
  expect(compensation.status).toBe('claimed');expect(compensation.invocation).toEqual({step:'reserve',direction:'compensation'});
  const compensationOutcome=await coordinator.invoke(takeoverActor,{protocol,operation:'execute',instance,invocation:compensation.invocation,fence:compensation.fence}) as any;
  expect(compensationOutcome.status).toBe('outcome');expect(compensationOutcome.result.status).toBe('committed');
  expect((await coordinator.invoke(actor,{protocol,operation:'reconcile',instance}) as any).status).toBe('state');
  expect((await coordinator.invoke(actor,{protocol,operation:'resolve',instance,invocation:compensation.invocation,evidence:'evidence-1'}) as any).status).toBe('conflict');
  expect((await coordinator.handle(actor,{protocol,operation:'recover-control',recovery:{id:'00000000-0000-4000-8000-000000000000',operation:'submit'}}) as any).status).toBe('unsupported');
  expect((await coordinator.handle(actor,{protocol,operation:'history',instance,limit:20}) as any).status).toBe('history');
  expect((await coordinator.invoke(actor,{protocol,operation:'close',instance,expectedHistorySequence:1,disposition:{kind:'accepted-residual-effects',reason:'test-only',evidence:'evidence-1'}}) as any).status).toBe('conflict');
  const recoveryKey='protocol-recovery-order';await inventory.seed('reserve',recoveryKey);
  const recoverySubmit=await coordinator.invoke(actor,{protocol,operation:'submit',key:'protocol-recovery-submit',target,inputs:{order:inventory.request('reserve',recoveryKey).inputs.order}}) as any;
  expect(await coordinator.handle(actor,{protocol,operation:'cancel',instance:recoverySubmit.instance},cancelCapability)).toEqual({status:'conflict',code:'TOKEN_REUSE'});
  armNativeInvokePause();
  const recoveryClaim=await coordinator.invoke(actor,{protocol,operation:'claim',instance:recoverySubmit.instance}) as any;
  const executionPromise=coordinator.invoke(actor,{protocol,operation:'execute',instance:recoverySubmit.instance,invocation:recoveryClaim.invocation,fence:recoveryClaim.fence});
  const observed=await nativeInvokeObserved;
  expect(observed.result.status).toBe('committed');
  const recoveryOrder=inventory.request('reserve',recoveryKey).inputs.order;if(!recoveryOrder)throw Error('Recovery fixture input missing');
  const exactProviderRequest={protocol:'umf.actions.tx/1' as const,target:{module:'sales',action:'reserve',revision:'saga-r1'},key:`saga1/${recoverySubmit.instance.namespace}/${recoverySubmit.instance.id}/0/f`,inputs:{order:recoveryOrder},correlation:observed.ticket};
  const exactProviderResult=await inventory.gateway.reconcile(observed.ticket,inventory.credential,exactProviderRequest);expect(exactProviderResult.status).toBe('committed');
  expect(inventory.gateway.isOriginalDisposition(observed.ticket,exactProviderRequest,exactProviderResult)).toBe(true);
  expect(await inventory.gateway.retainedEvidence(observed.ticket)).toBeDefined();
  await cluster.coordinator.latchStop(recoverySubmit.instance.id,{kind:'intervention',code:'TEST_PENDING_CLOSE'});
  const pendingState=await coordinator.handle(actor,{protocol,operation:'status',instance:recoverySubmit.instance}) as any;
  expect(pendingState.phase).toBe('intervention-required');expect(pendingState.pending).toHaveLength(1);
  const currentSequenceBeforeResolve=(await cluster.coordinator.status(recoverySubmit.instance.id,actor)).historySequence;
  const blockedClaim=await coordinator.invoke(actor,{protocol,operation:'claim',instance:recoverySubmit.instance}) as any;
  expect(blockedClaim).toEqual({status:'unsupported',code:'SAGA_PENDING'});
  const closeWhilePending=await coordinator.invoke(actor,{protocol,operation:'close',instance:recoverySubmit.instance,expectedHistorySequence:currentSequenceBeforeResolve,disposition:{kind:'accepted-residual-effects',reason:'test',evidence:'pre-resolution-provider-fact'}}) as any;
  expect(closeWhilePending).toEqual({status:'conflict',code:'SAGA_PENDING'});
  const forged=await coordinator.invoke(actor,{protocol,operation:'resolve',instance:recoverySubmit.instance,invocation:{step:'reserve',direction:'forward'},evidence:'forged-evidence'}) as any;
  expect(forged.status).toBe('unsupported');
  const resolved=await coordinator.invoke(actor,{protocol,operation:'resolve',instance:recoverySubmit.instance,invocation:{step:'reserve',direction:'forward'},evidence:observed.ticket}) as any;
  expect(resolved.status).toBe('state');expect(resolved.pending).toEqual([]);expect(resolved.stopCause).toEqual({kind:'intervention',code:'TEST_PENDING_CLOSE'});expect(resolved.phase).toBe('intervention-required');expect(resolved.forward[0].state).toBe('committed');
  const resolvedHistory=await coordinator.handle(actor,{protocol,operation:'history',instance:recoverySubmit.instance,limit:64}) as any;
  const resolveEvent=resolvedHistory.events.find((event:any)=>event.kind==='resolved');
  expect(resolveEvent.actor).toBe(actor.principal);expect(resolveEvent.evidence).toBe(inventory.gateway.issuerId);expect(resolveEvent.invocation).toEqual({step:'reserve',direction:'forward'});
  const resolutionRows=await cluster.coordinator.sql`select event from saga_event where instance_id=${recoverySubmit.instance.id}`;
  const resolution=resolutionRows.map((row:any)=>decodeReferenceJson(row.event) as any).find((event:any)=>event.kind==='resolution');
  expect(resolution.actor).toEqual({principal:actor.principal,service:actor.service});expect(resolution.issuer).toBe(inventory.gateway.issuerId);expect(resolution.ticket).toBe(observed.ticket);
  expect(resolution.evidence).toMatchObject({profile:'umf.actions.saga.provider-finality/1',actionRevision:'saga-r1',key:`saga1/${recoverySubmit.instance.namespace}/${recoverySubmit.instance.id}/0/f`});
  expect(resolvedHistory.events.filter((event:any)=>event.kind==='outcome')).toEqual([]);
  expect(resolution.result.status).toBe('committed');
  releaseNativeInvoke();
  const executionResult=await executionPromise as any;expect(executionResult.status).toBe('outcome');expect(executionResult.result.status).toBe('committed');
  const currentSequence=(await cluster.coordinator.status(recoverySubmit.instance.id,actor)).historySequence;
  const closeReview=await coordinator.prepareCloseReview(actor,recoverySubmit.instance,currentSequence) as any;
  expect(closeReview.status).toBe('review-ready');
  const staleClose=await coordinator.invoke(actor,{protocol,operation:'close',instance:recoverySubmit.instance,expectedHistorySequence:currentSequenceBeforeResolve,disposition:{kind:'accepted-residual-effects',reason:'provider finality independently observed',evidence:closeReview.evidence}}) as any;
  expect(staleClose).toEqual({status:'conflict',code:'SAGA_ORDER'});
  const unrelatedEvidence=(await cluster.coordinator.sql`select ticket from saga_ticket where instance_id=${instance.id} and direction='c'`)[0]!.ticket as string;
  const unrelatedClose=await coordinator.invoke(actor,{protocol,operation:'close',instance:recoverySubmit.instance,expectedHistorySequence:currentSequence,disposition:{kind:'accepted-residual-effects',reason:'wrong invocation evidence',evidence:unrelatedEvidence}}) as any;
  expect(unrelatedClose).toEqual({status:'conflict',code:'SAGA_EVIDENCE'});
  const closed=await coordinator.invoke(actor,{protocol,operation:'close',instance:recoverySubmit.instance,expectedHistorySequence:currentSequence,disposition:{kind:'accepted-residual-effects',reason:'provider finality independently observed',evidence:closeReview.evidence}}) as any;
  expect(closed.status).toBe('state');expect(closed.phase).toBe('closed');expect(closed.stopCause).toEqual({kind:'intervention',code:'TEST_PENDING_CLOSE'});
  const closedHistory=await coordinator.handle(actor,{protocol,operation:'history',instance:recoverySubmit.instance,limit:64}) as any;
  const closeEvent=closedHistory.events.find((event:any)=>event.kind==='closed');
  expect(closeEvent.actor).toBe(actor.principal);expect(closeEvent.stopCause).toEqual({kind:'intervention',code:'TEST_PENDING_CLOSE'});
  expect(closeEvent.disposition).toEqual({kind:'accepted-residual-effects',reason:'provider finality independently observed',evidence:closeReview.evidence});
  const closeRows=await cluster.coordinator.sql`select event from saga_event where instance_id=${recoverySubmit.instance.id}`;
  const closeRecord=closeRows.map((row:any)=>decodeReferenceJson(row.event) as any).find((event:any)=>event.kind==='closed');
  expect(closeRecord.actor).toEqual({principal:actor.principal,service:actor.service});expect(closeRecord.review.id).toBe(closeReview.evidence);expect(closeRecord.review.digest).toMatch(/^[0-9a-f]{64}$/);
  const compensationKey='protocol-unknown-compensation';await inventory.seed('reserve',compensationKey);
  const compSubmit=await coordinator.invoke(actor,{protocol,operation:'submit',key:'protocol-comp-submit',target,inputs:{order:inventory.request('reserve',compensationKey).inputs.order}}) as any;
  const compForwardClaim=await coordinator.invoke(actor,{protocol,operation:'claim',instance:compSubmit.instance}) as any;
  const compForward=await coordinator.invoke(actor,{protocol,operation:'execute',instance:compSubmit.instance,invocation:compForwardClaim.invocation,fence:compForwardClaim.fence}) as any;expect(compForward.result.status).toBe('committed');
  await coordinator.invoke(actor,{protocol,operation:'cancel',instance:compSubmit.instance});
  const compClaim=await coordinator.invoke(actor,{protocol,operation:'claim',instance:compSubmit.instance}) as any;expect(compClaim.invocation).toEqual({step:'reserve',direction:'compensation'});
  armNativeInvokePause();
  const compExecution=coordinator.invoke(actor,{protocol,operation:'execute',instance:compSubmit.instance,invocation:compClaim.invocation,fence:compClaim.fence});
  const compObserved=await nativeInvokeObserved;expect(compObserved.result.status).toBe('committed');
  const compBlocked=await coordinator.invoke(actor,{protocol,operation:'claim',instance:compSubmit.instance}) as any;expect(compBlocked).toEqual({status:'unsupported',code:'SAGA_PENDING'});
  const compResolved=await coordinator.invoke(actor,{protocol,operation:'resolve',instance:compSubmit.instance,invocation:{step:'reserve',direction:'compensation'},evidence:compObserved.ticket}) as any;expect(compResolved.status).toBe('state');expect(compResolved.pending).toEqual([]);
  releaseNativeInvoke();const compExecutionResult=await compExecution as any;expect(compExecutionResult.result.status).toBe('committed');
  const malformed=await coordinator.handle(actor,{protocol,operation:'status',instance,clientAuthority:'owner'});
  expect(malformed).toEqual({status:'unsupported',code:'PROTOCOL'});
  const denied=await coordinator.handle({...actor,principal:'stranger'},{protocol,operation:'status',instance});
  expect(denied).toEqual({status:'denied',code:'AUTHORIZATION'});
 });
},{timeout:30_000});

test('an admitted instance keeps its original immutable action binding after host directory replacement',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'snapshot-a'),installSagaProvider(cluster.providers[1],'snapshot-b')]);
  const original=sagaRuntimePlan(inventory,allocation),target={module:original.module,saga:original.id,revision:original.revision};
  const key='definition-snapshot-order';await Promise.all([inventory.seed('reserve',key),allocation.seed('reserve',key)]);
  const directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),original]]);
  const protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'snapshot-worker',service:'saga-test-worker',worker:'snapshot-worker'};
  const adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,async a=>a.tenant==='tenant-a');
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'snapshot-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
  const unavailableHost=new SagaProtocolCoordinator(cluster.coordinator,new Map(),async a=>a.tenant==='tenant-a');
  const unavailableSubmit=await adapter.invoke(actor,{protocol,operation:'submit',key:'snapshot-unavailable-submit',target,inputs:{order:inventory.request('reserve','unavailable-order').inputs.order}}) as any;
  const unavailable=await unavailableHost.invoke(actor,{protocol,operation:'claim',instance:unavailableSubmit.instance});
  expect(unavailable).toEqual({status:'unsupported',code:'REVISION'});
  const unavailableState=await adapter.handle(actor,{protocol,operation:'status',instance:unavailableSubmit.instance}) as any;
  expect(unavailableState.phase).toBe('intervention-required');expect(unavailableState.stopCause).toEqual({kind:'intervention',code:'REVISION'});
  const untouched=await inventory.store.transaction(inventory.storeName,async(tx,control)=>tx`select count(*)::int as n from action_outcome where store=${control.id} and original_intent::jsonb->>'key' like ${`saga1/${submitted.instance.namespace}/${submitted.instance.id}/%`}`);
  expect(untouched[0]!.n).toBe(0);
  const replacement={...original,definition:{...original.definition,steps:original.definition.steps.map(step=>({...step,binding:'allocation'}))}};
  directory.set(JSON.stringify([target.module,target.saga,target.revision]),replacement);
  const claim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  const execution=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:claim.invocation,fence:claim.fence}) as any;
  expect(execution.status).toBe('outcome');expect(execution.result.status).toBe('committed');
  const readEntity=async(provider:Awaited<ReturnType<typeof installSagaProvider>>)=>provider.store.transaction(provider.storeName,async(tx,control)=>{const rows=await tx`select fields from action_entity where store=${control.id}`;return rows.map((row:any)=>decodeReferenceJson(row.fields)).find((fields:any)=>fields['["sales","id"]']?.string===key);});
  const [originalStore,replacementStore]=await Promise.all([readEntity(inventory),readEntity(allocation)]);
  expect(originalStore?.['["sales","status"]']?.string).toBe('reserve');
  expect(replacementStore?.['["sales","status"]']?.string).toBe('pending');
 });
},{timeout:30_000});

test('retiring an action at the native admission cut prevents a fresh effect',async()=>{
 await withSagaNativeCluster(async cluster=>{
  let inventory:Awaited<ReturnType<typeof installSagaProvider>>;
  let armed=false,signal!:()=>void,release!:()=>void;
  const observed=new Promise<void>(resolve=>{signal=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  inventory=await installSagaProvider(cluster.providers[0],'retirement-cut',undefined,{beforeAdmission:async()=>{if(!armed)return;armed=false;await inventory.executor.admission.revisions.lifecycle(inventory.storeName,{module:'sales',action:'reserve',revision:'saga-r1'},'retired');signal();await gate;}});
  const allocation=await installSagaProvider(cluster.providers[1],'retirement-cut-b'),definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'retirement-worker',service:'saga-test-worker',worker:'retirement-worker'},adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,async a=>a.tenant==='tenant-a'),key='retired-before-admission';
  await inventory.seed('reserve',key);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'retirement-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
  const claim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  armed=true;
  const pending=adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:claim.invocation,fence:claim.fence});
  await observed;release();
  const result=await pending as any;
  expect(result.status).toBe('outcome');expect(result.result.status).toBe('unsupported');expect(result.result.code).toBe('REVISION');
  const stopped=await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;
  expect(stopped.phase).toBe('intervention-required');expect(stopped.stopCause).toMatchObject({kind:'intervention',code:'REVISION',step:'reserve'});
  expect(stopped.forward[0]!.state).toBe('refused');
  const nativeOutcome=await inventory.store.transaction(inventory.storeName,async(tx,control)=>tx`select count(*)::int as n from action_outcome where store=${control.id}`);
  expect(nativeOutcome[0]!.n).toBe(0);
 });
},{timeout:30_000});

test('a natively admitted action retains its original result when retirement follows execution',async()=>{
 await withSagaNativeCluster(async cluster=>{
  let signal!:()=>void,release!:()=>void,armed=true;
  const observed=new Promise<void>(resolve=>{signal=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const inventory=await installSagaProvider(cluster.providers[0],'retirement-after-admit',undefined,{afterInvoke:async()=>{if(!armed)return;armed=false;signal();await gate;}}),allocation=await installSagaProvider(cluster.providers[1],'retirement-after-admit-b'),definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'retirement-after-worker',service:'saga-test-worker',worker:'retirement-after-worker'},adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,async a=>a.tenant==='tenant-a'),key='retire-after-native-admission';
  await inventory.seed('reserve',key);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'retirement-after-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
  const claim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  const execution=adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:claim.invocation,fence:claim.fence});
  await observed;
  const nativeOutcome=await inventory.store.transaction(inventory.storeName,async(tx,control)=>tx`select count(*)::int as n from action_outcome where store=${control.id}`);
  expect(nativeOutcome[0]!.n).toBe(1);
  await inventory.executor.admission.revisions.lifecycle(inventory.storeName,{module:'sales',action:'reserve',revision:'saga-r1'},'retired');
  release();
  const result=await execution as any;
  expect(result.status).toBe('outcome');expect(result.result.status).toBe('committed');
 });
},{timeout:30_000});

test('definition retirement rejects fresh submissions while an admitted instance continues on its snapshot',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'definition-retirement-a'),installSagaProvider(cluster.providers[1],'definition-retirement-b')]),definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'definition-retirement-worker',service:'saga-test-worker',worker:'definition-retirement-worker'},adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,async a=>a.tenant==='tenant-a'),key='definition-retirement-order';
  await inventory.seed('reserve',key);
  const admitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'definition-retirement-admitted',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
  await cluster.coordinator.retireDefinition(actor.tenant,target.revision);
  const fresh=await adapter.invoke(actor,{protocol,operation:'submit',key:'definition-retirement-fresh',target,inputs:{order:inventory.request('reserve','different-order').inputs.order}}) as any;
  expect(fresh).toEqual({status:'unsupported',code:'REVISION'});
  const claim=await adapter.invoke(actor,{protocol,operation:'claim',instance:admitted.instance}) as any;
  const outcome=await adapter.invoke(actor,{protocol,operation:'execute',instance:admitted.instance,invocation:claim.invocation,fence:claim.fence}) as any;
  expect(outcome.result.status).toBe('committed');
  const state=await adapter.handle(actor,{protocol,operation:'status',instance:admitted.instance}) as any;
  expect(state.phase).toBe('running');expect(state.definition).toEqual(target);
 });
},{timeout:30_000});

test('expired submission identities remain nonreusable after coordinator restart',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'expired-identity-a'),installSagaProvider(cluster.providers[1],'expired-identity-b')]),definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'expired-identity-worker',service:'saga-test-worker',worker:'expired-identity-worker'},authorize=async(a:any)=>a.tenant==='tenant-a',adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,authorize),key='expired-identity-order',request={protocol,operation:'submit',key:'expired-identity-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}};
  const original=await adapter.invoke(actor,request) as any;
  await cluster.coordinator.sql`update saga_instance set expires_at=clock_timestamp()-interval '1 second' where id=${original.instance.id}`;
  await cluster.coordinator.close();const restarted=new SagaCoordinator(cluster.coordinator.url);await restarted.initialize();const restartedAdapter=new SagaProtocolCoordinator(restarted,directory,authorize);
  expect(await restartedAdapter.invoke(actor,request)).toEqual({status:'expired',code:'TOKEN_EXPIRED'});
  const changed=await restartedAdapter.invoke(actor,{...request,inputs:{order:inventory.request('reserve','changed-input').inputs.order}}) as any;
  expect(changed).toEqual({status:'conflict',code:'TOKEN_REUSE'});
  const rows=await restarted.sql`select count(*)::int as n from saga_instance where tenant=${actor.tenant} and owner=${actor.principal} and submit_key=${request.key}`;
  expect(rows[0]!.n).toBe(1);
  await restarted.close();
 });
},{timeout:30_000});

test('public success history agrees with independently queried native provider outcomes',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'history-oracle-a'),installSagaProvider(cluster.providers[1],'history-oracle-b')]),definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'history-oracle-worker',service:'saga-test-worker',worker:'history-oracle-worker'},adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,async a=>a.tenant==='tenant-a'),key='history-oracle-order';
  await Promise.all([inventory.seed('reserve',key),allocation.seed('allocate',key)]);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'history-oracle-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
  for(let ordinal=0;ordinal<definition.definition.steps.length;ordinal++){
   const claim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;expect(claim.status).toBe('claimed');
   const result=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:claim.invocation,fence:claim.fence}) as any;expect(result.result.status).toBe('committed');
  }
  const publicState=await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;expect(publicState.phase).toBe('succeeded');
  const publicHistory=await adapter.handle(actor,{protocol,operation:'history',instance:submitted.instance,limit:64}) as any;
  const ticketRows=await cluster.coordinator.sql`select ticket,ordinal,direction from saga_ticket where instance_id=${submitted.instance.id} order by ordinal,direction`;
  const historyOutcomes=(publicHistory.events as any[]).filter(event=>event.kind==='outcome');
  const history:HistoryObservation[]=definition.definition.steps.map((step,ordinal)=>{
   const row=ticketRows.find((item:any)=>Number(item.ordinal)===ordinal&&item.direction==='f'),event=historyOutcomes.find(item=>item.invocation.step===step.id&&item.invocation.direction==='forward');
   return {ticket:row?.ticket??`missing-ticket-${ordinal}`,status:event?.result?.status??'missing'};
  });
  const expected:ExpectedProviderFact[]=definition.definition.steps.map((step,ordinal)=>({ticket:String(ticketRows.find((item:any)=>Number(item.ordinal)===ordinal&&item.direction==='f')?.ticket??`missing-ticket-${ordinal}`),status:'committed',provider:ordinal===0?'provider-a':'provider-b',tenant:'tenant-a',storeEpoch:ordinal===0?'epoch-history-oracle-a':'epoch-history-oracle-b',actionRevision:'saga-r1',originalTicket:String(ticketRows.find((item:any)=>Number(item.ordinal)===ordinal&&item.direction==='f')?.ticket??`missing-ticket-${ordinal}`),key:`saga1/${submitted.instance.namespace}/${submitted.instance.id}/${ordinal}/f`,gatewayClosed:true,attemptsTerminal:true,outcomeCount:1,entity:{key,status:ordinal===0?'reserve':'allocate'}}));
  const providers:ProviderObservation[]=[];
  for(const fact of expected){
   const ordinal=Number(fact.key!.split('/').at(-2)),provider=ordinal===0?inventory:allocation;
   const [gatewayRows,attemptRows]=await Promise.all([provider.gateway.sql`select tenant,store_name,epoch,intent,state,final_disposition from saga_provider_ticket where ticket=${fact.ticket}`,provider.gateway.sql`select state from saga_provider_attempt where ticket=${fact.ticket} order by attempt`]);
   const ticket=gatewayRows[0];if(!ticket)continue;
   const intent=decodeReferenceJson(ticket.intent) as any,actionIdentity=encodeReferenceIdentity([fact.tenant,ticket.store_name,'worker','sales',intent.target.action,intent.key]);
   const outcomeRows=await provider.store.transaction(provider.storeName,async(tx,control)=>tx`select original_intent,result from action_outcome where store=${control.id} and identity=${actionIdentity}`);
   const entityRows=await provider.store.transaction(provider.storeName,async(tx,control)=>tx`select fields from action_entity where store=${control.id}`),entity=entityRows.map((row:any)=>decodeReferenceJson(row.fields)).find((fields:any)=>fields['["sales","id"]']?.string===fact.entity!.key);
   const result=outcomeRows[0]?decodeReferenceJson(outcomeRows[0].result) as any:undefined,original=outcomeRows[0]?decodeReferenceJson(outcomeRows[0].original_intent) as any:undefined;
   providers.push({ticket:fact.ticket,status:result?.status??'missing',provider:fact.provider!,tenant:String(ticket.tenant),storeEpoch:String(ticket.epoch),actionRevision:original?.target?.revision,originalTicket:original?.correlation,key:original?.key,gatewayClosed:ticket.state==='closed',attemptsTerminal:attemptRows.length>0&&attemptRows.every((row:any)=>row.state!=='admitted'),outcomeCount:outcomeRows.length,entityKey:entity?.['["sales","id"]']?.string??'missing',entityStatus:entity?.['["sales","status"]']?.string??'missing',source:'native-action-outcome'});
  }
  const check=verifyIndependentHistory(expected,history,providers);expect(check.passed).toBe(expected.length);expect(historyOutcomes.map(event=>event.invocation.step)).toEqual(['reserve','allocate']);
 });
},{timeout:30_000});

test('a nondeterministic declared output survives execute acknowledgement loss and replay',async()=>{
 await withSagaNativeCluster(async cluster=>{
  let loseAck=true,finalityStatus:string|undefined;
  const inventory=await installSagaProvider(cluster.providers[0],'nondeterministic-output',undefined,{afterFinality:async(_ticket,result)=>{finalityStatus=result.status;if(loseAck&&result.status==='committed'){loseAck=false;throw Error('simulated output acknowledgement loss');}}}),allocation=await installSagaProvider(cluster.providers[1],'nondeterministic-output-b'),definition=sagaRuntimePlan(inventory,allocation),actionSource=structuredClone(definition.document) as any,actions=actionSource.modules[0].extensions['umf.actions'].actions,action=actions.find((item:any)=>item.id==='reserve'),handlerSource='return {nonce: {string: Math.random().toString(36).slice(2)}};',deployment=inventory.executor.admission.handlers.install({id:'nondeterministic-output',version:'1',build:referenceHandlerBuild(handlerSource),source:handlerSource}),allocationHandlerSource='return {echo: inputs.nonce};',allocationDeployment=allocation.executor.admission.handlers.install({id:'retained-output-consumer',version:'1',build:referenceHandlerBuild(allocationHandlerSource),source:allocationHandlerSource}),consumer=actions.find((item:any)=>item.id==='allocate');
  action.outputs=[{id:'nonce',kind:'value',field:{module:'sales',element:'id'},required:true}];
  action.binding={kind:'handler',profile:{id:'umf.actions.container',version:'1'},handler:{id:deployment.id,version:deployment.version}};
  consumer.parameters.push({id:'nonce',kind:'value',field:{module:'sales',element:'id'},required:true});consumer.outputs=[{id:'echo',kind:'value',field:{module:'sales',element:'id'},required:true}];consumer.binding={kind:'handler',profile:{id:'umf.actions.container',version:'1'},handler:{id:allocationDeployment.id,version:allocationDeployment.version}};
  await inventory.executor.admission.revisions.retain(inventory.storeName,{module:'sales',action:'reserve',revision:'saga-r2'},actionSource,deployment);
  await allocation.executor.admission.revisions.retain(allocation.storeName,{module:'sales',action:'allocate',revision:'saga-r2'},actionSource,allocationDeployment);
  await inventory.policy.replayDiscovery(inventory.storeName,'sales','reserve',['reader']);
  await allocation.policy.replayDiscovery(allocation.storeName,'sales','allocate',['reader']);
  definition.bindings.inventory!.actionRevisions.reserve='saga-r2';
  definition.bindings.allocation!.actionRevisions.allocate='saga-r2';
  definition.definition.steps=[definition.definition.steps[0]!,{...definition.definition.steps[1]!,inputs:[{parameter:'order',from:{input:'order'}},{parameter:'nonce',from:{step:'reserve',output:'nonce'}}]}] as any;
  definition.definition.outputs=[{id:'generatedNonce',kind:'value',field:{module:'sales',element:'id'},required:true},{id:'confirmedNonce',kind:'value',field:{module:'sales',element:'id'},required:true}] as any;
  definition.definition.outputBindings=[{parameter:'generatedNonce',from:{step:'reserve',output:'nonce'}},{parameter:'confirmedNonce',from:{step:'allocate',output:'echo'}}];
  actionSource.modules[0].extensions['umf.actions.saga'].sagas=[definition.definition];definition.document=actionSource;
  const target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'nondeterministic-worker',service:'saga-test-worker',worker:'nondeterministic-worker'},authorize=async(a:any)=>a.tenant==='tenant-a';
  const adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,authorize),key='nondeterministic-order';await Promise.all([inventory.seed('reserve',key),allocation.seed('allocate',key)]);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'nondeterministic-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any,claim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  const execute={protocol,operation:'execute',instance:submitted.instance,invocation:claim.invocation,fence:claim.fence},capability=await adapter.prepareControl(actor,execute);
  await expect(adapter.handle(actor,execute,capability)).rejects.toThrow('simulated output acknowledgement loss');expect(finalityStatus).toBe('committed');
  const restarted=new SagaCoordinator(cluster.coordinator.url);await restarted.initialize();const restartedAdapter=new SagaProtocolCoordinator(restarted,directory,authorize);
  const recovered=await restartedAdapter.handle(actor,{protocol,operation:'recover-control',recovery:{id:capability,operation:'execute'}}) as any;
  expect(recovered.status).toBe('recovered');expect(recovered.result.result.status).toBe('committed');
  const nonce=recovered.result.result.outputs.nonce as {string:string};expect(nonce.string).toMatch(/^[a-z0-9]+$/);
  const secondClaim=await restartedAdapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;expect(secondClaim.invocation).toEqual({step:'allocate',direction:'forward'});
  const secondResult=await restartedAdapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:secondClaim.invocation,fence:secondClaim.fence}) as any;expect(secondResult.result.status).toBe('committed');expect(secondResult.result.outputs.echo).toEqual(nonce);
  const state=await restartedAdapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;
  expect(state.phase).toBe('succeeded');expect(state.outputs).toEqual({generatedNonce:nonce,confirmedNonce:nonce});
  const actionIdentity=encodeReferenceIdentity(['tenant-a',inventory.storeName,'worker','sales','reserve',`saga1/${submitted.instance.namespace}/${submitted.instance.id}/0/f`]);
  const retained=await inventory.store.transaction(inventory.storeName,async(tx,control)=>tx`select result from action_outcome where store=${control.id} and identity=${actionIdentity}`);
  expect(retained).toHaveLength(1);expect((decodeReferenceJson(retained[0]!.result) as any).outputs.nonce).toEqual(nonce);
  const consumerIdentity=encodeReferenceIdentity(['tenant-a',allocation.storeName,'worker','sales','allocate',`saga1/${submitted.instance.namespace}/${submitted.instance.id}/1/f`]),consumed=await allocation.store.transaction(allocation.storeName,async(tx,control)=>tx`select original_intent,result from action_outcome where store=${control.id} and identity=${consumerIdentity}`);
  expect(consumed).toHaveLength(1);expect((decodeReferenceJson(consumed[0]!.original_intent) as any).inputs.nonce).toEqual(nonce);expect((decodeReferenceJson(consumed[0]!.result) as any).outputs.echo).toEqual(nonce);
  await restarted.close();
 });
},{timeout:60_000});

test('a rejected allocation unwinds with the original typed output from its prior commit',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const inventory=await installSagaProvider(cluster.providers[0],'rejected-unwind-a'),allocation=await installSagaProvider(cluster.providers[1],'rejected-unwind-b');
  const definition=sagaRuntimePlan(inventory,allocation),source=structuredClone(definition.document) as any,actions=source.modules[0].extensions['umf.actions'].actions,reserve=actions.find((item:any)=>item.id==='reserve'),allocate=actions.find((item:any)=>item.id==='allocate'),release=actions.find((item:any)=>item.id==='release');
  const reserveSource='return {nonce: {string: Math.random().toString(36).slice(2)}};',deployment=inventory.executor.admission.handlers.install({id:'rejected-unwind-nonce',version:'1',build:referenceHandlerBuild(reserveSource),source:reserveSource});
  reserve.outputs=[{id:'nonce',kind:'value',field:{module:'sales',element:'id'},required:true}];reserve.binding={kind:'handler',profile:{id:'umf.actions.container',version:'1'},handler:{id:deployment.id,version:deployment.version}};
  allocate.parameters.push({id:'nonce',kind:'value',field:{module:'sales',element:'id'},required:true});allocate.failures=[{code:'ALLOCATION_DECLINED',message:'allocation rejected by business rule',retryable:false}];allocate.preconditions=[{id:'decline-allocation',failure:{code:'ALLOCATION_DECLINED',message:'allocation rejected by business rule'},rule:{language:'umf.actions.rules',version:'1',expression:'{"literal":{"boolean":false}}',references:[]}}];
  release.parameters.push({id:'nonce',kind:'value',field:{module:'sales',element:'id'},required:true});
  await inventory.executor.admission.revisions.retain(inventory.storeName,{module:'sales',action:'reserve',revision:'saga-r2'},source,deployment);
  await inventory.executor.admission.revisions.retain(inventory.storeName,{module:'sales',action:'release',revision:'saga-r2'},source);
  await allocation.executor.admission.revisions.retain(allocation.storeName,{module:'sales',action:'allocate',revision:'saga-r2'},source);
  await inventory.policy.replayDiscovery(inventory.storeName,'sales','reserve',['reader']);await inventory.policy.replayDiscovery(inventory.storeName,'sales','release',['reader']);await allocation.policy.replayDiscovery(allocation.storeName,'sales','allocate',['reader']);
  definition.bindings.inventory!.actionRevisions.reserve='saga-r2';definition.bindings.inventory!.actionRevisions.release='saga-r2';definition.bindings.allocation!.actionRevisions.allocate='saga-r2';
  definition.definition.steps[0]!.compensation.inputs=[{parameter:'order',from:{input:'order'}},{parameter:'nonce',from:{step:'reserve',output:'nonce'}}] as any;
  definition.definition.steps[1]!.inputs=[{parameter:'order',from:{input:'order'}},{parameter:'nonce',from:{step:'reserve',output:'nonce'}}] as any;
  source.modules[0].extensions['umf.actions.saga'].sagas=[definition.definition];definition.document=source;
  const target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'reject-unwind-worker',service:'saga-test-worker',worker:'reject-unwind-worker'},adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,async a=>a.tenant==='tenant-a'),key='rejected-unwind-order';
  await inventory.seed('reserve',key);await allocation.seed('allocate',key);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'rejected-unwind-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
  const forward=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  const committed=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:forward.invocation,fence:forward.fence}) as any;expect(committed.result.status).toBe('committed');
  const nonce=committed.result.outputs.nonce as {string:string};expect(nonce.string).toMatch(/^[a-z0-9]+$/);
  const rejectedClaim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  const rejected=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:rejectedClaim.invocation,fence:rejectedClaim.fence}) as any;
  expect(rejected.result).toEqual({status:'rejected',code:'ALLOCATION_DECLINED'});
  const compensation=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;expect(compensation.invocation).toEqual({step:'reserve',direction:'compensation'});
  const released=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:compensation.invocation,fence:compensation.fence}) as any;expect(released.result.status).toBe('committed');
  const releaseIdentity=encodeReferenceIdentity(['tenant-a',inventory.storeName,'worker','sales','release',`saga1/${submitted.instance.namespace}/${submitted.instance.id}/0/c`]),rows=await inventory.store.transaction(inventory.storeName,async(tx,control)=>tx`select original_intent from action_outcome where store=${control.id} and identity=${releaseIdentity}`);
  expect(rows).toHaveLength(1);expect((decodeReferenceJson(rows[0]!.original_intent) as any).inputs.nonce).toEqual(nonce);
  const state=await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;expect(state.phase).toBe('compensated');expect(state.forward.map((item:any)=>item.state)).toEqual(['committed','rejected']);expect(state.compensations.map((item:any)=>item.state)).toEqual(['committed','idle']);
  const history=await adapter.handle(actor,{protocol,operation:'history',instance:submitted.instance,limit:64}) as any;expect(history.events.filter((event:any)=>event.kind==='outcome').map((event:any)=>event.result.status)).toEqual(['committed','rejected','committed']);
 });
},{timeout:60_000});

async function withHistoryProtocol(operation:(ctx:{adapter:SagaProtocolCoordinator;actor:any;protocol:string;first:any;second:any})=>Promise<void>){
 await withSagaNativeCluster(async cluster=>{
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'history-a'),installSagaProvider(cluster.providers[1],'history-b')]);
  const definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]);
  let authorized=true;const adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,async actor=>actor.tenant==='tenant-a'&&authorized),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'history-worker',service:'saga-test-worker',worker:'history-worker'};
  const submit=(key:string)=>adapter.invoke(actor,{protocol,operation:'submit',key,target,inputs:{order:inventory.request('reserve',key).inputs.order}});
  const first=await submit('history-instance-a') as any,second=await submit('history-instance-b') as any;
  const firstClaim=await adapter.invoke(actor,{protocol,operation:'claim',instance:first.instance}) as any;expect(firstClaim.status).toBe('claimed');
  await operation({adapter,actor,protocol,first,second});
 });
}

test('history cursors are bound to their original instance',async()=>withHistoryProtocol(async({adapter,actor,protocol,first,second})=>{
 const page=await adapter.handle(actor,{protocol,operation:'history',instance:first.instance,limit:1}) as any;
 expect(page.status).toBe('history');expect(page.nextCursor).toBeString();
 const crossInstance=await adapter.handle(actor,{protocol,operation:'history',instance:second.instance,cursor:page.nextCursor,limit:10}) as any;
 expect(crossInstance).toEqual({status:'conflict',code:'SAGA_ORDER'});
}),{timeout:30_000});

test('history pagination retains the original high-water mark',async()=>withHistoryProtocol(async({adapter,actor,protocol,first})=>{
 const page=await adapter.handle(actor,{protocol,operation:'history',instance:first.instance,limit:1}) as any;
 expect(page.nextCursor).toBeString();
 await adapter.invoke(actor,{protocol,operation:'cancel',instance:first.instance});
 const next=await adapter.handle(actor,{protocol,operation:'history',instance:first.instance,cursor:page.nextCursor,limit:10}) as any;
 expect(next.status).toBe('history');expect(next.events.some((event:any)=>event.kind==='cancel')).toBe(false);
}),{timeout:30_000});

test('history pages require current authorization',async()=>withSagaNativeCluster(async cluster=>{
 const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'history-auth-a'),installSagaProvider(cluster.providers[1],'history-auth-b')]);
 const definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]);
 let authorized=true;const adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,async actor=>actor.tenant==='tenant-a'&&authorized),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'history-auth-worker',service:'saga-test-worker',worker:'history-auth-worker'};
 const first=await adapter.invoke(actor,{protocol,operation:'submit',key:'history-auth-instance',target,inputs:{order:inventory.request('reserve','history-auth-order').inputs.order}}) as any;
 const page=await adapter.handle(actor,{protocol,operation:'history',instance:first.instance,limit:1}) as any;expect(page.status).toBe('history');
 authorized=false;
  expect(await adapter.handle(actor,{protocol,operation:'history',instance:first.instance,...(page.nextCursor?{cursor:page.nextCursor}:{}),limit:10})).toEqual({status:'denied',code:'AUTHORIZATION'});
}),{timeout:30_000});


test('a control-operation crash recovers the exact original claim without renewing its lease',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'control-crash-a'),installSagaProvider(cluster.providers[1],'control-crash-b')]);
  const definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'control-crash-worker',service:'saga-test-worker',worker:'control-crash-worker'};
  const authorize=async(a:any)=>a.tenant==='tenant-a',adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,authorize);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'control-crash-submit',target,inputs:{order:inventory.request('reserve','control-crash-order').inputs.order}}) as any;
  const claimRequest={protocol,operation:'claim',instance:submitted.instance},capability=await adapter.prepareControl(actor,claimRequest);
  const dispatch=(adapter as any).dispatch.bind(adapter);let crash=true;
  (adapter as any).dispatch=async(a:any,request:any,capability:string)=>{const response=await dispatch(a,request,capability);if(crash&&request.operation==='claim'){crash=false;throw Error('simulated process loss after claim commit');}return response;};
  await expect(adapter.handle(actor,claimRequest,capability)).rejects.toThrow('simulated process loss after claim commit');
  const before=(await cluster.coordinator.sql`select lease_fence::text from saga_instance where id=${submitted.instance.id}`)[0]!.lease_fence;
  const restartedCoordinator=new SagaCoordinator(cluster.coordinator.url);await restartedCoordinator.initialize();
  const restartedAdapter=new SagaProtocolCoordinator(restartedCoordinator,directory,authorize);
  const recovered=await restartedAdapter.handle(actor,{protocol,operation:'recover-control',recovery:{id:capability,operation:'claim'}}) as any;
  expect(recovered.status).toBe('recovered');expect(recovered.result.status).toBe('claimed');
  expect(recovered.result.fence).toBe(before);
  const after=(await restartedCoordinator.sql`select lease_fence::text from saga_instance where id=${submitted.instance.id}`)[0]!.lease_fence;
  expect(after).toBe(before);
  await restartedCoordinator.close();
 });
},{timeout:30_000});

test('a lost compensation acknowledgement recovers the original release result after coordinator restart',async()=>{
 await withSagaNativeCluster(async cluster=>{
  let crashAfterFinality=false;
  const [inventory,allocation]=await Promise.all([
   installSagaProvider(cluster.providers[0],'compensation-crash-a',undefined,{afterFinality:async(_ticket,result)=>{if(crashAfterFinality&&result.status==='committed'){crashAfterFinality=false;throw Error('simulated lost compensation acknowledgement');}}}),
   installSagaProvider(cluster.providers[1],'compensation-crash-b'),
  ]);
  const definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'compensation-crash-worker',service:'saga-test-worker',worker:'compensation-crash-worker'},adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,async a=>a.tenant==='tenant-a'),key='compensation-crash-order';
  await inventory.seed('reserve',key);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'compensation-crash-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
  const forwardClaim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  const forward=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:forwardClaim.invocation,fence:forwardClaim.fence}) as any;
  expect(forward.result.status).toBe('committed');
  await adapter.invoke(actor,{protocol,operation:'cancel',instance:submitted.instance});
  const compensation=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  expect(compensation.invocation).toEqual({step:'reserve',direction:'compensation'});
  const request={protocol,operation:'execute',instance:submitted.instance,invocation:compensation.invocation,fence:compensation.fence},capability=await adapter.prepareControl(actor,request);
  crashAfterFinality=true;
  await expect(adapter.handle(actor,request,capability)).rejects.toThrow('simulated lost compensation acknowledgement');
  const restarted=new SagaCoordinator(cluster.coordinator.url);await restarted.initialize();
  const restartedAdapter=new SagaProtocolCoordinator(restarted,directory,async a=>a.tenant==='tenant-a');
  const recovery=await restartedAdapter.handle(actor,{protocol,operation:'recover-control',recovery:{id:capability,operation:'execute'}}) as any;
  expect(recovery.status).toBe('recovered');expect(recovery.result.result.status).toBe('committed');expect(recovery.result.invocation).toEqual(compensation.invocation);
  const state=await restartedAdapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;expect(state.phase).toBe('cancelled');
  const effects=await inventory.store.transaction(inventory.storeName,async(tx,control)=>tx`select count(*)::int as n from action_outcome where store=${control.id}`);
  expect(Number(effects[0]!.n)).toBe(2);
  const publicHistory=await restartedAdapter.handle(actor,{protocol,operation:'history',instance:submitted.instance,limit:64}) as any,ticketRows=await restarted.sql`select ticket,ordinal,direction from saga_ticket where instance_id=${submitted.instance.id} order by ordinal,direction`,outcomeEvents=(publicHistory.events as any[]).filter(event=>event.kind==='outcome');
  const expected:ExpectedProviderFact[]=ticketRows.map((row:any)=>({ticket:String(row.ticket),status:'committed',provider:'provider-a',tenant:'tenant-a',storeEpoch:'epoch-compensation-crash-a',actionRevision:'saga-r1',originalTicket:String(row.ticket),key:`saga1/${submitted.instance.namespace}/${submitted.instance.id}/${row.ordinal}/${row.direction}`,gatewayClosed:true,attemptsTerminal:true,outcomeCount:1,entity:{key,status:'release'}}));
  const history:HistoryObservation[]=ticketRows.map((row:any)=>{const invocation={step:'reserve',direction:row.direction==='c'?'compensation':'forward'},event=outcomeEvents.find(item=>item.invocation.step===invocation.step&&item.invocation.direction===invocation.direction);return {ticket:String(row.ticket),status:event?.result?.status??'missing'};});
  const providers:ProviderObservation[]=[];
  for(const fact of expected){const ticket=await inventory.gateway.sql`select tenant,store_name,epoch,intent,state from saga_provider_ticket where ticket=${fact.ticket}`,attempts=await inventory.gateway.sql`select state from saga_provider_attempt where ticket=${fact.ticket} order by attempt`;if(!ticket.length)continue;const providerTicket=ticket[0]!,intent=decodeReferenceJson(providerTicket.intent) as any,identity=encodeReferenceIdentity(['tenant-a',inventory.storeName,'worker','sales',intent.target.action,intent.key]),outcomes=await inventory.store.transaction(inventory.storeName,async(tx,control)=>tx`select original_intent,result from action_outcome where store=${control.id} and identity=${identity}`),entities=await inventory.store.transaction(inventory.storeName,async(tx,control)=>tx`select fields from action_entity where store=${control.id}`),entity=entities.map((row:any)=>decodeReferenceJson(row.fields)).find((fields:any)=>fields['["sales","id"]']?.string==='compensation-crash-order'),original=outcomes[0]?decodeReferenceJson(outcomes[0].original_intent) as any:undefined,result=outcomes[0]?decodeReferenceJson(outcomes[0].result) as any:undefined;providers.push({ticket:fact.ticket,status:result?.status??'missing',provider:'provider-a',tenant:String(providerTicket.tenant),storeEpoch:String(providerTicket.epoch),actionRevision:original?.target?.revision,originalTicket:original?.correlation,key:original?.key,gatewayClosed:providerTicket.state==='closed',attemptsTerminal:attempts.length>0&&attempts.every((row:any)=>row.state!=='admitted'),outcomeCount:outcomes.length,entityKey:entity?.['["sales","id"]']?.string??'missing',entityStatus:entity?.['["sales","status"]']?.string??'missing',source:'native-action-outcome'});}
  const independent=verifyIndependentHistory(expected,history,providers);expect(independent.passed).toBe(2);expect(outcomeEvents.map(event=>event.invocation.direction)).toEqual(['forward','compensation']);
  await restarted.close();
 });
},{timeout:30_000});

test('an execute crash after provider finality recovers the original outcome without a second effect',async()=>{
 await withSagaNativeCluster(async cluster=>{
  let crashAfterFinality=true;
  const [inventory,allocation]=await Promise.all([
   installSagaProvider(cluster.providers[0],'execute-crash-a',undefined,{afterFinality:async()=>{if(crashAfterFinality){crashAfterFinality=false;throw Error('simulated lost execute acknowledgement');}}}),
   installSagaProvider(cluster.providers[1],'execute-crash-b'),
  ]);
  const definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'execute-crash-worker',service:'saga-test-worker',worker:'execute-crash-worker'},authorize=async(a:any)=>a.tenant==='tenant-a';
  const coordinator=new SagaProtocolCoordinator(cluster.coordinator,directory,authorize);
  const key='execute-crash-order';await inventory.seed('reserve',key);
  const submitted=await coordinator.invoke(actor,{protocol,operation:'submit',key:'execute-crash-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
  const claimed=await coordinator.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  const executeRequest={protocol,operation:'execute',instance:submitted.instance,invocation:claimed.invocation,fence:claimed.fence},capability=await coordinator.prepareControl(actor,executeRequest);
  await expect(coordinator.handle(actor,executeRequest,capability)).rejects.toThrow('simulated lost execute acknowledgement');
  const restartedCoordinator=new SagaCoordinator(cluster.coordinator.url);await restartedCoordinator.initialize();
  const restarted=new SagaProtocolCoordinator(restartedCoordinator,directory,authorize);
  const recovered=await restarted.handle(actor,{protocol,operation:'recover-control',recovery:{id:capability,operation:'execute'}}) as any;
  expect(recovered.status).toBe('recovered');expect(recovered.result.status).toBe('outcome');expect(recovered.result.result.status).toBe('committed');
  const effectCount=await inventory.store.transaction(inventory.storeName,async(tx,control)=>tx`select count(*)::int as count from action_outcome where store=${control.id} and identity=${encodeReferenceIdentity(['tenant-a',control.store,'worker','sales','reserve',`saga1/${submitted.instance.namespace}/${submitted.instance.id}/0/f`])}`);
  expect(effectCount[0]!.count).toBe(1);
  await restartedCoordinator.close();
 });
},{timeout:30_000});

test('retained issuer evidence resolves after automatic lookup exhaustion without resuming work',async()=>{
 await withSagaNativeCluster(async cluster=>{
  let loseAck=true;
  const [inventory,allocation]=await Promise.all([
   installSagaProvider(cluster.providers[0],'resolve-after-budget-a',undefined,{afterFinality:async(_ticket,result)=>{if(loseAck&&result.status==='committed'){loseAck=false;throw Error('provider reply lost after retained finality');}}}),
   installSagaProvider(cluster.providers[1],'resolve-after-budget-b'),
  ]);
  const definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'resolve-budget-worker',service:'saga-test-worker',worker:'resolve-budget-worker'},adapter=new SagaProtocolCoordinator(cluster.coordinator,new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),async a=>a.tenant==='tenant-a'),key='resolve-after-budget-order';
  await inventory.seed('reserve',key);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'resolve-after-budget-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any,claim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any,execute={protocol,operation:'execute',instance:submitted.instance,invocation:claim.invocation,fence:claim.fence},capability=await adapter.prepareControl(actor,execute);
  await expect(adapter.handle(actor,execute,capability)).rejects.toThrow('provider reply lost after retained finality');
  const ticket=String((await cluster.coordinator.sql`select ticket from saga_ticket where instance_id=${submitted.instance.id} and ordinal=0 and direction='f'`)[0]!.ticket);
  for(let index=0;index<16;index++)expect(await cluster.coordinator.lookupBudget(ticket)).toBe(true);
  expect(await cluster.coordinator.lookupBudget(ticket)).toBe(false);
  const before=await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;expect(before.phase).toBe('intervention-required');expect(before.pending).toHaveLength(1);
  const resolved=await adapter.invoke(actor,{protocol,operation:'resolve',instance:submitted.instance,invocation:{step:'reserve',direction:'forward'},evidence:ticket}) as any;
  expect(resolved.status).toBe('state');expect(resolved.phase).toBe('intervention-required');expect(resolved.pending).toEqual([]);expect(resolved.forward[0]!.state).toBe('committed');expect(resolved.stopCause).toEqual(before.stopCause);
  const retained=await inventory.gateway.retainedEvidence(ticket);expect(retained).toBeDefined();
  const identity=encodeReferenceIdentity(['tenant-a',inventory.storeName,'worker','sales','reserve',`saga1/${submitted.instance.namespace}/${submitted.instance.id}/0/f`]),effects=await inventory.store.transaction(inventory.storeName,async(tx,control)=>tx`select result from action_outcome where store=${control.id} and identity=${identity}`);
  expect(effects).toHaveLength(1);expect((decodeReferenceJson(effects[0]!.result) as any).status).toBe('committed');
 });
},{timeout:30_000});

test('five-step recovery compensates the committed prefix in exact reverse order',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'reverse-five-a'),installSagaProvider(cluster.providers[1],'reverse-five-b')]);
  const definition=sagaRuntimePlan(inventory,allocation),actions=['reserve','allocate','reserve','allocate','reserve'],base=structuredClone(definition.definition.steps[0]) as any;
  definition.definition.steps=actions.map((action,index)=>({...structuredClone(base),id:`step-${index}`,action:{module:'sales',action},binding:action==='reserve'?'inventory':'allocation',compensation:{kind:'action',action:{module:'sales',action:'release'},binding:action==='reserve'?'inventory':'allocation',inputs:structuredClone(base.inputs)}}));
  const sagaDoc=(definition as any).document.modules[0].extensions['umf.actions.saga'];sagaDoc.sagas[0]=definition.definition;
  const target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'reverse-worker',service:'saga-test-worker',worker:'reverse-worker'},authorize=async(a:any)=>a.tenant==='tenant-a';
  const adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,authorize),key='reverse-five-order';await Promise.all([inventory.seed('reserve',key),allocation.seed('allocate',key)]);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'reverse-five-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
  const forward:string[]=[];
  for(let i=0;i<4;i++){
   const claim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;expect(claim.invocation).toEqual({step:`step-${i}`,direction:'forward'});forward.push(claim.invocation.step);
   const outcome=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:claim.invocation,fence:claim.fence}) as any;if(outcome.result.status!=='committed')throw Error(`forward ${i} failed: ${JSON.stringify(outcome)}`);expect(outcome.result.status).toBe('committed');
  }
  await inventory.store.sql.unsafe("CREATE FUNCTION saga_reverse_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'five-step forward rollback witness' USING ERRCODE='40001'; END $$; CREATE TRIGGER saga_reverse_failure BEFORE INSERT ON action_outcome FOR EACH ROW EXECUTE FUNCTION saga_reverse_failure()").simple();
  const failedClaim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;expect(failedClaim.invocation).toEqual({step:'step-4',direction:'forward'});
  const failed=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:failedClaim.invocation,fence:failedClaim.fence}) as any;expect(failed.result.status).toBe('failed');
  await inventory.store.sql.unsafe('DROP TRIGGER saga_reverse_failure ON action_outcome; DROP FUNCTION saga_reverse_failure()').simple();
  const compensation:string[]=[];
  for(let i=3;i>=0;i--){
   const claim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;if(!claim.invocation)throw Error(`compensation claim ${i} refused: ${JSON.stringify(claim)}`);expect(claim.invocation).toEqual({step:`step-${i}`,direction:'compensation'});compensation.push(claim.invocation.step);
   const outcome=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:claim.invocation,fence:claim.fence}) as any;expect(outcome.result.status).toBe('committed');
  }
  expect(forward).toEqual(['step-0','step-1','step-2','step-3']);expect(compensation).toEqual(['step-3','step-2','step-1','step-0']);
  const state=await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;expect(state.status).toBe('state');expect(state.phase).toBe('compensated');
 });
},{timeout:60_000});

test('forward authorization does not imply independent compensation authority',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'comp-auth-a'),installSagaProvider(cluster.providers[1],'comp-auth-b')]);
  const definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'comp-auth-worker',service:'saga-test-worker',worker:'comp-auth-worker'},authorize=async(a:any)=>a.tenant==='tenant-a';
  const adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,authorize),key='comp-auth-order';await inventory.seed('reserve',key);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'comp-auth-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
  const forward=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  expect(forward.invocation).toEqual({step:'reserve',direction:'forward'});
  expect((await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:forward.invocation,fence:forward.fence}) as any).result.status).toBe('committed');
  await adapter.invoke(actor,{protocol,operation:'cancel',instance:submitted.instance});
  await inventory.policy.membership(inventory.storeName,'worker','forward',false);
  await inventory.policy.membership(inventory.storeName,'worker','compensator',false);
  const compensation=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  expect(compensation.invocation).toEqual({step:'reserve',direction:'compensation'});
  const denied=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:compensation.invocation,fence:compensation.fence}) as any;
  expect(denied.result.status).toBe('denied');
  const state=await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;
  expect(state.phase).toBe('intervention-required');expect(state.forward[0]!.state).toBe('committed');expect(state.compensations[0]!.state).toBe('refused');
  const entity=await inventory.store.transaction(inventory.storeName,async(tx,control)=>tx`select fields from action_entity where store=${control.id}`);
  expect((decodeReferenceJson(entity[0]!.fields) as any)['["sales","status"]']).toEqual({string:'reserve'});
 });
},{timeout:30_000});

test('cancellation during an admitted forward invocation waits for its original result before compensation',async()=>{
 await withSagaNativeCluster(async cluster=>{
  let paused=true,observed!:()=>void,release!:()=>void;let atProvider=new Promise<void>(resolve=>{observed=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  const [inventory,allocation]=await Promise.all([
   installSagaProvider(cluster.providers[0],'cancel-race-a',undefined,{afterInvoke:async()=>{if(!paused)return;paused=false;observed();await gate;}}),
   installSagaProvider(cluster.providers[1],'cancel-race-b'),
  ]);
  const definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'cancel-race-worker',service:'saga-test-worker',worker:'cancel-race-worker'},authorize=async(a:any)=>a.tenant==='tenant-a';
  const adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,authorize),key='cancel-race-order';await inventory.seed('reserve',key);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'cancel-race-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
  const claim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  const execution=adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:claim.invocation,fence:claim.fence});await atProvider;
  const cancelled=await adapter.invoke(actor,{protocol,operation:'cancel',instance:submitted.instance}) as any;expect(cancelled.status).toBe('cancel-requested');
  const blocked=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;expect(blocked).toEqual({status:'unsupported',code:'SAGA_PENDING'});
  const during=await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;expect(during.pending).toHaveLength(1);expect(during.forward[0]!.state).toBe('indeterminate');
  release();const result=await execution as any;expect(result.result.status).toBe('committed');
  const compensation=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;expect(compensation.invocation).toEqual({step:'reserve',direction:'compensation'});
  const released=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:compensation.invocation,fence:compensation.fence}) as any;expect(released.result.status).toBe('committed');
  const after=await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;expect(after.phase).toBe('cancelled');expect(after.forward[0]!.state).toBe('committed');expect(after.compensations[0]!.state).toBe('committed');
 });
},{timeout:30_000});

test('a failed compensation stops before earlier committed work is compensated',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'failed-comp-a'),installSagaProvider(cluster.providers[1],'failed-comp-b')]);
  const definition=sagaRuntimePlan(inventory,allocation),base=structuredClone(definition.definition.steps[0]) as any,actions=['reserve','allocate','reserve'];
  definition.definition.steps=actions.map((action,index)=>({...structuredClone(base),id:`failure-step-${index}`,action:{module:'sales',action},binding:action==='allocate'?'allocation':'inventory',compensation:{kind:'action',action:{module:'sales',action:'release'},binding:action==='allocate'?'allocation':'inventory',inputs:structuredClone(base.inputs)}}));
  (definition as any).document.modules[0].extensions['umf.actions.saga'].sagas[0]=definition.definition;
  const target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'failed-comp-worker',service:'saga-test-worker',worker:'failed-comp-worker'},authorize=async(a:any)=>a.tenant==='tenant-a';
  const adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,authorize),key='failed-comp-order';await Promise.all([inventory.seed('reserve',key),allocation.seed('allocate',key)]);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'failed-comp-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
  for(let i=0;i<2;i++){const claim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;const outcome=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:claim.invocation,fence:claim.fence}) as any;expect(outcome.result.status).toBe('committed');}
  await inventory.store.sql.unsafe("CREATE FUNCTION saga_failed_comp_forward() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forward rollback witness' USING ERRCODE='40001'; END $$; CREATE TRIGGER saga_failed_comp_forward BEFORE INSERT ON action_outcome FOR EACH ROW EXECUTE FUNCTION saga_failed_comp_forward()").simple();
  const failureClaim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;expect(failureClaim.invocation).toEqual({step:'failure-step-2',direction:'forward'});
  const failure=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:failureClaim.invocation,fence:failureClaim.fence}) as any;expect(failure.result.status).toBe('failed');
  await inventory.store.sql.unsafe('DROP TRIGGER saga_failed_comp_forward ON action_outcome; DROP FUNCTION saga_failed_comp_forward()').simple();
  await allocation.store.sql.unsafe("CREATE FUNCTION saga_failed_comp_release() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'compensation rollback witness' USING ERRCODE='40001'; END $$; CREATE TRIGGER saga_failed_comp_release BEFORE INSERT ON action_outcome FOR EACH ROW EXECUTE FUNCTION saga_failed_comp_release()").simple();
  const releaseClaim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;expect(releaseClaim.invocation).toEqual({step:'failure-step-1',direction:'compensation'});
  const release=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:releaseClaim.invocation,fence:releaseClaim.fence}) as any;expect(release.result.status).toBe('failed');
  const state=await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;expect(state.phase).toBe('intervention-required');expect(state.compensations.map((item:any)=>item.state)).toEqual(['idle','failed','idle']);
  const earlier=await cluster.coordinator.sql`select count(*)::int as n from saga_ticket where instance_id=${submitted.instance.id} and ordinal=0 and direction='c'`;expect(earlier[0]!.n).toBe(0);
  await allocation.store.sql.unsafe('DROP TRIGGER saga_failed_comp_release ON action_outcome; DROP FUNCTION saga_failed_comp_release()').simple();
 });
},{timeout:60_000});

test('cancel is refused during failure unwind without replacing the first cause',async()=>{
 await withSagaNativeCluster(async cluster=>{
  let loseFailureAck=true, providerInvocations=0, pauseCompensation=true,signalCompensation!:()=>void,releaseCompensation!:()=>void;
  const compensationObserved=new Promise<void>(resolve=>{signalCompensation=resolve;}),compensationGate=new Promise<void>(resolve=>{releaseCompensation=resolve;});
  const [inventory,allocation]=await Promise.all([
   installSagaProvider(cluster.providers[0],'cancel-failure-a',undefined,{afterInvoke:async()=>{providerInvocations++;if(pauseCompensation&&providerInvocations===2){pauseCompensation=false;signalCompensation();await compensationGate;}}}),
   installSagaProvider(cluster.providers[1],'cancel-failure-b',undefined,{afterFinality:async(_ticket,result)=>{if(loseFailureAck&&result.status==='failed'){loseFailureAck=false;throw Error('lost failed-forward acknowledgement');}}}),
  ]);
  const definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'cancel-failure-worker',service:'saga-test-worker',worker:'cancel-failure-worker'},adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,async a=>a.tenant==='tenant-a'),key='cancel-failure-order';
  await Promise.all([inventory.seed('reserve',key),allocation.seed('allocate',key)]);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'cancel-failure-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
  const first=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  expect((await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:first.invocation,fence:first.fence}) as any).result.status).toBe('committed');
  await allocation.store.sql.unsafe("CREATE FUNCTION saga_cancel_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forward rollback witness' USING ERRCODE='40001'; END $$; CREATE TRIGGER saga_cancel_failure BEFORE INSERT ON action_outcome FOR EACH ROW EXECUTE FUNCTION saga_cancel_failure()").simple();
  const failing=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  await expect(adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:failing.invocation,fence:failing.fence})).rejects.toThrow('lost failed-forward acknowledgement');
  await allocation.store.sql.unsafe('DROP TRIGGER saga_cancel_failure ON action_outcome; DROP FUNCTION saga_cancel_failure()').simple();
  const reconciled=await adapter.invoke(actor,{protocol,operation:'reconcile',instance:submitted.instance}) as any;expect(reconciled.status).toBe('state');
  const before=await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;expect(before.phase).toBe('compensating');expect(before.stopCause.kind).toBe('failure');
  const cancellation=await adapter.invoke(actor,{protocol,operation:'cancel',instance:submitted.instance}) as any;expect(cancellation).toEqual({status:'conflict',code:'SAGA_ORDER'});
  const after=await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;expect(after.stopCause).toEqual(before.stopCause);expect(after.phase).toBe('compensating');
  const compensation=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;expect(compensation.invocation).toEqual({step:'reserve',direction:'compensation'});
  const releasing=adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:compensation.invocation,fence:compensation.fence});await compensationObserved;
  const during=await adapter.invoke(actor,{protocol,operation:'cancel',instance:submitted.instance}) as any;expect(during).toEqual({status:'conflict',code:'SAGA_ORDER'});
  const whilePending=await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;expect(whilePending.phase).toBe('compensating');expect(whilePending.stopCause).toEqual(before.stopCause);expect(whilePending.pending).toHaveLength(1);
  releaseCompensation();const released=await releasing as any;expect(released.result.status).toBe('committed');
  const terminal=await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;expect(terminal.phase).toBe('compensated');expect(terminal.stopCause).toEqual(before.stopCause);
 });
},{timeout:60_000});

test('an irreversible committed step remains visible as residual when later work fails',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'pivot-residual-a'),installSagaProvider(cluster.providers[1],'pivot-residual-b')]);
  const definition=sagaRuntimePlan(inventory,allocation);definition.definition.steps[0]!.compensation={kind:'irreversible',reason:'External notification cannot be recalled'} as any;
  (definition as any).document.modules[0].extensions['umf.actions.saga'].sagas[0]=definition.definition;
  const target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'pivot-worker',service:'saga-test-worker',worker:'pivot-worker'},authorize=async(a:any)=>a.tenant==='tenant-a';
  const adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,authorize),key='pivot-residual-order';await Promise.all([inventory.seed('reserve',key),allocation.seed('allocate',key)]);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'pivot-residual-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
  const first=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  expect((await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:first.invocation,fence:first.fence}) as any).result.status).toBe('committed');
  await allocation.store.sql.unsafe("CREATE FUNCTION saga_pivot_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'later forward failure' USING ERRCODE='40001'; END $$; CREATE TRIGGER saga_pivot_failure BEFORE INSERT ON action_outcome FOR EACH ROW EXECUTE FUNCTION saga_pivot_failure()").simple();
  const second=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  const failed=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:second.invocation,fence:second.fence}) as any;expect(failed.result.status).toBe('failed');
  await allocation.store.sql.unsafe('DROP TRIGGER saga_pivot_failure ON action_outcome; DROP FUNCTION saga_pivot_failure()').simple();
  expect(await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance})).toEqual({status:'unsupported',code:'SAGA_PIVOT'});
  const state=await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;
  expect(state.phase).toBe('intervention-required');expect(state.forward[0]!.state).toBe('committed');expect(state.compensations[0]!.state).toBe('irreversible');
  const entity=await inventory.store.transaction(inventory.storeName,async(tx,control)=>tx`select fields from action_entity where store=${control.id}`);
  expect((decodeReferenceJson(entity[0]!.fields) as any)['["sales","status"]']).toEqual({string:'reserve'});
  const compensationTicket=await cluster.coordinator.sql`select count(*)::int as n from saga_ticket where instance_id=${submitted.instance.id} and direction='c'`;expect(compensationTicket[0]!.n).toBe(0);
 });
},{timeout:60_000});

test('reconciliation consumes the bounded lookup budget across coordinator restart',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'lookup-budget-a'),installSagaProvider(cluster.providers[1],'lookup-budget-b')]);
  const definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'lookup-worker',service:'saga-test-worker',worker:'lookup-worker'},authorize=async(a:any)=>a.tenant==='tenant-a';
  const originalRegister=inventory.gateway.register.bind(inventory.gateway);
  inventory.gateway.register=async(ticket,tenant,request,credential)=>{const result=await originalRegister(ticket,tenant,request,credential);await inventory.gateway.holdAdmission(ticket);return result;};
  let authoritativeLookups=0;const originalReconcile=inventory.gateway.reconcile.bind(inventory.gateway);
  inventory.gateway.reconcile=async(...args:any[])=>{authoritativeLookups++;return originalReconcile(...args as Parameters<typeof originalReconcile>);};
  const adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,authorize),key='bounded-lookup-order';await inventory.seed('reserve',key);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'bounded-lookup-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
  const claim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
  const result=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:claim.invocation,fence:claim.fence}) as any;expect(result.status).toBe('indeterminate');
  for(let attempt=0;attempt<8;attempt++)expect((await adapter.invoke(actor,{protocol,operation:'reconcile',instance:submitted.instance}) as any).status).toBe('indeterminate');
  await cluster.coordinator.close();
  const restartedCoordinator=new SagaCoordinator(cluster.coordinator.url);await restartedCoordinator.initialize();
  const restartedAdapter=new SagaProtocolCoordinator(restartedCoordinator,directory,authorize);
  for(let attempt=0;attempt<9;attempt++)expect((await restartedAdapter.invoke(actor,{protocol,operation:'reconcile',instance:submitted.instance}) as any).status).toBe('indeterminate');
  expect(authoritativeLookups).toBe(16);
  const pendingState=await restartedAdapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;
  expect(pendingState.pending).toHaveLength(1);
  const ticket=String((await restartedCoordinator.sql`select ticket from saga_ticket where instance_id=${submitted.instance.id} and direction='f'`)[0]!.ticket);
  const [providerTicket,attempts,outcomes]=await Promise.all([
   inventory.gateway.sql`select tenant,store_name,epoch,intent,state from saga_provider_ticket where ticket=${ticket}`,
   inventory.gateway.sql`select state from saga_provider_attempt where ticket=${ticket} order by attempt`,
   inventory.store.transaction(inventory.storeName,async(tx,control)=>tx`select result from action_outcome where store=${control.id}`),
  ]);
  const intent=decodeReferenceJson(providerTicket[0]!.intent) as any;
  const staticExpected:ExpectedProviderFact={ticket,status:'pending',provider:'provider-a',tenant:'tenant-a',storeEpoch:'epoch-lookup-budget-a',actionRevision:'saga-r1',originalTicket:ticket,key:`saga1/${submitted.instance.namespace}/${submitted.instance.id}/0/f`,gatewayClosed:false,attemptsTerminal:false,outcomeCount:0,pending:true};
  const oracle=verifyIndependentHistory([staticExpected],[{ticket,status:'pending',pending:pendingState.pending.some((item:any)=>item.step==='reserve'&&item.direction==='forward')}],[{ticket,status:providerTicket[0]!.state==='open'&&attempts.some((row:any)=>row.state==='admitted')?'pending':'unexpected',provider:'provider-a',tenant:String(providerTicket[0]!.tenant),storeEpoch:String(providerTicket[0]!.epoch),actionRevision:intent.target.revision,originalTicket:intent.correlation,key:intent.key,gatewayClosed:providerTicket[0]!.state==='closed',attemptsTerminal:attempts.length>0&&attempts.every((row:any)=>row.state!=='admitted'),outcomeCount:outcomes.length,source:'native-provider-ticket'}]);
  expect(oracle.passed).toBe(1);
  await restartedCoordinator.close();
 });
},{timeout:30_000});

test('automatic work expires against a host clock across coordinator restart',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'elapsed-budget-a'),installSagaProvider(cluster.providers[1],'elapsed-budget-b')]);
  const definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'elapsed-worker',service:'saga-test-worker',worker:'elapsed-worker'},authorize=async(a:any)=>a.tenant==='tenant-a',clock={now:50_000};
  let durable=new SagaCoordinator(cluster.coordinator.url,()=>clock.now);await durable.initialize();
  let adapter=new SagaProtocolCoordinator(durable,directory,authorize),key='elapsed-budget-order';await inventory.seed('reserve',key);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'elapsed-budget-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
  clock.now+=899_999;
  const beforeExpiry=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;expect(beforeExpiry.status).toBe('claimed');
  clock.now+=1;
  await durable.close();durable=new SagaCoordinator(cluster.coordinator.url,()=>clock.now);await durable.initialize();adapter=new SagaProtocolCoordinator(durable,directory,authorize);
  const afterExpiry=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;expect(afterExpiry.status).not.toBe('claimed');
  const stopped=await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any;
  expect(stopped.phase).toBe('intervention-required');expect(stopped.stopCause).toEqual({kind:'intervention',code:'SAGA_LIMIT'});
  const effects=await inventory.store.transaction(inventory.storeName,async(tx,control)=>tx`select count(*)::int as n from action_outcome where store=${control.id}`);
  expect(Number(effects[0]!.n)).toBe(0);
  await durable.close();
 });
},{timeout:30_000});

test('a submit acknowledgement lost after durable admission recovers the original response',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'submit-loss-a'),installSagaProvider(cluster.providers[1],'submit-loss-b')]);
  const definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'submit-loss-worker',service:'saga-test-worker',worker:'submit-loss-worker'},adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,async a=>a.tenant==='tenant-a'),key='submit-loss-order';
  const request={protocol,operation:'submit',key:'submit-loss-idempotency',target,inputs:{order:inventory.request('reserve',key).inputs.order}},capability=await adapter.prepareControl(actor,request),dispatch=(adapter as any).dispatch.bind(adapter);
  (adapter as any).dispatch=async(a:any,r:any,cap:string)=>{const response=await dispatch(a,r,cap);if(r.operation==='submit')throw Error('simulated lost submit acknowledgement');return response;};
  await expect(adapter.handle(actor,request,capability)).rejects.toThrow('simulated lost submit acknowledgement');
  const restartedCoordinator=new SagaCoordinator(cluster.coordinator.url);await restartedCoordinator.initialize();const restarted=new SagaProtocolCoordinator(restartedCoordinator,directory,async a=>a.tenant==='tenant-a');
  const recovered=await restarted.handle(actor,{protocol,operation:'recover-control',recovery:{id:capability,operation:'submit'}}) as any;
  expect(recovered.status).toBe('recovered');expect(recovered.result.status).toBe('submitted');expect(recovered.result.definition).toEqual(target);
  const retried=await restarted.invoke(actor,request) as any;expect(retried).toEqual(recovered.result);
  const instances=await cluster.coordinator.sql`select count(*)::int as n from saga_instance where tenant='tenant-a' and owner=${actor.principal} and submit_key='submit-loss-idempotency'`;
  expect(instances[0]!.n).toBe(1);
  await restartedCoordinator.close();
 });
},{timeout:30_000});

test('Unicode tenant identity executes with an opaque action key that survives restart',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const tenant='tenant/租😀';
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'unicode-namespace-a',undefined,{},tenant),installSagaProvider(cluster.providers[1],'unicode-namespace-b',undefined,{},tenant)]);
  await inventory.seed('reserve','unicode-order');
  const definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant,principal:'operator/雪',service:'saga-test-worker',worker:'worker/雪'},adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,async()=>true);
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'unicode-namespace-submit',target,inputs:{order:inventory.request('reserve','unicode-order').inputs.order}}) as any;
  expect(submitted.status).toBe('submitted');expect(submitted.instance.namespace).toMatch(/^[A-Za-z0-9_-]+$/);expect(submitted.instance.namespace).not.toContain(tenant);
  const claim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;expect(claim.status).toBe('claimed');
  const restarted=new SagaCoordinator(cluster.coordinator.url);await restarted.initialize();const restartedAdapter=new SagaProtocolCoordinator(restarted,directory,async()=>true);
  const result=await restartedAdapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:claim.invocation,fence:claim.fence}) as any;expect(result.result.status).toBe('committed');
  const actionKey=`saga1/${submitted.instance.namespace}/${submitted.instance.id}/0/f`,
   retained=await restarted.sql`select namespace from saga_instance where id=${submitted.instance.id}`,
   tickets=await restarted.sql`select ticket,action_key from saga_ticket where instance_id=${submitted.instance.id} and ordinal=0 and direction='f'`;
  expect(retained[0]!.namespace).toBe(submitted.instance.namespace);expect(tickets[0]!.action_key).toBe(actionKey);
  expect(await restarted.ticketActionKey(String(tickets[0]!.ticket))).toBe(actionKey);
  const providerRows=await inventory.store.transaction(inventory.storeName,async(tx,control)=>tx`select original_intent from action_outcome where store=${control.id}`);
  expect(providerRows).toHaveLength(1);expect((decodeReferenceJson(providerRows[0]!.original_intent) as any).key).toBe(actionKey);
  expect((await restartedAdapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any).phase).toBe('running');
  await restarted.close();
 });
},{timeout:30_000});

test('changed revision or trusted binding conflicts after terminal completion',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'terminal-intent-a'),installSagaProvider(cluster.providers[1],'terminal-intent-b')]);
  const original=sagaRuntimePlan(inventory,allocation),target={module:original.module,saga:original.id,revision:original.revision},key='terminal-intent-order',protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'terminal-intent-worker',service:'saga-test-worker',worker:'terminal-intent-worker'},authorize=async(a:any)=>a.tenant==='tenant-a';
  await Promise.all([inventory.seed('reserve',key),allocation.seed('allocate',key)]);
  const originalDirectory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),original]]),adapter=new SagaProtocolCoordinator(cluster.coordinator,originalDirectory,authorize),request={protocol,operation:'submit',key:'terminal-intent-key',target,inputs:{order:inventory.request('reserve',key).inputs.order}},submitted=await adapter.invoke(actor,request) as any;
  for(let i=0;i<original.definition.steps.length;i++){const claim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any,result=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:claim.invocation,fence:claim.fence}) as any;expect(result.result.status).toBe('committed');}
  expect((await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any).phase).toBe('succeeded');
  const clonePlan=(source:typeof original)=>({...source,document:structuredClone(source.document),definition:structuredClone(source.definition),bindings:Object.fromEntries(Object.entries(source.bindings).map(([name,binding])=>[name,{...binding,actionRevisions:{...binding.actionRevisions}}]))});
  const revised=clonePlan(original);revised.revision='saga-r2';const revisedTarget={...target,revision:'saga-r2'},revisedDirectory=new Map([[JSON.stringify([revisedTarget.module,revisedTarget.saga,revisedTarget.revision]),revised]]),revisionAdapter=new SagaProtocolCoordinator(cluster.coordinator,revisedDirectory,authorize);
  const changedRevision=await revisionAdapter.invoke(actor,{...request,target:revisedTarget}) as any;expect(changedRevision).toEqual({status:'conflict',code:'TOKEN_REUSE'});
  const replaced=clonePlan(original);replaced.bindings.inventory!.provider='provider-replacement';replaced.bindings.inventory!.storeName=allocation.storeName;const replacementAdapter=new SagaProtocolCoordinator(cluster.coordinator,new Map([[JSON.stringify([target.module,target.saga,target.revision]),replaced]]),authorize);
  const changedBinding=await replacementAdapter.invoke(actor,request) as any;expect(changedBinding).toEqual({status:'conflict',code:'TOKEN_REUSE'});
 });
},{timeout:30_000});

test('a first-step rollback unwinds empty and late delivery returns its original failure without effects',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const inventory=await installSagaProvider(cluster.providers[0],'empty-unwind'),allocation=await installSagaProvider(cluster.providers[1],'empty-unwind-b'),definition=sagaRuntimePlan(inventory,allocation);
  definition.definition.steps=[definition.definition.steps[0]!];definition.document=(structuredClone(definition.document) as any);(definition.document as any).modules[0].extensions['umf.actions.saga'].sagas=[definition.definition];
  const target={module:definition.module,saga:definition.id,revision:definition.revision},adapter=new SagaProtocolCoordinator(cluster.coordinator,new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),async a=>a.tenant==='tenant-a'),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'empty-unwind-worker',service:'saga-test-worker',worker:'empty-unwind-worker'},key='empty-unwind-order';
  await inventory.seed('reserve',key);
  await inventory.store.sql.unsafe("CREATE FUNCTION saga_empty_unwind_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'first forward rollback witness' USING ERRCODE='40001'; END $$; CREATE TRIGGER saga_empty_unwind_failure BEFORE INSERT ON action_outcome FOR EACH ROW EXECUTE FUNCTION saga_empty_unwind_failure()").simple();
  const submitted=await adapter.invoke(actor,{protocol,operation:'submit',key:'empty-unwind-submit',target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any,claim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any,ticket=String((await cluster.coordinator.sql`select ticket from saga_ticket where instance_id=${submitted.instance.id} and ordinal=0 and direction='f'`)[0]!.ticket),failure=await adapter.invoke(actor,{protocol,operation:'execute',instance:submitted.instance,invocation:claim.invocation,fence:claim.fence}) as any;
  await inventory.store.sql.unsafe('DROP TRIGGER saga_empty_unwind_failure ON action_outcome; DROP FUNCTION saga_empty_unwind_failure()').simple();
  expect(failure.result.status).toBe('failed');expect((await adapter.handle(actor,{protocol,operation:'status',instance:submitted.instance}) as any).phase).toBe('compensated');
  const ticketRows=await inventory.gateway.sql`select intent from saga_provider_ticket where ticket=${ticket}`,request=decodeReferenceJson(ticketRows[0]!.intent) as unknown as ReferenceInvokeRequest;
  const late=await inventory.gateway.deliver(ticket,inventory.credential,request);expect(late).toEqual(failure.result);
  const identity=encodeReferenceIdentity(['tenant-a',inventory.storeName,'worker','sales','reserve',request.key]),outcomes=await inventory.store.transaction(inventory.storeName,async(tx,control)=>tx`select result from action_outcome where store=${control.id} and identity=${identity}`),attempts=await inventory.gateway.sql`select state from saga_provider_attempt where ticket=${ticket}`;
  expect(outcomes).toHaveLength(0);expect(attempts).toHaveLength(1);expect(attempts[0]!.state).toBe('rolled-back');
  const history=await adapter.handle(actor,{protocol,operation:'history',instance:submitted.instance,limit:64}) as any;expect(history.events.filter((event:any)=>event.kind==='outcome').map((event:any)=>event.result.status)).toEqual(['failed']);
 });
},{timeout:30_000});

test('incompatible automatic limits refuse admission and tighter limits persist across restart',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'limit-profile-a'),installSagaProvider(cluster.providers[1],'limit-profile-b')]),definition=sagaRuntimePlan(inventory,allocation),actor={tenant:'tenant-a',principal:'limit-profile-worker',service:'saga-test-worker'},key='limit-profile-key';
  const makeIntent=(overrides:Record<string,unknown>)=>({definitionRevision:definition.revision,target:{module:definition.module,saga:definition.id,revision:definition.revision},package:encodeReferenceJson(definition.document),definition:definition.definition,inputs:{order:inventory.request('reserve',key).inputs.order},bindings:{inventory:{provider:'provider-a',storeName:inventory.storeName},allocation:{provider:'provider-b',storeName:allocation.storeName}},actionRevisions:{'inventory:reserve':'saga-r1','allocation:allocate':'saga-r1'},...overrides});
  const coordinator=cluster.coordinator;
  expect(await coordinator.submit(actor,'needs-longer-duration',makeIntent({maxAutomaticMs:900001}))).toEqual({status:'refusal',code:'SAGA_LIMIT'});
  expect(await coordinator.submit(actor,'requires-erasure',makeIntent({payloadErasureAllowed:true}))).toEqual({status:'refusal',code:'SAGA_LIMIT'});
  const accepted=await coordinator.submit(actor,'tight-limits',makeIntent({maxLookups:2,maxAutomaticMs:120000,maxRetainedBytes:1000000}));expect(accepted.status).toBe('submitted');if(accepted.status!=='submitted')throw Error('Expected tight limits to be admitted');
  const row=await coordinator.sql`select max_lookups,max_automatic_ms,max_retained_bytes,payload_erasure_allowed from saga_instance where id=${accepted.instance}`;
  expect(Number(row[0]!.max_lookups)).toBe(2);expect(Number(row[0]!.max_automatic_ms)).toBe(120000);expect(Number(row[0]!.max_retained_bytes)).toBe(1000000);expect(row[0]!.payload_erasure_allowed).toBe(false);
  const restarted=new SagaCoordinator(coordinator.url);await restarted.initialize();const retained=await restarted.sql`select max_lookups,max_automatic_ms,max_retained_bytes,payload_erasure_allowed from saga_instance where id=${accepted.instance}`;
  expect(Number(retained[0]!.max_lookups)).toBe(2);expect(Number(retained[0]!.max_automatic_ms)).toBe(120000);expect(Number(retained[0]!.max_retained_bytes)).toBe(1000000);expect(retained[0]!.payload_erasure_allowed).toBe(false);
  await restarted.close();
 });
},{timeout:30_000});

test('operator closure rejects finality evidence for another provider, revision, epoch, or action key',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const [inventory,allocation]=await Promise.all([installSagaProvider(cluster.providers[0],'close-scope-a'),installSagaProvider(cluster.providers[1],'close-scope-b')]);
  const definition=sagaRuntimePlan(inventory,allocation),target={module:definition.module,saga:definition.id,revision:definition.revision},directory=new Map([[JSON.stringify([target.module,target.saga,target.revision]),definition]]),protocol='umf.actions.saga/1',actor={tenant:'tenant-a',principal:'close-scope-worker',service:'saga-test-worker',worker:'close-scope-worker'},adapter=new SagaProtocolCoordinator(cluster.coordinator,directory,async(a:any)=>a.tenant==='tenant-a');
  const variants=[
   {name:'provider',provider:'provider-b',store:allocation.storeName,epoch:'epoch-close-scope-b',revision:'saga-r1',key:'saga1/tenant-a/wrong-instance/0/f'},
   {name:'revision',provider:'provider-a',store:inventory.storeName,epoch:'epoch-close-scope-a',revision:'saga-r2',key:'saga1/tenant-a/wrong-instance/0/f'},
   {name:'epoch',provider:'provider-a',store:inventory.storeName,epoch:'epoch-retired',revision:'saga-r1',key:'saga1/tenant-a/wrong-instance/0/f'},
   {name:'action key',provider:'provider-a',store:inventory.storeName,epoch:'epoch-close-scope-a',revision:'saga-r1',key:'attacker-selected-key'},
  ];
  const observed:string[]=[];
  for(const variant of variants){
   const key=`close-scope-${variant.name.replaceAll(' ','-')}`,submitted=await adapter.invoke(actor,{protocol,operation:'submit',key,target,inputs:{order:inventory.request('reserve',key).inputs.order}}) as any;
   const claim=await adapter.invoke(actor,{protocol,operation:'claim',instance:submitted.instance}) as any;
   const ticketRows=await cluster.coordinator.sql`select ticket from saga_ticket where instance_id=${submitted.instance.id} and ordinal=0 and direction='f'`;
   const ticket=String(ticketRows[0]?.ticket??'');if(!ticket)throw Error('Claim did not preissue the operator evidence fixture ticket');
   await cluster.coordinator.latchStop(submitted.instance.id,{kind:'intervention',code:'OPERATOR_REVIEW'});
   await cluster.coordinator.settleTicket(ticket,{status:'failed',code:'TEST_NONCOMMIT'});
   const evidenceId=`forged-${variant.name.replaceAll(' ','-')}`;
   await cluster.coordinator.retainEvidence({evidenceId,issuer:variant.provider,tenant:'tenant-a',ticket,observation:{profile:'umf.actions.saga.provider-finality/1',provider:variant.provider,store:variant.store,storeEpoch:variant.epoch,actionRevision:variant.revision,invocation:{step:'reserve',direction:'forward'},key:variant.key,finalDisposition:{status:'failed',code:'TEST_NONCOMMIT'}}});
   const sequence=(await cluster.coordinator.status(submitted.instance.id,actor)).historySequence;
   const closed=await adapter.invoke(actor,{protocol,operation:'close',instance:submitted.instance,expectedHistorySequence:sequence,disposition:{kind:'accepted-residual-effects',reason:'independent operator review',evidence:evidenceId}}) as any;
   observed.push(`${variant.name}:${closed.status}:${closed.code??closed.phase}`);
  }
  expect(observed).toEqual(variants.map(variant=>`${variant.name}:conflict:SAGA_EVIDENCE`));
 });
},{timeout:30_000});
