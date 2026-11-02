// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {inspectSecurityPolicy,requireSecurityInterpretation,securityPolicyDependencies,securityIdentityTransportDependencies} from '../../src/index-node-v4';
import {securityFixture,ref} from './fixture';

test('Node V4 Security policy root validates typed pins and derives policy plus identity dependencies through Rust',()=>{
  const {policy,resolution}=securityFixture();
  const inspected=inspectSecurityPolicy(policy,resolution) as {valid:boolean;complete:boolean;diagnostics:unknown[]};
  expect(inspected.valid).toBe(true);expect(inspected.complete).toBe(true);expect(inspected.diagnostics).toEqual([]);
  const dependencies=securityPolicyDependencies(policy,resolution) as {fields:{elementId:string}[];associations:{elementId:string}[]};
  expect(dependencies.fields.map(field=>field.elementId)).toEqual(['active','assignmentProject','assignmentStaff','ownerProject','ownerResource','projectId','resourceId','staffId']);
  expect(dependencies.associations.map(association=>association.elementId)).toEqual(['Assignment','Ownership']);
  const transport=securityIdentityTransportDependencies(policy,resolution) as {policyFields:{elementId:string}[];records:{type:{elementId:string};keyFields:{elementId:string}[]}[]};
  expect(transport.policyFields.map(field=>field.elementId)).toEqual(dependencies.fields.map(field=>field.elementId));
  expect(transport.records.map(record=>record.type.elementId)).toEqual(['Assignment','Ownership','Project','Resource','Staff']);
  expect(transport.records.find(record=>record.type.elementId==='Resource')?.keyFields).toEqual([ref('resourceId')]);
  expect(requireSecurityInterpretation(policy,resolution)).toMatchObject({valid:true,complete:true});
});

test('Node V4 Security policy root refuses incomplete closure and preserves source meaning',()=>{
  const {policy,resolution}=securityFixture();
  const future={...policy,future:{issuer:'caller'}};
  const result=inspectSecurityPolicy(future,resolution) as {valid:boolean;complete:boolean;source:unknown;diagnostics:{code:string}[]};
  expect(result.valid).toBe(true);expect(result.complete).toBe(false);expect(result.source).toEqual(future);
  expect(result.diagnostics.some(item=>item.code==='SECURITY_UNKNOWN')).toBe(true);
  expect(()=>requireSecurityInterpretation(future,resolution)).toThrow('Security interpretation refused');
  expect(inspectSecurityPolicy(policy,undefined)).toMatchObject({valid:true,complete:false});
});
