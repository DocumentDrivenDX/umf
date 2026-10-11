import {test,expect} from 'bun:test';
import {probe,inspect,candidates} from './representation';
test('opaque contracts preserve expressions without an execution claim',()=>{const r=probe();expect(r.reports.every(x=>!x.executionVerified)).toBe(true);expect(r.reports[1].unchecked).toEqual(['rule:0']);expect(r.reports[2].unchecked.length).toBe(2)});
test('future meaning survives and blocks compatibility',()=>{expect(probe().retained).toBe(true);expect(inspect({...candidates[0],future:true}).declaredCompatible).toBe(false)});
test('accessors are refused without executing and returned copies are isolated',()=>{const r=probe();expect(r.getterCalls).toBe(0);expect(r.refused).toBe(true);expect(r.isolated).toBe(true)});
test('missing frame and malformed rule refuse',()=>{const {writes,...rest}=candidates[0];expect(()=>inspect(rest)).toThrow('STRUCTURE');expect(()=>inspect({...candidates[0],postconditions:[{}]})).toThrow('RULE')});

test('missing executor claims never establish compatibility',()=>{expect(inspect(candidates[0]).declaredCompatible).toBe(false)});
