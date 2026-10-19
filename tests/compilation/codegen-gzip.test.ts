// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {gunzipSync} from 'node:zlib';
import {deterministicGzip} from '../../scripts/codegen/gzip';
test('universal generator framing round-trips boundary sizes with fixed metadata',()=>{
 for(const size of [0,1,65534,65535,65536,131071]){
  const bytes=Uint8Array.from({length:size},(_,i)=>(i*193+17)&255);
  const encoded=deterministicGzip(bytes);
  expect(new Uint8Array(gunzipSync(encoded))).toEqual(bytes);
  expect([...encoded.slice(0,10)]).toEqual([31,139,8,0,0,0,0,0,0,255]);
  expect(deterministicGzip(bytes)).toEqual(encoded);
 }
});
