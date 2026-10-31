// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import logicalSource from '../../fixtures/binding/raw-profiles/logical.json';
import lakebase from '../../fixtures/binding/raw-profiles/lakebase.json';
import {inspectRawTableBinding as inspectReference} from '../../src/extensions/binding/raw-profiles';
import {inspectRawTableBinding as inspectDefault} from '../../src/index-node-v4';
import type {Document} from '../../src/model/types';

const setup=(logicalInput:Document=logicalSource as unknown as Document)=>{
 const binding=structuredClone(lakebase) as unknown as Document,logical=structuredClone(logicalInput);
 const profile=binding.extensions!['umf.binding'] as any;
 return {binding,logical,target:{platform:profile.target.system,majorVersion:profile.target.version}};
};

test('V4 Node raw-profile export matches the TypeScript reference route',()=>{
 for(const source of [setup(),setup((()=>{const logical=structuredClone(logicalSource) as unknown as Document;delete (logical.modules[0]!.elements[1] as any).members;return logical;})())]){
  expect(inspectDefault(source.binding,source.logical,source.target,'sales')).toEqual(inspectReference(source.binding,source.logical,source.target,'sales'));
 }
});

test('V4 Node raw-profile export preserves validation error results',()=>{
 const {binding,logical,target}=setup();target.platform='other';
 expect(inspectDefault(binding,logical,target,'sales')).toEqual(inspectReference(binding,logical,target,'sales'));
});

test('V4 Node raw-profile export preserves reference admission errors without invoking getters',()=>{
 const {binding,logical,target}=setup();let reads=0;
 Object.defineProperty(binding,'future',{enumerable:true,get(){reads++;throw new Error('getter invoked');}});
 expect(inspectDefault(binding,logical,target,'sales')).toEqual(inspectReference(binding,logical,target,'sales'));
 expect(reads).toBe(0);
});
