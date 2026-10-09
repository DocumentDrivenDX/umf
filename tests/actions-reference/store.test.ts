import {test,expect} from 'bun:test';
import {encodeCoreKeyTuple} from '../../src/model/key-tuple';
import composite from '../../fixtures/actions/composite-key.json';
import {ReferenceActionStore} from '../../scripts/actions-reference/store';
import {withReferenceStore} from './native-harness';
import {encodeReferenceIdentity as identity,encodeReferenceJson as json,decodeReferenceJson as decode} from '../../scripts/actions-reference/codec';
// Partial native foundation evidence only; complete US-056 criteria remain open.
test('native store foundation enforces exact aliases, FKs, control serialization and atomic rollback',async()=>{
 await withReferenceStore(async(store,version)=>{
  expect(version).toBe('17.9 (Debian 17.9-1.pgdg13+1)');console.log(JSON.stringify({nativeVersion:version,nativeVersionNumber:'170009'}));const sid=await store.create('s','tenant','epoch-1'),record=identity({module:'sales',element:'order'});
  let entityId='',revisionId='';
  await store.transaction('s',async(tx,control)=>{
   const [entity]=await tx`insert into action_entity(store,identity,record,primary_key,fields,version) values (${control.id},${identity([record,'pk','o1'])},${record},'pk-o1',${json({})},'v0') returning id::text`;entityId=entity.id;
   await tx`insert into action_key_alias(store,identity,entity) values (${control.id},${identity([record,'pk','tuple-primary'])},${entityId}),(${control.id},${identity([record,'external','tuple-alternate'])},${entityId})`;
   const [revision]=await tx`insert into action_revision(store,identity,lifecycle,source) values (${control.id},${identity(['sales','approve','r1'])},'active',${json({qualification:'store-foundation-only'})}) returning id::text`;revisionId=revision.id;
  });
  const aliases=await store.sql`select distinct entity::text from action_key_alias where store=${sid}`;expect(aliases.map((r:any)=>r.entity)).toEqual([entityId]);
  await expect(store.transaction('s',async(tx,control)=>{const [other]=await tx`insert into action_entity(store,identity,record,primary_key,fields,version) values (${control.id},${identity([record,'pk','o2'])},${record},'pk-o2','{}','v0') returning id::text`;await tx`insert into action_key_alias(store,identity,entity) values (${control.id},${identity([record,'external','tuple-alternate'])},${other.id})`;})).rejects.toThrow();
  expect((await store.sql`select id::text from action_entity where store=${sid} order by id`).map((r:any)=>r.id)).toEqual([entityId]);
  await expect(store.transaction('s',async(tx,control)=>{await tx`insert into action_link(store,identity,relationship,source_entity,target_entity) values (${control.id},${identity(['order-customer',entityId,'99999'])},${identity('order-customer')},${entityId},99999)`;})).rejects.toThrow();expect(await store.sql`select * from action_link`).toHaveLength(0);
  await expect(store.transaction('s',async(tx,control)=>{await tx`update action_entity set fields=${json({status:{string:'changed'}})},version='v1' where store=${control.id}`;await tx`insert into action_audit(store,header,family,identity,revision,actor,policy_version,decision,details) values (${control.id},'{}',${identity(['sales','approve'])},${identity('attempt-failed')},${revisionId},${json({tenant:'tenant',principal:'human',service:'service'})},0,'committed','{}')`;throw Error('injected precommit rollback');})).rejects.toThrow('injected precommit rollback');
  const [entity]=await store.sql`select fields,version from action_entity`;expect(decode(entity.fields)).toEqual({});expect(entity.version).toBe('v0');expect(await store.sql`select * from action_audit`).toHaveLength(0);
  let entered!:()=>void,release!:()=>void;const locked=new Promise<void>(resolve=>entered=resolve),unblock=new Promise<void>(resolve=>release=resolve),order:string[]=[];
  const first=store.transaction('s',async(tx,control)=>{order.push('first');entered();await unblock;await tx`update action_store set policy_version=policy_version+1 where id=${control.id}`;});await locked;
  const second=store.transaction('s',async(_tx,control)=>{order.push('second');expect(control.policy_version).toBe(1n);});
  try{let waiting=false;for(let i=0;i<100;i++){const [state]=await store.sql`select count(*)::integer as waiting from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%for update%'`;if(state.waiting>0){waiting=true;break;}await Bun.sleep(10);}expect(waiting).toBe(true);expect(order).toEqual(['first']);}finally{release();await Promise.all([first,second]);}expect(order).toEqual(['first','second']);
  await store.transaction('s',async(tx,control)=>{await tx`update action_store set invocation_fenced=true where id=${control.id}`;});await store.transaction('s',async(_tx,control)=>{expect(control.invocation_fenced).toBe(true);});
 });
},60000);
test('native lossless payloads and identity buckets preserve NUL/surrogates, large tokens/Keys and digest collisions',async()=>{
 await withReferenceStore(async store=>{
  // Force collision routing before any row is created; retained exact identity must remain authoritative.
  await store.sql.unsafe("create or replace function action_identity_lookup(value text) returns bytea language sql immutable strict as $$ select decode(repeat('00',32),'hex') $$").simple();
  const tuple=encodeCoreKeyTuple(composite,{module:'sales',element:'order',key:'pk'},[{string:'a'.repeat(300000)},{string:'b'.repeat(300000)}]);expect(tuple.bytesHex.length).toBeGreaterThan(1000000);
  const sid=await store.create('s\u0000\ud800','tenant\ud801','epoch\u0000'),record=identity({module:'sales\u0000',element:'order\ud800'}),payload={literal:{string:'\u0000'},unknown:{'\ud800':'\ud801'}};
  let entityId='',revisionId='';await store.transaction('s\u0000\ud800',async(tx,control)=>{expect(control.tenant).toBe('tenant\ud801');expect(control.epoch).toBe('epoch\u0000');const [entity]=await tx`insert into action_entity(store,identity,record,primary_key,fields,version) values (${control.id},${identity([record,'pk','large'])},${record},${tuple.bytesHex},${json(payload)},'v0') returning id::text`;entityId=entity.id;const [revision]=await tx`insert into action_revision(store,identity,lifecycle,source) values (${control.id},${identity(['sales','action','r1'])},'active',${json(payload)}) returning id::text`;revisionId=revision.id;});
  const [entity]=await store.sql`select fields,length(primary_key) as size from action_entity where store=${sid}`;expect(decode(entity.fields)).toEqual(payload);expect(entity.size).toBe(tuple.bytesHex.length);const [revision]=await store.sql`select source from action_revision where id=${revisionId}`;expect(decode(revision.source)).toEqual(payload);
  const token=Array.from({length:1024},(_,i)=>String.fromCharCode(0x800+i)).join('');expect(Buffer.byteLength(token)).toBe(3072);
  for(const principal of ['\ud800','\ud801']){const exact=identity(['tenant',principal,'sales','action',token]);await store.sql`insert into action_outcome(store,identity,revision,fingerprint,original_intent,result) values (${sid},${exact},${revisionId},'fp',${json({key:token})},${json({status:'committed',outputs:payload})})`;const [outcome]=await store.sql`select identity,result,octet_length(lookup) as bucket from action_outcome where store=${sid} and lookup=action_identity_lookup(${exact}) and identity=${exact}`;expect(decode(outcome.identity)).toEqual(['tenant',principal,'sales','action',token]);expect(decode(outcome.result)).toEqual({status:'committed',outputs:payload});expect(outcome.bucket).toBe(32);}
  expect(await store.sql`select * from action_outcome`).toHaveLength(2);
  const [other]=await store.sql`insert into action_entity(store,identity,record,primary_key,fields,version) values (${sid},${identity([record,'pk','other'])},${record},'other','{}','v0') returning id::text`;
  const first=identity([record,'collision','first']),second=identity([record,'collision','second']);await store.sql`insert into action_key_alias(store,identity,entity) values (${sid},${first},${entityId}),(${sid},${second},${other.id})`;
  expect(await store.sql`select * from action_key_alias where store=${sid} and lookup=action_identity_lookup(${first})`).toHaveLength(2);expect(await store.sql`select * from action_key_alias where store=${sid} and lookup=action_identity_lookup(${first}) and identity=${first}`).toHaveLength(1);
  const [selected]=await store.sql`select entity::text from action_key_alias where store=${sid} and lookup=action_identity_lookup(${second}) and identity=${second}`;expect(selected.entity).toBe(other.id);
  await expect((async()=>{await store.sql`insert into action_key_alias(store,identity,entity) values (${sid},${first},${entityId})`;})()).rejects.toThrow();
 });
},60000);

test('native qualified isolation preserves exact concurrent uniqueness and independent stores',async()=>{
 await withReferenceStore(async store=>{
  const a=await store.create('a','tenant','epoch'),b=await store.create('b','tenant','epoch');let entity='';await store.transaction('a',async(tx,control)=>{const [row]=await tx`insert into action_entity(store,identity,record,primary_key,fields,version) values (${control.id},${identity('e1')},${identity('record')},'pk','{}','v0') returning id::text`;entity=row.id;});
  let firstEntered!:()=>void,releaseFirst!:()=>void;const entered=new Promise<void>(resolve=>firstEntered=resolve),hold=new Promise<void>(resolve=>releaseFirst=resolve);
  const first=store.transaction('a',async(tx,control)=>{await tx`update action_store set business_sequence=business_sequence+1 where id=${control.id}`;firstEntered();await hold;});await entered;
  let secondStarted!:()=>void,done=false;const started=new Promise<void>(resolve=>secondStarted=resolve);
  const second=store.transaction('b',async(tx,control)=>{await tx`set local application_name='umf-independent-store-b'`;secondStarted();await tx`update action_store set business_sequence=business_sequence+1 where id=${control.id}`;}).then(()=>{done=true;});await started;
  try{await Promise.race([second,(async()=>{for(let i=0;i<200&&!done;i++){const rows=await store.sql`select wait_event_type from pg_stat_activity where application_name='umf-independent-store-b'`;if(rows.some((r:any)=>r.wait_event_type==='Lock'))throw Error('Independent store blocked by global registry');await Bun.sleep(10);}if(!done)throw Error('Independent store did not complete');})()]);expect(done).toBe(true);}finally{releaseFirst();await Promise.all([first,second]);}
  const counters=await store.sql`select business_sequence::text from action_store where id in (${a},${b}) order by id`;expect(counters.map((r:any)=>r.business_sequence)).toEqual(['1','1']);
  let aliasEntered!:()=>void,releaseAlias!:()=>void;const aliasReady=new Promise<void>(resolve=>aliasEntered=resolve),aliasHold=new Promise<void>(resolve=>releaseAlias=resolve),exact=identity(['record','pk','same-tuple']);
  const creator=store.transaction('a',async(tx,control)=>{await tx`insert into action_key_alias(store,identity,entity) values (${control.id},${exact},${entity})`;aliasEntered();await aliasHold;});await aliasReady;
  const competing=store.sql.begin('isolation level read committed',async tx=>{await tx`set local application_name='umf-duplicate-alias-b'`;await tx`insert into action_key_alias(store,identity,entity) values (${a},${exact},${entity})`;}).then(()=>({accepted:true}),()=>({accepted:false}));
  try{let blocked=false;for(let i=0;i<100;i++){const [row]=await store.sql`select count(*)::integer as waiting from pg_stat_activity where application_name='umf-duplicate-alias-b' and wait_event_type='Lock'`;if(row.waiting>0){blocked=true;break;}await Bun.sleep(10);}expect(blocked).toBe(true);}finally{releaseAlias();await creator;}
  expect((await competing).accepted).toBe(false);expect(await store.sql`select * from action_key_alias where store=${a} and identity=${exact}`).toHaveLength(1);
  await expect(store.sql.begin('isolation level repeatable read',async tx=>{await tx`insert into action_membership(store,identity,principal,role) values (${a},${identity(['human','role'])},${json('human')},${json('role')})`;})).rejects.toThrow('unqualified isolation');
  await store.sql.unsafe("alter database qualification set default_transaction_isolation='repeatable read'").simple();const changedDefault=new ReferenceActionStore(store.url);
  try{const [row]=await changedDefault.sql`show default_transaction_isolation`;expect(row.default_transaction_isolation).toBe('repeatable read');await changedDefault.transaction('a',async(tx)=>{const [isolation]=await tx`show transaction_isolation`;expect(isolation.transaction_isolation).toBe('read committed');});}finally{await changedDefault.close();}
 });
},60000);
