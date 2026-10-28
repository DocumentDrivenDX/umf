import {expect, test} from 'bun:test';
import {createCoreModelEngine, createCoreModelRootEngine, createCoreModelRootKeyTupleEngine, initializeCoreModelRootWasm} from '../index.js';
import coreSchema from '../../../../spec/core/schema.json' with {type: 'json'};
import referenceSchema from '../../../../spec/core/semantic-type-reference.schema.json' with {type: 'json'};
import packageSchema from '../../../../spec/core/extension-package.schema.json' with {type: 'json'};
import constraints from '../../../../spec/metamodel/generated/core-constraints.json' with {type: 'json'};
import domainPolicy from '../../../../spec/metamodel/generated/domain-policy.json' with {type: 'json'};

const resources = {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy};

function fakeWasmModule(constructions) {
  return {
    engineVersion: 'test',
    copyJsonWire() { throw new Error('copyJsonWire should not run during factory setup'); },
    executeRequestWire() { throw new Error('executeRequestWire should not run during factory setup'); },
    executeCoreSchemaPropertiesHostJson() { throw new Error('host-input operation should not run during factory setup'); },
    CoreKeyTupleRuntime: class {
      constructor() { constructions.count++; }
    },
  };
}

test('WASM root-only factory omits tuple runtime while public model factory remains eager', () => {
  const constructions = {count: 0};
  const module = fakeWasmModule(constructions);
  const rootModel = createCoreModelRootEngine(module, resources);
  expect(constructions.count).toBe(0);
  for (const name of ['encodeCoreKeyTuple', 'verifyCoreKeyTuple', 'readCoreKeyTupleBytes', 'prepareCoreKeyTuples']) {
    expect(Object.hasOwn(rootModel, name)).toBe(false);
  }

  const publicModel = createCoreModelEngine(module, resources);
  expect(constructions.count).toBe(1);
  for (const name of ['encodeCoreKeyTuple', 'verifyCoreKeyTuple', 'readCoreKeyTupleBytes', 'prepareCoreKeyTuples']) {
    expect(Object.hasOwn(publicModel, name)).toBe(true);
  }
});

test('WASM default-root tuple slice selects retained Rust methods without exposing encoder or verifier', () => {
  const constructions = {count: 0};
  const module = fakeWasmModule(constructions);
  const rootModel = createCoreModelRootKeyTupleEngine(module, resources);
  expect(constructions.count).toBe(1);
  expect(Object.hasOwn(rootModel, 'encodeCoreKeyTuple')).toBe(false);
  expect(Object.hasOwn(rootModel, 'verifyCoreKeyTuple')).toBe(false);
  expect(Object.hasOwn(rootModel, 'readCoreKeyTupleBytes')).toBe(true);
  expect(Object.hasOwn(rootModel, 'prepareCoreKeyTuples')).toBe(true);
});

test('WASM Core Key verification fails closed when the Rust staged runtime is missing', () => {
  const module = fakeWasmModule({count: 0});
  const engine = createCoreModelEngine(module, resources);
  expect(() => engine.prepareCoreKeyVerification({})).toThrow('RUST_BINDING_MISSING');
});

test('WASM root initializer initializes the module and preserves the no-tuple root shape', async () => {
  const constructions = {count: 0};
  const module = fakeWasmModule(constructions);
  let initialized = 0;
  module.default = async () => { initialized++; };
  const host = {WebAssembly: {instantiate() {}}};
  const rootModel = await initializeCoreModelRootWasm(resources, async () => module, host);
  expect(initialized).toBe(1);
  expect(constructions.count).toBe(0);
  expect(Object.hasOwn(rootModel, 'prepareCoreKeyTuples')).toBe(false);
});
