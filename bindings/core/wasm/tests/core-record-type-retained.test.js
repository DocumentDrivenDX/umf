import {expect, test} from 'bun:test';
import {createCoreRecordTypeEngine} from '../index.js';
import {toWire} from '../src/wire.js';

const resources = {coreSchema: {}, referenceSchema: {}, packageSchema: {}, constraints: {}, domainPolicy: {}};

function fakeModule(log = []) {
  return {
    engineVersion: 'test',
    executeRequestWire(request) {
      const decoded = JSON.parse(request);
      log.push(['request', decoded]);
      return JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: JSON.stringify(toWire({ok: true}))});
    },
    CoreRecordTypeVerificationRuntime: class {
      constructor(wire) { log.push(['construct', wire]); }
      prepareVerification(wire) {
        log.push(['prepare', wire]);
        return {free() { log.push(['stage-free']); }};
      }
      finishVerification(stage, wire) {
        log.push(['finish', wire]);
        return JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: JSON.stringify(toWire({operation: 'verify-core-record-type'}))});
      }
      free() { log.push(['runtime-free']); }
    },
  };
}

test('retained Record Type rejects cross-engine handles before traversing current', () => {
  const first = createCoreRecordTypeEngine(fakeModule(), resources);
  const second = createCoreRecordTypeEngine(fakeModule(), resources);
  const stage = first.prepareCoreRecordTypeVerification({receipt: true});
  let reads = 0;
  const current = new Proxy({}, {ownKeys() { reads++; return []; }});
  expect(() => second.finishCoreRecordTypeVerification(stage, current)).toThrow('Invalid private Record Type verification handle');
  expect(reads).toBe(0);
  first.dispose(); second.dispose();
});

test('retained Record Type consumes stages on finish failure and frees resources idempotently', () => {
  const log = [];
  const engine = createCoreRecordTypeEngine(fakeModule(log), resources);
  const stage = engine.prepareCoreRecordTypeVerification({receipt: true});
  const current = Object.defineProperty({}, 'x', {enumerable: true, get() { throw new Error('host getter'); }});
  expect(() => engine.finishCoreRecordTypeVerification(stage, current)).toThrow();
  expect(() => engine.finishCoreRecordTypeVerification(stage, {})).toThrow('Invalid private Record Type verification handle');
  expect(log.filter(([name]) => name === 'stage-free')).toHaveLength(1);
  engine.dispose(); engine.dispose();
  expect(log.filter(([name]) => name === 'runtime-free')).toHaveLength(1);
  expect(() => engine.prepareCoreRecordTypeVerification({})).toThrow('disposed');
});

test('retained Record Type convenience verification reads receipt before current', () => {
  const log = [];
  const engine = createCoreRecordTypeEngine(fakeModule(log), resources);
  const order = [];
  const object = (name, value) => new Proxy({}, {
    ownKeys() { order.push(name); return ['value']; },
    getOwnPropertyDescriptor(_target, key) { return key === 'value' ? {value, enumerable: true, configurable: true, writable: true} : undefined; },
  });
  const receipt = object('receipt', 1);
  const current = object('current', 2);
  engine.verifyCoreRecordTypeDeclaration(receipt, current);
  expect(order).toEqual(['receipt', 'receipt', 'current', 'current']);
  expect(log.map(([name]) => name).filter(name => name === 'prepare' || name === 'finish')).toEqual(['prepare', 'finish']);
  engine.dispose();
});

test('retained Record Type shares host work admission across prepare and finish', () => {
  let preparedWork = 0;
  const probe = createCoreRecordTypeEngine(fakeModule(), resources, {controls: {meter(work) { preparedWork += work; }}});
  probe.prepareCoreRecordTypeVerification({receipt: true});
  probe.dispose();
  const engine = createCoreRecordTypeEngine(fakeModule(), resources, {controls: {maxWork: preparedWork}});
  const stage = engine.prepareCoreRecordTypeVerification({receipt: true});
  expect(() => engine.finishCoreRecordTypeVerification(stage, {current: true})).toThrow('Host work budget exceeded');
  expect(() => engine.finishCoreRecordTypeVerification(stage, {})).toThrow('Invalid private Record Type verification handle');
  engine.dispose();
});

test('retained Record Type bounds abandoned stages and supports explicit discard', () => {
  const log = [];
  const engine = createCoreRecordTypeEngine(fakeModule(log), resources);
  const stages = Array.from({length: 64}, () => engine.prepareCoreRecordTypeVerification({receipt: true}));
  try { engine.prepareCoreRecordTypeVerification({receipt: true}); throw new Error('expected stage limit'); }
  catch (error) { expect(error.code).toBe('CORE_RECORD_TYPE_STAGE_LIMIT'); }
  engine.discardCoreRecordTypeVerification(stages[0]);
  const replacement = engine.prepareCoreRecordTypeVerification({receipt: true});
  engine.dispose();
  expect(log.filter(([name]) => name === 'stage-free')).toHaveLength(65);
  expect(() => engine.finishCoreRecordTypeVerification(replacement, {})).toThrow('disposed');
});
