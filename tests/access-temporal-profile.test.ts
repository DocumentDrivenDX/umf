// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-081-AC2
import {describe,expect,test} from 'bun:test';
import {ACCESS_TEMPORAL_PROFILE,parseAccessTemporal} from '../src/adapters/access-temporal';
import vectors from '../fixtures/access/golden-vectors/temporal-profile.json';
describe('explicit typed-access temporal profile',()=>{
 for(const v of vectors.cases)test(v.id,()=>{
  if(v.accept){const result=parseAccessTemporal(v.kind as 'date'|'instant'|'local',v.token);
   expect(result).toMatchObject({profile:ACCESS_TEMPORAL_PROFILE,kind:v.kind,originalText:v.token,...v.expected});
   expect(Object.isFrozen(result)).toBe(true);
  }else expect(()=>parseAccessTemporal(v.kind as 'date'|'instant'|'local',v.token)).toThrow(RangeError);
 });
 test('wrong carriers, selectors and oversized tokens refuse',()=>{
  for(const value of [null,42,{},new Date()])expect(()=>parseAccessTemporal('instant',value as string)).toThrow(TypeError);
  expect(()=>parseAccessTemporal('time' as 'date','12:00:00')).toThrow(RangeError);
  expect(()=>parseAccessTemporal('instant','0'.repeat(1000000))).toThrow(RangeError);
 });
 test('pre-epoch offsets preserve microseconds and normalize identically',()=>{
  const a=parseAccessTemporal('instant','1969-12-31T23:59:59.500000Z');
  const b=parseAccessTemporal('instant','1970-01-01T00:59:59.5+01:00');
  expect(a).toMatchObject({utcSeconds:'-1',microsecond:500000,canonicalText:'1969-12-31T23:59:59.500000Z'});
  expect(b.canonicalText).toBe(a.canonicalText);
 });
});
