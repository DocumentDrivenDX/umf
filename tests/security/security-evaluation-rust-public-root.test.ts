// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {evaluateSecurityAccess,evaluateSecurityCollection} from '../../src/index-node-v4';
import {ref} from './fixture';
import {evaluationFixture} from './evaluation-fixture';

test('Node V4 Rust Security evaluation preserves correlated access decisions and disclosure',()=>{
  const f=evaluationFixture();
  expect(evaluateSecurityAccess(f.policy,f.resolution,f.cut,{action:'read',output:[ref('salary')]},f.resource)).toEqual({decision:'permit',output:[{field:ref('salary'),disposition:'withheld'}]});
  const denied=evaluationFixture();denied.cut.facts=[denied.owner];
  expect(evaluateSecurityAccess(denied.policy,denied.resolution,denied.cut,{action:'read',output:[ref('salary')]},denied.resource)).toEqual({decision:'deny',output:[]});
});

test('Node V4 Rust Security collection returns rows for complete cuts and refuses ambiguous cuts atomically',()=>{
  const f=evaluationFixture(),request={action:'read',output:[ref('salary')],resources:[f.resource]};
  expect(evaluateSecurityCollection(f.policy,f.resolution,f.cut,request)).toEqual({status:'evaluated',rows:[[{field:ref('salary'),disposition:'withheld'}]]});
  const refused=evaluationFixture();refused.cut.facts.push(refused.assignment);
  expect(evaluateSecurityCollection(refused.policy,refused.resolution,refused.cut,{action:'read',output:[ref('salary')],resources:[refused.resource]})).toEqual({status:'refused',rows:[]});
  expect(evaluateSecurityCollection(f.policy,f.resolution,f.cut,{action:'read',output:[ref('salary')],resources:'malformed'})).toEqual({status:'refused',rows:[]});
});
