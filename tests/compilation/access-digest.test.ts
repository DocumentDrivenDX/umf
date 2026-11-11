// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {canonical,sha256Text} from '../../src/compilation/bundle/hash';
// @covers US-080-AC1
 test('portable SHA-256 matches independent native crypto over UTF-8 vectors',()=>{
 for(const text of ['', 'abc', '😀\u2028\u2029', 'a'.repeat(1000000)])expect(sha256Text(text)).toBe(createHash('sha256').update(text).digest('hex'));
 expect(canonical({z:1,a:[true,null,'é'],n:1e-7})).toBe('{"a":[true,null,"é"],"n":1e-7,"z":1}');
 expect(()=>canonical({bad:'\ud800'})).toThrow();
 });
import {hashCanonical} from '../../src/compilation/bundle/hash';
import {request,profile} from './access-fixtures';
// @covers US-080-AC1
 test('streamed JCS hashing agrees with whole canonical hashing across chunk boundaries',()=>{
 const value={sources:Array.from({length:32},(_,i)=>({i,text:'😀"\\\n'.repeat(100)})),profile:{codeSha256:'a'.repeat(64)}};expect(hashCanonical(value)).toBe(createHash('sha256').update(canonical(value)).digest('hex'));
 });
