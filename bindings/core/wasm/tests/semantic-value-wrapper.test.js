import {expect, test} from 'bun:test';
import {createSemanticTypeRegistry, initializeSemanticValueWasm, UmfCoreError} from '../index.js';
import {fromWire, toWire} from '../src/wire.js';

const ref = {vocabulary: 'urn:example', version: '1', term: 'email'};
const ok = value => JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: JSON.stringify(toWire(value))});

test('WASM semantic registry copies admission data and keeps synchronous callback transport opaque', () => {
  const calls = [];
  const module = {executeSemanticValueWire(request, dispatcher) {
    const op = fromWire(JSON.parse(request));
    calls.push(op.op);
    if (op.op === 'registry/prepareCheck') return ok(true);
    if (op.op === 'registry/check') {
      const reply = dispatcher(op.entries[0].validatorToken, JSON.stringify(toWire({value: {address: 'a@b'}, definition: {kind: 'email'}})));
      expect(fromWire(JSON.parse(reply))).toMatchObject({status: 'returned', reportedWork: 3});
      return ok({reference: ref, status: 'valid', complete: true, issues: []});
    }
    return ok(op.op === 'registry/lookup' ? op.entries[0].definition : null);
  }};
  const registry = createSemanticTypeRegistry(module);
  const definition = {kind: 'email'};
  let observed;
  registry.register(ref, definition, (value, copied, {reportWork}) => {
    observed = [value, copied];
    reportWork(3);
    return {status: 'valid', complete: true, issues: []};
  });
  definition.kind = 'changed';
  expect(registry.lookup(ref)).toEqual({kind: 'email'});
  expect(registry.check(ref, {address: 'a@b'}).status).toBe('valid');
  expect(observed).toEqual([{address: 'a@b'}, {kind: 'email'}]);
  expect(calls).toEqual(['registry/admitReference', 'registry/admit', 'registry/lookup', 'registry/prepareCheck', 'registry/check']);
});

test('WASM semantic callback faults are tagged and reported work is validated', () => {
  let captured;
  const module = {executeSemanticValueWire(request, dispatcher) {
    const op = fromWire(JSON.parse(request));
    if (op.op === 'registry/prepareCheck') return ok(true);
    if (op.op === 'registry/check') captured = dispatcher(op.entries[0].validatorToken, JSON.stringify(toWire({value: 1, definition: {}})));
    return ok(null);
  }};
  const registry = createSemanticTypeRegistry(module);
  registry.register(ref, {}, () => { throw new Error('caller failure'); });
  registry.check(ref, 1);
  expect(fromWire(JSON.parse(captured))).toMatchObject({status: 'threw', message: 'caller failure', reportedWork: 0});
});

test('hard-isolated semantic callbacks are refused before any wire call', () => {
  let calls = 0;
  expect(() => createSemanticTypeRegistry({executeSemanticValueWire() { calls++; }}, {profile: 'hard-isolated'}))
    .toThrow(expect.objectContaining({code: 'RESOURCE_PROFILE_UNAVAILABLE'}));
  expect(calls).toBe(0);
});


test('options descriptor refusals precede addon access and never invoke getters', () => {
  let optionGetterCalls = 0;
  let moduleGetterCalls = 0;
  const options = Object.defineProperty({}, 'profile', {enumerable: true, get() { optionGetterCalls++; throw new Error('must not run'); }});
  const module = Object.defineProperty({}, 'executeSemanticValueWire', {get() { moduleGetterCalls++; return () => ok(null); }});
  expect(() => createSemanticTypeRegistry(module, options)).toThrow(TypeError);
  expect(optionGetterCalls).toBe(0);
  expect(moduleGetterCalls).toBe(0);
});

test('invalid reported work is returned through the private resource tag', () => {
  let captured;
  const module = {executeSemanticValueWire(request, dispatcher) {
    const op = fromWire(JSON.parse(request));
    if (op.op === 'registry/prepareCheck') return ok(true);
    if (op.op === 'registry/check') captured = fromWire(JSON.parse(dispatcher(op.entries[0].validatorToken, JSON.stringify(toWire({value: null, definition: {}})))));
    return ok(null);
  }};
  const registry = createSemanticTypeRegistry(module);
  registry.register(ref, {}, (_value, _definition, {reportWork}) => { reportWork(-1); return {status: 'valid', complete: true, issues: []}; });
  registry.check(ref, null);
  expect(captured).toMatchObject({status: 'resource', code: 'HOST_CONTROL', reportedWork: 0});
});


test('semantic value initializer loads and initializes one module before returning the registry', async () => {
  let loads = 0;
  let initializations = 0;
  const operations = [];
  const module = {
    async default() { initializations++; },
    executeSemanticValueWire(request) {
      operations.push(fromWire(JSON.parse(request)).op);
      return ok(null);
    },
  };
  const registry = await initializeSemanticValueWasm(async () => { loads++; return module; }, {WebAssembly: {instantiate() {}}});
  registry.register(ref, {});
  expect(loads).toBe(1);
  expect(initializations).toBe(1);
  expect(operations).toEqual(['registry/admitReference', 'registry/admit']);
});
