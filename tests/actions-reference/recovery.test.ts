import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import {ReferenceActionIssuer} from '../../scripts/actions-reference/authentication';
import {ReferenceActionPolicy} from '../../scripts/actions-reference/policy';
import {ReferenceActionExecutor} from '../../scripts/actions-reference/executor';
import {ReferenceActionStore} from '../../scripts/actions-reference/store';
import {ReferenceCommitUncertain} from '../../scripts/actions-reference/transaction-failures';
import {seedReferenceEntity} from '../../scripts/actions-reference/state';
import {decodeReferenceJson} from '../../scripts/actions-reference/codec';
import {withReferenceStore} from './native-harness';
async function setup(store:ReferenceActionStore){
 await store.create('s','tenant','epoch');const issuer=new ReferenceActionIssuer(),policy=new ReferenceActionPolicy(store,issuer),executor=new ReferenceActionExecutor(policy),source=structuredClone(fixture) as unknown as Document;
 (source.modules[0]!.extensions!['umf.actions'] as any).actions[0].authorization.profile={id:'umf.actions.roles',version:'1'};
 const target={module:'sales',action:'approve',revision:'r1'},fields={'["sales","id"]':{string:'o1'},'["sales","status"]':{string:'pending'}},request={protocol:'umf.actions.tx/1',target,key:'token',inputs:{order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'o1'}]}}},credential=issuer.issue({tenant:'tenant',principal:'person',service:'service'});
 await executor.admission.revisions.retain('s',target,source);await policy.membership('s','person','approver',true);await policy.replayDiscovery('s','sales','approve',['approver']);await store.transaction('s',(tx,control)=>seedReferenceEntity(tx,control,source,{module:'sales',element:'order'},fields,'v0'));return {issuer,executor,request,credential,fields};
}
/** @covers US-901-AC9 */
test('native server abort after all writes retries at most three complete transactions',async()=>{
 for(const [code,abortCount] of [['40001',2],['40P01',2],['40001',3]] as const)await withReferenceStore(async store=>{
  const {executor,request,credential,fields}=await setup(store),transaction=store.transaction.bind(store);let attempts=0,written=0;
  store.transaction=((name,operation)=>transaction(name,async(tx,control)=>{attempts++;const result=await operation(tx,control);expect(await tx`select * from action_audit`).toHaveLength(1);expect(await tx`select * from action_outcome`).toHaveLength(1);expect(await tx`select * from action_outbox`).toHaveLength(1);written++;if(attempts<=abortCount)await tx.unsafe(`DO $$ BEGIN RAISE EXCEPTION 'qualification abort' USING ERRCODE = '${code}'; END $$`);return result;})) as typeof store.transaction;
  const result=await executor.invoke('s',credential,request);expect(attempts).toBe(3);expect(written).toBe(3);
  if(abortCount===3){expect(result).toEqual({status:'failed',code:'TRANSIENT_ABORT'});expect(decodeReferenceJson((await store.sql`select fields from action_entity`)[0]!.fields)).toEqual(fields);expect(decodeReferenceJson((await store.sql`select version from action_entity`)[0]!.version)).toBe('v0');}
  else expect(result.status).toBe('committed');
  for(const table of ['action_outcome','action_audit','action_outbox'])expect(await store.sql.unsafe('select * from '+table)).toHaveLength(abortCount===3?0:1);expect((await store.sql`select business_sequence::text from action_store`)[0]!.business_sequence).toBe(abortCount===3?'0':'1');
 });
},60000);
/** @covers US-901-AC10 */
test('injected lost acknowledgement after actual commit never retries; new connection recovers keyed original result',async()=>{
 for(const keyed of [true,false])await withReferenceStore(async store=>{
  const {executor,issuer,request,credential}=await setup(store),transaction=store.transaction.bind(store);let attempts=0;const invocation=keyed?request:{protocol:request.protocol,target:request.target,inputs:request.inputs};
  store.transaction=(async(name,operation)=>{attempts++;await transaction(name,operation);throw new ReferenceCommitUncertain();}) as typeof store.transaction;
  expect(await executor.invoke('s',credential,invocation)).toEqual({status:'indeterminate'});expect(attempts).toBe(1);store.transaction=transaction;
  const restarted=new ReferenceActionStore(store.url);try{const consumer=new ReferenceActionExecutor(new ReferenceActionPolicy(restarted,issuer));if(keyed){const recovered=await consumer.outcomes.lookup('s',credential,request);expect(recovered.status).toBe('committed');expect(await consumer.invoke('s',credential,request)).toEqual(recovered);}for(const table of ['action_audit','action_outbox'])expect(await restarted.sql.unsafe('select * from '+table)).toHaveLength(1);expect(await restarted.sql`select * from action_outcome`).toHaveLength(keyed?1:0);expect((await restarted.sql`select business_sequence::text from action_store`)[0]!.business_sequence).toBe('1');}finally{await restarted.close();}
 });
},60000);
/** @covers US-901-AC10 */
test('native backend termination before acknowledgement is indeterminate and never automatically retried',async()=>{
 await withReferenceStore(async store=>{
  const {executor,request,credential,fields}=await setup(store),transaction=store.transaction.bind(store);let attempts=0;
  store.transaction=((name,operation)=>transaction(name,async(tx,control)=>{attempts++;const result=await operation(tx,control);const [backend]=await tx`select pg_backend_pid() as pid`;expect(await tx`select * from action_audit`).toHaveLength(1);const [terminated]=await store.sql`select pg_terminate_backend(${backend!.pid}) as killed`;expect(terminated!.killed).toBe(true);return result;})) as typeof store.transaction;
  expect(await executor.invoke('s',credential,request)).toEqual({status:'indeterminate'});expect(attempts).toBe(1);expect(decodeReferenceJson((await store.sql`select fields from action_entity`)[0]!.fields)).toEqual(fields);for(const table of ['action_outcome','action_audit','action_outbox'])expect(await store.sql.unsafe('select * from '+table)).toHaveLength(0);
 });
},30000);
/** @covers US-901-AC5 @covers US-901-AC9 */
test('retry rechecks authorization after a native rollback and intervening revocation',async()=>{
 await withReferenceStore(async store=>{
  const {executor,request,credential,fields}=await setup(store),transaction=store.transaction.bind(store);let attempts=0,changed=0;
  const wrapped:typeof store.transaction=async(name,operation)=>{attempts++;try{return await transaction(name,async(tx,control)=>{const result=await operation(tx,control);if(attempts===1){expect(await tx`select * from action_outbox`).toHaveLength(1);changed++;await tx.unsafe("DO $$ BEGIN RAISE EXCEPTION 'qualification abort' USING ERRCODE = '40001'; END $$");}return result;});}catch(error){if(attempts===1){store.transaction=transaction;try{await executor.policy.membership('s','person','approver',false);}finally{store.transaction=wrapped;}}throw error;}};
  store.transaction=wrapped;expect(await executor.invoke('s',credential,request)).toEqual({status:'denied',code:'AUTHORIZATION'});expect(attempts).toBe(2);expect(changed).toBe(1);expect(decodeReferenceJson((await store.sql`select fields from action_entity`)[0]!.fields)).toEqual(fields);for(const table of ['action_outcome','action_audit','action_outbox'])expect(await store.sql.unsafe('select * from '+table)).toHaveLength(0);expect((await store.sql`select business_sequence::text from action_store`)[0]!.business_sequence).toBe('0');
 });
},30000);

/** @covers US-901-AC10 */
test('native unknown-completion diagnostics never qualify as known rollback retries',async()=>{
 for(const code of ['40003','08007'])await withReferenceStore(async store=>{
  const {executor,request,credential}=await setup(store),transaction=store.transaction.bind(store);let attempts=0;
  store.transaction=((name,operation)=>transaction(name,async(tx,control)=>{attempts++;await operation(tx,control);await tx.unsafe(`DO $$ BEGIN RAISE EXCEPTION 'qualification unknown' USING ERRCODE = '${code}'; END $$`);throw Error('Unreachable');})) as typeof store.transaction;
  expect(await executor.invoke('s',credential,request)).toEqual({status:'indeterminate'});expect(attempts).toBe(1);for(const table of ['action_outcome','action_audit','action_outbox'])expect(await store.sql.unsafe('select * from '+table)).toHaveLength(0);
 });
},30000);
