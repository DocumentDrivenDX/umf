import {expect, test} from 'bun:test';
import {ACCESS_TEMPORAL_PROFILE, createAccessTemporalEngine} from '../index.js';
import {toWire} from '../src/wire.js';

const ok = value => JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: JSON.stringify(toWire(value))});

test('opt-in access-temporal facade verifies version and decodes the tagged Rust result', () => {
  const calls = [];
  const engine = createAccessTemporalEngine({
    accessTemporalProfileVersion: () => ACCESS_TEMPORAL_PROFILE,
    executeAccessTemporalWire(wire) {
      calls.push(JSON.parse(wire));
      return ok({profile: ACCESS_TEMPORAL_PROFILE, kind: 'date', originalText: '2000-02-29', canonicalText: '2000-02-29'});
    },
  });
  const parsed = engine.parseAccessTemporal('date', '2000-02-29');
  expect(parsed).toEqual({profile: ACCESS_TEMPORAL_PROFILE, kind: 'date', originalText: '2000-02-29', canonicalText: '2000-02-29'});
  expect(Object.isFrozen(parsed)).toBe(true);
  expect(calls).toHaveLength(1);
  expect(calls[0].kind).toBe('object');
  expect(calls[0].members).toHaveLength(2);
});

test('access-temporal facade fails closed for absent or mismatched bindings and unsupported JS values', () => {
  expect(() => createAccessTemporalEngine({})).toThrow('RUST_WASM_BINDING_MISSING');
  expect(() => createAccessTemporalEngine({accessTemporalProfileVersion: () => 'future', executeAccessTemporalWire() {}})).toThrow('RUST_WASM_BINDING_PROFILE_MISMATCH');
  let calls = 0;
  const engine = createAccessTemporalEngine({accessTemporalProfileVersion: () => ACCESS_TEMPORAL_PROFILE, executeAccessTemporalWire() { calls++; return ok(null); }});
  expect(() => engine.parseAccessTemporal('date', () => {})).toThrow('Access temporal requires text');
  expect(calls).toBe(0);
  let traps = 0;
  const proxy = new Proxy({}, {ownKeys() { traps++; throw new Error('host trap'); }});
  expect(() => engine.parseAccessTemporal(proxy, '2000-02-29')).toThrow(new RangeError('Access temporal kind'));
  expect(traps).toBe(0);
  expect(calls).toBe(0);
});

test('raw host values refuse before proxy traps, getters, or kind/length checks', () => {
  let calls = 0;
  const engine = createAccessTemporalEngine({accessTemporalProfileVersion: () => ACCESS_TEMPORAL_PROFILE, executeAccessTemporalWire() { calls++; return ok(null); }});
  for (const token of [null, 42, {}, [], new Date(0), new String('2024-01-01')]) {
    expect(() => engine.parseAccessTemporal('instant', token)).toThrow(new TypeError('Access temporal requires text'));
  }
  let trapCalls = 0;
  const proxy = new Proxy({}, {getPrototypeOf() { trapCalls++; throw new Error('proxy trap'); }, ownKeys() { trapCalls++; throw new Error('proxy trap'); }});
  expect(() => engine.parseAccessTemporal('date', proxy)).toThrow(new TypeError('Access temporal requires text'));
  let getterCalls = 0;
  const accessor = Object.defineProperty({}, 'value', {enumerable: true, get() { getterCalls++; throw new Error('getter'); }});
  expect(() => engine.parseAccessTemporal('date', accessor)).toThrow(new TypeError('Access temporal requires text'));
  const proxyKind = new Proxy({}, {getPrototypeOf() { trapCalls++; throw new Error('proxy kind trap'); }, ownKeys() { trapCalls++; throw new Error('proxy kind trap'); }});
  expect(() => engine.parseAccessTemporal(proxyKind, 'x'.repeat(33))).toThrow(new RangeError('Access temporal kind'));
  expect(trapCalls).toBe(0);
  expect(getterCalls).toBe(0);
  expect(calls).toBe(0);
});

test('lone UTF-16 surrogates pass through tagged transport without replacement', () => {
  let sent;
  const engine = createAccessTemporalEngine({accessTemporalProfileVersion: () => ACCESS_TEMPORAL_PROFILE, executeAccessTemporalWire(wire) { sent = wire; return ok(null); }});
  engine.parseAccessTemporal('date', '\ud800');
  expect(sent).toContain('55296');
  expect(sent).not.toContain('65533');
});

test('access-temporal facade fails closed on unrecognized Rust result codes', () => {
  const engine = createAccessTemporalEngine({
    accessTemporalProfileVersion: () => ACCESS_TEMPORAL_PROFILE,
    executeAccessTemporalWire: () => JSON.stringify({profile: 'umf.core-wire/1', status: 'error', code: 'INTERNAL', pathUnits: [], messageUnits: []}),
  });
  expect(() => engine.parseAccessTemporal('date', '2000-02-29')).toThrow('RUST_WIRE_ERROR:INTERNAL');
});
