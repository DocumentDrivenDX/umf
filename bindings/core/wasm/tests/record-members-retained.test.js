import {expect, test} from 'bun:test';
import {createCoreRecordMembersEngine} from '../index.js';
import {toWire} from '../src/wire.js';

const resources = {coreSchema: {}, referenceSchema: {}, packageSchema: {}, constraints: {}, domainPolicy: {}};
function fakeModule(log = []) {
  return {
    CoreRecordMembersInspectionRuntime: class {
      constructor(wire, dispatcher) { log.push(['new', wire, dispatcher]); }
      inspect(source, identity, dispatcher) {
        log.push(['inspect', source, identity, dispatcher]);
        return JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: JSON.stringify(toWire({inspected: true}))});
      }
      free() { log.push(['free']); }
    },
  };
}

test('retained Record Members serializes source before identity and returns only its opt-in operation', () => {
  const log = [];
  const engine = createCoreRecordMembersEngine(fakeModule(log), resources);
  const order = [];
  const input = (label, value) => new Proxy({}, {
    ownKeys() { order.push(label); return ['value']; },
    getOwnPropertyDescriptor(_target, key) { return key === 'value' ? {value, enumerable: true, configurable: true, writable: true} : undefined; },
  });
  expect(engine.inspectCoreRecordMembers(input('source', 1), input('identity', 2))).toEqual({inspected: true});
  expect(order).toEqual(['source', 'source', 'identity', 'identity']);
  expect(Object.keys(engine).sort()).toEqual(['dispose', 'inspectCoreRecordMembers']);
  engine.dispose();
});

test('retained Record Members separates setup from fresh call controls and disposes idempotently', () => {
  const log = [];
  let setup = 0, calls = 0;
  const engine = createCoreRecordMembersEngine(fakeModule(log), resources, {
    setupControls: {meter(work) { setup += work; }},
    controls: {meter(work) { calls += work; }},
  });
  engine.inspectCoreRecordMembers({}, {module: 'm', element: 'e'});
  engine.inspectCoreRecordMembers({}, {module: 'm', element: 'e'});
  expect(setup).toBeGreaterThan(0);
  expect(calls).toBeGreaterThan(0);
  engine.dispose(); engine.dispose();
  expect(log.filter(([name]) => name === 'free')).toHaveLength(1);
  expect(() => engine.inspectCoreRecordMembers({}, {module: 'm', element: 'e'})).toThrow('disposed');
});

test('retained Record Members refuses before construction when resources are incomplete', () => {
  const log = [];
  expect(() => createCoreRecordMembersEngine(fakeModule(log), {coreSchema: {}})).toThrow('Missing engine descriptor property');
  expect(log.filter(([name]) => name === 'new')).toHaveLength(0);
});

test('retained Record Members rejects non-plain resource prototypes before construction', () => {
  const log = [];
  const inherited = Object.assign(Object.create({future: true}), resources);
  expect(() => createCoreRecordMembersEngine(fakeModule(log), inherited)).toThrow('Engine resources must be a plain object');
  expect(log.filter(([name]) => name === 'new')).toHaveLength(0);
  const nullPrototype = Object.assign(Object.create(null), resources);
  const engine = createCoreRecordMembersEngine(fakeModule(log), nullPrototype);
  expect(log.filter(([name]) => name === 'new')).toHaveLength(1);
  engine.dispose();
});
