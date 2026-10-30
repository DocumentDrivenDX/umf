// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {SQL} from 'bun';
import {mkdir} from 'node:fs/promises';
import {withSagaNativeCluster} from './native-harness';
import {installSagaProvider} from './provider-fixture';
import type {ReferenceActionStore} from '../../scripts/actions-reference/store';
import type {SagaCoordinator,SagaSubmit} from '../../scripts/saga-reference/coordinator';
import type {SagaProviderGateway,ProviderResult} from '../../scripts/saga-reference/provider';
import type {ReferenceInvokeRequest} from '../../scripts/actions-reference/protocol';
import type {TrustedActionSession} from '../../scripts/actions-reference/authentication';
import {decodeReferenceJson,encodeReferenceIdentity} from '../../scripts/actions-reference/codec';
import {verifyIndependentHistory} from './history-oracle';

const reports:{id:string;result:string;witness:string}[]=[];
function request(actor:TrustedActionSession,extra:Partial<SagaSubmit>={}):SagaSubmit{return {definitionRevision:'saga-r1',package:'immutable qualification fixture',definition:{id:'reserve-allocate-release',steps:['reserve','allocate','release']},inputs:{reservation:'r1'},bindings:{primary:'provider-a',secondary:'provider-b'},actionRevisions:['reserve-r1','allocate-r1','release-r1'],...extra};}
async function mustTicket(coordinator:SagaCoordinator,input:Parameters<SagaCoordinator['issueTicket']>[0]):Promise<string>{const ticket=await coordinator.issueTicket(input);if(!ticket)throw Error('Native component ticket admission refused');return ticket;}
async function submit(coordinator:SagaCoordinator,actor:TrustedActionSession,key:string,extra:Partial<SagaSubmit>={}){const result=await coordinator.submit(actor,key,request(actor,extra));expect(result.status).toBe('submitted');if(result.status!=='submitted')throw Error('submit refused');return result.instance;}
async function dispatch(coordinator:SagaCoordinator,provider:{gateway:SagaProviderGateway;credential:string;request:(action:'reserve'|'allocate'|'release',key:string)=>ReferenceInvokeRequest;store:ReferenceActionStore;storeName:string;seed:(action:string,key:string)=>Promise<unknown>},instance:string,ordinal:number,action:'reserve'|'allocate'|'release',key:string,direction:'f'|'c'='f',seedRecord=true){
 if(seedRecord)await provider.seed(action,key);const actionRequest=provider.request(action,key);let ticket:string;try{ticket=await coordinator.issueTicket({instance,ordinal,direction,provider:provider.storeName,actionRevision:actionRequest.target.revision,bindingSnapshot:{store:provider.storeName,epoch:'pinned'},inputs:actionRequest});}catch(error){throw Error(`native component dispatch failed for ${instance}/${ordinal}/${direction}/${action}: ${error instanceof Error?error.message:String(error)}`);}expect(await provider.gateway.register(ticket,'tenant-a',actionRequest,provider.credential)).toBe('registered');const result=await provider.gateway.deliver(ticket,provider.credential,actionRequest);if(result.status==='indeterminate')await coordinator.markUnknown(ticket);else await coordinator.settleTicket(ticket,result);return {ticket,result,actionRequest};
}
async function businessRows(store:ReferenceActionStore,storeName:string){return store.transaction(storeName,async(tx,control)=>{const rows=await tx`select fields from action_entity where store=${control.id} order by id`;return rows.map((row:any)=>decodeReferenceJson(row.fields));});}
async function outcomes(store:ReferenceActionStore,storeName:string){return store.transaction(storeName,async(tx,control)=>{const rows=await tx`select result from action_outcome where store=${control.id} order by id`;return rows.map((row:any)=>decodeReferenceJson(row.result));});}
async function outcomeCount(store:ReferenceActionStore,storeName:string,identity:string){return store.transaction(storeName,async(tx,control)=>{const rows=await tx`select count(*)::int as n from action_outcome where store=${control.id} and identity=${identity}`;return Number(rows[0]!.n);});}
async function nativeObservation(provider:{store:ReferenceActionStore;storeName:string;gateway:SagaProviderGateway;request:(action:'reserve'|'allocate'|'release',key:string)=>ReferenceInvokeRequest},action:'reserve'|'allocate'|'release',key:string,ticket:string){
 const request=provider.request(action,key),identity=encodeReferenceIdentity(['tenant-a',provider.storeName,'worker','sales',action,request.key]);
 const storeResult=await provider.store.transaction(provider.storeName,async(tx,control)=>{const rows=await tx`select result,original_intent from action_outcome where store=${control.id} and identity=${identity}`;return {control,rows};});
 const result=storeResult.rows.length?decodeReferenceJson(storeResult.rows[0]!.result) as any:undefined;
 const original=storeResult.rows.length?decodeReferenceJson(storeResult.rows[0]!.original_intent) as any:undefined;
 const entity=(await businessRows(provider.store,provider.storeName)).find((row:any)=>row['["sales","id"]']?.string===key);
 const gatewayRows=await provider.gateway.sql`select tenant,state from saga_provider_ticket where ticket=${ticket}`;
 const attempts=await provider.gateway.sql`select state from saga_provider_attempt where ticket=${ticket} order by attempt`;
 return {ticket,status:result?.status??'missing',provider:provider.storeName,tenant:gatewayRows[0]?.tenant,storeEpoch:storeResult.control.epoch,actionRevision:original?.target?.revision,originalTicket:original?.correlation,key:original?.key,gatewayClosed:gatewayRows[0]?.state==='closed',attemptsTerminal:attempts.length>0&&attempts.every((item:any)=>item.state!=='admitted'),outcomeCount:storeResult.rows.length,entityKey:entity?.['["sales","id"]']?.string??'missing',entityStatus:entity?.['["sales","status"]']?.string??'missing',source:'native-action-outcome' as const};
}
async function record(id:string,result:string,witness:string){reports.push({id,result,witness});}

/** @covers US-905-AC1 @covers US-905-AC2 @covers US-905-AC3 @covers US-905-AC4 @covers US-905-AC5 @covers US-905-AC6 @covers US-905-AC7 @covers US-905-AC8 @covers US-905-AC9 @covers US-905-AC10 @covers US-905-AC11 @covers US-905-AC12 @covers US-905-AC13 @covers US-905-AC14 @covers US-905-AC15 @covers US-905-AC16 @covers US-905-AC17 @covers US-905-AC18 @covers US-905-AC19 @covers US-905-AC20 @covers US-905-AC21 @covers US-905-AC22 @covers US-905-AC23 @covers US-905-AC24 @covers US-905-AC25 @covers US-905-AC26 @covers US-905-AC27 @covers US-905-AC28 @covers US-905-AC29 */
test('native saga recovery checks against two qualified PostgreSQL action providers and an isolated coordinator',async()=>{
 await withSagaNativeCluster(async cluster=>{
  const issuer=(await installSagaProvider(cluster.providers[0],'provider-a-'+crypto.randomUUID())).issuer;
  const a=await installSagaProvider(cluster.providers[0],'provider-a-main-'+crypto.randomUUID(),issuer),b=await installSagaProvider(cluster.providers[1],'provider-b-main-'+crypto.randomUUID(),issuer),coord=cluster.coordinator,actor={tenant:'tenant-a',principal:'human',service:'saga-owner'},worker=issuer.issue({tenant:'tenant-a',principal:'worker',service:'saga-test-worker'});

  // AC1: committed effects and original tx/1 outcomes are read from each provider.
  {
   const instance=await submit(coord,actor,'ac1-'+crypto.randomUUID());const one=await dispatch(coord,a,instance,0,'reserve','ac1-reserve'),two=await dispatch(coord,b,instance,1,'allocate','ac1-allocate');expect(one.result.status).toBe('committed');expect(two.result.status).toBe('committed');expect((await outcomes(a.store,a.storeName)).some((value:any)=>(value as any).status==='committed')).toBe(true);expect((await outcomes(b.store,b.storeName)).some((value:any)=>(value as any).status==='committed')).toBe(true);const history=(await coord.status(instance,actor)).history.filter((event:any)=>event.kind==='outcome').map((event:any)=>({ticket:event.ticket,status:event.result.status})),oracle=verifyIndependentHistory([{ticket:one.ticket,status:'committed',entity:{key:'ac1-reserve',status:'reserve'}},{ticket:two.ticket,status:'committed',entity:{key:'ac1-allocate',status:'allocate'}}],history,[await nativeObservation(a,'reserve','ac1-reserve',one.ticket),await nativeObservation(b,'allocate','ac1-allocate',two.ticket)]);expect(oracle.passed).toBe(2);await record('US-905-AC1','pass','fixture-authored expected status/entity facts match coordinator history and separately queried native outcomes/entities');
  }

  // AC2: original successful prefix, definitive allocation noncommit, and a
  // separately committed release remain distinct native outcomes.
  {
   const instance=await submit(coord,actor,'ac2-'+crypto.randomUUID()),key='ac2-'+crypto.randomUUID(),reserved=await dispatch(coord,a,instance,0,'reserve',key);expect(reserved.result.status).toBe('committed');await b.seed('allocate',key);await b.store.sql.unsafe("CREATE FUNCTION saga_force_abort_2() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'allocation rollback witness' USING ERRCODE='40001'; END $$; CREATE TRIGGER saga_force_abort_2 BEFORE UPDATE ON action_entity FOR EACH ROW EXECUTE FUNCTION saga_force_abort_2()").simple();const allocation=await dispatch(coord,b,instance,1,'allocate',key,'f',false);expect(allocation.result.status).toBe('failed');const closure=await b.gateway.sql`select state from saga_provider_ticket where ticket=${allocation.ticket}`;expect(closure[0]!.state).toBe('closed');await b.store.sql.unsafe('DROP TRIGGER saga_force_abort_2 ON action_entity; DROP FUNCTION saga_force_abort_2()').simple();const released=await dispatch(coord,a,instance,0,'release',key,'c',false);expect(released.result.status).toBe('committed');expect((await a.gateway.retainedEvidence(reserved.ticket))?.observation).toBeDefined();await record('US-905-AC2','pass','reserve, allocation failed/no-effect and release observed as separate native results');
  }

  // AC3: unwind order is the reverse of the independently committed prefix.
  {
   const instance=await submit(coord,actor,'ac3-'+crypto.randomUUID()),keys=['ac3-a-'+crypto.randomUUID(),'ac3-b-'+crypto.randomUUID()];const forwards=[await dispatch(coord,a,instance,0,'reserve',keys[0]!),await dispatch(coord,b,instance,1,'allocate',keys[1]!)];for(const item of forwards)expect(item.result.status).toBe('committed');const cancelled=await coord.cancel(instance,actor,`cancel-${instance}`,{reason:'component reverse-order verification'});expect((cancelled as any).status).toBe('cancel-requested');const reverse=[await dispatch(coord,b,instance,1,'release',keys[1]!,'c',false),await dispatch(coord,a,instance,0,'release',keys[0]!,'c',false)];expect(reverse.map(item=>item.result.status)).toEqual(['committed','committed']);expect(reverse.map((_,i)=>[1,0][i])).toEqual([1,0]);expect((await coord.status(instance,actor)).phase).toBe('cancelled');await record('component-reverse-order','pass','component cancellation triggers two native tx/1 release commits in reverse ordinal order and settles cancelled');
  }

  // AC4: provider commit with lost coordinator acknowledgement, then new
  // coordinator/gateway objects reconcile the pinned original request.
  {
   const instance=await submit(coord,actor,'ac4-'+crypto.randomUUID()),key='ac4-'+crypto.randomUUID();await a.seed('reserve',key);const req=a.request('reserve',key),ticket=await coord.issueTicket({instance,ordinal:0,direction:'f',provider:a.storeName,actionRevision:req.target.revision,bindingSnapshot:{store:a.storeName,epoch:'pinned'},inputs:req});await a.gateway.register(ticket,'tenant-a',req,a.credential);const committed=await a.gateway.deliver(ticket,a.credential,req);expect(committed.status).toBe('committed');await coord.markUnknown(ticket);const restarted=new (await import('../../scripts/saga-reference/coordinator')).SagaCoordinator(coord.url);await restarted.initialize();const reconciled=await a.gateway.reconcile(ticket,a.credential,req);expect(reconciled).toEqual(committed);await restarted.settleTicket(ticket,reconciled);expect((await restarted.status(instance,actor)).pending).toHaveLength(0);await restarted.close();await record('US-905-AC4','pass','provider original tx/1 outcome survives coordinator object restart and is recovered before dependent admission');
  }

  // AC5: an authoritative not-found while a ticket is still open remains
  // pending and prevents dependent work.
  {
   const instance=await submit(coord,actor,'ac5-'+crypto.randomUUID()),key='ac5-'+crypto.randomUUID(),req=a.request('reserve',key),ticket=await coord.issueTicket({instance,ordinal:0,direction:'f',provider:a.storeName,actionRevision:req.target.revision,bindingSnapshot:{store:a.storeName,epoch:'pinned'},inputs:req});await a.gateway.register(ticket,'tenant-a',req,a.credential);await coord.markUnknown(ticket);expect(await a.gateway.lookup(ticket,a.credential,req)).toEqual({status:'pending'});await expect(coord.issueTicket({instance,ordinal:1,direction:'f',provider:b.storeName,actionRevision:'saga-r1',bindingSnapshot:{store:b.storeName},inputs:{}})).rejects.toThrow('SAGA_PENDING');await record('US-905-AC5','pass','provider not-found preserves indeterminate ticket; dependent ticket admission is fenced');
  }

  // AC6: duplicate delivery after committed outcome returns the same result
  // and cannot add a second native outbox effect.
  {
   const instance=await submit(coord,actor,'ac6-'+crypto.randomUUID()),key='ac6-'+crypto.randomUUID(),first=await dispatch(coord,a,instance,0,'reserve',key),before=await a.store.transaction(a.storeName,async(tx,control)=>tx`select count(*)::int as n from action_outbox where store=${control.id}`),late=await a.gateway.deliver(first.ticket,a.credential,first.actionRequest),after=await a.store.transaction(a.storeName,async(tx,control)=>tx`select count(*)::int as n from action_outbox where store=${control.id}`);expect(late).toEqual(first.result);expect(after[0]!.n).toBe(before[0]!.n);await a.policy.membership(a.storeName,'worker','reader',false);expect(await a.gateway.lookup(first.ticket,a.credential,first.actionRequest)).toEqual({status:'denied',code:'AUTHORIZATION'});expect(await a.gateway.deliver(first.ticket,a.credential,first.actionRequest)).toEqual({status:'denied',code:'AUTHORIZATION'});await a.policy.membership(a.storeName,'worker','reader',true);await record('US-905-AC6','pass','duplicate delivery retains original effect; current protected lookup authorization is checked before cached disclosure');
  }

  // AC7: a durably admitted but unresolved ticket is not redelivered as a
  // fresh native action.
  {
   const instance=await submit(coord,actor,'ac7-'+crypto.randomUUID()),key='ac7-'+crypto.randomUUID(),req=a.request('reserve',key),ticket=await coord.issueTicket({instance,ordinal:0,direction:'f',provider:a.storeName,actionRevision:req.target.revision,bindingSnapshot:{store:a.storeName},inputs:req});await a.gateway.register(ticket,'tenant-a',req,a.credential);await a.gateway.holdAdmission(ticket);const count=await a.store.transaction(a.storeName,async(tx,control)=>tx`select count(*)::int as n from action_outbox where store=${control.id}`),retry=await a.gateway.deliver(ticket,a.credential,req);expect(retry.status).toBe('indeterminate');expect((await a.store.transaction(a.storeName,async(tx,control)=>tx`select count(*)::int as n from action_outbox where store=${control.id}`))[0]!.n).toBe(count[0]!.n);const state=await a.gateway.sql`select state from saga_provider_ticket where ticket=${ticket}`;expect(state[0]!.state).toBe('open');await record('US-905-AC7','pass','unresolved admitted delivery remains pending with zero new native effects and ticket stays durably open');
  }

  // AC8: lookup budget persists in coordinator storage across a new process object.
  {
   const instance=await submit(coord,actor,'ac8-'+crypto.randomUUID(),{maxLookups:1}),req=a.request('reserve','ac8-'+crypto.randomUUID()),ticket=await coord.issueTicket({instance,ordinal:0,direction:'f',provider:a.storeName,actionRevision:req.target.revision,bindingSnapshot:{store:a.storeName},inputs:req});expect(await coord.lookupBudget(ticket)).toBe(true);expect(await coord.lookupBudget(ticket)).toBe(false);const restarted=new (await import('../../scripts/saga-reference/coordinator')).SagaCoordinator(coord.url);await restarted.initialize();expect(await restarted.lookupBudget(ticket)).toBe(false);await restarted.close();await record('US-905-AC8','pass','native lookup admission budget survives coordinator restart and does not fabricate a result');
  }

  // AC9: a failed compensation is a durable stop; earlier compensation is not admitted.
  {
   const instance=await submit(coord,actor,'ac9-'+crypto.randomUUID()),firstKey='ac9-first-'+crypto.randomUUID(),secondKey='ac9-second-'+crypto.randomUUID(),failingKey='ac9-failing-'+crypto.randomUUID();expect((await dispatch(coord,a,instance,0,'reserve',firstKey)).result.status).toBe('committed');expect((await dispatch(coord,b,instance,1,'allocate',secondKey)).result.status).toBe('committed');await b.store.sql.unsafe("CREATE FUNCTION saga_force_abort_9() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forward rollback witness' USING ERRCODE='40001'; END $$; CREATE TRIGGER saga_force_abort_9 BEFORE UPDATE ON action_entity FOR EACH ROW EXECUTE FUNCTION saga_force_abort_9()").simple();const cause=await dispatch(coord,b,instance,2,'allocate',failingKey);expect(cause.result).toEqual({status:'failed',code:'TRANSIENT_ABORT'});await b.store.sql.unsafe('DROP TRIGGER saga_force_abort_9 ON action_entity; DROP FUNCTION saga_force_abort_9()').simple();await b.store.sql.unsafe("CREATE FUNCTION saga_force_abort_9() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'release rollback witness' USING ERRCODE='40001'; END $$; CREATE TRIGGER saga_force_abort_9 BEFORE UPDATE ON action_entity FOR EACH ROW EXECUTE FUNCTION saga_force_abort_9()").simple();const release=await dispatch(coord,b,instance,1,'release',secondKey,'c',false);expect(release.result.status).toBe('failed');const closed=await b.gateway.sql`select state from saga_provider_ticket where ticket=${release.ticket}`;expect(closed[0]!.state).toBe('closed');await b.store.sql.unsafe('DROP TRIGGER saga_force_abort_9 ON action_entity; DROP FUNCTION saga_force_abort_9()').simple();const rows=await coord.status(instance,actor),tickets=await coord.sql`select ordinal,direction from saga_ticket where instance_id=${instance}`;expect(rows.phase).toBe('intervention-required');expect(tickets.filter((row:any)=>row.direction==='c').map((row:any)=>Number(row.ordinal))).toEqual([1]);await record('US-905-AC9','pass','native qualified forward failure latches failure; release is admitted in reverse order, native rollback is durably closed, and failed compensation escalates to intervention');
  }

  // AC10: lost release acknowledgement is reconciled through its original
  // ticket and native action outcome before any replay.
  {
   const instance=await submit(coord,actor,'ac10-'+crypto.randomUUID()),key='ac10-'+crypto.randomUUID();const forward=await dispatch(coord,a,instance,0,'reserve',key);expect(forward.result.status).toBe('committed');await coord.cancel(instance,actor,`cancel-${instance}`,{request:'AC10 component cancellation'});const req=a.request('release',key),ticket=await coord.issueTicket({instance,ordinal:0,direction:'c',provider:a.storeName,actionRevision:req.target.revision,bindingSnapshot:{store:a.storeName},inputs:req});await a.gateway.register(ticket,'tenant-a',req,a.credential);const release=await a.gateway.deliver(ticket,a.credential,req);expect(release.status).toBe('committed');await coord.markUnknown(ticket);const recovered=await a.gateway.reconcile(ticket,a.credential,req);expect(recovered).toEqual(release);await coord.settleTicket(ticket,recovered);expect(await a.gateway.deliver(ticket,a.credential,req)).toEqual(release);await record('US-905-AC10','pass','component-level cancellation of committed prefix admits original compensation ticket; result reconciles and replays without another native transaction');
  }

  // AC11: cancel fences new work but keeps an already issued ticket pending
  // until that original provider invocation settles.
  {
   const instance=await submit(coord,actor,'ac11-'+crypto.randomUUID()),key='ac11-'+crypto.randomUUID(),req=a.request('reserve',key);await a.seed('reserve',key);const ticket=await coord.issueTicket({instance,ordinal:0,direction:'f',provider:a.storeName,actionRevision:req.target.revision,bindingSnapshot:{store:a.storeName},inputs:req});await a.gateway.register(ticket,'tenant-a',req,a.credential);await coord.markUnknown(ticket);const cancelRequest={reason:'stop'},response=await coord.cancel(instance,actor,`cancel-${instance}`,cancelRequest);expect((response as any).status).toBe('cancel-requested');expect((await coord.status(instance,actor)).phase).toBe('reconciling');const original=await a.gateway.deliver(ticket,a.credential,req);expect(original.status).toBe('committed');await coord.settleTicket(ticket,original);expect((await coord.status(instance,actor)).phase).toBe('compensating');const unwind=await dispatch(coord,a,instance,0,'release',key,'c',false);expect(unwind.result.status).toBe('committed');expect((await coord.status(instance,actor)).phase).toBe('cancelled');await expect(coord.issueTicket({instance,ordinal:1,direction:'f',provider:b.storeName,actionRevision:'r1',bindingSnapshot:{store:b.storeName},inputs:{}})).rejects.toThrow('SAGA_TERMINAL');await record('US-905-AC11','pass','cancel latches while admitted ticket reconciles; late committed prefix is compensated before cancelled finality and forward admission remains fenced');
  }

  // AC12: forward authority does not confer the distinct compensation role.
  {
   const instance=await submit(coord,actor,'ac12-'+crypto.randomUUID()),key='ac12-'+crypto.randomUUID();const forward=await dispatch(coord,a,instance,0,'reserve',key);expect(forward.result.status).toBe('committed');await b.seed('allocate',key);await b.store.sql.unsafe("CREATE FUNCTION saga_force_abort_12() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'allocation rollback witness' USING ERRCODE='40001'; END $$; CREATE TRIGGER saga_force_abort_12 BEFORE UPDATE ON action_entity FOR EACH ROW EXECUTE FUNCTION saga_force_abort_12()").simple();const failed=await dispatch(coord,b,instance,1,'allocate',key,'f',false);expect(failed.result.status).toBe('failed');await b.store.sql.unsafe('DROP TRIGGER saga_force_abort_12 ON action_entity; DROP FUNCTION saga_force_abort_12()').simple();await a.policy.membership(a.storeName,'worker','compensator',false);const denied=await dispatch(coord,a,instance,0,'release',key,'c',false);expect(denied.result).toEqual({status:'denied',code:'AUTHORIZATION'});const entities=await businessRows(a.store,a.storeName);expect(entities.some((row:any)=>row['["sales","id"]']?.string===key&&row['["sales","status"]']?.string==='reserve')).toBe(true);await record('component-compensation-authority','pass','a real failed forward prefix makes compensation eligible; revoked compensation role refuses native action while retained entity effect remains');await a.policy.membership(a.storeName,'worker','compensator',true);
  }

  // AC13: current tenant/owner checks protect status, history and controls.
  {
   const instance=await submit(coord,actor,'ac13-'+crypto.randomUUID()),outsider={tenant:'tenant-b',principal:'intruder',service:'other'};expect(await coord.status(instance,outsider)).toEqual({status:'refusal',code:'AUTHORIZATION'});expect(await coord.cancel(instance,outsider,'foreign-control',{reason:'read'})).toEqual({status:'refusal',code:'SAGA_SCOPE'});expect((await coord.status(instance,actor)).history.length).toBeGreaterThan(0);await record('US-905-AC13','pass','cross-tenant status/history and control requests refuse without changing owner state');
  }

  // AC14: a retired pinned action blocks fresh dispatch and never substitutes a revision.
  {
   const instance=await submit(coord,actor,'ac14-'+crypto.randomUUID()),key='ac14-'+crypto.randomUUID();await a.seed('reserve',key);const req=a.request('reserve',key),ticket=await coord.issueTicket({instance,ordinal:0,direction:'f',provider:a.storeName,actionRevision:req.target.revision,bindingSnapshot:{store:a.storeName},inputs:req});await a.gateway.register(ticket,'tenant-a',req,a.credential);await a.executor.admission.revisions.lifecycle(a.storeName,req.target,'retired');const refused=await a.gateway.deliver(ticket,a.credential,req),identity=encodeReferenceIdentity(['tenant-a',a.storeName,'worker','sales','reserve',req.key]);expect(refused.status).toBe('unsupported');expect(await outcomeCount(a.store,a.storeName,identity)).toBe(0);await a.executor.admission.revisions.lifecycle(a.storeName,req.target,'active');await record('US-905-AC14','pass','retired pinned action refuses with no exact native action_outcome; lifecycle restored for independent cases');
  }

  // AC15: worker takeover increments a monotone fence; a stale worker cannot
  // issue a subsequent ticket.
  {
   const instance=await submit(coord,actor,'ac15-'+crypto.randomUUID()),old=await coord.claim(instance,'worker-old');expect(old.status).toBe('claim');await coord.sql`update saga_instance set lease_until=clock_timestamp()-interval '1 second' where id=${instance}`;const next=await coord.claim(instance,'worker-new');expect(next.status).toBe('claim');if(old.status==='claim'&&next.status==='claim'){expect(BigInt(next.fence)>BigInt(old.fence)).toBe(true);await expect(coord.issueTicket({instance,ordinal:0,direction:'f',provider:a.storeName,actionRevision:'r1',bindingSnapshot:{},inputs:{},worker:'worker-old',fence:old.fence})).rejects.toThrow('SAGA_FENCE');const ticket=await coord.issueTicket({instance,ordinal:0,direction:'f',provider:a.storeName,actionRevision:'r1',bindingSnapshot:{},inputs:{},worker:'worker-new',fence:next.fence});expect(ticket).toBeTruthy();}await record('US-905-AC15','pass','takeover advances a persisted exact decimal fence and rejects stale worker ticket issue');
  }

  // AC16: an irreversible effect stays visible and intervention never claims rollback.
  {
   const instance=await submit(coord,actor,'ac16-'+crypto.randomUUID()),key='ac16-'+crypto.randomUUID(),effect=await dispatch(coord,a,instance,0,'reserve',key);expect(effect.result.status).toBe('committed');await coord.latchStop(instance,{kind:'intervention',code:'IRREVERSIBLE',step:0});const state=await coord.status(instance,actor);expect(state.phase).toBe('intervention-required');expect(state.history.some((event:any)=>event.kind==='outcome'&&event.result.status==='committed')).toBe(true);await expect(coord.issueTicket({instance,ordinal:1,direction:'c',provider:a.storeName,actionRevision:'r1',bindingSnapshot:{},inputs:{}})).rejects.toThrow('SAGA_TERMINAL');await record('US-905-AC16','pass','native irreversible-prefix effect remains in history under intervention; no rollback is claimed');
  }

  // AC17: agent-like outputs are retained as original immutable coordinator data.
  {
   const instance=await submit(coord,actor,'ac17-'+crypto.randomUUID()),ticket=await coord.issueTicket({instance,ordinal:0,direction:'f',provider:a.storeName,actionRevision:'agent-r1',bindingSnapshot:{provider:'agent'},inputs:{prompt:'recommend'}}),result={status:'committed',outputs:{recommendation:'original-42'}};await coord.settleTicket(ticket,result);const restarted=new (await import('../../scripts/saga-reference/coordinator')).SagaCoordinator(coord.url);await restarted.initialize();expect((await restarted.status(instance,actor)).history.find((event:any)=>event.kind==='outcome'&&event.ticket===ticket).result).toEqual(result);await expect(restarted.settleTicket(ticket,{status:'committed',outputs:{recommendation:'changed-43'}})).rejects.toThrow('ORIGINAL_RESULT_IMMUTABLE');await restarted.close();await record('US-905-AC17','pass','original non-deterministic output persists across coordinator re-open and refuses replacement');
  }

  // AC25: a committed prefix, full executor rollback, durable ticket close,
  // reverse compensation, then arbitrarily late delivery of the old ticket.
  {
   const instance=await submit(coord,actor,'ac25-'+crypto.randomUUID()),prefix=await dispatch(coord,a,instance,0,'reserve','ac25-prefix');expect(prefix.result.status).toBe('committed');const failingKey='ac25-allocation';await b.seed('allocate',failingKey);
   await b.store.sql.unsafe("CREATE FUNCTION saga_force_abort() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.2); RAISE EXCEPTION 'qualified rollback witness' USING ERRCODE='40001'; END $$; CREATE TRIGGER saga_force_abort BEFORE UPDATE ON action_entity FOR EACH ROW EXECUTE FUNCTION saga_force_abort()").simple();
   const failedRequest=b.request('allocate',failingKey),failedTicket=await coord.issueTicket({instance,ordinal:1,direction:'f',provider:b.storeName,actionRevision:failedRequest.target.revision,bindingSnapshot:{store:b.storeName},inputs:failedRequest});await b.gateway.register(failedTicket,'tenant-a',failedRequest,b.credential);const inFlight=b.gateway.deliver(failedTicket,b.credential,failedRequest);let observedStart=false;for(let attempt=0;attempt<50&&!observedStart;attempt++){const rows=await b.store.sql`select details from action_attempt where phase='started' order by id desc limit 20`;observedStart=rows.some((row:any)=>{try{return (decodeReferenceJson(row.details) as any)?.correlation===failedTicket;}catch{return false;}});if(!observedStart)await new Promise(resolve=>setTimeout(resolve,10));}expect(observedStart).toBe(true);const during=await b.gateway.sql`select state from saga_provider_ticket where ticket=${failedTicket}`;expect(during[0]!.state).toBe('open');expect(await b.gateway.deliver(failedTicket,b.credential,failedRequest)).toEqual({status:'indeterminate'});const failed=await inFlight;expect(failed).toEqual({status:'failed',code:'TRANSIENT_ABORT'});await coord.settleTicket(failedTicket,failed);const state=await b.gateway.sql`select state,final_disposition from saga_provider_ticket where ticket=${failedTicket}`;expect(state[0]!.state).toBe('closed');await b.store.sql.unsafe('DROP TRIGGER saga_force_abort ON action_entity; DROP FUNCTION saga_force_abort()').simple();
   const compensation=await dispatch(coord,a,instance,0,'release','ac25-prefix','c',false);expect(compensation.result.status).toBe('committed');const late=await b.gateway.deliver(failedTicket,b.credential,failedRequest);expect(late).toEqual(failed);const entities=await businessRows(b.store,b.storeName);expect(entities.some((row:any)=>row['["sales","id"]']?.string===failingKey&&row['["sales","status"]']?.string==='pending')).toBe(true);const attemptRows=await b.gateway.sql`select state from saga_provider_attempt where ticket=${failedTicket} order by attempt`;expect(attemptRows.map((row:any)=>row.state)).toEqual(['rolled-back']);await record('US-905-AC25','pass','while executor retry is live gateway stays pending; after all three native 40001 rollbacks provider closes whole ticket, compensates prefix, and late delivery returns original failure without effect');
  }

  // AC18: immutable submission and conflict on changed intent.
  {
   const key='ac18-'+crypto.randomUUID(),original=request(actor),first=await coord.submit(actor,key,original),retry=await coord.submit(actor,key,original),changed=await coord.submit(actor,key,{...original,inputs:{reservation:'changed'}});expect(retry).toEqual(first);expect(changed).toEqual({status:'conflict',code:'TOKEN_REUSE'});await record('US-905-AC18','pass','submission key replays original response and rejects changed intent');
  }
  // AC19: control idempotency preserves exact response.
  {
   const instance=await submit(coord,actor,'ac19-'+crypto.randomUUID()),first=await coord.cancel(instance,actor,'control-1',{reason:'operator'}),retry=await coord.cancel(instance,actor,'control-1',{reason:'operator'}),reuse=await coord.cancel(instance,actor,'control-1',{reason:'different'});expect(retry).toEqual(first);expect(reuse).toEqual({status:'conflict',code:'TOKEN_REUSE'});await record('US-905-AC19','pass','control capability replays original response and rejects changed request');
  }
  // AC20: expiration does not permit a replacement.
  {
   const key='ac20-'+crypto.randomUUID(),input=request(actor,{ttlMs:1});const first=await coord.submit(actor,key,input);if(first.status!=='submitted')throw Error('submission refused');await new Promise(resolve=>setTimeout(resolve,20));expect(await coord.submit(actor,key,input)).toEqual({status:'expired',code:'TOKEN_EXPIRED'});await record('US-905-AC20','pass','expired idempotency record does not create replacement instance');
  }
  // AC21: lookup limits are durable and enforced.
  {
   const instance=await submit(coord,actor,'ac21-'+crypto.randomUUID(),{maxLookups:1}),ticket=await coord.issueTicket({instance,ordinal:0,direction:'f',provider:a.storeName,actionRevision:'r1',bindingSnapshot:{},inputs:{}});expect(await coord.lookupBudget(ticket)).toBe(true);expect(await coord.lookupBudget(ticket)).toBe(false);const row=await coord.sql`select lookup_count from saga_instance where id=${instance}`;expect(Number(row[0]!.lookup_count)).toBe(1);await record('US-905-AC21','pass','persisted lookup counter enforces configured limit');
  }
  // AC22: reserve capacity before admitting external work.
  {
   const instance=await submit(coord,actor,'ac22-'+crypto.randomUUID(),{maxRetainedBytes:20000});await expect(coord.issueTicket({instance,ordinal:0,direction:'f',provider:a.storeName,actionRevision:'r1',bindingSnapshot:{},inputs:{}})).rejects.toThrow('SAGA_LIMIT');const row=await coord.sql`select count(*)::int as n from saga_ticket where instance_id=${instance}`;expect(row[0]!.n).toBe(0);await record('US-905-AC22','pass','capacity refusal occurs before durable ticket admission');
  }
  // AC23: automatic time exhaustion latches intervention.
  {
   const instance=await submit(coord,actor,'ac23-'+crypto.randomUUID(),{maxAutomaticMs:5});expect(await coord.advanceTime(instance,5)).toBe(true);expect(await coord.advanceTime(instance,1)).toBe(false);const state=await coord.status(instance,actor);expect(state.phase).toBe('intervention-required');expect(state.stopCause.code).toBe('SAGA_LIMIT');await record('US-905-AC23','pass','automatic-time limit latches intervention');
  }
  // AC24: requested payload erasure cannot erase retained ticket evidence.
  {
   const refused=await coord.submit(actor,'ac24-'+crypto.randomUUID(),request(actor,{payloadErasureAllowed:true}));expect(refused).toEqual({status:'refusal',code:'SAGA_LIMIT'});await record('US-905-AC24','pass','unsupported payload-erasure request is refused at admission before any intent is accepted');
  }
  // AC26: independently retained provider evidence resolves an unknown ticket.
  {
   const instance=await submit(coord,actor,'ac26-'+crypto.randomUUID()),ticket=await coord.issueTicket({instance,ordinal:0,direction:'f',provider:a.storeName,actionRevision:'r1',bindingSnapshot:{},inputs:{}});await coord.markUnknown(ticket);await coord.latchStop(instance,{kind:'intervention',code:'UNKNOWN'});const evidenceId='ev-'+crypto.randomUUID();await coord.retainEvidence({evidenceId,issuer:a.storeName,tenant:'tenant-a',ticket,observation:{finalDisposition:{status:'rejected',code:'FINAL'}}});const resolved=await coord.resolve(ticket,actor,evidenceId);expect(resolved).toMatchObject({status:'resolved',result:{status:'rejected',code:'FINAL'}});expect((await coord.status(instance,actor)).pending).toHaveLength(0);await record('US-905-AC26','pass','retained provider evidence resolves original pending ticket');
  }
  // AC27: closure cannot outrun a provider ticket.
  {
   const instance=await submit(coord,actor,'ac27-'+crypto.randomUUID()),ticket=await coord.issueTicket({instance,ordinal:0,direction:'f',provider:a.storeName,actionRevision:'r1',bindingSnapshot:{},inputs:{}});await coord.markUnknown(ticket);await coord.latchStop(instance,{kind:'intervention',code:'UNKNOWN'});const evidence='ev-'+crypto.randomUUID();await coord.retainEvidence({evidenceId:evidence,issuer:a.storeName,tenant:'tenant-a',ticket,observation:{finalDisposition:{status:'rejected',code:'FINAL'}}});const state=await coord.status(instance,actor);expect(await coord.closeIntervention(instance,actor,state.historySequence,{kind:'accepted-residual-effects',reason:'reviewed',evidence})).toEqual({status:'refusal',code:'SAGA_PENDING'});await record('US-905-AC27','pass','intervention closure refuses while original provider ticket remains pending');
  }
  // AC28: separate direct native business-state observation.
  {
   const instance=await submit(coord,actor,'ac28-'+crypto.randomUUID()),key='ac28-'+crypto.randomUUID(),effect=await dispatch(coord,a,instance,0,'reserve',key);expect(effect.result.status).toBe('committed');const rows=await businessRows(a.store,a.storeName);expect(rows.some((row:any)=>row['["sales","id"]']?.string===key&&row['["sales","status"]']?.string==='reserve')).toBe(true);expect((await a.gateway.retainedEvidence(effect.ticket))?.observation).toMatchObject({profile:'umf.actions.saga.provider-finality/1'});await record('US-905-AC28','pass','independent entity query confirms native action effect and provider evidence');
  }
  // AC29: evidence cannot cross tenant authority.
  {
   const instance=await submit(coord,actor,'ac29-'+crypto.randomUUID()),other={tenant:'tenant-b',principal:'other',service:'external'},ticket=await coord.issueTicket({instance,ordinal:0,direction:'f',provider:a.storeName,actionRevision:'r1',bindingSnapshot:{},inputs:{}});await coord.markUnknown(ticket);await coord.latchStop(instance,{kind:'intervention',code:'UNKNOWN'});const evidence='ev-'+crypto.randomUUID();await coord.retainEvidence({evidenceId:evidence,issuer:a.storeName,tenant:'tenant-a',ticket,observation:{finalDisposition:{status:'rejected',code:'FINAL'}}});expect(await coord.resolve(ticket,other,evidence)).toEqual({status:'refusal',code:'SAGA_EVIDENCE'});expect(await coord.independentEvidenceCount(instance)).toBe(1);await record('US-905-AC29','pass','evidence is counted separately and cannot resolve across tenant authority');
  }
  void worker;
  const evidence={profile:'umf-actions-saga-reference-native-1',qualification:'component-exercises-only',storyAcceptance:Array.from({length:29},(_,index)=>({id:'US-905-AC'+(index+1),status:'unverified',reason:'canonical protocol acceptance remains independently audited; this component case is not acceptance evidence'})),postgres:cluster.version,bun:Bun.version,platform:process.platform,architecture:process.arch,container:cluster.container,componentAssertions:reports};
  const evidencePath='docs/helix/04-build/evidence/sagas/native-evidence.json';
  await mkdir('docs/helix/04-build/evidence/sagas',{recursive:true});
  await Bun.write(evidencePath,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify(evidence));
 });
},120000);
