import {expect, test} from 'bun:test';
import {createDocumentComparisonEngine, DOCUMENT_COMPARISON_PROFILE} from '../index.js';
import {toWire} from '../src/wire.js';

test('public WASM comparison adapter preserves snapshot order and output records', () => {
  const order = [];
  const module = {
    documentComparisonProfile: () => DOCUMENT_COMPARISON_PROFILE,
    executeDocumentComparisonWire: (request) => {
      const parsed = JSON.parse(request);
      expect(parsed.kind).toBe('object');
      return {profile: 'umf.core-wire/1', status: 'ok', wire: JSON.stringify(toWire([
        {path: '/x', status: 'changed', before: 1, after: 2},
      ]))};
    },
  };
  const engine = createDocumentComparisonEngine(module, {snapshot(value) { order.push(value); return value; }});
  const changes = engine.compareDocuments('before', 'after');
  expect(order).toEqual(['before', 'after']);
  expect(changes).toEqual([{path: '/x', status: 'changed', before: 1, after: 2}]);
  expect(Object.getPrototypeOf(changes[0])).toBe(Object.prototype);
});

test('WASM adapter keeps before-first refusal and host cancellation ahead of FFI', () => {
  let invokes = 0;
  const module = {
    documentComparisonProfile: () => DOCUMENT_COMPARISON_PROFILE,
    executeDocumentComparisonWire: () => { invokes++; throw new Error('must not invoke'); },
  };
  const order = [];
  const refuses = createDocumentComparisonEngine(module, {snapshot(value) { order.push(value); if (value === 'bad') throw new Error('snapshot refusal'); return value; }});
  expect(() => refuses.compareDocuments('bad', 'after')).toThrow('snapshot refusal');
  expect(order).toEqual(['bad']);
  expect(invokes).toBe(0);

  const cancelled = createDocumentComparisonEngine(module, {snapshot: (value) => value, controls: {isCancelled: () => true}});
  expect(() => cancelled.compareDocuments(null, true)).toThrow(expect.objectContaining({code: 'CANCELLED'}));
  expect(invokes).toBe(0);
});

test('WASM work limits reset per invocation and a refusal does not poison a later call', () => {
  const output = [{path: '/x', status: 'changed', before: 1, after: 2}];
  let baselineWork = 0;
  const measured = createDocumentComparisonEngine({
    documentComparisonProfile: () => DOCUMENT_COMPARISON_PROFILE,
    executeDocumentComparisonWire: () => JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: JSON.stringify(toWire(output))}),
  }, {snapshot: (value) => value, controls: {meter(amount) { baselineWork += amount; }}});
  expect(measured.compareDocuments({x: 1}, {x: 2})).toEqual(output);
  expect(baselineWork).toBeGreaterThan(1);

  const controls = {maxWork: baselineWork};
  const operations = createDocumentComparisonEngine({
    documentComparisonProfile: () => DOCUMENT_COMPARISON_PROFILE,
    executeDocumentComparisonWire: () => JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: JSON.stringify(toWire(output))}),
  }, {snapshot: (value) => value, controls});
  expect(operations.compareDocuments({x: 1}, {x: 2})).toEqual(output);
  expect(operations.compareDocuments({x: 1}, {x: 2})).toEqual(output);

  let cancelled = true;
  const recovering = createDocumentComparisonEngine({
    documentComparisonProfile: () => DOCUMENT_COMPARISON_PROFILE,
    executeDocumentComparisonWire: () => JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: JSON.stringify(toWire(output))}),
  }, {snapshot: (value) => value, controls: {maxWork: baselineWork * 3, isCancelled() { if (cancelled) { cancelled = false; return true; } return false; }}});
  expect(() => recovering.compareDocuments({x: 1}, {x: 2})).toThrow(expect.objectContaining({code: 'CANCELLED'}));
  expect(recovering.compareDocuments({x: 1}, {x: 2})).toEqual(output);
});
