// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {createCoreModelEngine,isNativeUmfCoreError} from '../../bindings/core/node/index.js';
import frozen from '../../tests/rust-core/fixtures/r5-core-evolution/frozen-typescript-0.10.json';
import {CORE_MODEL_RESOURCES} from '../../src/access/core-model-resources';
import {bindCoreEvolutionRustCandidate} from '../../src/access/rust-core-evolution-candidate';
import {UmfError} from '../../src/model/errors';
import type {Document} from '../../src/model/types';
import type {CoreEvolutionPolicy} from '../../src/model/evolution-types';

type FrozenCase={before:Document;after:Document;policy:CoreEvolutionPolicy};
type Outcome={ok:true;value:unknown}|{ok:false;error:{code:unknown;message:unknown;path:unknown}};
const cases=frozen.cases as unknown as Record<string,FrozenCase>;
const outcomes=frozen.outcomes as unknown as Record<string,Outcome>;

const canonical=(value:unknown):string=>Array.isArray(value)
  ?`[${value.map(canonical).join(',')}]`
  :value!==null&&typeof value==='object'
    ?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`
    :JSON.stringify(value)??'undefined';
const capture=(operation:()=>unknown):Outcome=>{
  try{return {ok:true,value:operation()};}
  catch(error){const value=error as {code?:unknown;message?:unknown;path?:unknown};return {ok:false,error:{code:value.code??'',message:value.message??String(error),path:value.path??''}};}
};

test('private Rust candidate matches the frozen seven-case evolution packet',()=>{
  const api=bindCoreEvolutionRustCandidate(createCoreModelEngine(CORE_MODEL_RESOURCES),isNativeUmfCoreError);
  for(const [name,entry] of Object.entries(cases)){
    const actual=capture(()=>api.inspectCoreEvolution(entry.before,entry.after,entry.policy));
    expect(canonical(actual),name).toBe(canonical(outcomes[name]));
  }
},60_000);

test('private Rust candidate verifies current and rejects forged receipts',()=>{
  const api=bindCoreEvolutionRustCandidate(createCoreModelEngine(CORE_MODEL_RESOURCES),isNativeUmfCoreError);
  const accepted=cases.accepted_absent_string_addition!;
  const receipt=api.inspectCoreEvolution(accepted.before,accepted.after,accepted.policy);
  expect(api.verifyCoreEvolution(receipt,accepted.before,accepted.after,accepted.policy)).toEqual(receipt);
  const forged=structuredClone(receipt) as Record<string,unknown>;
  forged.complete=!forged.complete;
  const outcome=capture(()=>api.verifyCoreEvolution(forged,accepted.before,accepted.after,accepted.policy));
  expect(outcome.ok).toBe(false);
  if(outcome.ok)throw new Error('forged receipt accepted');
  expect(outcome.error.code).toBe('CORE_EVOLUTION_RECEIPT');
},60_000);

test('private Rust candidate maps semantic engine errors and preserves native resource errors',()=>{
  const semanticError=Object.assign(new Error('Closed original receipt required'),{name:'UmfCoreError',code:'CORE_EVOLUTION_RECEIPT',path:''});
  const semantic=bindCoreEvolutionRustCandidate({
    inspectCoreEvolution(){throw semanticError;},
    verifyCoreEvolution(){throw semanticError;},
  },error=>error===semanticError);
  expect(()=>semantic.inspectCoreEvolution({} as never,{} as never,{} as never)).toThrow(UmfError);

  const resourceError=Object.assign(new Error('budget exceeded'),{name:'UmfCoreError',code:'RESOURCE_LIMIT',path:''});
  const resource=bindCoreEvolutionRustCandidate({
    inspectCoreEvolution(){throw resourceError;},
    verifyCoreEvolution(){throw resourceError;},
  },error=>error===resourceError);
  try {resource.inspectCoreEvolution({} as never,{} as never,{} as never);throw new Error('expected native resource error');}
  catch(error){expect(error).toBe(resourceError);}
});

test('Rust retained-output byte edge is exact',()=>{
  const api=bindCoreEvolutionRustCandidate(createCoreModelEngine(CORE_MODEL_RESOURCES),isNativeUmfCoreError);
  const base=structuredClone(cases.unchanged!.before) as any;
  const after=structuredClone(cases.unchanged!.after) as any;
  const policy=cases.unchanged!.policy;
  const byteLength=(value:unknown)=>new TextEncoder().encode(JSON.stringify(value)).length;
  const baselineBefore={...base,opaque:''};
  const baselineReceipt=api.inspectCoreEvolution(baselineBefore,after,policy);
  const baselineBytes=[policy,baselineBefore,after,baselineReceipt].reduce((n,value)=>n+byteLength(value),0);
  const remaining=4_000_000-baselineBytes;
  expect(remaining%2).toBe(0);
  const padding=remaining/2;
  const atLimit={...base,opaque:'x'.repeat(padding)};
  const receipt=api.inspectCoreEvolution(atLimit,after,policy);
  expect([policy,atLimit,after,receipt].reduce((n,value)=>n+byteLength(value),0)).toBe(4_000_000);
  const overLimit={...base,opaque:'x'.repeat(padding+1)};
  const rustOver=capture(()=>api.inspectCoreEvolution(overLimit,after,policy));
  expect(rustOver.ok).toBe(false);
  if(rustOver.ok)throw new Error('Rust accepted aggregate receipt bytes above the limit');
  expect(rustOver.error.code).toBe('LIMIT');
},60_000);
