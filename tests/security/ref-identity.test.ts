// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {securityRefIdentity} from '../../src/extensions/security/types';

const packet=JSON.parse(readFileSync('tests/rust-core/fixtures/r8-security-truth-logic/ref-identity-cases.json','utf8')) as {
  cases:{name:string;ref:unknown;expected:string}[];
};

test('security reference identity matches frozen tagged-JSON predecessor vectors',()=>{
  for(const row of packet.cases){
    expect(securityRefIdentity(row.ref as never)).toBe(row.expected);
  }
});
