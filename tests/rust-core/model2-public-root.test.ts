// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {Registry,editExtension,prepareCoreInspection,type Document,type ExtensionPackage} from '../../src/index-node-v4';

const packageDefinition:ExtensionPackage={id:'fixture.note',version:'1.0.0',coreVersion:'0.10.0',description:'Model callback baseline',schema:{type:'object',required:['label'],properties:{label:{type:'string'}},additionalProperties:false},semantics:'The callback validates a descriptive label.',scopes:['element'],capabilities:{validation:'semantic',directions:[],evidence:[]}};
const registry=()=>new Registry().register(packageDefinition,()=>[]);
const source=():Document=>({umf:'0.10.0',id:'fixture:model2',vocabularies:{'fixture.note':{version:'1.0.0'}},modules:[{id:'sales',namespace:'sales',elements:[{id:'Customer',name:'Customer',extensions:{'fixture.note':{label:'Buyer'}}}]}]});

test('V4 Rust Model2 edit and prepared inspection retain callback ordering and snapshot semantics',()=>{
  const input=source(),calls:unknown[]=[];
  const edited=editExtension(input,registry(),'sales','Customer','fixture.note',payload=>{calls.push(payload);return {label:'Purchaser'};});
  expect(calls).toEqual([{label:'Buyer'}]);
  expect(edited.modules[0]!.elements[0]!.extensions['fixture.note']).toEqual({label:'Purchaser'});
  expect(input.modules[0]!.elements[0]!.extensions['fixture.note']).toEqual({label:'Buyer'});
  const callbackError=new Error('updater failure');
  let observed:unknown;
  try{editExtension(input,registry(),'sales','Customer','fixture.note',()=>{throw callbackError;});}catch(error){observed=error;}
  expect(observed).toBe(callbackError);
  expect(()=>editExtension(input,registry(),'sales','Customer','fixture.note',()=>({label:7}))).toThrow();

  const prepared=prepareCoreInspection(input);
  expect(prepared.source).not.toBe(input);expect(Object.isFrozen(prepared.source.modules[0]!.elements[0])).toBe(true);
  expect(prepared.schemaProperties({module:'sales',element:'Customer'})).toEqual({});
  expect(prepared.keys({module:'sales',element:'Customer'})).toEqual({state:'inapplicable'});
  expect(()=>prepared.facets({module:'sales',element:'missing'})).toThrow();
});
