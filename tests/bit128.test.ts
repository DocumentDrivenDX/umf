// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import * as u from '../src/index';
import oracle from '../fixtures/validation/uuid/bit128-oracle.json';
test('all bit positions, sign boundaries and seeded values match independent Python oracle',()=>{
 for(const row of oracle.cases){
  const value=u.parseBits128(row.hex.toUpperCase());
  expect(value.hex).toBe(row.hex);expect(Object.isFrozen(value)).toBe(true);
  expect(u.bits128ToWords(value,false)).toEqual(row.unsigned);expect(u.bits128ToWords(value,true)).toEqual(row.signed);
  expect(u.bits128FromWords(row.unsigned,false)).toEqual(value);expect(u.bits128FromWords(row.signed,true)).toEqual(value);
  expect(u.bits128ToInteger(value,false).integerToken).toBe(row.integer);expect(u.bits128ToInteger(value,true).integerToken).toBe(row.signedInteger);
  expect(u.bits128FromInteger({integerToken:row.integer},false)).toEqual(value);expect(u.bits128FromInteger({integerToken:row.signedInteger},true)).toEqual(value);
  const buffer=new Uint8Array(32);buffer.set(u.bits128ToBytes(value),7);expect(u.bits128FromBytes(buffer.subarray(7,23))).toEqual(value);
  const copied=u.bits128ToBytes(value);copied[0]=copied[0]!^255;expect(u.parseBits128(row.hex)).toEqual(value);
 }
});
test('strict grammar, bounds, two-complement ordering, forged snapshots and accessors',()=>{
 for(const text of ['', '0'.repeat(31),'0'.repeat(32)+'\n','x'.repeat(32),...['\n','\r','\u2028','\u2029'].map(end=>'0'.repeat(31)+end),'0'.repeat(30)+'\r\n'])expect(()=>u.parseBits128(text)).toThrow();
 for(const token of ['-0','-0e99','1.1','340282366920938463463374607431768211456','-1'])expect(()=>u.bits128FromInteger({integerToken:token},false)).toThrow();
 expect(u.bits128FromInteger({integerToken:'1.00e2'},false).hex).toBe('0'.repeat(30)+'64');
 for(const token of ['+1','01','-0','1e0','1\n','1\r','18446744073709551616'])expect(()=>u.bits128FromWords({high:token,low:'0'},false)).toThrow();
 expect(()=>u.bits128FromWords({high:'0',low:'9223372036854775808'},true)).toThrow();
 expect(()=>u.bits128FromInteger({integerToken:'170141183460469231731687303715884105728'},true)).toThrow();
 expect(()=>u.bits128FromInteger({integerToken:'-170141183460469231731687303715884105729'},true)).toThrow();
 expect(u.compareBits128(u.parseBits128('7'+'f'.repeat(31)),u.parseBits128('8'+'0'.repeat(31)))).toBe(-1);
 let calls=0;const value:any={profile:'umf-128/1',get hex(){calls++;return '0'.repeat(32);}};
 expect(()=>u.bits128ToBytes(value)).toThrow();expect(calls).toBe(0);
 expect(()=>u.bits128ToBytes({...u.parseBits128('0'.repeat(32)),extra:true} as any)).toThrow();
 expect(()=>u.bits128FromWords({high:0,low:0} as any,false)).toThrow();
});
test('byte bridge checks intrinsic length before copying and never invokes user iterators',()=>{
 let calls=0;const bytes=new Uint8Array(16);Object.defineProperty(bytes,Symbol.iterator,{value:()=>{calls++;throw Error('iterator invoked');}});
 expect(u.bits128FromBytes(bytes).hex).toBe('0'.repeat(32));expect(calls).toBe(0);
 const oversized=new Uint8Array(17);Object.defineProperty(oversized,'byteLength',{get(){calls++;return 16;}});
 expect(()=>u.bits128FromBytes(oversized)).toThrow();expect(calls).toBe(0);
});
