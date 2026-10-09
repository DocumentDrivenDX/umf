import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import {ReferenceActionIssuer} from '../../scripts/actions-reference/authentication';
import {ReferenceActionPolicy} from '../../scripts/actions-reference/policy';
import {ReferenceActionExecutor} from '../../scripts/actions-reference/executor';
import {ReferenceActionAudit} from '../../scripts/actions-reference/audit';
import {ReferenceActionProjection} from '../../scripts/actions-reference/projection';
import {seedReferenceEntity} from '../../scripts/actions-reference/state';
import {decodeReferenceJson} from '../../scripts/actions-reference/codec';
import {withReferenceStore} from './native-harness';
/** @covers US-056-AC5 @covers US-056-AC11 @covers US-056-AC12 */
for(const domain of ['audit','projection'] as const)test('native '+domain+' read linearizes before queued revocation and later denial selects no protected rows',async()=>{
 await withReferenceStore(async store=>{
  await store.create('s','tenant','epoch');const issuer=new ReferenceActionIssuer(),policy=new ReferenceActionPolicy(store,issuer),executor=new ReferenceActionExecutor(policy),source=structuredClone(fixture) as unknown as Document,target={module:'sales',action:'approve',revision:'r'},credential=issuer.issue({tenant:'tenant',principal:'human',service:'reader'});(source.modules[0]!.extensions!['umf.actions'] as any).actions[0].authorization.profile={id:'umf.actions.roles',version:'1'};await executor.admission.revisions.retain('s',target,source);await policy.membership('s','human','approver',true);await policy.membership('s','human','reader',true);await policy.replayDiscovery('s','sales','approve',['approver']);await store.transaction('s',(tx,control)=>seedReferenceEntity(tx,control,source,{module:'sales',element:'order'},{'["sales","id"]':{string:'one'},'["sales","status"]':{string:'pending'}},'initial'));const result=await executor.invoke('s',credential,{protocol:'umf.actions.tx/1',target,key:'A',inputs:{order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'one'}]}}});expect(result.status).toBe('committed');if(result.status!=='committed')throw Error('Expected committed setup');
  const audit=new ReferenceActionAudit(policy),projection=new ReferenceActionProjection(policy);let read:()=>Promise<unknown>;if(domain==='audit'){await audit.configure('s','sales','approve',['reader'],['reader']);const [row]=await store.sql`select identity from action_audit`;read=()=>audit.read('s',credential,{module:'sales',action:'approve',attemptId:decodeReferenceJson(row!.identity),details:true});}else{await projection.register('s','primary',['reader']);read=()=>projection.readAtLeast('s',credential,{projection:'primary',receipt:result.receipt});}
  let entered!:()=>void,release!:()=>void,held=false,protectedQueries=0;const ready=new Promise<void>(resolve=>entered=resolve),hold=new Promise<void>(resolve=>release=resolve),original=store.transaction.bind(store);
  store.transaction=((name,operation)=>original(name,(tx,control)=>operation(new Proxy(tx,{apply(target,thisArg,args){const sql=(args[0] as string[]).join('?');if(new RegExp('\\b(?:from|update) action_'+domain+'\\b').test(sql)){protectedQueries++;if(!held){held=true;entered();return hold.then(()=>Reflect.apply(target,thisArg,args));}}return Reflect.apply(target,thisArg,args);}}),control))) as typeof store.transaction;
  const accepted=read();await ready;const revoked=policy.membership('s','human','reader',false);let blocked=false;
  try{for(let attempt=0;attempt<200;attempt++){const rows=await store.sql`select pid from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0`;if(rows.length){blocked=true;break;}await Bun.sleep(5);}expect(blocked).toBe(true);}finally{release();}
  const observed=await accepted as any;expect(observed.status).toBe(domain==='audit'?'audit':'visible');if(domain==='audit')expect(observed.details.result).toEqual(result);else expect(observed.content.entities[0].fields['["sales","status"]']).toEqual({string:'approved'});await revoked;const before=protectedQueries;expect(await read()).toEqual({status:'denied',code:'AUTHORIZATION'});expect(protectedQueries).toBe(before);expect((await store.sql`select count(*)::int as count from action_outcome`)[0]!.count).toBe(1);expect((await store.sql`select count(*)::int as count from action_audit`)[0]!.count).toBe(1);store.transaction=original;
 });
},30000);
