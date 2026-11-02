// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {bindCoreElementSelectionRust} from '../../src/access/rust-selection-default';
import type {CoreElementSelection} from '../../src/model/selection';

test('Selection facade forwards original inputs and Registry lazily to its engine',()=>{
 const source={source:true} as any,query={references:'none'} as any,registry={get(){throw new Error('must remain caller-owned');}} as any;
 const calls:unknown[][]=[];
 const result={selection:[]} as unknown as CoreElementSelection;
 const api=bindCoreElementSelectionRust({selectCoreElements(...args:unknown[]){calls.push(args);return result;}});
 expect(api.selectCoreElements(source,query,registry)).toBe(result);
 expect(calls).toEqual([[source,query,registry]]);
 expect(calls[0]![0]).toBe(source);
 expect(calls[0]![1]).toBe(query);
 expect(calls[0]![2]).toBe(registry);
 expect(Object.isFrozen(api)).toBe(true);
 expect(api.selectCoreElements.length).toBe(2);
});

test('Selection facade preserves the engine refusal object by identity',()=>{
 const sentinel={thrown:'from-engine'};
 const api=bindCoreElementSelectionRust({selectCoreElements(){throw sentinel;}});
 let caught:unknown;
 try{api.selectCoreElements({} as any,{references:'none'} as any);}catch(error){caught=error;}
 expect(caught).toBe(sentinel);
});
