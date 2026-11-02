// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createSecurityLogicEngine} from '../../bindings/core/node';
import {securityAnd as referenceAnd,securityOr as referenceOr,type SecurityTruth} from '../../src/extensions/security/logic';
import {UmfError} from '../../src/model/types';
import {createSecurityLogicRustAdapter} from '../../src/extensions/security/rust-logic-adapter';

const rust=createSecurityLogicEngine();
const adapter=createSecurityLogicRustAdapter(rust);
const states:SecurityTruth[]=['T','F','U'];
function thrown(work:()=>unknown):unknown {
  try{work();}catch(error){return error;}
  throw new Error('expected operation to throw');
}
function expectUmfError(error:unknown,code:string,message:string,path=''):void {
  expect(error).toBeInstanceOf(UmfError);
  const actual=error as UmfError;
  expect(actual.name).toBe('UmfError');
  expect(actual.code).toBe(code);
  expect(actual.message).toBe(message);
  expect(actual.path).toBe(path);
}

test('Rust adapter preserves truth tables and dispatches valid values to Rust',()=>{
  let andCalls=0,orCalls=0;
  const observed=createSecurityLogicRustAdapter({
    securityAnd(values){andCalls++;return rust.securityAnd(values);},
    securityOr(values){orCalls++;return rust.securityOr(values);},
  });
  for(const a of states)for(const b of states){
    expect(observed.securityAnd([a,b])).toBe(referenceAnd([a,b]));
    expect(observed.securityOr([a,b])).toBe(referenceOr([a,b]));
  }
  expect(observed.securityAnd(Array(64).fill('T'))).toBe('T');
  expect(observed.securityOr(Array(64).fill('F'))).toBe('F');
  expect(andCalls).toBe(10);
  expect(orCalls).toBe(10);
});

test('snapshot admission precedes arity and truth-token errors',()=>{
  expectUmfError(thrown(()=>adapter.securityAnd([])),'SECURITY_BOUND','Expected 1–64 truth operands');
  expectUmfError(thrown(()=>adapter.securityOr(['T','X'])),'SECURITY_TRUTH','Invalid security truth');

  let getterCalled=false;
  const accessor=Object.defineProperty({},'later',{enumerable:true,get(){getterCalled=true;return 'T';}});
  expectUmfError(thrown(()=>adapter.securityOr(['X',accessor])),'NON_JSON','Hidden fields and accessors cannot be serialized faithfully','/1/later');
  expect(getterCalled).toBe(false);

  const tooManyWithAccessor=[...Array(64).fill('T'),accessor];
  expectUmfError(thrown(()=>adapter.securityAnd(tooManyWithAccessor)),'NON_JSON','Hidden fields and accessors cannot be serialized faithfully','/64/later');
  expect(getterCalled).toBe(false);
});

test('snapshot rejects raw host shapes and preserves proxy trap exceptions',()=>{
  expectUmfError(thrown(()=>adapter.securityAnd(Array(65).fill('T'))),'SECURITY_BOUND','Expected 1–64 truth operands');
  expect((thrown(()=>adapter.securityAnd([,])) as UmfError).code).toBe('NON_JSON');
  expect((thrown(()=>adapter.securityAnd(Object.assign(['T'],{extra:'F'}))) as UmfError).code).toBe('NON_JSON');
  expect((thrown(()=>adapter.securityAnd([Object.create({truth:'T'})])) as UmfError).code).toBe('NON_JSON');

  const marker=new Error('ownKeys trap');
  let trapCalled=false;
  const proxy=new Proxy(['T'],{ownKeys(){trapCalled=true;throw marker;}});
  expect(thrown(()=>adapter.securityOr(proxy))).toBe(marker);
  expect(trapCalled).toBe(true);
});

test('valid vectors reach actual Rust operations while invalid vectors do not',()=>{
  let calls=0;
  const observed=createSecurityLogicRustAdapter({
    securityAnd(values){calls++;return rust.securityAnd(values);},
    securityOr(values){calls++;return rust.securityOr(values);},
  });
  expect(observed.securityAnd(['T','U'])).toBe('U');
  expect(observed.securityOr(['F','U'])).toBe('U');
  expect(calls).toBe(2);
  expectUmfError(thrown(()=>observed.securityAnd(['X'])),'SECURITY_TRUTH','Invalid security truth');
  expectUmfError(thrown(()=>observed.securityOr([])),'SECURITY_BOUND','Expected 1–64 truth operands');
  expect(calls).toBe(2);
});
