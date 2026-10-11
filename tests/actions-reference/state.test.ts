import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import {ReferenceRevisionRepository} from '../../scripts/actions-reference/revisions';
import {prepareReferenceAction} from '../../scripts/actions-reference/preparation';
import {seedReferenceEntity,freezeReferenceState,referenceAliasIdentity} from '../../scripts/actions-reference/state';
import {encodeReferenceJson} from '../../scripts/actions-reference/codec';
import {actionFieldValueKey} from '../../src/extensions/actions/evaluation';
import {withReferenceStore} from './native-harness';
/** @covers US-901-AC8 */
test('native frozen frames resolve primary/alternate Keys to one resource and reject duplicate alias writes atomically',async()=>{
 await withReferenceStore(async store=>{
  await store.create('s','tenant','epoch');const source=structuredClone(fixture) as unknown as Document,action=(source.modules[0]!.extensions!['umf.actions'] as any).actions[0],record=source.modules[0]!.elements.find(element=>element.id==='order')!;action.authorization.profile={id:'umf.actions.roles',version:'1'};
  source.modules[0]!.elements.push({id:'external',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});(record.members as any[]).push({module:'sales',element:'external'});(record.keys as any[]).push({id:'external',name:'external',fields:[{module:'sales',element:'external'}],primary:false});
  action.parameters.push({id:'alternate',kind:'entity',target:{module:'sales',element:'order',key:'external'},required:true});action.reads.push({...structuredClone(action.writes[0]),id:'alternate-read',selector:{language:'umf.actions.keys',version:'1',expression:'{"entity":"alternate"}',references:[{parameter:'alternate'}]}});
  const target={module:'sales',action:'approve',revision:'r1'},inputs={order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'o1'}]},alternate:{key:{module:'sales',element:'order',key:'external'},components:[{string:'e1'}]}},prepared=prepareReferenceAction({id:'1',source,target,lifecycle:'active',deployment:null},{protocol:'umf.actions.tx/1',target,inputs});
  await new ReferenceRevisionRepository(store).retain('s',target,source);
  const fields={[actionFieldValueKey({module:'sales',element:'id'})]:{string:'o1'},[actionFieldValueKey({module:'sales',element:'external'})]:{string:'e1'},[actionFieldValueKey({module:'sales',element:'status'})]:{string:'pending'}};let id='';
  await store.transaction('s',async(tx,control)=>{id=await seedReferenceEntity(tx,control,source,{module:'sales',element:'order'},fields,'v7\u0000\ud800');const forged=structuredClone(prepared);forged.frames[0]!.identity.tupleHex='00';forged.frames[0]!.access='write';const state=await freezeReferenceState(tx,control,forged);expect(state.missingInputs).toEqual([]);expect(state.frames.map(frame=>frame.canonical)).toEqual(['entity:'+id,'entity:'+id]);expect(state.frames.map(frame=>frame.entity!.version)).toEqual(['v7\u0000\ud800','v7\u0000\ud800']);expect(state.parameters.get('alternate')!.id).toBe(id);expect(state.frames.map(frame=>frame.access)).toEqual(['read','write']);});
  await expect(store.transaction('s',(tx,control)=>seedReferenceEntity(tx,control,source,{module:'sales',element:'order'},{...fields,[actionFieldValueKey({module:'sales',element:'id'})]:{string:'o2'}}))).rejects.toThrow('duplicate exact native identity');expect((await store.sql`select id::text from action_entity`).map((row:any)=>row.id)).toEqual([id]);expect(await store.sql`select * from action_key_alias`).toHaveLength(2);
  let other='';await store.transaction('s',async(tx,control)=>{other=await seedReferenceEntity(tx,control,source,{module:'sales',element:'order'},{...fields,[actionFieldValueKey({module:'sales',element:'id'})]:{string:'o2'},[actionFieldValueKey({module:'sales',element:'external'})]:{string:'e2'}});});
  const widened=structuredClone(prepared);widened.action.writes[0]!.delete=true;widened.action.writes[0]!.fields.push({module:'sales',element:'id'});await expect(store.transaction('s',(tx,control)=>freezeReferenceState(tx,control,widened))).rejects.toThrow();
  const forgedInput=structuredClone(prepared);(forgedInput.inputs.order as any).key.key='external';await expect(store.transaction('s',(tx,control)=>freezeReferenceState(tx,control,forgedInput))).rejects.toThrow('declared exact Key');
  const alternate=referenceAliasIdentity(prepared.frames[0]!.identity.entity,prepared.frames[0]!.identity.tupleHex);
  await expect(store.transaction('s',async tx=>{await tx`update action_key_alias set entity=${other} where identity=${alternate}`;})).rejects.toThrow('immutable native alias target');
  await store.sql`alter table action_key_alias disable trigger action_key_alias_target`;
  try{await store.transaction('s',async tx=>{await tx`update action_key_alias set entity=${other} where identity=${alternate}`;});await expect(store.transaction('s',(tx,control)=>freezeReferenceState(tx,control,prepared))).rejects.toThrow('Native alias does not match');}
  finally{await store.transaction('s',async tx=>{await tx`update action_key_alias set entity=${id} where identity=${alternate}`;});await store.sql`alter table action_key_alias enable trigger action_key_alias_target`;}
  await store.transaction('s',async tx=>{await tx`update action_entity set fields=${encodeReferenceJson({...fields,[actionFieldValueKey({module:'sales',element:'id'})]:{string:'changed'}})} where id=${id}`;});await expect(store.transaction('s',(tx,control)=>freezeReferenceState(tx,control,prepared))).rejects.toThrow('Native alias does not match');await store.transaction('s',async tx=>{await tx`update action_entity set fields=${encodeReferenceJson(fields)} where id=${id}`;});
  const absent=prepareReferenceAction({id:'1',source,target,lifecycle:'active',deployment:null},{protocol:'umf.actions.tx/1',target,inputs:{...inputs,order:{key:inputs.order.key,components:[{string:'missing'}]}}});await store.transaction('s',async(tx,control)=>{const state=await freezeReferenceState(tx,control,absent);expect(state.missingInputs).toEqual(['order']);expect(state.frames[1]!.entity).toBeNull();});
 });
},60000);
