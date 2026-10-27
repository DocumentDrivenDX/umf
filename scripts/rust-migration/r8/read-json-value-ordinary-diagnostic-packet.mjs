// SPDX-License-Identifier: MIT OR Apache-2.0
// Source-only oracle for ordinary parser diagnostics after permissive live JSON.parse.
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

const root = resolve(import.meta.dirname, '../../..');
const temp = await mkdtemp(join(tmpdir(), 'umf-ordinary-diagnostic-'));
const refBundle = join(temp, 'reference.mjs');
const defaultBundle = join(temp, 'default.mjs');
function build(entry, outfile) {
  const built = spawnSync('bun', ['build', entry, '--target=node', '--format=esm', `--outfile=${outfile}`], {cwd: root, encoding: 'utf8'});
  if (built.status !== 0) throw new Error(`Bun source build failed for ${entry}: ${built.stderr || built.stdout}`);
}
build('scripts/rust-migration/r8/ordinary-diagnostic-reference-entry.ts', refBundle);
build('scripts/rust-migration/r8/ordinary-diagnostic-default-entry.ts', defaultBundle);
const [{readOrdinaryJson: reference, isUmfError: referenceUmfError}, {readOrdinaryJson: defaultRoute, isUmfError: defaultUmfError}] = await Promise.all([
  import(pathToFileURL(refBundle)), import(pathToFileURL(defaultBundle)),
]);

// Input strings are intentionally malformed JSON. The live accessor returns a
// permissive parser that accepts every source, exposing YAML parser diagnostics.
const cases = [
  ['map-empty-head', '{'],
  ['map-missing-value', '{"a":}'],
  ['map-truncated-key', '{"a": 1, "b"'],
  ['map-missing-colon', '{"a" 1}'],
  ['map-trailing-comma', '{"a":1,}'],
  ['map-adjacent-members', '{"a":1 "b":2}'],
  ['map-unquoted-key', '{a:1}'],
  ['map-comment-line', '{"a":1 // trailing comment\n}'],
  ['map-comment-hash', '{"a":1 # trailing comment\n}'],
  ['map-block-comment', '{/* comment */"a":1}'],
  ['map-single-quoted-key', "{'a':1}"],
  ['map-unterminated-key', '{"a:1}'],
  ['map-unterminated-double-value', '{"a":"value}'],
  ['map-single-quoted-value', '{"a":' + "'value'" + '}'],
  ['map-bad-escape', '{"a":"\\q"}'],
  ['sequence-empty-head', '['],
  ['sequence-leading-comma', '[,1]'],
  ['sequence-double-comma', '[1,,2]'],
  ['sequence-trailing-comma', '[1,]'],
  ['sequence-missing-separator', '[1 2]'],
  ['sequence-truncated-nested-map', '[{"a":1]'],
  ['sequence-comment-between-values', '[1 // comment\n,2]'],
  ['nested-map-truncated-inner', '{"a":{"b":1}'],
  ['nested-sequence-truncated-inner', '{"a":[1,2}'],
  ['nested-flow-mixed-truncated', '[{"a":[1,{"b":2}]}'],
  ['nested-extra-close', '{"a":[1,2]]}'],
  ['multiline-map-missing-value', '{\n  "first": 1,\n  "second":\n}'],
  ['multiline-sequence-truncated', '[\n  1,\n  {"x": 2\n]'],
  ['multiline-comment-separator', '[1,\n // comment\n 2,]'],
  ['unicode-key-bad-member', '{"名":1, "壊れ":}'],
  ['unicode-astral-truncated-quote', '{"😀":"値}'],
  ['unicode-line-separator', '["a\u2028b",]'],
  ['unicode-crlf-comment', '{\r\n "é": 1, // comment\r\n}'],
  ['quote-unclosed-single', "['unterminated]"],
  ['quote-unclosed-double', '["unterminated]'],
  ['quote-after-escape-truncated', '["trailing\\'],
  ['truncated-exponent', '[1e+]'],
  ['truncated-literal', '[tru]'],
  ['leading-zero', '[01]'],
  ['valid-json-control', '{"ok":[1,true,null,"x"]}'],
];

function shape(value, seen = new Map()) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    if (typeof value === 'string') return {type: 'string', utf16Length: value.length, utf16Sha256: createHash('sha256').update(Buffer.from(value, 'utf16le')).digest('hex')};
    if (typeof value === 'number' && Object.is(value, -0)) return {type: 'number', value: '-0'};
    return {type: value === null ? 'null' : typeof value, value};
  }
  if (seen.has(value)) return {type: 'reference', id: seen.get(value)};
  const id = seen.size; seen.set(value, id);
  const proto = Object.getPrototypeOf(value);
  const keys = Reflect.ownKeys(value);
  return {type: Array.isArray(value) ? 'array' : typeof value, id,
    prototype: proto === null ? 'null' : proto === Array.prototype ? 'Array.prototype' : proto === Object.prototype ? 'Object.prototype' : proto?.constructor?.name ?? 'other',
    keys: keys.map((key) => typeof key === 'symbol' ? `symbol:${String(key)}` : key),
    descriptors: keys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return {key: typeof key === 'symbol' ? `symbol:${String(key)}` : key, enumerable: descriptor.enumerable, configurable: descriptor.configurable,
        writable: 'writable' in descriptor ? descriptor.writable : undefined,
        value: 'value' in descriptor ? shape(descriptor.value, seen) : undefined};
    }),
  };
}

function observe(route, isError, source) {
  const events = [];
  const prior = Object.getOwnPropertyDescriptor(JSON, 'parse');
  try {
    Object.defineProperty(JSON, 'parse', {
      configurable: true,
      get() {
        const event = {event: 'get:JSON.parse'};
        events.push(event);
        return function permissiveParse(value, ...rest) {
          events.push({event: 'call:JSON.parse', receiverIsJSON: this === JSON, argumentType: typeof value, argument: value, restCount: rest.length});
          return null;
        };
      },
    });
    try {
      const value = route(source);
      return {kind: 'return', shape: shape(value), events, raw: value};
    } catch (error) {
      return {kind: 'throw', isUmfError: isError(error), constructorName: error?.constructor?.name,
        name: error?.name, code: error?.code, path: error?.path, message: error?.message, events, raw: error};
    }
  } finally {
    Object.defineProperty(JSON, 'parse', prior);
  }
}
const rows = cases.map(([id, source]) => {
  const expected = observe(reference, referenceUmfError, source);
  const actual = observe(defaultRoute, defaultUmfError, source);
  const same = expected.kind === actual.kind && JSON.stringify({...expected, raw: undefined}) === JSON.stringify({...actual, raw: undefined}) &&
    (expected.kind === 'return' ? isDeepStrictEqual(expected.raw, actual.raw) : expected.isUmfError === actual.isUmfError);
  const clean = ({raw: _raw, ...result}) => result;
  return {id, source, reference: clean(expected), default: clean(actual), matches: same};
});

const pins = [
  'src/model/serialization.ts', 'src/model/errors.ts', 'src/index-v4-default.ts',
  'scripts/rust-migration/r8/ordinary-diagnostic-reference-entry.ts',
  'scripts/rust-migration/r8/ordinary-diagnostic-default-entry.ts',
  'scripts/rust-migration/r8/read-json-value-ordinary-diagnostic-packet.mjs',
];
const sourcePins = {};
for (const path of pins) sourcePins[path] = createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
const result = {packet: 'r8-read-json-value-ordinary-diagnostic-source-oracle-20261027-v1',
  runtime: {node: process.version, bun: process.versions.bun ?? null, v8: process.versions.v8},
  mode: 'ordinary-profile; format=json; dynamic JSON.parse getter returns null for every source; malformed JSON then reaches YAML diagnostics',
  sourcePins, count: rows.length, rows,
  scope: 'TypeScript reference/default source bundles only; no Rust, WASM, Chromium, installed SDK, or release evidence.'};
await rm(temp, {recursive: true, force: true});
if (rows.some((row) => !row.matches)) process.exitCode = 1;
console.log(JSON.stringify(result, null, 2));
