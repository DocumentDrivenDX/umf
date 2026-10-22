// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {GREGORIAN_DATE_PROFILE,parseGregorianDate,truncateGregorianDate} from '../../src/adapters/gregorian-date';

test('explicit Gregorian civil-date profile retains exact components and frozen source',()=>{
 const parsed=parseGregorianDate('2000-02-29');
 expect(parsed).toEqual({profile:GREGORIAN_DATE_PROFILE,originalText:'2000-02-29',year:2000,month:2,day:29});
 expect(Object.isFrozen(parsed)).toBe(true);
 for(const token of ['0001-01-01','0099-12-31','0400-02-29','9999-12-31'])expect(parseGregorianDate(token).originalText).toBe(token);
});

test('every named date truncation is exact and idempotent',()=>{
 const values={year:'2026-01-01',quarter:'2026-10-01',month:'2026-10-01',day:'2026-10-15'};
 for(const [unit,expected] of Object.entries(values)){
  const actual=truncateGregorianDate('2026-10-15',unit);expect(actual).toBe(expected);
  expect(truncateGregorianDate(actual,unit)).toBe(actual);
 }
 for(const [month,quarter] of [[1,1],[3,1],[4,4],[6,4],[7,7],[9,7],[10,10],[12,10]]){
  expect(truncateGregorianDate(`2000-${String(month).padStart(2,'0')}-15`,'quarter')).toBe(`2000-${String(quarter).padStart(2,'0')}-01`);
 }
});

test('strict date recipe refuses malformed and foreign temporal meaning',()=>{
 for(const token of ['0000-01-01','10000-01-01','-001-01-01','1900-02-29','2100-02-29','2000-02-30','2026-04-31','2026-00-01','2026-13-01','2026-01-00','2026-01-32','2026-1-01','2026-01-1','2026-01-01\n',' 2026-01-01','２０２６-01-01','2026-W01-1','2026-001','2026-01-01T00:00:00Z'])expect(()=>parseGregorianDate(token)).toThrow(RangeError);
 for(const value of [null,{},10,true])expect(()=>parseGregorianDate(value as any)).toThrow(TypeError);
 for(const unit of ['week','MONTH','',null,{},1])expect(()=>truncateGregorianDate('2026-10-15',unit as any)).toThrow(RangeError);
 expect(()=>parseGregorianDate('x'.repeat(100_000))).toThrow(RangeError);
});
