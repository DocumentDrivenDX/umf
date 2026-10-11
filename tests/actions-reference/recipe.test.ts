import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import {ReferenceRevisionRepository} from '../../scripts/actions-reference/revisions';
import {prepareReferenceAction} from '../../scripts/actions-reference/preparation';
import {seedReferenceEntity,freezeReferenceState} from '../../scripts/actions-reference/state';
import {executeCandidateRecipe} from '../../scripts/actions-reference/recipe';
import {actionFieldValueKey} from '../../src/extensions/actions/evaluation';
import {decodeReferenceJson} from '../../scripts/actions-reference/codec';
import {withReferenceStore} from './native-harness';
test('native candidate recipe orders missing inputs, versions, conditions and evaluates isolated final state',async()=>{
 await withReferenceStore(async store=>{
  await store.create('s','tenant','epoch');const source=structuredClone(fixture) as unknown as Document,action=(source.modules[0]!.extensions!['umf.actions'] as any).actions[0];action.authorization.profile={id:'umf.actions.roles',version:'1'};
  action.reads.push({...structuredClone(action.writes[0]),id:'__proto__'});
  const condition=(id:string,phase:string,value:string)=>({id,rule:{language:'umf.actions.rules',version:'1',expression:JSON.stringify({op:'eq',args:[{state:phase,frame:'__proto__',field:{module:'sales',element:'status'}},{literal:{string:value}}]}),references:[{record:{module:'sales',element:'order'}}]},failure:{code:id.toUpperCase(),message:id}});
  action.preconditions=[condition('pending','pre','pending')];action.postconditions=[condition('approved','post','approved')];action.failures=[...action.preconditions,...action.postconditions].map((condition:any)=>({...condition.failure,retryable:false}));
  const target={module:'sales',action:'approve',revision:'r1'},inputs={order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'o1'}]}},repo=new ReferenceRevisionRepository(store);await repo.retain('s',target,source);
  const fields={[actionFieldValueKey({module:'sales',element:'id'})]:{string:'o1'},[actionFieldValueKey({module:'sales',element:'status'})]:{string:'pending'}};
  await store.transaction('s',(tx,control)=>seedReferenceEntity(tx,control,source,{module:'sales',element:'order'},fields,'v0'));
  const run=async(expectedVersions:any[]=[],requestedInputs:any=inputs)=>{const prepared=prepareReferenceAction({id:'1',source,target,lifecycle:'active',deployment:null},{protocol:'umf.actions.tx/1',target,inputs:requestedInputs,expectedVersions});return store.transaction('s',async(tx,control)=>executeCandidateRecipe(prepared,await freezeReferenceState(tx,control,prepared)));};
  const result=await run();expect(result.kind).toBe('candidate');if(result.kind==='candidate'){expect(result.updates).toHaveLength(1);expect(result.updates[0]!.fields[actionFieldValueKey({module:'sales',element:'status'})]).toEqual({string:'approved'});}
  expect(await run([{frame:'order-write',version:'wrong'},{frame:'__proto__',version:'wrong'}])).toEqual({kind:'conflict',code:'EXPECTED_VERSION',subject:'__proto__'});
  expect(await run([{frame:'__proto__',version:'wrong'}],{order:{key:inputs.order.key,components:[{string:'missing'}]}})).toEqual({kind:'rejected',code:'ENTITY_MISSING',subject:'order'});
  expect(decodeReferenceJson((await store.sql`select fields from action_entity`)[0]!.fields)).toEqual(fields);expect(await store.sql`select * from action_outcome`).toHaveLength(0);expect(await store.sql`select * from action_outbox`).toHaveLength(0);
  action.binding.effects.push({...structuredClone(action.binding.effects[0]),id:'restore',values:[{field:{module:'sales',element:'status'},value:{literal:{string:'pending'}}}]});const second={...target,revision:'r2'};await repo.retain('s',second,source);
  const prepared=prepareReferenceAction({id:'2',source,target:second,lifecycle:'active',deployment:null},{protocol:'umf.actions.tx/1',target:second,inputs});await expect(store.transaction('s',async(tx,control)=>executeCandidateRecipe(prepared,await freezeReferenceState(tx,control,prepared)))).rejects.toThrow('postcondition failed');
  expect(decodeReferenceJson((await store.sql`select fields from action_entity`)[0]!.fields)).toEqual(fields);
 });
},60000);
