import {describe, expect, test} from 'bun:test';
import {createHostReadResponseFrames, HOST_READ_RESPONSE_FRAME_UNITS} from '../src/wire.js';
import {createHostReadResponseFrames as createWasmHostReadResponseFrames} from '../../wasm/src/wire.js';

function descriptor(value) {
  const fields = value.split('|');
  expect(fields[0]).toBe('UMF-HOST-READ-V3');
  return fields;
}

function frame(value) {
  const [prefix, token, offset, count, hex] = value.split('|');
  expect(prefix).toBe('UMF-HOST-FRAME-V3');
  return {token: Number(token), offset: Number(offset), count: Number(count), hex};
}

function decodeHex(hex) {
  return Array.from({length: hex.length / 4}, (_, index) => Number.parseInt(hex.slice(index * 4, index * 4 + 4), 16));
}

describe('V3 host response frames', () => {
  test('keeps full strings in the host and serves bounded, exact UTF-16 frames', () => {
    const text = 'a'.repeat(HOST_READ_RESPONSE_FRAME_UNITS - 1) + '😀z';
    const session = createHostReadResponseFrames(() => text);
    const [, kind, tokenText, lengthText] = descriptor(session.dispatcher('DigestText'));
    expect(kind).toBe('string');
    const token = Number(tokenText);
    expect(Number(lengthText)).toBe(text.length);

    const first = frame(session.dispatcher('__umf_host_read_v3_frame__', `${token}:0:${HOST_READ_RESPONSE_FRAME_UNITS}`));
    expect(first.token).toBe(token);
    expect(first.offset).toBe(0);
    expect(first.count).toBe(HOST_READ_RESPONSE_FRAME_UNITS - 1);
    expect(first.hex).toHaveLength(first.count * 4);

    const second = frame(session.dispatcher('__umf_host_read_v3_frame__', `${token}:${first.count}:${HOST_READ_RESPONSE_FRAME_UNITS}`));
    expect(second.offset).toBe(first.count);
    expect(second.count).toBe(3);
    expect(decodeHex(second.hex)).toEqual([0xd83d, 0xde00, 0x7a]);
    expect(() => session.dispatcher('__umf_host_read_v3_frame__', `${token}:${first.count}:${HOST_READ_RESPONSE_FRAME_UNITS}`)).toThrow();
    session.dispose();
  });

  test('captures selection entries once and rejects token, offset, and frame-size mutations', () => {
    let reads = 0;
    const session = createHostReadResponseFrames(() => {
      reads++;
      return ['module.one', 'module.two'];
    });
    const [, kind, tokenText, countText] = descriptor(session.dispatcher('SelectRecords'));
    const token = Number(tokenText);
    expect(kind).toBe('array');
    expect(countText).toBe('2');
    expect(reads).toBe(1);

    const [, itemKind, itemTokenText, itemLength] = descriptor(
      session.dispatcher('__umf_host_read_v3_array_item__', `${token}:0`),
    );
    expect(itemKind).toBe('string');
    const itemToken = Number(itemTokenText);
    expect(Number(itemLength)).toBe('module.one'.length);
    const actualFrame = frame(session.dispatcher('__umf_host_read_v3_frame__', `${itemToken}:0:${HOST_READ_RESPONSE_FRAME_UNITS}`));
    expect(decodeHex(actualFrame.hex)).toEqual(Array.from('module.one', character => character.charCodeAt(0)));
    expect(() => session.dispatcher('__umf_host_read_v3_array_item__', `${token}:0`)).toThrow();
    expect(() => session.dispatcher('__umf_host_read_v3_frame__', `${itemToken}:0:1`)).toThrow();
    expect(reads).toBe(1);
    session.dispose();
    expect(() => session.dispatcher('__umf_host_read_v3_frame__', `${itemToken}:0:${HOST_READ_RESPONSE_FRAME_UNITS}`)).toThrow();
  });

  test('WASM host adapter keeps raw strings and emits the same bounded frame shape', () => {
    const text = 'x'.repeat(HOST_READ_RESPONSE_FRAME_UNITS + 1);
    const session = createWasmHostReadResponseFrames(() => text);
    const [, kind, tokenText, unitsText] = descriptor(session.dispatcher('DigestText'));
    expect([kind, Number(unitsText)]).toEqual(['string', text.length]);
    const token = Number(tokenText);
    const first = frame(session.dispatcher('__umf_host_read_v3_frame__', `${token}:0:${HOST_READ_RESPONSE_FRAME_UNITS}`));
    expect([first.token, first.offset, first.count]).toEqual([token, 0, HOST_READ_RESPONSE_FRAME_UNITS]);
    expect(first.hex).toHaveLength(first.count * 4);
    const second = frame(session.dispatcher('__umf_host_read_v3_frame__', `${token}:${first.count}:${HOST_READ_RESPONSE_FRAME_UNITS}`));
    expect([second.token, second.offset, second.count]).toEqual([token, HOST_READ_RESPONSE_FRAME_UNITS, 1]);
    session.dispose();
  });

  test('captured own-property test survives callback mutation of Object.hasOwn', () => {
    const original = Object.hasOwn;
    let descriptor;
    try {
      Object.hasOwn = () => { throw new Error('mutable Object.hasOwn was called'); };
      const session = createHostReadResponseFrames(() => ['captured']);
      descriptor = session.dispatcher('SelectRecords');
      session.dispose();
    } finally {
      Object.hasOwn = original;
    }
    expect(descriptor).toBe('UMF-HOST-READ-V3|array|1|1|8');
  });

  test('array admission rejects sparse, extended, accessor, symbol, and subclass arrays before copying', () => {
    const session = createHostReadResponseFrames((_event, value) => value);
    const sparse = [];
    sparse.length = 0xffffffff;
    const extended = ['ok'];
    extended.extra = true;
    const symbolKeyed = ['ok'];
    symbolKeyed[Symbol('extra')] = true;
    const hiddenIndex = ['ok'];
    Object.defineProperty(hiddenIndex, '0', {value: 'ok', enumerable: false});
    class SpecialArray extends Array {}
    const subclass = new SpecialArray('ok');
    for (const value of [sparse, extended, symbolKeyed, hiddenIndex, subclass]) {
      expect(() => session.dispatcher('SelectRecords', value)).toThrow();
    }
    session.dispose();
  });

  test('array snapshot uses captured intrinsics after the host callback mutates globals', () => {
    const originalGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    const originalOwnKeys = Reflect.ownKeys;
    const source = ['module.one'];
    let response;
    try {
      const session = createHostReadResponseFrames(() => {
        Object.getOwnPropertyDescriptor = () => { throw new Error('mutable descriptor intrinsic was called'); };
        Reflect.ownKeys = () => { throw new Error('mutable ownKeys intrinsic was called'); };
        return source;
      });
      response = session.dispatcher('SelectRecords');
      session.dispose();
    } finally {
      Object.getOwnPropertyDescriptor = originalGetOwnPropertyDescriptor;
      Reflect.ownKeys = originalOwnKeys;
    }
    expect(response).toBe('UMF-HOST-READ-V3|array|1|1|10');
  });

  test('array snapshot defines own entries despite a host-installed inherited numeric setter', () => {
    const original = Object.getOwnPropertyDescriptor(Array.prototype, '0');
    let setterCalls = 0;
    let response;
    try {
      const session = createHostReadResponseFrames(() => {
        Object.defineProperty(Array.prototype, '0', {set() { setterCalls++; }, configurable: true});
        return ['module.one'];
      });
      response = session.dispatcher('SelectRecords');
      session.dispose();
    } finally {
      if (original) Object.defineProperty(Array.prototype, '0', original);
      else delete Array.prototype[0];
    }
    expect(response).toBe('UMF-HOST-READ-V3|array|1|1|10');
    expect(setterCalls).toBe(0);
  });

  test('frame reads use captured numeric, string, allocation, and freeze intrinsics', () => {
    const originals = {
      safeInteger: Number.isSafeInteger,
      min: Math.min,
      charCodeAt: String.prototype.charCodeAt,
      uint16Array: globalThis.Uint16Array,
      freeze: Object.freeze,
      regexpTest: RegExp.prototype.test,
      stringSplit: String.prototype.split,
      mapGet: Map.prototype.get,
      mapDelete: Map.prototype.delete,
    };
    let response;
    let actualFrame;
    try {
      const session = createHostReadResponseFrames(() => {
        Number.isSafeInteger = () => { throw new Error('mutable integer intrinsic was called'); };
        Math.min = () => { throw new Error('mutable minimum intrinsic was called'); };
        String.prototype.charCodeAt = () => { throw new Error('mutable string intrinsic was called'); };
        globalThis.Uint16Array = () => { throw new Error('mutable typed-array intrinsic was called'); };
        Object.freeze = () => { throw new Error('mutable freeze intrinsic was called'); };
        RegExp.prototype.test = () => { throw new Error('mutable regex intrinsic was called'); };
        String.prototype.split = () => { throw new Error('mutable split intrinsic was called'); };
        Map.prototype.get = () => { throw new Error('mutable map intrinsic was called'); };
        Map.prototype.delete = () => { throw new Error('mutable map intrinsic was called'); };
        return 'abc';
      });
      response = session.dispatcher('DigestText');
      actualFrame = session.dispatcher('__umf_host_read_v3_frame__', `1:0:${HOST_READ_RESPONSE_FRAME_UNITS}`);
      session.dispose();
    } finally {
      Number.isSafeInteger = originals.safeInteger;
      Math.min = originals.min;
      String.prototype.charCodeAt = originals.charCodeAt;
      globalThis.Uint16Array = originals.uint16Array;
      Object.freeze = originals.freeze;
      RegExp.prototype.test = originals.regexpTest;
      String.prototype.split = originals.stringSplit;
      Map.prototype.get = originals.mapGet;
      Map.prototype.delete = originals.mapDelete;
    }
    expect(descriptor(response)[1]).toBe('string');
    expect(decodeHex(frame(actualFrame).hex)).toEqual([97, 98, 99]);
  });

  test('does not consult live Uint16Array after a host getter poisons it', () => {
    const original = globalThis.Uint16Array;
    let result;
    try {
      const session = createHostReadResponseFrames(() => {
        globalThis.Uint16Array = () => { throw new Error('live Uint16Array was consulted'); };
        return 'A\ud800';
      });
      const [, , token] = descriptor(session.dispatcher('DigestText'));
      result = session.dispatcher('__umf_host_read_v3_frame__', `${token}:0:${HOST_READ_RESPONSE_FRAME_UNITS}`);
      session.dispose();
    } finally {
      globalThis.Uint16Array = original;
    }
    expect(decodeHex(frame(result).hex)).toEqual([0x41, 0xd800]);
  });

  test('abort recognition requires an ordinary enumerable one-property data object', () => {
    const session = createHostReadResponseFrames((_event, value) => value);
    const hidden = {};
    Object.defineProperty(hidden, 'kind', {value: 'umf.host-abort/3', enumerable: false});
    class AbortSubclass { constructor() { this.kind = 'umf.host-abort/3'; } }
    expect(() => session.dispatcher('Abort', hidden)).toThrow();
    expect(() => session.dispatcher('Abort', new AbortSubclass())).toThrow();
    expect(session.dispatcher('Abort', {kind: 'umf.host-abort/3'})).toBe('UMF-HOST-READ-V3|abort');
    session.dispose();
  });
});
