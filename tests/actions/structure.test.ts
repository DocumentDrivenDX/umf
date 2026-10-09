import {describe,test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import {admitAction,checkActionsStructure,actionsPackage} from '../../src/extensions/actions/structure';
import {Registry} from '../../src/registry/registry';
import {validateDocument} from '../../src/validation/document';
import {UmfError} from '../../src/model/types';
const payload=fixture.modules[0]!.extensions['umf.actions'];
const original=payload.actions[0]!;
describe('action structural admission (partial STP-055 evidence)',()=>{
 test('actual registry compiler accepts the complete core 0.8.0 fixture',()=>{
  const registry=new Registry().register(actionsPackage);
  expect(checkActionsStructure(payload)).toBe(true);
  expect(validateDocument(fixture,registry).valid).toBe(true);
  expect(validateDocument(fixture,registry).complete).toBe(false);
 });
 test('required policy, malformed known effects and ambiguous bindings refuse',()=>{
  for(const change of [
   (a:any)=>delete a.authorization,
   (a:any)=>delete a.binding.effects[0].values,
   (a:any)=>a.binding.effects[0].entity.created='other',
   (a:any)=>a.attribution.profile={id:'unrelated',version:'1'},
   (a:any)=>a.parameters[0].required=false,
  ]){
   const candidate=structuredClone(original);change(candidate);
   expect(()=>admitAction(candidate)).toThrow(UmfError);
  }
 });
 test('future effects and unrelated unknown members retain their exact data',()=>{
  const candidate=structuredClone(original) as any;
  candidate.future={nested:[null,'retain']};candidate.binding.effects=[{id:'future',kind:'future-effect',payload:{x:1}}];
  expect(admitAction(candidate)).toEqual(candidate);
 });
 test('copy isolation and hostile getters',()=>{
  let calls=0;const hostile=Object.defineProperty({},'id',{enumerable:true,get(){calls++;return 'id'}});
  expect(()=>admitAction(hostile)).toThrow();expect(calls).toBe(0);
  const copied=admitAction(original);copied.name='Changed';expect(original.name).toBe('Approve');
 });
 test('non-BMP expression bounds count UTF-16 units even for opaque languages',()=>{
  for(const frame of ['reads','writes'] as const){
   const candidate=structuredClone(original) as any;candidate[frame]=[structuredClone(original.writes[0])];
   candidate[frame][0].selector.language='opaque';candidate[frame][0].selector.expression='😀'.repeat(32768);
   expect(admitAction(candidate)[frame][0]!.selector.expression.length).toBe(65536);
   candidate[frame][0].selector.expression+='😀';expect(()=>admitAction(candidate)).toThrow(UmfError);
  }
 });
 test('array and expression bounds fail before producing a typed action',()=>{
  const candidate=structuredClone(original) as any;
  candidate.parameters=Array(129).fill(original.parameters[0]);expect(()=>admitAction(candidate)).toThrow();
  candidate.parameters=original.parameters;candidate.writes[0].selector.expression='x'.repeat(65537);expect(()=>admitAction(candidate)).toThrow();
 });
});
