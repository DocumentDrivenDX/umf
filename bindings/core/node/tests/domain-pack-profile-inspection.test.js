// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {inspectDomainPackProfileWire} from '../index.js';
import {inspectDomainPack, requireDomainPackProfile} from '../../../../src/index-node-v4.ts';
import {inspectDomainPack as inspectReference, requireDomainPackProfile as requireReference} from '../../../../src/domain-packs/profile.ts';
import {readFile} from 'node:fs/promises';

const ids = ['legal','medical','commerce','supply-chain','cybersecurity','manufacturing','payments','education','transit','real-estate','energy','hr','martech','construction','ecology','archaeology'];
const minimal = () => ({id:'profile-fixture',version:'1.0.0',domain_types:{identity:{}},sources:{source:{kind:'external',data_kind:'unknown',reference:'urn:fixture:source',format:'json'}}});
const complete = () => ({...minimal(),schemas:[{id:'table',format:'tablespec',reference:'table.json'}],source_bindings:[{schema_id:'table',source_id:'source',role:'rows'}],execution_profile:{version:'1.0.0',mode:'fixed',targets:{tabular:['table']},include_sources:['source'],qualification:'Fixed local fixture only.'}});
const outcome = fn => {try{return {kind:'returned',value:fn()};}catch(error){return {kind:'threw',name:error?.name,code:error?.code??null,path:error?.path??null,message:error?.message??String(error),string:String(error)};}};

test('default Node routes and Rust wire match the TypeScript reference across semantic and catalog vectors', async () => {
  const vectors = [
    minimal(), complete(), {...complete(),future:{opaque:'surrogate-safe ✨',nested:[1,{meaning:'preserve'}]}},
    {...complete(),schemas:[...complete().schemas,{id:'table',format:'tablespec',reference:'duplicate.json'}],execution_profile:[]},
    {...complete(),execution_profile:{version:'2.0.0',mode:'unsupported',qualification:'',targets:{other:['missing']},include_sources:['unknown']}},
  ];
  for (const id of ids) vectors.push(JSON.parse(await readFile(new URL(`../../../../spec/domain-packs/${id}/pack.json`, import.meta.url), 'utf8')));
  for (const input of vectors) {
    const expected = inspectReference(input);
    expect(inspectDomainPack(input)).toEqual(expected);
    expect(JSON.parse(inspectDomainPackProfileWire(JSON.stringify(input)))).toEqual(expected);
    expect(outcome(() => requireDomainPackProfile(input))).toEqual(outcome(() => requireReference(input)));
  }
});

test('malformed profile short-circuits prior semantic diagnostics and unknown UTF-16 content survives', () => {
  const malformed = {...complete(),schemas:[...complete().schemas,{id:'table',format:'tablespec',reference:'duplicate.json'}],execution_profile:[]};
  expect(inspectDomainPack(malformed)).toEqual(inspectReference(malformed));
  expect(inspectDomainPack(malformed).diagnostics).toEqual(['Malformed execution profile']);
  const input = {...minimal(),description:'\uD800',future_annotation:{opaque:'\uDFFF'}};
  expect(inspectDomainPack(input)).toEqual(inspectReference(input));
});

test('Rust wire JSON safely escapes lone surrogates in semantic diagnostics', () => {
  const input = {...minimal(),artifact_collections:[{
    version:'1.0.0',id:'collection',title:'Originals',view:'documents',
    semantic_kinds:['document'],source_ids:['\uD800'],
  }]};
  const expected = inspectReference(input);
  const direct = JSON.parse(inspectDomainPackProfileWire(JSON.stringify(input)));
  expect(direct).toEqual(expected);
  expect(direct.diagnostics[0]).toBe('Unresolved artifact source: \uD800');
  expect(inspectDomainPack(input)).toEqual(expected);
});

 test('default exports preserve public names and zero-argument shape', () => {
  expect(inspectDomainPack.name).toBe('inspectDomainPack');
  expect(inspectDomainPack.length).toBe(1);
  expect(requireDomainPackProfile.name).toBe('requireDomainPackProfile');
  expect(requireDomainPackProfile.length).toBe(1);
});
