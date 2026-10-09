import {test,expect} from 'bun:test';
import composite from '../../fixtures/actions/composite-key.json';
import createLink from '../../fixtures/actions/create-link.json';
import association from '../../fixtures/actions/association-record.json';
import type {Document} from '../../src/model/types';
import {inspectActions,registerActions} from '../../src/extensions/actions';
import {admitActionInputs} from '../../src/extensions/actions/selector';
import {Registry} from '../../src/registry/registry';
import {ReferenceActionIssuer} from '../../scripts/actions-reference/authentication';
import {ReferenceActionPolicy} from '../../scripts/actions-reference/policy';
import {ReferenceActionExecutor} from '../../scripts/actions-reference/executor';
import {ReferenceActionStore} from '../../scripts/actions-reference/store';
import {freezeReferenceState,seedReferenceEntity} from '../../scripts/actions-reference/state';
import {decodeReferenceJson} from '../../scripts/actions-reference/codec';
import {withReferenceStore} from './native-harness';

const record={module:'sales',element:'order'},key={...record,key:'pk'};
const entity=(region:string,id:string)=>({key,components:[{string:region},{string:id}]});
const fieldMap=(region:string,id:string)=>({'["sales","region"]':{string:region},'["sales","id"]':{string:id},'["sales","status"]':{string:'pending'}});

/** @covers US-056-AC2 @covers US-056-AC3 @covers US-056-AC4 @covers US-056-AC8 @covers US-056-AC10 */
test('native composite Keys preserve ordered components through preparation, freeze, typed results and restarted replay',async()=>{
 await withReferenceStore(async(store,nativeVersion)=>{
  await store.create('s','tenant','epoch');
  const issuer=new ReferenceActionIssuer(),policy=new ReferenceActionPolicy(store,issuer),executor=new ReferenceActionExecutor(policy,undefined,{append:async()=>{}}),source=structuredClone(composite) as unknown as Document;
  const action=(source.modules[0]!.extensions!['umf.actions'] as any).actions[0],target={module:'sales',action:'approve',revision:'composite'},credential=issuer.issue({tenant:'tenant',principal:'human',service:'composite-qualification'});
  action.parameters.push({...structuredClone(action.parameters[0]),id:'other'});
  action.reads=[{...structuredClone(action.writes[0]),id:'selected-read'},{...structuredClone(action.writes[0]),id:'other-read',selector:{language:'umf.actions.keys',version:'1',expression:'{"entity":"other"}',references:[{parameter:'other'}]}}];
  expect(inspectActions(source,registerActions(new Registry())).validation.valid).toBe(true);
  await executor.admission.revisions.retain('s',target,source);
  await policy.membership('s','human','approver',true);await policy.replayDiscovery('s','sales','approve',['approver']);
  const first=entity('west','east'),second=entity('east','west'),ids:string[]=[];
  for(const [region,id,version] of [['west','east','first-version'],['east','west','second-version']] as const)
   ids.push(await store.transaction('s',(tx,control)=>seedReferenceEntity(tx,control,source,record,fieldMap(region,id),version)));
  expect(ids[0]).not.toBe(ids[1]);
  const request={protocol:'umf.actions.tx/1',target,key:'first',inputs:{order:first,other:second},expectedVersions:[{frame:'other-read',version:'second-version'},{frame:'order-write',version:'first-version'},{frame:'selected-read',version:'first-version'}]};
  const prepared=await executor.admission.prepareFresh('s',credential,request);
  const frozen=await store.transaction('s',(tx,control)=>freezeReferenceState(tx,control,prepared));
  expect(frozen.missingInputs).toEqual([]);
  expect(frozen.frames.map(frame=>({frame:frame.id,native:frame.entity!.id,version:frame.entity!.version,identity:frame.identity}))).toEqual([
   {frame:'selected-read',native:ids[0]!,version:'first-version',identity:first},
   {frame:'other-read',native:ids[1]!,version:'second-version',identity:second},
   {frame:'order-write',native:ids[0]!,version:'first-version',identity:first}
  ]);
  expect(frozen.frames[0]!.canonical).toBe(frozen.frames[2]!.canonical);
  expect(frozen.frames[0]!.canonical).not.toBe(frozen.frames[1]!.canonical);
  const committed=await executor.invoke('s',credential,request);expect(committed.status).toBe('committed');
  if(committed.status!=='committed')throw Error('Expected composite commit');
  expect(committed.changes).toEqual([{kind:'updated',entity:first}]);expect(committed.outputs).toEqual({});expect(committed.noOp).toBe(false);
  expect(committed.verification).toEqual({kind:'recipe',effects:[{effect:'approve-status',status:'verified',outcome:'changed'}],postconditions:[],frames:'enforced',constraints:'verified'});
  let rows=await store.sql`select id::text,fields,version from action_entity order by id`;
  expect(rows.map((row:any)=>({id:row.id,fields:decodeReferenceJson(row.fields),version:decodeReferenceJson(row.version)}))).toEqual([
   {id:ids[0],fields:{...fieldMap('west','east'),'["sales","status"]':{string:'approved'}},version:committed.version},
   {id:ids[1],fields:fieldMap('east','west'),version:'second-version'}
  ]);
  const swapped={...request,key:'second',inputs:{order:second,other:first},expectedVersions:[{frame:'selected-read',version:'second-version'},{frame:'other-read',version:committed.version},{frame:'order-write',version:'second-version'}]};
  const changed=await executor.invoke('s',credential,swapped);expect(changed.status).toBe('committed');
  if(changed.status!=='committed')throw Error('Expected swapped composite commit');
  expect(changed.changes).toEqual([{kind:'updated',entity:second}]);expect(changed.version).not.toBe(committed.version);
  rows=await store.sql`select id::text,fields,version from action_entity order by id`;
  expect(rows.map((row:any)=>({id:row.id,status:(decodeReferenceJson(row.fields) as any)['["sales","status"]'],version:decodeReferenceJson(row.version)}))).toEqual([
   {id:ids[0],status:{string:'approved'},version:committed.version},{id:ids[1],status:{string:'approved'},version:changed.version}
  ]);
  expect(await executor.invoke('s',credential,{...request,key:'stale'})).toEqual({status:'conflict',code:'EXPECTED_VERSION'});
  expect(await executor.invoke('s',credential,{...request,inputs:swapped.inputs})).toEqual({status:'conflict',code:'TOKEN_REUSE'});
  expect(await executor.invoke('s',credential,{...request,key:'invalid-arity',inputs:{...request.inputs,order:{key,components:[{string:'west'}]}}})).toEqual({status:'unsupported',code:'PARAMETER'});
  const restarted=new ReferenceActionStore(store.url);
  try{
   const consumer=new ReferenceActionExecutor(new ReferenceActionPolicy(restarted,issuer),undefined,{append:async()=>{}});
   expect(await consumer.invoke('s',credential,request)).toEqual(committed);
   expect(await consumer.outcomes.lookup('s',credential,{...request,expectedVersions:[...request.expectedVersions].reverse()})).toEqual(committed);
   expect(await consumer.invoke('s',credential,swapped)).toEqual(changed);
  }finally{await restarted.close();}
  for(const [table,count] of [['action_entity',2],['action_key_alias',2],['action_outcome',3],['action_audit',3],['action_outbox',2]] as const)
   expect((await store.sql.unsafe('select count(*)::int as count from '+table))[0]!.count).toBe(count);
  expect((await store.sql`select business_sequence::text from action_store`)[0]!.business_sequence).toBe('2');
  console.log(JSON.stringify({nativeCompositeKey:{nativeVersion,bun:Bun.version,components:2,family:'string',swappedIdentitiesDistinct:true,commits:2,restartedReplay:'exact',scope:'One two-component primary Key, two reversed tuples, explicit resource versions and recipe typed identities; no universal Key-domain claim'}}));
 });
},30000);

/** @covers US-056-AC1 @covers US-056-AC2 @covers US-056-AC8 */
test('native owned and association-Record declarations refuse before business access or any transactional write',async()=>{
 await withReferenceStore(async(store,nativeVersion)=>{
  await store.create('s','tenant','epoch');
  const issuer=new ReferenceActionIssuer(),policy=new ReferenceActionPolicy(store,issuer),executor=new ReferenceActionExecutor(policy,undefined,{append:async()=>{}}),credential=issuer.issue({tenant:'tenant',principal:'human',service:'unsupported-layouts'});
  await policy.membership('s','human','approver',true);await policy.replayDiscovery('s','sales','create-order',['approver']);
  const inputs={'order-id':{string:'new'},customer:{key:{module:'sales',element:'customer',key:'pk'},components:[{string:'c'}]},product:{key:{module:'sales',element:'product',key:'pk'},components:[{string:'p'}]}};
  const supportedTarget={module:'sales',action:'create-order',revision:'independent-control'},supportedSource=structuredClone(createLink) as unknown as Document;
  expect(inspectActions(supportedSource,registerActions(new Registry())).validation.valid).toBe(true);
  await executor.admission.revisions.retain('s',supportedTarget,supportedSource);
  const supported=await executor.admission.prepareFresh('s',credential,{protocol:'umf.actions.tx/1',target:supportedTarget,inputs});
  expect(supported.inputs).toEqual(inputs);expect(supported.frames.map(frame=>frame.id)).toEqual(['order-write','customer-write','product-write']);
  const definitions=[{kind:'owned',source:structuredClone(createLink) as unknown as Document,code:'ACTION_UNCHECKED',inputs},{kind:'association-record',source:structuredClone(association) as unknown as Document,code:'ACTION_NATIVE_RELATIONSHIP',inputs:{...inputs,association:{key:{module:'sales',element:'order-customer-association',key:'pk'},components:[{string:'a'}]}}}];
  for(const definition of definitions){
   if(definition.kind==='owned')(definition.source.modules[0]!.relationships as any[])[0].targetLifecycle='owned';
   const inspection=inspectActions(definition.source,registerActions(new Registry()));expect(inspection.validation.valid).toBe(true);
   expect(admitActionInputs(definition.source,inspection.actions[0]!.action,definition.inputs)).toEqual(definition.inputs);
   await executor.admission.revisions.retain('s',{module:'sales',action:'create-order',revision:definition.kind},definition.source);
  }
  // Native guards fail the test even if an attempted write would later roll back.
  await store.sql.unsafe("create function refuse_profile_boundary_write() returns trigger language plpgsql as $$ begin raise exception 'unexpected profile-boundary write'; end $$");
  const tables:string[]=(await store.sql`select tablename from pg_tables where schemaname='public' and tablename like 'action_%' order by tablename`).map((row:{tablename:string})=>row.tablename);
  const snapshot=async()=>Promise.all(tables.map(async table=>({table,body:(await store.sql.unsafe('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),\'[]\')::text as body from '+table+' t'))[0]!.body})));
  const before=await snapshot();
  for(const table of tables)
   await store.sql.unsafe('create trigger refuse_profile_boundary_write before insert or update or delete on '+table+' for each statement execute function refuse_profile_boundary_write()');
  let businessAccesses=0;const transaction=store.transaction.bind(store);
  store.transaction=((name,operation)=>transaction(name,(tx,control)=>operation(new Proxy(tx,{apply(target,thisArg,args){
   const sql=(args[0] as string[]).join('?');if(/\b(?:action_entity|action_key_alias|action_link)\b/.test(sql)){businessAccesses++;throw Error('Business access before unsupported relationship refusal');}
   return Reflect.apply(target,thisArg,args);
  }}),control))) as typeof store.transaction;
  try{
   for(const definition of definitions){
    const target={module:'sales',action:'create-order',revision:definition.kind},inputs=definition.inputs;
    await expect(executor.admission.prepareFresh('s',credential,{protocol:'umf.actions.tx/1',target,inputs})).rejects.toMatchObject({code:definition.code});
    expect(await executor.preview('s',credential,{protocol:'umf.actions.tx/1',target,inputs})).toEqual({status:'unsupported',code:'PARAMETER'});
    expect(await executor.invoke('s',credential,{protocol:'umf.actions.tx/1',target,key:definition.kind,inputs})).toEqual({status:'unsupported',code:'PARAMETER'});
   }
  }finally{store.transaction=transaction;}
  expect(businessAccesses).toBe(0);
  expect(await snapshot()).toEqual(before);
  for(const table of ['action_entity','action_key_alias','action_link','action_outcome','action_audit','action_outbox'])expect((await store.sql.unsafe('select count(*)::int as count from '+table))[0]!.count).toBe(0);
  expect((await store.sql`select business_sequence::text from action_store`)[0]!.business_sequence).toBe('0');expect(await store.sql`select id from action_receipt`).toHaveLength(1);
  console.log(JSON.stringify({nativeUnsupportedRelationships:{nativeVersion,bun:Bun.version,declarations:['owned','association-record'],validMetadata:true,independentLayoutControl:'admitted',allInputsTyped:'admitted',prepare:'refused',preview:'unsupported/PARAMETER',invoke:'unsupported/PARAMETER',businessAccesses,transactionalWrites:0,allActionTablesGuarded:tables.length,allActionRowsUnchanged:true,scope:'Named unqualified arrangements refuse through actual native admission; no support or generic database-trigger detection claim'}}));
 });
},30000);
