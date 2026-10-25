// SPDX-License-Identifier: MIT OR Apache-2.0
// Immutable Bun predecessor packet for the opt-in umf-128/1 TypeScript family.
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import * as bit from '../../../../src/model/bit128';
import * as uuid from '../../../../src/model/uuid';

const root = resolve(import.meta.dir, '../../../../');
const packetPath = resolve(import.meta.dir, 'predecessor.json');
const sourcePaths = [
  'src/model/bit128.ts',
  'src/model/uuid.ts',
  'tests/bit128.test.ts',
  'tests/uuid.test.ts',
  'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'
];
const hex = '8000000000000000ffffffffffffffff';
const uuidText = '80000000-0000-0000-ffff-ffffffffffff';
const must: (ok: unknown, message: string) => asserts ok = (ok, message) => { if (!ok) throw new Error(message); };
const shape = (value: object) => ({
  prototype: Object.getPrototypeOf(value) === Object.prototype ? 'Object.prototype' : Object.getPrototypeOf(value) === null ? 'null' : Object.getPrototypeOf(value)?.constructor?.name ?? 'other',
  frozen: Object.isFrozen(value),
  keys: Object.keys(value),
  descriptors: Object.fromEntries(Object.keys(value).map(k => [k, Object.getOwnPropertyDescriptor(value, k)?.writable === false ? 'readonly' : 'mutable']))
});
const outcome = (fn: () => unknown) => {
  try { const value = fn(); return {ok: true, value: normalize(value)}; }
  catch (e) {
    const error = e as {name?: string;code?: string;message?: string;path?: unknown};
    return {ok: false, error: {name: error.name, code: error.code, message: error.message, ...(Object.hasOwn(error, 'path') ? {path: error.path} : {})}};
  }
};
function normalize(value: unknown): unknown {
  if (value instanceof Uint8Array) return {type: value.constructor.name, bytes: Array.from(value), shape: shape(value)};
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return {
    ...Object.fromEntries(Object.keys(value).map(key => [key, normalize((value as Record<string, unknown>)[key])])),
    $shape: shape(value)
  };
  return value;
}
function run() {
  const parsed = bit.parseBits128(hex);
  const parsedUuid = uuid.parseUuid(uuidText);
  const wordsUnsigned = bit.bits128ToWords(parsed, false);
  const wordsSigned = bit.bits128ToWords(parsed, true);
  const integerUnsigned = bit.bits128ToInteger(parsed, false);
  const integerSigned = bit.bits128ToInteger(parsed, true);
  const bytes = Uint8Array.from({length: 20}, (_, i) => i);
  const view = new Uint8Array(bytes.buffer, 2, 16);
  const fromView = bit.bits128FromBytes(view);
  view[0] = 255;
  const isolated = bit.bits128ToBytes(fromView);
  must(fromView.hex === '02030405060708090a0b0c0d0e0f1011', 'typed-array offset snapshot');
  must(isolated[0] === 2, 'byte copy isolation');
  class ByteSubclass extends Uint8Array {}
  must(bit.bits128FromBytes(new ByteSubclass(new Uint8Array(16))).hex === '0'.repeat(32), 'Uint8Array subclass');
  const cases: Record<string, unknown> = {
    parseBits128: outcome(() => bit.parseBits128(hex.toUpperCase())),
    parseUuid: outcome(() => uuid.parseUuid(uuidText.toUpperCase())),
    bits128FromBytes: outcome(() => fromView),
    bits128ToBytes: outcome(() => bit.bits128ToBytes(parsed)),
    uuidFromBits128: outcome(() => uuid.uuidFromBits128(parsed)),
    uuidToBits128: outcome(() => uuid.uuidToBits128(parsedUuid)),
    compareBits128: outcome(() => [bit.compareBits128(bit.parseBits128('0'.repeat(32)), parsed), bit.compareBits128(parsed, parsed), bit.compareBits128(parsed, bit.parseBits128('f'.repeat(32)))]),
    bits128ToWords: outcome(() => ({unsigned: wordsUnsigned, signed: wordsSigned, unsignedShape: shape(wordsUnsigned), signedShape: shape(wordsSigned)})),
    bits128FromWords: outcome(() => ({unsigned: bit.bits128FromWords(wordsUnsigned, false), signed: bit.bits128FromWords(wordsSigned, true)})),
    bits128ToInteger: outcome(() => ({unsigned: integerUnsigned, signed: integerSigned, unsignedShape: shape(integerUnsigned), signedShape: shape(integerSigned)})),
    bits128FromInteger: outcome(() => ({zero: bit.bits128FromInteger({integerToken: '0'}, false), maxUnsigned: bit.bits128FromInteger({integerToken: '340282366920938463463374607431768211455'}, false), minSigned: bit.bits128FromInteger({integerToken: '-170141183460469231731687303715884105728'}, true)})),
    typedArray: {offset: fromView.hex, subclass: 'accepted', copiedBeforeMutation: isolated[0] === 2},
    descriptorAndErrorOrder: {
      bitProfileBeforeHex: outcome(() => bit.bits128ToBytes({profile: 'other', get hex() { throw new Error('getter ran'); }} as never)),
      bitAccessorWithExtra: outcome(() => bit.bits128ToBytes({profile: bit.BIT128_PROFILE, get hex() { throw new Error('getter ran'); }, extra: true} as never)),
      uuidOriginalBeforeConsistency: outcome(() => uuid.uuidToBits128({profile: bit.BIT128_PROFILE, hex: '0'.repeat(32), canonicalText: '0'.repeat(8)+'-0000-0000-0000-000000000000', originalText: 'x'} as never)),
      symbolMember: outcome(() => bit.bits128ToBytes(Object.assign({profile: bit.BIT128_PROFILE, hex: '0'.repeat(32)}, {[Symbol('x')]: 1}) as never)),
      integerShapeBeforeType: outcome(() => bit.bits128FromInteger({integerToken: 1n, extra: true} as never, false)),
      wordsShapeBeforeAccessor: outcome(() => bit.bits128FromWords({get high() { throw new Error('getter ran'); }, low: '0', extra: true} as never, false))
    },
    syntaxAndBoundaries: {
      utf16SurrogateBits: outcome(() => bit.parseBits128('0'.repeat(31) + '\ud800')),
      uuidUpperOriginal: parsedUuid.originalText,
      negativeZeroInteger: outcome(() => bit.bits128FromInteger({integerToken: '-0'}, true)),
      noncanonicalInteger: outcome(() => bit.bits128FromInteger({integerToken: '01'}, false)),
      unsignedOverflow: outcome(() => bit.bits128FromInteger({integerToken: '340282366920938463463374607431768211456'}, false)),
      signedMinimumAndMaximum: [bit.bits128FromInteger({integerToken: '-170141183460469231731687303715884105728'}, true).hex, bit.bits128FromInteger({integerToken: '170141183460469231731687303715884105727'}, true).hex],
      signedWordMinimumAndMaximum: [bit.bits128FromWords({high: '-9223372036854775808', low: '9223372036854775807'}, true).hex, bit.bits128FromWords({high: '9223372036854775807', low: '-9223372036854775808'}, true).hex],
      invalidSignedness: outcome(() => bit.bits128ToWords(parsed, 0 as never))
    }
  };
  must(Object.keys(cases).slice(0, 11).join(',') === 'parseBits128,parseUuid,bits128FromBytes,bits128ToBytes,uuidFromBits128,uuidToBits128,compareBits128,bits128ToWords,bits128FromWords,bits128ToInteger,bits128FromInteger', 'public function inventory');
  must(bit.BIT128_PROFILE === 'umf-128/1', 'profile identity');
  return {format: 'umf-bit128-default-route-predecessor/1', runtime: `Bun ${Bun.version}`, profile: bit.BIT128_PROFILE, publicFunctions: Object.keys(cases).slice(0, 11), cases};
}
const digest = async (path: string) => createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
const sourceClosure = Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, await digest(path)])));
const packet = {...run(), sourceClosure};
const bytes = `${JSON.stringify(packet, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const frozen = await readFile(packetPath, 'utf8');
  must(frozen === bytes, 'frozen packet differs: predecessor.json or a source-closure file changed');
  console.log(`PASS predecessor packet and ${sourcePaths.length} authority hashes verified`);
} else if (process.argv.includes('--freeze')) {
  await writeFile(packetPath, bytes);
  console.log(`FROZEN ${packetPath}`);
} else {
  console.log(bytes);
}
