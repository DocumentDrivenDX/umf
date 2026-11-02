import {describe, expect, test} from 'bun:test';
import {createDocumentComparisonOperations, DOCUMENT_COMPARISON_PROFILE} from '../../../bindings/core/node/src/document-comparison.js';
import {fromWire, toWire} from '../../../bindings/core/node/src/wire.js';
import {copyJson} from '../../../src/model/json.ts';

function executorReturning(result, calls) {
  return (request, control) => {
    calls.push({request: JSON.parse(request), control});
    return {profile: 'umf.core-wire/1', status: 'ok', wire: JSON.stringify(toWire(result))};
  };
}

describe('document comparison adapter boundary', () => {
  test('snapshots before then after and sends the versioned resource-free request', () => {
    const order = [];
    const calls = [];
    const snapshot = (value) => { order.push(value); if (value === 'bad') throw new Error('snapshot refused'); return {value}; };
    const operations = createDocumentComparisonOperations(executorReturning([{path: '/x', status: 'changed', before: 1, after: 2}], calls), {snapshot});
    expect(operations.compareDocuments('old', 'new')).toEqual([{path: '/x', status: 'changed', before: 1, after: 2}]);
    expect(order).toEqual(['old', 'new']);
    expect(fromWire(calls[0].request)).toEqual({profile: DOCUMENT_COMPARISON_PROFILE, before: {value: 'old'}, after: {value: 'new'}});
    expect(Object.keys(fromWire(calls[0].request))).toEqual(['profile', 'before', 'after']);
  });

  test('predecessor copyJson refusal prevents after snapshot and native invocation', () => {
    const calls = [];
    let afterReads = 0;
    const before = Object.defineProperty({}, 'x', {enumerable: true, get() { throw new Error('getter must not run'); }});
    const after = Object.defineProperty({}, 'x', {enumerable: true, get() { afterReads++; return 1; }});
    const operations = createDocumentComparisonOperations(executorReturning([], calls), {snapshot: copyJson});
    let refusal;
    try { operations.compareDocuments(before, after); } catch (error) { refusal = error; }
    expect(refusal.name).toBe('UmfError');
    expect(refusal.code).toBe('NON_JSON');
    expect(refusal.path).toBe('/x');
    expect(refusal.message).toBe('Hidden fields and accessors cannot be serialized faithfully');
    expect(afterReads).toBe(0);
    expect(calls).toHaveLength(0);
  });

  test('maps native error envelopes and enforces host work controls', () => {
    const operations = createDocumentComparisonOperations(() => ({profile: 'umf.core-wire/1', status: 'error', code: 'LIMIT', pathUnits: [47, 120], messageUnits: [110, 111]}), {snapshot: (x) => x});
    expect(() => operations.compareDocuments(null, null)).toThrow(expect.objectContaining({code: 'LIMIT', path: '/x'}));

    let invoked = false;
    const limited = createDocumentComparisonOperations(() => { invoked = true; return ''; }, {snapshot: (x) => x, controls: {maxWork: 0}});
    expect(() => limited.compareDocuments(null, null)).toThrow(expect.objectContaining({code: 'RESOURCE_LIMIT'}));
    expect(invoked).toBe(false);
  });

  test('work limits reset per invocation and a refusal does not poison a later call', () => {
    const output = [{path: '/x', status: 'changed', before: 1, after: 2}];
    const execute = () => JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: JSON.stringify(toWire(output))});
    let baselineWork = 0;
    const measured = createDocumentComparisonOperations(execute, {
      snapshot: (value) => value,
      controls: {meter(amount) { baselineWork += amount; }},
    });
    expect(measured.compareDocuments({x: 1}, {x: 2})).toEqual(output);
    expect(baselineWork).toBeGreaterThan(1);

    const controls = {maxWork: baselineWork};
    const operations = createDocumentComparisonOperations(execute, {snapshot: (value) => value, controls});
    expect(operations.compareDocuments({x: 1}, {x: 2})).toEqual(output);
    expect(operations.compareDocuments({x: 1}, {x: 2})).toEqual(output);

    let cancelled = true;
    const recovering = createDocumentComparisonOperations(execute, {
      snapshot: (value) => value,
      controls: {maxWork: baselineWork * 3, isCancelled() { if (cancelled) { cancelled = false; return true; } return false; }},
    });
    expect(() => recovering.compareDocuments({x: 1}, {x: 2})).toThrow(expect.objectContaining({code: 'CANCELLED'}));
    expect(recovering.compareDocuments({x: 1}, {x: 2})).toEqual(output);
  });
});
