import {expect, test} from 'bun:test';
import {createCoreKeyTupleOperations as nodeOperations} from '../src/core-key-tuple.js';
import {createCoreKeyTupleOperations as wasmOperations} from '../../wasm/src/core-key-tuple.js';

for (const [host, factory] of [['Node/Bun', nodeOperations], ['WASM', wasmOperations]]) {
  test(`${host} routes direct tuple operations and returns byte arrays`, () => {
    const calls = [];
    const api = factory((op, args) => {
      calls.push([op, args]);
      return op === 'model/readCoreKeyTupleBytes' ? [0x55, 0x4d] : {receipt: true};
    });
    const source = {umf: '0.10.0'}, identity = {module: 'm', element: 'r', key: 'k'}, values = [{string: 'x'}];
    expect(api.encodeCoreKeyTuple(source, identity, values)).toEqual({receipt: true});
    expect(api.encodeCoreKeyTuple(source, identity, values, {profile: 'umf-key-tuple-v2'})).toEqual({receipt: true});
    expect(api.verifyCoreKeyTuple('receipt', source)).toEqual({receipt: true});
    expect(Array.from(api.readCoreKeyTupleBytes('receipt', source))).toEqual([0x55, 0x4d]);
    expect(calls).toEqual([
      ['model/encodeCoreKeyTuple', {source, identity, values}],
      ['model/encodeCoreKeyTuple', {source, identity, values, options: {profile: 'umf-key-tuple-v2'}}],
      ['model/verifyCoreKeyTuple', {receipt: 'receipt', current: source}],
      ['model/readCoreKeyTupleBytes', {receipt: 'receipt', current: source}],
    ]);
  });

  test(`${host} prepared tuple handle owns and freezes the Rust-admitted source`, () => {
    const original = {umf: '0.10.0', modules: [{elements: [{id: 'r'}]}]};
    const calls = [];
    const api = factory((op, args) => {
      calls.push([op, args]);
      return op === 'model/prepareCoreKeyTuples' ? structuredClone(original) : {ok: true};
    });
    const prepared = api.prepareCoreKeyTuples(original);
    original.modules[0].elements[0].id = 'changed';
    expect(prepared.profile).toBe('umf.core.key-tuples.prepared/1');
    expect(prepared.source.modules[0].elements[0].id).toBe('r');
    expect(Object.isFrozen(prepared.source)).toBe(true);
    expect(Object.isFrozen(prepared.source.modules[0].elements[0])).toBe(true);
    expect(prepared.encode({module: 'm', element: 'r', key: 'k'}, [{string: 'v'}])).toEqual({ok: true});
    expect(prepared.verify('receipt')).toEqual({ok: true});
    expect(calls.map(([op]) => op)).toEqual([
      'model/prepareCoreKeyTuples',
      'model/encodePreparedCoreKeyTuple',
      'model/verifyPreparedCoreKeyTuple',
    ]);
    expect(calls[1][1].source).toBe(prepared.source);
    expect(calls[2][1].source).toBe(prepared.source);
  });

  test(`${host} native prepared tuple wrapper keeps the Rust handle private`, () => {
    const original = {umf: '0.10.0', modules: [{elements: [{id: 'r'}]}]};
    const retained = structuredClone(original);
    const nativeCalls = [];
    const native = {
      prepare(source) {
        nativeCalls.push(['prepare', source]);
        return {
          source: retained,
          encode(identity, values) { nativeCalls.push(['encode', identity, values]); return {rust: 'encoded'}; },
          verify(receipt) { nativeCalls.push(['verify', receipt]); return {rust: 'verified'}; },
        };
      },
    };
    const api = factory(() => { throw new Error('tagged fallback must not run'); }, native);
    const prepared = api.prepareCoreKeyTuples(original);
    original.modules[0].elements[0].id = 'changed';
    expect(Object.keys(prepared)).toEqual(['profile', 'source', 'encode', 'verify']);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.source)).toBe(true);
    expect(prepared.source.modules[0].elements[0].id).toBe('r');
    expect(prepared.encode({module: 'm'}, [{string: 'v'}])).toEqual({rust: 'encoded'});
    expect(prepared.verify('receipt')).toEqual({rust: 'verified'});
    expect(nativeCalls.map(([name]) => name)).toEqual(['prepare', 'encode', 'verify']);
  });

  test(`${host} validates a receipt before observing current`, () => {
    let currentRead = false;
    const native = {
      prepareRead(receipt) {
        if (receipt !== 'valid') throw Object.assign(new Error('bad receipt'), {code: 'KEY_TUPLE_RECEIPT'});
        return {readBytes(current) { return new Uint8Array([current.value]); }};
      },
    };
    const api = factory(() => { throw new Error('tagged fallback must not run'); }, native);
    const current = {};
    Object.defineProperty(current, 'value', {enumerable: true, get() { currentRead = true; return 0x55; }});
    expect(() => api.readCoreKeyTupleBytes('invalid', current)).toThrow();
    expect(currentRead).toBe(false);
    expect(Array.from(api.readCoreKeyTupleBytes('valid', current))).toEqual([0x55]);
    expect(currentRead).toBe(true);
  });
}
