// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setDefaultTimeout} from 'bun:test';
import {createCoreRecordTypeOperations} from '../src/core-record-type.js';
import coreSchema from '../../../../spec/core/schema.json' with {type:'json'};
import referenceSchema from '../../../../spec/core/semantic-type-reference.schema.json' with {type:'json'};
import packageSchema from '../../../../spec/core/extension-package.schema.json' with {type:'json'};
import constraints from '../../../../spec/metamodel/generated/core-constraints.json' with {type:'json'};
import domainPolicy from '../../../../spec/metamodel/generated/domain-policy.json' with {type:'json'};

const packet=JSON.parse(readFileSync(new URL('../../../../../../../../tests/rust-core/fixtures/r5-core-record-type/frozen-typescript.json',import.meta.url),'utf8'));
const packageRoot=process.env.UMF_R5_RECORD_TYPE_NODE_PACKAGE;
const {createCoreModelEngine,createCoreRecordTypeEngine}=packageRoot
  ? await import(new URL('index.js',pathToFileURL(`${resolve(packageRoot)}/`)).href)
  : await import('../index.js');
const resources={coreSchema,referenceSchema,packageSchema,constraints,domainPolicy};
const receipt=packet.successes['declare-nested'];
setDefaultTimeout(90_000);

test('retained opt-in Record Type verifier matches the frozen v6 verification successes',()=>{
  const engine=createCoreRecordTypeEngine(resources);
  expect(engine.declareCoreRecordType(packet.successes['declare-nested'].fieldAuthor,packet.successes['declare-nested'].recordAuthor)).toEqual(packet.successes['declare-nested']);
  for(const name of ['verify-nested','verify-recursive','verify-qualified']) {
    const expected=packet.successes[name];
    expect(engine.verifyCoreRecordTypeDeclaration(expected,expected.target)).toEqual(expected);
  }
});

test('receipt preparation finishes before any current own-key or value access',()=>{
  const engine=createCoreRecordTypeEngine(resources);
  const malformed=structuredClone(receipt);delete malformed.reference;
  let reads=0;
  const current=new Proxy({}, {ownKeys(){reads++;return [];},getOwnPropertyDescriptor(){reads++;return undefined;}});
  expect(()=>engine.verifyCoreRecordTypeDeclaration(malformed,current)).toThrow();
  expect(reads).toBe(0);
});

test('private stages reject invalid, cross-engine and reused handles before current traversal',()=>{
  const engine=createCoreRecordTypeEngine(resources),other=createCoreRecordTypeEngine(resources);
  expect(()=>engine.prepareCoreRecordTypeVerification({})).toThrow();
  const current=new Proxy({}, {ownKeys(){throw new Error('current must not be traversed');}});
  const cross=engine.prepareCoreRecordTypeVerification(receipt);
  expect(()=>other.finishCoreRecordTypeVerification(cross,current)).toThrow('Invalid private Core Record Type verification handle');
  const oneUse=engine.prepareCoreRecordTypeVerification(receipt);
  expect(engine.finishCoreRecordTypeVerification(oneUse,receipt.target)).toEqual(receipt);
  expect(()=>engine.finishCoreRecordTypeVerification(oneUse,current)).toThrow('Invalid private Core Record Type verification handle');
});

test('finish failure consumes a private stage before current traversal',()=>{
  const engine=createCoreRecordTypeEngine(resources);
  const stale=structuredClone(receipt.target);stale.future={retained:true};
  const handle=engine.prepareCoreRecordTypeVerification(receipt);
  expect(()=>engine.finishCoreRecordTypeVerification(handle,stale)).toThrow();
  let reads=0;const current=new Proxy({}, {ownKeys(){reads++;return [];}});
  expect(()=>engine.finishCoreRecordTypeVerification(handle,current)).toThrow('Invalid private Core Record Type verification handle');
  expect(reads).toBe(0);
});

test('host maxWork remains cumulative across receipt and current stages',()=>{
  let measured=0;
  const baseline=createCoreRecordTypeEngine(resources,{controls:{meter:amount=>{measured+=amount;}}});
  measured=0;
  baseline.verifyCoreRecordTypeDeclaration(receipt,receipt.target);
  expect(measured).toBeGreaterThan(1);
  const threshold=measured-1;
  let phase='prepare',prepareWork=0,finishWork=0;
  const measuredEngine=createCoreRecordTypeEngine(resources,{controls:{meter:amount=>{
    if(phase==='prepare')prepareWork+=amount;else finishWork+=amount;
  }},setupControls:{}});
  const staged=measuredEngine.prepareCoreRecordTypeVerification(receipt);
  phase='finish';
  measuredEngine.finishCoreRecordTypeVerification(staged,receipt.target);
  expect(prepareWork).toBeGreaterThan(0);
  expect(finishWork).toBeGreaterThan(0);
  expect(prepareWork).toBeLessThan(threshold);
  expect(finishWork).toBeLessThan(threshold);

  const limited=createCoreRecordTypeEngine(resources,{controls:{maxWork:threshold},setupControls:{}});
  const limitedStage=limited.prepareCoreRecordTypeVerification(receipt);
  expect(()=>limited.finishCoreRecordTypeVerification(limitedStage,receipt.target)).toThrow();
});

test('Core Model factory does not expose the opt-in Record Type runtime',()=>{
  const engine=createCoreModelEngine(resources);
  expect(engine.verifyCoreRecordTypeDeclaration).toBeUndefined();
  expect(engine.prepareCoreRecordTypeVerification).toBeUndefined();
});

test('explicit stages can be discarded and disposed engines refuse follow-up calls',()=>{
  const engine=createCoreRecordTypeEngine(resources);
  const handle=engine.prepareCoreRecordTypeVerification(receipt);
  expect(engine.discardCoreRecordTypeVerification(handle)).toBeUndefined();
  expect(()=>engine.finishCoreRecordTypeVerification(handle,receipt.target)).toThrow('Invalid private Core Record Type verification handle');
  engine.dispose();
  expect(()=>engine.verifyCoreRecordTypeDeclaration(receipt,receipt.target)).toThrow('Core Record Type engine has been disposed');
});

test('stage cap refuses the 65th handle and discard frees capacity',()=>{
  class FacadeError extends Error { constructor(code,message){super(message);this.code=code;} }
  let next=0;
  const api=createCoreRecordTypeOperations(()=>null,{prepare:()=>({id:++next}),finish:()=>null,dispose(){}},{ErrorType:FacadeError});
  const handles=Array.from({length:64},()=>api.prepareCoreRecordTypeVerification({}));
  try { api.prepareCoreRecordTypeVerification({}); throw new Error('expected stage cap'); }
  catch(error) { expect(error.code).toBe('CORE_RECORD_TYPE_STAGE_LIMIT'); }
  api.discardCoreRecordTypeVerification(handles[0]);
  const replacement=api.prepareCoreRecordTypeVerification({});
  expect(api.finishCoreRecordTypeVerification(replacement,{})).toBeNull();
});
