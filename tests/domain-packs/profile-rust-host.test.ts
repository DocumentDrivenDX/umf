// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {createDomainPackProfileInspectionOperation} from '../../src/domain-packs/profile-rust';
const pack = () => ({
  id: 'profile-fixture', version: '1.0.0', domain_types: {identity: {}},
  sources: {source: {kind: 'external', data_kind: 'unknown', reference: 'urn:fixture:source', format: 'json'}},
});
const status = {valid: true, complete: false, diagnostics: []};

test('Rust profile wrapper preserves the synchronous API and serializes a copied JSON value', () => {
  const seen: unknown[] = [];
  const operations = createDomainPackProfileInspectionOperation(wire => {
    seen.push(JSON.parse(wire));
    return JSON.stringify(status);
  });
  expect(operations.inspectDomainPack.name).toBe('inspectDomainPack');
  expect(operations.inspectDomainPack.length).toBe(1);
  expect(operations.requireDomainPackProfile.name).toBe('requireDomainPackProfile');
  expect(operations.requireDomainPackProfile.length).toBe(1);
  expect(operations.inspectDomainPack(pack())).toEqual(status);
  expect(operations.requireDomainPackProfile(pack())).toEqual(status);
  expect(seen).toHaveLength(2);
});

test('profile host admission refuses all captured non-JSON shapes before dispatch', () => {
  const make = (change: (base: any) => unknown) => change(pack());
  const cases: Array<(base: any) => unknown> = [
    base => Object.defineProperty(base, 'future', {enumerable: true, get() { throw new Error('getter invoked'); }}),
    base => Object.defineProperty(base, 'toJSON', {enumerable: true, value() { throw new Error('toJSON invoked'); }}),
    base => Object.assign(Object.create({future: true}), base),
    base => { base[Symbol('opaque')] = 'x'; return base; },
    base => { base.future = new Array(1); return base; },
    base => { const child: any = {}; child.self = child; base.future = child; return base; },
    base => { base.future = Number.NaN; return base; },
    base => { base.future = -0; return base; },
    base => { base.future = Number.MAX_SAFE_INTEGER + 1; return base; },
    base => { let node: any = {}; const root = node; for (let i = 0; i < 130; i++) node = node.child = {}; base.future = root; return base; },
  ];
  let getters = 0;
  let dispatched = 0;
  const inspector = createDomainPackProfileInspectionOperation(wire => {
    dispatched++;
    return JSON.stringify(status);
  });
  const results = cases.map(change => {
    const input = change === cases[0]
      ? Object.defineProperty(pack(), 'future', {enumerable: true, get() { getters++; return 'x'; }})
      : change === cases[1]
        ? Object.defineProperty(pack(), 'toJSON', {enumerable: true, value() { getters++; return {}; }})
        : make(change);
    const result = inspector.inspectDomainPack(input);
    expect(result.valid).toBe(false);
    expect(result.diagnostics[0]).toMatch(/^UmfError:/);
    return result;
  });
  expect(results).toHaveLength(10);
  expect(getters).toBe(0);
  expect(dispatched).toBe(0);
});

test('internal Rust failures map to the reference malformed-profile result; missing binding still fails at construction', () => {
  const inspector = createDomainPackProfileInspectionOperation(() => { throw new Error('internal failure'); });
  expect(inspector.inspectDomainPack(pack())).toEqual({valid: false, complete: false, diagnostics: ['Malformed execution profile']});
  expect(() => inspector.requireDomainPackProfile(pack())).toThrow(expect.objectContaining({
    name: 'UmfError', code: 'DOMAIN_PACK_PROFILE', message: 'Malformed execution profile',
  }));
  expect(() => createDomainPackProfileInspectionOperation(undefined as any)).toThrow('A Rust domain-pack profile inspector is required');
});
