// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe, expect, test} from 'bun:test';
import {createAccessTemporalEngine, ACCESS_TEMPORAL_PROFILE} from '../index.js';

describe('opt-in Node access-temporal facade', () => {
  test('uses the pinned profile and preserves immutable results', () => {
    const engine = createAccessTemporalEngine();
    const value = engine.parseAccessTemporal('instant', '1969-12-31T23:59:59.5Z');
    expect(engine.profile).toBe(ACCESS_TEMPORAL_PROFILE);
    expect(value).toEqual({profile: ACCESS_TEMPORAL_PROFILE, kind: 'instant', originalText: '1969-12-31T23:59:59.5Z', canonicalText: '1969-12-31T23:59:59.500000Z', microsecond: 500000, utcSeconds: '-1', originalOffset: 'Z'});
    expect(Object.isFrozen(value)).toBe(true);
  });

  test('keeps host type admission in JS and kind-before-length semantics in Rust', () => {
    const engine = createAccessTemporalEngine();
    expect(() => engine.parseAccessTemporal('other', null)).toThrow(new TypeError('Access temporal requires text'));
    expect(() => engine.parseAccessTemporal('other', 'x'.repeat(33))).toThrow(new RangeError('Access temporal kind'));
    expect(() => engine.parseAccessTemporal('date', 'x'.repeat(33))).toThrow(new RangeError('Access temporal token limit'));
    const observed = [];
    const kindProxy = new Proxy({}, {get(_target, property) { observed.push(String(property)); throw new Error('kind trap'); }});
    expect(() => engine.parseAccessTemporal(kindProxy, '2000-01-01')).toThrow(new RangeError('Access temporal kind'));
    expect(observed).toEqual([]);
  });

  test('rejects the eight frozen raw-host carriers without observing proxies or accessors', () => {
    const engine = createAccessTemporalEngine();
    const observed = [];
    const proxy = new Proxy({}, {get(_target, property) { observed.push(`proxy:${String(property)}`); throw new Error('proxy trap'); }});
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, 'toString', {get() { getterCalls++; throw new Error('getter'); }});
    const raw = [
      null,
      42,
      {},
      [],
      new Date(0),
      new String('2024-01-01'),
      proxy,
      accessor,
    ];
    for (const [index, token] of raw.entries()) {
      const kind = index < 6 ? 'instant' : 'date';
      expect(() => engine.parseAccessTemporal(kind, token)).toThrow(new TypeError('Access temporal requires text'));
    }
    expect(observed).toEqual([]);
    expect(getterCalls).toBe(0);
  });
});
