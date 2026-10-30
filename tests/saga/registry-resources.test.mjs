// SPDX-License-Identifier: MIT OR Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEngine} from '../../bindings/core/node/index.js';
const read=path=>JSON.parse(readFileSync(new URL('../../'+path,import.meta.url),'utf8'));
const resources={coreSchema:read('spec/core/schema.json'),referenceSchema:read('spec/core/semantic-type-reference.schema.json'),packageSchema:read('spec/core/extension-package.schema.json'),constraints:read('spec/metamodel/generated/core-constraints.json'),domainPolicy:read('spec/metamodel/generated/domain-policy.json')};
const manifest=(id,schema)=>({id,version:'0.1.0',coreVersion:'0.10.0',scopes:['module'],description:'Synthetic local resource qualification',semantics:'No execution semantics',schema,capabilities:{validation:'structural',directions:[],evidence:[]}});
const a=manifest('test.a',{$id:'urn:umf:test:a',type:'object',properties:{value:{$ref:'urn:umf:test:b#/$defs/value'}}});
const b=manifest('test.b',{$id:'urn:umf:test:b',$defs:{value:{type:'string'}},type:'object'});
test('explicit extension schemas resolve locally regardless of registry order',()=>{
 const engine=createEngine(resources);
 for(const order of [[a,b],[b,a]]){const result=engine.listKinds(order.map(manifest=>({manifest})));assert.equal(result.definitions.length,0);assert.equal(result.packages.length,2);assert.equal(result.complete,false);assert.deepEqual(result.packages.map(p=>p.extension).sort(),['test.a','test.b']);}
});
test('unregistered external references are refused without fetching',()=>{
 assert.throws(()=>createEngine(resources).listKinds([{manifest:a}]),{code:'SCHEMA_REF_UNRESOLVED'});
});
test('conflicting installed and core schema identities are refused',()=>{
 const engine=createEngine(resources),conflict=manifest('test.conflict',{$id:'urn:umf:test:b',type:'boolean'});
 assert.throws(()=>engine.listKinds([b,conflict].map(manifest=>({manifest}))),{code:'SCHEMA_RESOURCE_CONFLICT'});
 assert.throws(()=>engine.listKinds([{manifest:manifest('test.core',{$id:resources.coreSchema.$id,type:'boolean'})}]),{code:'SCHEMA_RESOURCE_CONFLICT'});
});
