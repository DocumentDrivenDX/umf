// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {UmfError} from '../../src/model/errors';
import {SecurityReadRegistration} from '../../src/index-node-v4';
import {evaluationFixture} from './evaluation-fixture';
import {ref} from './fixture';

test('Node V4 Security read registration pins and evaluates definitions through Rust',()=>{
  const f=evaluationFixture(),registration=new SecurityReadRegistration(),handle=registration.register(f.policy,f.resolution);
  const request={action:'read',output:[ref('salary')],resources:[f.resource]};
  expect(registration.evaluate(handle,f.cut,request)).toEqual({status:'evaluated',rows:[[{field:ref('salary'),disposition:'withheld'}]]});
  expect(registration.evaluate({kind:'registered-security-read'},f.cut,request)).toEqual({status:'refused',rows:[]});
  f.policy.rules[0]!.disclosure![0]!.disposition={kind:'original'};
  expect(registration.evaluate(handle,f.cut,request)).toEqual({status:'evaluated',rows:[[{field:ref('salary'),disposition:'withheld'}]]});
  expect(()=>registration.register(f.policy,f.resolution)).toThrow(UmfError);
  expect(()=>registration.register(f.policy,f.resolution)).toThrow('Registered source revision has different content');
});
