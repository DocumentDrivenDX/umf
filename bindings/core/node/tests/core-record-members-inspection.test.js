import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import coreSchema from '../../../../spec/core/schema.json' with {type:'json'};
import referenceSchema from '../../../../spec/core/semantic-type-reference.schema.json' with {type:'json'};
import packageSchema from '../../../../spec/core/extension-package.schema.json' with {type:'json'};
import constraints from '../../../../spec/metamodel/generated/core-constraints.json' with {type:'json'};
import domainPolicy from '../../../../spec/metamodel/generated/domain-policy.json' with {type:'json'};

const packet=JSON.parse(readFileSync(new URL('../../../../../../../../tests/rust-core/fixtures/r5-record-members-inspection/frozen-typescript.json',import.meta.url),'utf8'));
const packageRoot=process.env.UMF_R5_RECORD_MEMBERS_NODE_PACKAGE;
const {createCoreRecordMembersEngine}=packageRoot
  ? await import(pathToFileURL(resolve(packageRoot,'index.js')).href)
  : await import('../index.js');
const resources={coreSchema,referenceSchema,packageSchema,constraints,domainPolicy};
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);

test('retained inspector matches all 11 frozen TypeScript cases',()=>{
  const engine=createCoreRecordMembersEngine(resources);
  for(const [name,{source,identity}] of Object.entries(packet.cases)) {
    let outcome;
    try { outcome={ok:true,value:engine.inspectCoreRecordMembers(source,identity)}; }
    catch(error) { outcome={ok:false,error:{code:error.code??'',message:error.message??String(error),path:error.path??''}}; }
    expect(same(outcome,packet.outcomes[name])).toBe(true);
  }
  engine.dispose();
});

test('resource setup controls and fresh operation controls are separate',()=>{
  let setupWork=0,operationWork=0;
  const engine=createCoreRecordMembersEngine(resources,{
    setupControls:{meter:amount=>{setupWork+=amount;}},
    controls:{meter:amount=>{operationWork+=amount;}},
  });
  expect(setupWork).toBeGreaterThan(0);
  expect(operationWork).toBe(0);
  const {source,identity}=packet.cases.known;
  engine.inspectCoreRecordMembers(source,identity);
  expect(operationWork).toBeGreaterThan(0);
  engine.dispose();
});

test('accessor inputs refuse without invoking user getters',()=>{
  const engine=createCoreRecordMembersEngine(resources);
  let reads=0;
  const source={};
  Object.defineProperty(source,'id',{enumerable:true,get(){reads++;return 'nested';}});
  expect(()=>engine.inspectCoreRecordMembers(source,{module:'sales',element:'slot'})).toThrow();
  expect(reads).toBe(0);
  const {source:valid}=packet.cases.known;
  const identity={};
  Object.defineProperty(identity,'module',{enumerable:true,get(){reads++;return 'sales';}});
  Object.defineProperty(identity,'element',{enumerable:true,value:'slot'});
  expect(()=>engine.inspectCoreRecordMembers(valid,identity)).toThrow();
  expect(reads).toBe(0);
  engine.dispose();
});

test('resource setup admits exactly five plain enumerable data descriptors',()=>{
  let reads=0;
  const accessor={...resources};
  Object.defineProperty(accessor,'coreSchema',{enumerable:true,get(){reads++;return coreSchema;}});
  expect(()=>createCoreRecordMembersEngine(accessor)).toThrow(TypeError);
  expect(reads).toBe(0);
  expect(()=>createCoreRecordMembersEngine({...resources,future:true})).toThrow(TypeError);
  const missing={...resources};delete missing.domainPolicy;
  expect(()=>createCoreRecordMembersEngine(missing)).toThrow(TypeError);
  expect(()=>createCoreRecordMembersEngine(Object.assign(Object.create({inherited:true}),resources))).toThrow(TypeError);
});

test('operation cancellation and disposed engine refusal are explicit',()=>{
  const {source,identity}=packet.cases.known;
  const cancelled=createCoreRecordMembersEngine(resources,{controls:{isCancelled:()=>true}});
  try { cancelled.inspectCoreRecordMembers(source,identity); throw new Error('expected cancellation'); }
  catch(error) { expect(error.code).toBe('CANCELLED'); }
  cancelled.dispose();

  const disposed=createCoreRecordMembersEngine(resources);
  disposed.dispose();
  try { disposed.inspectCoreRecordMembers(source,identity); throw new Error('expected disposed refusal'); }
  catch(error) { expect(error.code).toBe('CORE_RECORD_MEMBERS_DISPOSED'); }
});
