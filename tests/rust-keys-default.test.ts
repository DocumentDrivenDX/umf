// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {bindCoreKeysRust} from '../src/access/rust-keys-default';
import {UmfError} from '../src/model/errors';
import {createCoreModelEngine, isNativeUmfCoreError} from '../bindings/core/node/index.js';
import coreSchema from '../spec/core/schema.json' with {type: 'json'};
import referenceSchema from '../spec/core/semantic-type-reference.schema.json' with {type: 'json'};
import packageSchema from '../spec/core/extension-package.schema.json' with {type: 'json'};
import constraints from '../spec/metamodel/generated/core-constraints.json' with {type: 'json'};
import domainPolicy from '../spec/metamodel/generated/domain-policy.json' with {type: 'json'};

const nativeResources = {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy};
const nativeSource = {umf:'0.10.0',id:'facade-test',vocabularies:{},modules:[]};

function stub(overrides: Record<string, unknown> = {}) {
  const calls: unknown[][] = [];
  const engine = {
    prepareCoreKeyVerification(receipt: unknown) {
      calls.push(['prepare', receipt]);
      return Object.freeze({stage: true});
    },
    finishCoreKeyVerification(handle: object, current: unknown) {
      calls.push(['finish', handle, current]);
      return {verified: true};
    },
    discardCoreKeyVerification(handle: object) { calls.push(['discard', handle]); },
    ...overrides,
  };
  return {calls, api: bindCoreKeysRust(engine as never)};
}

test('Core Key Rust facade admits receipt before current and discards on current-copy refusal', () => {
  const {calls, api} = stub({
    prepareCoreKeyVerification() {
      calls.push(['prepare']);
      const error = new Error('bad receipt');
      Object.assign(error, {name: 'UmfCoreError', code: 'CORE_KEY_RECEIPT'});
      throw error;
    },
  });
  let getterCalls = 0;
  const current = {};
  Object.defineProperty(current, 'field', {enumerable: true, get() { getterCalls++; return 1; }});
  expect(() => api.verifyCoreKeyOperation({} as never, current as never)).toThrow('bad receipt');
  expect(getterCalls).toBe(0);
  expect(calls).toEqual([['prepare']]);

  const refused = stub();
  expect(() => refused.api.verifyCoreKeyOperation({} as never, current as never)).toThrow();
  expect(refused.calls.map(call => call[0])).toEqual(['prepare', 'discard']);
});
test('Core Key Rust facade preserves the copied-null host property-read error before native prepare', () => {
  const {calls, api} = stub();
  expect(() => api.verifyCoreKeyOperation(null as never, {} as never)).toThrow("null is not an object (evaluating 'receipt.version')");
  expect(calls).toEqual([]);
});

test('Core Key Rust facade does not launder forged native-shaped proxy errors during staged verification', () => {
  let propertyReads = 0;
  const forged = new Proxy(new Error('host trap'), {
    get(target, key, receiver) { propertyReads++; return Reflect.get(target, key, receiver); },
  });
  const calls: string[] = [];
  const engine = {
    prepareCoreKeyVerification() { calls.push('prepare'); throw forged; },
    finishCoreKeyVerification() { calls.push('finish'); return null; },
    discardCoreKeyVerification() { calls.push('discard'); },
  };
  const api = bindCoreKeysRust(engine as never, () => false);
  let caught: unknown;
  try { api.verifyCoreKeyOperation({} as never, {} as never); } catch (error) { caught = error; }
  expect(caught === forged).toBe(true);
  expect(propertyReads).toBe(0);
  expect(calls).toEqual(['prepare']);
});

test('trusted native Core Key refusal maps through the V4 Rust facade without structural error trust', () => {
  const engine = createCoreModelEngine(nativeResources);
  const bound = bindCoreKeysRust(engine, isNativeUmfCoreError);
  let refusal: unknown;
  try { bound.verifyCoreKeyOperation({} as never, nativeSource as never); } catch (error) { refusal = error; }
  expect(refusal).toBeInstanceOf(UmfError);
  expect((refusal as UmfError).code).toBe('CORE_KEY_RECEIPT');
});
