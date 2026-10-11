import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import {ReferenceMutationGateway} from '../../scripts/actions-reference/gateway';
import type {FrozenReferenceFrame,FrozenReferenceState} from '../../scripts/actions-reference/state';
import {encodeReferenceIdentity} from '../../scripts/actions-reference/codec';
import {inspectActions,registerActions} from '../../src/extensions/actions';
import {Registry} from '../../src/registry/registry';
const relation={module:'sales',relationship:'asymmetric'};
function environment(){
 const source=structuredClone(fixture) as unknown as Document,order=source.modules[0]!.elements.find(element=>element.id==='order')!;
 for(const id of ['other','product']){const record={...structuredClone(order),id,members:['id','status'].map(field=>({module:'sales',element:id+'-'+field})),keys:[{id:'pk',name:'primary',primary:true,fields:[{module:'sales',element:id+'-id'}]}]};for(const field of ['id','status'])source.modules[0]!.elements.push({...structuredClone(source.modules[0]!.elements.find(element=>element.id===field)!),id:id+'-'+field});source.modules[0]!.elements.push(record);}
 source.modules[0]!.relationships=[{id:'asymmetric',name:'asymmetric',source:[{module:'sales',element:'order'}],target:[{module:'sales',element:'other',key:'pk'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:0,max:'*'},targetLifecycle:'independent',directed:true}];
 expect(inspectActions(source,registerActions(new Registry())).validation.valid).toBe(true);
 const frame=(id:string,element:string,nativeId:string,absent=false):FrozenReferenceFrame=>({id,access:'read',canonical:'entity:'+nativeId,entity:absent?null:{id:nativeId,record:{module:'sales',element},fields:{[JSON.stringify(['sales',element==='order'?'id':element+'-id'])]:{string:id},[JSON.stringify(['sales',element==='order'?'status':element+'-status'])]:{string:'pending'}},version:'v0'},identity:{key:{module:'sales',element,key:'pk'},components:[{string:id}]},fields:[],relationships:[encodeReferenceIdentity(relation)],create:false,delete:false});
 const state:FrozenReferenceState={frames:[frame('source','order','1'),frame('target','other','2'),frame('unrelated','product','3'),frame('absent-other','other','4',true),frame('absent-product','product','5',true)],parameters:new Map(),missingInputs:[],links:[{relationship:relation,sourceEntity:'1',targetEntity:'2'}]};return {source,state};
}
test('linked gateway validates authored endpoint orientation before absence and permanently aborts invalid calls',()=>{
 const {source,state}=environment();const correct=new ReferenceMutationGateway(source,state);expect(correct.linked(relation,'source','target')).toBe(true);expect(correct.linked(relation,'source','absent-other')).toBe(false);expect(correct.exists('source')).toBe(true);
 for(const [from,to] of [['target','source'],['source','unrelated'],['source','absent-product'],['absent-other','source']]){const gateway=new ReferenceMutationGateway(source,state);expect(()=>gateway.linked(relation,from!,to!)).toThrow('endpoint Record orientation mismatch');expect(()=>gateway.exists('source')).toThrow('Aborted gateway');}
});

test('candidate LINK/UNLINK enforce write access, preserve pre-state and discard restored membership',()=>{
 const {source,state}=environment();state.frames.push(...state.frames.map(frame=>({...structuredClone(frame),id:frame.id+'-write',access:'write' as const})));
 const gateway=new ReferenceMutationGateway(source,state);
 expect(gateway.link(relation,'source-write','target-write')).toBe('no-op');
 expect(gateway.unlink(relation,'source-write','target-write')).toBe('changed');expect(gateway.linked(relation,'source','target')).toBe(false);expect(gateway.ruleState('pre').links).toHaveLength(1);expect(gateway.ruleState('post').links).toHaveLength(0);expect(gateway.linkChanges()).toEqual([{kind:'unlinked',link:{relationship:relation,sourceEntity:'1',targetEntity:'2'}}]);
 expect(gateway.unlink(relation,'source-write','target-write')).toBe('no-op');expect(gateway.link(relation,'source-write','target-write')).toBe('changed');expect(gateway.linkChanges()).toEqual([]);expect(gateway.changes()).toEqual([]);
 for(const [from,to] of [['source','target-write'],['target-write','source-write'],['source-write','unrelated-write'],['source-write','absent-product-write']]){const invalid=new ReferenceMutationGateway(source,state);expect(()=>invalid.link(relation,from!,to!)).toThrow();expect(()=>invalid.linkChanges()).toThrow('Aborted gateway');}
 const absent=new ReferenceMutationGateway(source,state);expect(()=>absent.link(relation,'source-write','absent-other-write')).toThrow('endpoint absent');expect(()=>absent.exists('source')).toThrow('Aborted gateway');
 const readOnly=new ReferenceMutationGateway(source,{...state,frames:state.frames.map(frame=>({...frame,relationships:frame.access==='write'?[]:frame.relationships}))});expect(()=>readOnly.unlink(relation,'source-write','target-write')).toThrow('outside frozen write permission');expect(()=>readOnly.linkChanges()).toThrow('Aborted gateway');
});

test('candidate relationship mutation preserves authored target Key while accepting a read-only target reference',()=>{
 const {source,state}=environment(),other=source.modules[0]!.elements.find(element=>element.id==='other')!;(other.keys as any[]).push({id:'alternate',name:'alternate',primary:false,fields:[{module:'sales',element:'other-id'},{module:'sales',element:'other-status'}]});expect(inspectActions(source,registerActions(new Registry())).validation.valid).toBe(true);
 const target=state.frames.find(frame=>frame.id==='target')!;state.frames.push({...structuredClone(state.frames[0]!),id:'source-write',access:'write'}, {...structuredClone(target),id:'alternate',identity:{key:{module:'sales',element:'other',key:'alternate'},components:[{string:'target'},{string:'pending'}]}});
 const gateway=new ReferenceMutationGateway(source,state);expect(gateway.link(relation,'source-write','target')).toBe('no-op');expect(gateway.unlink(relation,'source-write','target')).toBe('changed');expect(gateway.link(relation,'source-write','target')).toBe('changed');
 for(const operation of ['link','unlink'] as const){const invalid=new ReferenceMutationGateway(source,state);expect(()=>invalid[operation](relation,'source-write','alternate')).toThrow('target Key mismatch');expect(()=>invalid.linkChanges()).toThrow('Aborted gateway');}
});

test('candidate net changes retain combined first-modification order and remove restored relationships',()=>{
 const {source,state}=environment();state.frames.push({...structuredClone(state.frames[0]!),id:'source-write',access:'write',fields:['["sales","status"]']});
 const first=new ReferenceMutationGateway(source,state);expect(first.unlink(relation,'source-write','target')).toBe('changed');first.set('source-write',[{field:{module:'sales',element:'status'},value:{string:'approved'}}]);expect(first.candidateChanges().map(change=>change.kind)).toEqual(['unlinked','updated']);first.link(relation,'source-write','target');expect(first.candidateChanges().map(change=>change.kind)).toEqual(['updated']);
 const second=new ReferenceMutationGateway(source,state);second.set('source-write',[{field:{module:'sales',element:'status'},value:{string:'approved'}}]);second.unlink(relation,'source-write','target');expect(second.candidateChanges().map(change=>change.kind)).toEqual(['updated','unlinked']);
});
