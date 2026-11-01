// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {decodeSecurityDisclosure,encodeSecurityDisclosure,validateSecurityDisclosure} from '../../src/index-node-v4';
import {UmfError} from '../../src/model/errors';
import {securityFixture,ref} from './fixture';

test('Node V4 Security disclosure validation and source roundtrip use Rust',()=>{
  const {policy,resolution}=securityFixture();
  const batch={version:'umf.security.disclosure/0.1.0' as const,target:ref('Resource'),fields:[ref('salary')],rows:[[{field:ref('salary'),disposition:'withheld' as const}]]};
  expect(validateSecurityDisclosure(batch,policy,resolution)).toEqual(batch);
  expect(decodeSecurityDisclosure(encodeSecurityDisclosure(batch,policy,resolution),policy,resolution)).toEqual(batch);
  expect(()=>validateSecurityDisclosure({...batch,version:'future'},policy,resolution)).toThrow(UmfError);
});
