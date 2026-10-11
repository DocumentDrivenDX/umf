import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import {verifyReferenceGraph,type ReferenceGraphCandidate} from '../../scripts/actions-reference/graph';
import {seedReferenceEntity,type NativeReferenceEntity} from '../../scripts/actions-reference/state';
import {encodeReferenceIdentity} from '../../scripts/actions-reference/codec';
import {withReferenceStore} from './native-harness';
const record={module:'sales',element:'order'},relationship={module:'sales',relationship:'loop'};
function declaration(min=0){const source=structuredClone(fixture) as unknown as Document;source.modules[0]!.relationships=[{id:'loop',name:'loop',source:[record],target:[{...record,key:'pk'}],sourceMultiplicity:{min,max:1},targetMultiplicity:{min,max:1},targetLifecycle:'independent',directed:true}];return source;}
function entity(id:string,label:string):NativeReferenceEntity{return {id,record,fields:{'["sales","id"]':{string:label},'["sales","status"]':{string:'pending'}},version:'v0'};}
test('native final graph applies CREATE/LINK and UNLINK/DELETE deltas and sees unselected competing edges',async()=>{
 await withReferenceStore(async store=>{
  await store.create('s','tenant','epoch');const source=declaration(),entities:NativeReferenceEntity[]=[];
  for(const label of ['a','b','c'])entities.push(entity(await store.transaction('s',(tx,control)=>seedReferenceEntity(tx,control,source,record,entity('0',label).fields)),label));const [a,b,c]=entities as [NativeReferenceEntity,NativeReferenceEntity,NativeReferenceEntity];
  const link=(from:string,to:string)=>({relationship,sourceEntity:from,targetEntity:to});
  const edge=async(from:string,to:string,identity?:string)=>store.transaction('s',async(tx,control)=>{await tx`insert into action_link(store,identity,relationship,source_entity,target_entity) values (${control.id},${encodeReferenceIdentity(identity??[relationship,from,to])},${encodeReferenceIdentity(relationship)},${from},${to})`;});await edge(a.id,b.id);
  const check=(candidate:ReferenceGraphCandidate,document=source)=>store.transaction('s',(tx,control)=>verifyReferenceGraph(tx,control,document,candidate));
  await check({entities:[a,c],changes:[],links:[]});
  await expect(check({entities:[a,c],changes:[],links:[{kind:'linked',link:link(a.id,c.id)}]})).rejects.toMatchObject({code:'CONSTRAINT'});
  await check({entities:[a,b,c],changes:[],links:[{kind:'unlinked',link:link(a.id,b.id)},{kind:'linked',link:link(a.id,c.id)}]});expect(await store.sql`select * from action_link`).toHaveLength(1);
  await edge(b.id,a.id);await expect(check({entities:[a,c],changes:[],links:[{kind:'linked',link:link(c.id,a.id)}]})).rejects.toMatchObject({code:'CONSTRAINT'});
  await expect(check({entities:[a],changes:[{kind:'deleted',entity:a}],links:[]})).rejects.toMatchObject({code:'CONSTRAINT'});
  await check({entities:[a,b],changes:[{kind:'deleted',entity:a}],links:[{kind:'unlinked',link:link(a.id,b.id)},{kind:'unlinked',link:link(b.id,a.id)}]});expect(await store.sql`select * from action_entity`).toHaveLength(3);await expect(check({entities:[a,b],changes:[{kind:'deleted',entity:a}],links:[{kind:'unlinked',link:link(a.id,b.id)},{kind:'unlinked',link:link(b.id,a.id)}]},declaration(1))).rejects.toMatchObject({code:'CONSTRAINT'});
  const created=entity('created:0','new');await expect(check({entities:[],changes:[{kind:'created',entity:created}],links:[]},declaration(1))).rejects.toMatchObject({code:'CONSTRAINT'});await check({entities:[],changes:[{kind:'created',entity:created}],links:[{kind:'linked',link:link(created.id,created.id)}]},declaration(1));
  await expect(check({entities:[a,b],changes:[{kind:'deleted',entity:a}],links:[{kind:'linked',link:link(a.id,b.id)}]})).rejects.toMatchObject({code:'CONSTRAINT'});
  await expect(check({entities:[a],changes:[],links:[{kind:'linked',link:link(a.id,'999999')}]})).rejects.toMatchObject({code:'CONSTRAINT'});
  await edge(a.id,b.id,'duplicate');await expect(check({entities:[a,c],changes:[],links:[{kind:'linked',link:link(a.id,c.id)}]})).rejects.toMatchObject({code:'CONSTRAINT'});
  const unknown=declaration();(unknown.modules[0]!.relationships as any[])[0].future=true;await expect(check({entities:[],changes:[{kind:'created',entity:created}],links:[{kind:'linked',link:link(created.id,created.id)}]},unknown)).rejects.toMatchObject({code:'ACTION_UNCHECKED'});
  expect(await store.sql`select * from action_outcome`).toHaveLength(0);expect(await store.sql`select * from action_audit`).toHaveLength(0);expect(await store.sql`select * from action_outbox`).toHaveLength(0);expect((await store.sql`select business_sequence::text from action_store`)[0]!.business_sequence).toBe('0');
 });
},60000);
