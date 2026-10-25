// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';
import {parseRfc3339ExactInstant, sameRfc3339ExactInstant} from '../../../src/adapters/rfc3339-exact-instant';

const source = 'src/adapters/rfc3339-exact-instant.ts';
const cases: Array<{id: string; kind: 'parse' | 'same'; input: unknown; hostOnly?: boolean}> = [
 {id:'offset-equivalent',kind:'same',input:{left:'2024-01-01T00:00:00.123456789Z',right:'2023-12-31T19:00:00.1234567890-05:00'}},
 {id:'fraction-diff',kind:'same',input:{left:'2024-01-01T00:00:00.1234567Z',right:'2024-01-01T00:00:00.1234568Z'}},
 {id:'negative-epoch',kind:'parse',input:{token:'1969-12-31T23:59:59.5000Z'}},
 {id:'unknown-offset',kind:'parse',input:{token:'2024-01-01T00:00:00-00:00'}},
 {id:'lowercase',kind:'parse',input:{token:'2024-01-01t00:00:00z'}},
 {id:'offset-minute-range',kind:'parse',input:{token:'2024-01-01T00:00:00+00:60'}},
 {id:'invalid-calendar-before-offset',kind:'parse',input:{token:'2024-02-30T00:00:00+24:00'}},
 {id:'final-line-terminator',kind:'parse',input:{token:'2024-01-01T00:00:00Z\n'}},
 {id:'utf16-nonstring',kind:'parse',input:{token:{valueOf:'not-called'}}},
 {id:'raw-null',kind:'parse',input:{token:null},hostOnly:true},
 {id:'raw-array',kind:'parse',input:{token:[]},hostOnly:true},
 {id:'raw-boxed-string',kind:'parse',input:{token:{hostValue:'boxed-string'}},hostOnly:true},
 {id:'raw-proxy',kind:'parse',input:{token:{hostValue:'proxy-no-trap'}},hostOnly:true},
 {id:'same-left-first',kind:'same',input:{left:null,right:'malformed'}},
 {id:'same-right-error',kind:'same',input:{left:'2024-01-01T00:00:00Z',right:'malformed'}},
 {id:'fraction-precision',kind:'parse',input:{token:'2024-01-01T00:00:00.12345678901234567890Z'}},
];
const captured = cases.map(testCase => {
 try {
  const token = (testCase.input as {token?: unknown}).token;
  const hostValue = token && typeof token === 'object' && 'hostValue' in token
   ? (token.hostValue === 'boxed-string' ? new String('2024-01-01T00:00:00Z') : new Proxy({}, {get(){throw new Error('proxy was observed')}}))
   : token;
  const value = testCase.kind === 'parse'
   ? parseRfc3339ExactInstant(testCase.hostOnly ? hostValue as string : (testCase.input as {token: string}).token)
   : sameRfc3339ExactInstant((testCase.input as {left: string;right:string}).left,(testCase.input as {left: string;right:string}).right);
  return {...testCase,outcome:{status:'ok',value}};
 } catch (error) {
  const e = error as Error;
  return {...testCase,outcome:{status:'error',name:e.name,message:e.message}};
 }
});
const maximum = 1048576;
const exactBound = `1970-01-01T00:00:00.${'1'.repeat(maximum - 21)}Z`;
const boundaryCases = [exactBound, `${exactBound}1`].map(token => {
 try {
  const value = parseRfc3339ExactInstant(token);
  return {lengthUtf16:token.length,status:'ok',utcSeconds:value.utcSeconds,fractionDigitsLength:value.fractionalDigits.length};
 } catch (error) {
  const e = error as Error;
  return {lengthUtf16:token.length,status:'error',name:e.name,message:e.message};
 }
});
const packet = {schema:'umf-rust-rfc3339-wire-predecessor/1',sources:{[source]:createHash('sha256').update(readFileSync(source)).digest('hex')},cases:captured,boundaryCases};
const output = 'docs/helix/04-build/evidence/rust-migration/r5-rfc3339-exact-instant-wire/predecessor.json';
const serialized = JSON.stringify(packet,null,2)+'\n';
if (process.argv.includes('--check')) {
 const current = readFileSync(output);
 const regenerated = Buffer.from(serialized, 'utf8');
 if (!current.equals(regenerated)) {
  const currentHash = createHash('sha256').update(current).digest('hex');
  const regeneratedHash = createHash('sha256').update(regenerated).digest('hex');
  throw new Error(`Frozen RFC3339 predecessor differs (current ${currentHash}; regenerated ${regeneratedHash}); review changes, then run without --check to refresh explicitly.`);
 }
 console.log(`RFC3339 predecessor matches byte-for-byte: ${output}`);
} else {
 writeFileSync(output, serialized);
 console.log(`Refreshed RFC3339 predecessor: ${output}`);
}
