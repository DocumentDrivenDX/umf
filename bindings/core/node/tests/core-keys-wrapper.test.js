// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {createCoreKeysOperations as nodeOperations} from '../src/core-keys.js';
import {createCoreKeysOperations as wasmOperations} from '../../wasm/src/core-keys.js';

for (const [host, factory] of [['Node/Bun', nodeOperations], ['WASM', wasmOperations]]) {
  test(`${host} routes the five opt-in Key operations without reshaping values`, () => {
    const calls = [];
    const api = factory((op, args) => {
      calls.push([op, args]);
      return {op, args};
    });
    const source = {umf: '0.10.0', unknown: {'\ud800': [null, {x: 1}]}};
    const identity = {module: 'm', element: 'r'};
    const keyIdentity = {module: 'm', element: 'r', key: 'k'};
    const members = [{module: 'm', element: 'f1'}, {module: 'm', element: 'f2'}];
    const keyRequest = {id: 'k', name: 'Pair', fields: members};
    const receipt = {operation: 'declare-core-key', source, target: {}, identity, request: keyRequest};

    expect(api.inspectCoreKeys(source, identity).op).toBe('model/inspectCoreKeys');
    expect(api.lookupCoreKey(source, keyIdentity).args.identity).toBe(keyIdentity);
    expect(api.declareCoreRecordMembers(source, identity, members).args.request).toBe(members);
    expect(api.declareCoreKey(source, identity, keyRequest).args.request).toBe(keyRequest);
    expect(api.verifyCoreKeyOperation(receipt, source).args.current).toBe(source);
    expect(calls).toEqual([
      ['model/inspectCoreKeys', {source, identity}],
      ['model/lookupCoreKey', {source, identity: keyIdentity}],
      ['model/declareCoreRecordMembers', {source, identity, request: members}],
      ['model/declareCoreKey', {source, identity, request: keyRequest}],
      ['model/verifyCoreKeyOperation', {receipt, current: source}],
    ]);
    expect(Object.isFrozen(api)).toBe(true);
  });

  test(`${host} delegates staged verification only through a native one-use handle`, () => {
    const calls = [];
    const stage = Object.freeze({native: true});
    const native = {
      prepare(receipt) { calls.push(['prepare', receipt]); return stage; },
      finish(handle, current) { calls.push(['finish', handle, current]); return {receipt: 'verified'}; },
    };
    const api = factory((op, args) => { calls.push(['wire', op, args]); return null; }, native);
    const otherApi = factory(() => null, native);
    const receipt = {opaque: '\ud800'};
    const current = {value: 1};
    const prepared = api.prepareCoreKeyVerification(receipt);
    expect(Object.getPrototypeOf(prepared)).toBe(null);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(() => otherApi.finishCoreKeyVerification(prepared, current)).toThrow('Invalid private key verification handle');
    expect(api.finishCoreKeyVerification(prepared, current)).toEqual({receipt: 'verified'});
    expect(() => api.finishCoreKeyVerification(prepared, current)).toThrow('Invalid private key verification handle');
    expect(() => api.finishCoreKeyVerification({}, current)).toThrow('Invalid private key verification handle');
    expect(api.verifyCoreKeyOperation(receipt, current)).toEqual({receipt: 'verified'});
    expect(calls).toEqual([
      ['prepare', receipt], ['finish', stage, current],
      ['prepare', receipt], ['finish', stage, current],
    ]);
  });

  test(`${host} consumes a prepared verification handle on finish failure`, () => {
    let finishCalls = 0;
    let discardCalls = 0;
    const api = factory(() => null, {
      prepare() { return Object.freeze({native: true}); },
      finish() { finishCalls++; throw new Error('current admission failed'); },
      discard() { discardCalls++; },
    });
    const handle = api.prepareCoreKeyVerification({operation: 'test'});
    expect(() => api.finishCoreKeyVerification(handle, {invalid: true})).toThrow('current admission failed');
    expect(() => api.finishCoreKeyVerification(handle, {valid: true})).toThrow('Invalid private key verification handle');
    expect(finishCalls).toBe(1);
    expect(discardCalls).toBe(1);
  });

  test(`${host} discards a prepared verification stage exactly once`, () => {
    const discarded = [];
    const api = factory(() => null, {
      prepare(receipt) { return {receipt}; },
      finish() { throw new Error('finish should not run'); },
      discard(stage) { discarded.push(stage); },
    });
    const handle = api.prepareCoreKeyVerification({receipt: 1});
    expect(api.discardCoreKeyVerification(handle)).toBeUndefined();
    expect(() => api.discardCoreKeyVerification(handle)).toThrow('Invalid private key verification handle');
    expect(() => api.finishCoreKeyVerification(handle, {})).toThrow('Invalid private key verification handle');
    expect(discarded).toEqual([{receipt: {receipt: 1}}]);
  });
}
