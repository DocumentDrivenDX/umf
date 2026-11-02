import {describe, expect, test} from 'bun:test';
import {createAccessRrfOperations, ACCESS_RRF_PROFILE} from '../src/access-rrf.js';
import {createAccessRrfOperations as createWasmOperations} from '../../wasm/src/access-rrf.js';
import {createAccessRrfEngine as createWasmEngine} from '../../wasm/index.js';
import {encodeWire, fromWire} from '../../wasm/src/wire.js';

for (const [host, factory] of [['Node', createAccessRrfOperations], ['WASM', createWasmOperations]]) {
  describe(`${host} access RRF wrapper`, () => {
    test('copies admitted arrays and dispatches the tagged Rust operation', () => {
      const calls = [];
      const legs = [[1, 0], [0]];
      const keyOrder = [1, 0];
      const engine = factory(request => {
        calls.push(request);
        return {ordered: [{identity: 0, score: 1 / 11}, {identity: 1, score: 1 / 12}]};
      });
      const result = engine.score({constant: '10', topK: 2, keyCount: 2, keyOrder, legs});
      keyOrder.reverse();
      legs[0].reverse();
      expect(engine.profile).toBe(ACCESS_RRF_PROFILE);
      expect(result.ordered).toHaveLength(2);
      expect(calls).toEqual([{profile: ACCESS_RRF_PROFILE, op: 'access.rrf.score', constant: '10', topK: 2, keyCount: 2, keyOrder: [1, 0], legs: [[1, 0], [0]]}]);
    });

    test('rejects malformed inputs before reaching Rust', () => {
      let calls = 0;
      const engine = factory(() => { calls++; return {ordered: []}; });
      const base = {constant: '1', topK: 1, keyCount: 2, keyOrder: [0, 1], legs: [[0]]};
      for (const request of [
        {...base, constant: '0'}, {...base, constant: '01'}, {...base, constant: '9'.repeat(4097)}, {...base, topK: -1}, {...base, topK: 10_001},
        {...base, keyOrder: [0, 0]}, {...base, legs: [[2]]}, {...base, legs: [[0, 0]]},
        {...base, keyCount: 10_001, keyOrder: Array(10_001).fill(0)},
        {...base, legs: [Array(10_001).fill(0)]},
      ]) expect(() => engine.score(request)).toThrow();
      expect(calls).toBe(0);
    });

    test('admits bounded inputs in linear passes and reports work while validating', () => {
      const work = [];
      const engine = factory(() => ({ordered: []}), () => ({charge: units => work.push(units)}));
      engine.score({constant: '60', topK: 0, keyCount: 4, keyOrder: [2, 0, 3, 1], legs: [[0, 1], [3]]});
      expect(work.reduce((sum, units) => sum + units, 0)).toBe(9);
    });

    test('preserves a non-involutive complete-key tie order', () => {
      let sent;
      const engine = factory(request => {
        sent = request;
        return {ordered: [{identity: 2, score: 0.75}, {identity: 0, score: 0.75}, {identity: 1, score: 2 / 3}]};
      });
      const result = engine.score({constant: '1', topK: 3, keyCount: 3, keyOrder: [2, 0, 1], legs: [[0, 1, 2], [2, 1, 0]]});
      expect(sent.keyOrder).toEqual([2, 0, 1]);
      expect(result.ordered.map(row => row.identity)).toEqual([2, 0, 1]);
    });

    test('rejects malformed Rust output', () => {
      const engine = factory(() => ({}));
      expect(() => engine.score({constant: '1', topK: 0, keyCount: 0, keyOrder: [], legs: []})).toThrow(/malformed result/);
      const invalidIdentity = factory(() => ({ordered: [{identity: 1, score: 1}]}));
      expect(() => invalidIdentity.score({constant: '1', topK: 1, keyCount: 1, keyOrder: [0], legs: [[0]]})).toThrow(/malformed result/);
    });
  });
}

test('WASM engine uses the typed wire binding and forwards cooperative controls', () => {
  let observed;
  const module = {
    accessRrfProfileVersion: () => ACCESS_RRF_PROFILE,
    executeAccessRrfWire(wireJson, controls) {
      observed = {request: fromWire(JSON.parse(wireJson)), controls};
      return JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: encodeWire({ordered: [{identity: 0, score: 0.5}]})});
    },
  };
  const engine = createWasmEngine(module, {controls: {meter: () => {}}});
  expect(engine.score({constant: '1', topK: 1, keyCount: 1, keyOrder: [0], legs: [[0]]})).toEqual({ordered: [{identity: 0, score: 0.5}]});
      expect(observed.request).toEqual({profile: ACCESS_RRF_PROFILE, op: 'access.rrf.score', constant: '1', topK: 1, keyCount: 1, keyOrder: [0], legs: [[0]]});
  expect(typeof observed.controls).toBe('function');
});
