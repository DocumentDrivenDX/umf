// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {inspectProtectionFunction,evaluateProtectionValue,inspectProtectionQueryProperties} from '../../../src/index-node-v4';
import {domainFixture,domainRef} from './domain-fixture';

function constantFixture(){
 const fixture=domainFixture();
 const transform=fixture.catalog.transforms[0];
 transform.disclosureProfile=[];
 transform.parameters=[{name:'value',field:domainRef('output'),value:{string:'hidden'}}];
 return fixture;
}

test('public Rust protection functions inspect and evaluate a typed constant',()=>{
 const {policy,catalog,closure}=constantFixture();
 const inspected=inspectProtectionFunction(policy,catalog,closure,{ruleIndex:0,disclosureIndex:0});
 expect(inspected.status).toBe('reference-ready');
 const result=evaluateProtectionValue(policy,catalog,closure,{ruleIndex:0,disclosureIndex:0,value:{integerToken:'42'}});
 expect(result.status).toBe('transformed');
 expect(result.value).toEqual({string:'hidden'});
 expect(catalog.native).toEqual({sql:'opaque\r\n😀'});
},30_000);

test('public Rust protection evaluation refuses a value outside its input domain',()=>{
 const {policy,catalog,closure}=constantFixture();
 expect(evaluateProtectionValue(policy,catalog,closure,{ruleIndex:0,disclosureIndex:0,value:{string:'wrong'}}).status).toBe('refused');
},30_000);

test('public Rust query-property inspection admits an explicitly selected deterministic join',()=>{
 const {policy,catalog,closure}=domainFixture();
 catalog.transforms[0].disclosureProfile=[];
 catalog.transforms[0].queryUse.join='disclosed';
 const result=inspectProtectionQueryProperties(policy,catalog,closure,{ruleIndex:0,disclosureIndex:0,operator:'join',required:['equality']});
 expect(result.status).toBe('compatible-properties');
 expect(result.impliedProperties).toContain('equality');
},30_000);

test('public Rust query-property inspection refuses an unknown operator',()=>{
 const {policy,catalog,closure}=domainFixture();
 expect(inspectProtectionQueryProperties(policy,catalog,closure,{ruleIndex:0,disclosureIndex:0,operator:'future',required:['equality']}).status).toBe('refused');
},30_000);
