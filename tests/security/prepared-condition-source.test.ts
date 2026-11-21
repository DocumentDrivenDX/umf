// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect,spyOn} from 'bun:test';
import {createSecurityCandidateConditionEngine} from '../../bindings/core/node/index.js';

test('prepared condition transport matches ordinary complete requests byte for byte',()=>{
 const engine=createSecurityCandidateConditionEngine(),expression={op:'literal',value:true},prepared=engine.prepareCandidateCondition(expression),dispatch=()=>true;
 const stringify=spyOn(JSON,'stringify');
 try {
  const request=(run:()=>unknown)=>{
   stringify.mockClear();try{run();}catch{} // Native refusal is checked independently below.
   const first=stringify.mock.results[0];expect(first?.type).toBe('return');
   expect(typeof first?.value).toBe('string');return first?.value;
  };
  for(const index of [0,1,9999,10000,10001,-1,-0,1.5,NaN,Infinity,-Infinity]){
   const ordinary=request(()=>engine.evaluateCandidateCondition(expression,index,dispatch));
   expect(request(()=>prepared(index,dispatch))).toBe(ordinary);
  }
 }finally{stringify.mockRestore();}
});

test('prepared native conditions retain snapshots, live callback order and refusal',()=>{
 const engine=createSecurityCandidateConditionEngine(),source={op:'literal',value:true},prepared=engine.prepareCandidateCondition(source);
 const events:unknown[]=[],dispatch=(event:unknown)=>{events.push(event);return true;};
 expect(prepared(0,dispatch)).toBe('T');const expected=structuredClone(events);events.length=0;
 expect(engine.evaluateCandidateCondition(source,0,dispatch)).toBe('T');expect(events).toEqual(expected);
 source.value=false;expect(prepared(0,()=>true)).toBe('T');expect(engine.evaluateCandidateCondition(source,0,()=>true)).toBe('F');
 const error=(run:()=>unknown)=>{let caught:unknown;try{run();}catch(error){caught=error;}expect(caught).toBeInstanceOf(Error);const e=caught as {code?:string;message:string;path?:string};return {code:e.code,message:e.message,path:e.path};};
 for(const index of [-1,10001,NaN,Infinity,null,undefined,'0',{},[]])expect(error(()=>prepared(index as number,()=>true))).toEqual(error(()=>engine.evaluateCandidateCondition({op:'literal',value:true},index as number,()=>true)));
 expect(error(()=>prepared(0,()=>false))).toEqual(error(()=>engine.evaluateCandidateCondition({op:'literal',value:true},0,()=>false)));
});

test('condition preparation refuses getters and cycles without invoking input accessors',()=>{
 let getters=0;const engine=createSecurityCandidateConditionEngine();
 const expression={op:'literal'};Object.defineProperty(expression,'value',{enumerable:true,get(){getters++;return true;}});
 expect(()=>engine.prepareCandidateCondition(expression)).toThrow();expect(getters).toBe(0);
 const cycle:any={op:'not'};cycle.arg=cycle;expect(()=>engine.prepareCandidateCondition(cycle)).toThrow();
});
