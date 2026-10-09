import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import type {Action} from '../../src/extensions/actions';
import {ReferenceActionIssuer} from '../../scripts/actions-reference/authentication';
import {ReferenceActionPolicy} from '../../scripts/actions-reference/policy';
import {withReferenceStore} from './native-harness';
test('native current policy gates protected callbacks and serializes revocation with accepted work',async()=>{
 await withReferenceStore(async store=>{
  await store.create('s','tenant','epoch');const issuer=new ReferenceActionIssuer(),policy=new ReferenceActionPolicy(store,issuer),action=structuredClone(fixture.modules[0]!.extensions['umf.actions'].actions[0]) as Action;
  action.authorization={kind:'roles',profile:{id:'umf.actions.roles',version:'1'},roles:['approver']};const credential=issuer.issue({tenant:'tenant',principal:'person',service:'service-A'});let accessed=0;
  await expect(policy.protected('s',credential,action,async()=>{accessed++;})).rejects.toThrow('AUTHORIZATION');expect(accessed).toBe(0);
  await policy.membership('s','person','approver',true);
  for(const location of ['profile','authorization']){const unknown=structuredClone(action);if(location==='profile')(unknown.authorization.profile as any).future={deny:true};else (unknown.authorization as any).future={deny:true};await expect(policy.protected('s',credential,unknown,async()=>{accessed++;})).rejects.toThrow('UNSUPPORTED_AUTHORIZATION');}expect(accessed).toBe(0);
  const oversized=structuredClone(action);(oversized.authorization as any).roles.push('x'.repeat(257));await expect(policy.protected('s',credential,oversized,async()=>{accessed++;})).rejects.toThrow('UNSUPPORTED_AUTHORIZATION');expect(accessed).toBe(0);
  await policy.protected('s',credential,action,async(_tx,control,session)=>{accessed++;expect(control.policy_version).toBe(1n);expect(session.service).toBe('service-A');});expect(accessed).toBe(1);
  const anotherService=issuer.issue({tenant:'tenant',principal:'person',service:'service-B'});await policy.protected('s',anotherService,action,async()=>{accessed++;});
  const wrongTenant=issuer.issue({tenant:'other',principal:'person',service:'service-A'});await expect(policy.protected('s',wrongTenant,action,async()=>{accessed++;})).rejects.toThrow('AUTHORIZATION');expect(accessed).toBe(2);
  let entered!:()=>void,release!:()=>void;const ready=new Promise<void>(resolve=>entered=resolve),hold=new Promise<void>(resolve=>release=resolve);
  const accepted=policy.protected('s',credential,action,async()=>{entered();await hold;});await ready;
  const revoked=policy.membership('s','person','approver',false);
  try{let blocked=false;for(let i=0;i<100;i++){const rows=await store.sql`select pid from pg_stat_activity where datname=current_database() and wait_event_type='Lock'`;if(rows.length){blocked=true;break;}await Bun.sleep(10);}expect(blocked).toBe(true);}finally{release();}
  await accepted;await revoked;
  await expect(policy.protected('s',credential,action,async()=>{accessed++;})).rejects.toThrow('AUTHORIZATION');expect(accessed).toBe(2);
  expect((await store.sql`select policy_version::text from action_store`)[0]!.policy_version).toBe('2');
 });
},60000);
