// SPDX-License-Identifier: MIT OR Apache-2.0
// Source-only catalog-profile oracle. Builds two independent JS bundles from
// current TypeScript source, then compares their direct results and host traces.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

const root = resolve(import.meta.dirname, '../../..');
const temp = await mkdtemp(join(tmpdir(), 'umf-catalog-json-oracle-'));
const refBundle = join(temp, 'reference.mjs');
const defaultBundle = join(temp, 'default.mjs');
function build(entry, outfile) {
  const result = spawnSync('bun', ['build', entry, '--target=node', '--format=esm', `--outfile=${outfile}`], {cwd: root, encoding: 'utf8'});
  if (result.status !== 0) throw new Error(`Bun source build failed for ${entry}: ${result.stderr || result.stdout}`);
}
build('scripts/rust-migration/r8/catalog-profile-reference-entry.ts', refBundle);
build('scripts/rust-migration/r8/catalog-profile-default-entry.ts', defaultBundle);
const [{readCatalogJson: reference}, {readCatalogJson: defaultRoute}] = await Promise.all([
  import(pathToFileURL(refBundle)), import(pathToFileURL(defaultBundle)),
]);

const sentinel = Object.freeze({sentinel: 'catalog raw host read'});
const parseSentinel = Object.freeze({sentinel: 'catalog JSON.parse'});
let trace = [];
const note = (item) => trace.push(item);
const makeFrame = (initial, options = {}) => {
  const state = {text: initial, lengthReads: 0, indexReads: new Map(), sliceReads: 0, sliceCalls: 0};
  const target = Object.create(null);
  const proxy = new Proxy(target, {
    get(_target, key, receiver) {
      if (key === 'length') {
        state.lengthReads++;
        note(`length:${state.lengthReads}`);
        if (options.lengthThrowAt === state.lengthReads) throw sentinel;
        if (options.lengthValues?.length) return options.lengthValues[Math.min(state.lengthReads - 1, options.lengthValues.length - 1)];
        return state.text.length;
      }
      if (key === 'slice') {
        state.sliceReads++;
        note(`slice:get:${state.sliceReads}`);
        if (options.sliceGetterThrows) throw sentinel;
        return function(start, end) {
          state.sliceCalls++;
          note(`slice:call:${state.sliceCalls}:${this === proxy}:${start}:${end}`);
          if (options.sliceThrow) throw sentinel;
          const actual = state.text.slice(start, end);
          return options.sliceValues?.[state.sliceCalls - 1] ?? actual;
        };
      }
      if (typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key)) {
        const index = Number(key);
        const reads = (state.indexReads.get(index) ?? 0) + 1;
        state.indexReads.set(index, reads);
        note(`index:${index}:${reads}`);
        if (options.indexThrowAt === index) throw sentinel;
        if (options.changeIndexAt === index && reads > 1) return options.changedCharacter;
        return state.text[index];
      }
      if (key === Symbol.toPrimitive) {
        note('get:Symbol.toPrimitive');
        return (hint) => { note(`toPrimitive:${hint}`); return state.text; };
      }
      if (key === 'toString') {
        note('get:toString');
        return function() { note(`toString:${this === proxy}`); return state.text; };
      }
      note(`get:${String(key)}`);
      return Reflect.get(_target, key, receiver);
    },
  });
  return {proxy, state};
};

const cases = [
  ['primitive-ordered-output', () => '{"z":1,"a":[true,null,"x"]}'],
  ['primitive-nested-empty', () => '{"outer":{"inner":[]},"empty":{}}'],
  ['primitive-escaped-strings', () => '{"line":"a\\nb","unicode":"\\u0061"}'],
  ['primitive-duplicate-key', () => '{"x":1,"x":2}'],
  ['primitive-unsafe-integer', () => '{"x":9007199254740993}'],
  ['primitive-trailing-space', () => '[1,2]  '],
  ['primitive-dynamic-parse', () => '[1]'],
  ['raw-proxy-index-length-slice', () => makeFrame('{"a":"b"}').proxy],
  ['raw-stateful-length-reads', () => makeFrame('[1,2]', {lengthValues: [5, 4, 5, 5, 5, 5]}).proxy],
  ['raw-stateful-slice-reads', () => makeFrame('{"a":"x","b":"y"}', {sliceValues: ['"same"', '"x"', '"same"', '"y"']}).proxy],
  ['raw-length-getter-throws', () => makeFrame('[]', {lengthThrowAt: 1}).proxy],
  ['raw-index-getter-throws', () => makeFrame('[1]', {indexThrowAt: 0}).proxy],
  ['raw-slice-getter-throws', () => makeFrame('["x"]', {sliceGetterThrows: true}).proxy],
  ['raw-slice-call-throws', () => makeFrame('["x"]', {sliceThrow: true}).proxy],
  ['raw-stateful-index', () => makeFrame('[1]', {changeIndexAt: 1, changedCharacter: '2'}).proxy],
];

function digest(value) { return createHash('sha256').update(Buffer.from(value, 'utf16le')).digest('hex'); }
function shape(value, seen = new Map()) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    if (typeof value === 'string') return {type: 'string', utf16Length: value.length, utf16Sha256: digest(value)};
    if (typeof value === 'number' && Object.is(value, -0)) return {type: 'number', value: '-0'};
    if (typeof value === 'number' && Number.isNaN(value)) return {type: 'number', value: 'NaN'};
    return {type: value === null ? 'null' : typeof value, value: typeof value === 'bigint' || typeof value === 'symbol' ? String(value) : value};
  }
  if (seen.has(value)) return {type: 'reference', id: seen.get(value)};
  const id = seen.size; seen.set(value, id);
  const prototype = Object.getPrototypeOf(value);
  const keys = Reflect.ownKeys(value);
  return {
    type: Array.isArray(value) ? 'array' : typeof value, id,
    prototype: prototype === null ? 'null' : prototype === Array.prototype ? 'Array.prototype' : prototype === Object.prototype ? 'Object.prototype' : prototype?.constructor?.name ?? 'other',
    keys: keys.map((key) => typeof key === 'symbol' ? `symbol:${String(key)}` : key),
    descriptors: keys.map((key) => {
      const d = Object.getOwnPropertyDescriptor(value, key);
      return {key: typeof key === 'symbol' ? `symbol:${String(key)}` : key, enumerable: d.enumerable, configurable: d.configurable, writable: 'writable' in d ? d.writable : undefined, value: 'value' in d ? shape(d.value, seen) : undefined};
    }),
  };
}
function outcome(fn) {
  try { const raw = fn(); return {kind: 'return', raw, shape: shape(raw)}; }
  catch (raw) {
    return {kind: 'throw', raw, hasThrown: true, sentinelIdentity: raw === sentinel, parseSentinelIdentity: raw === parseSentinel,
      constructorName: raw?.constructor?.name, name: raw?.name, code: raw?.code, path: raw?.path, message: raw?.message, shape: shape(raw)};
  }
}
const comparableShape = (value) => {
  const copy = structuredClone(value);
  if (copy?.type === 'object' && Array.isArray(copy.descriptors)) {
    copy.descriptors = copy.descriptors.filter((item) => !['stack', 'originalLine', 'originalColumn', 'line', 'column', 'sourceURL'].includes(item.key));
  }
  return copy;
};
const compare = (left, right) => left.kind === right.kind &&
  JSON.stringify(comparableShape(left.shape)) === JSON.stringify(comparableShape(right.shape)) &&
  left.sentinelIdentity === right.sentinelIdentity && left.parseSentinelIdentity === right.parseSentinelIdentity &&
  (left.kind === 'return' ? isDeepStrictEqual(left.raw, right.raw) : left.constructorName === right.constructorName && left.name === right.name && left.code === right.code && left.path === right.path && left.message === right.message);

const rows = [];
for (const [id, makeSource] of cases) {
  const run = (fn) => {
    trace = [];
    const source = makeSource();
    const result = outcome(() => fn(source));
    return {result, trace: [...trace]};
  };
  let referenceRow, defaultRow;
  if (id === 'primitive-dynamic-parse') {
    const make = () => '[1]';
    const exec = (fn) => {
      trace = [];
      const original = Object.getOwnPropertyDescriptor(JSON, 'parse');
      const parseTrace = [];
      try {
        Object.defineProperty(JSON, 'parse', {configurable: true, get() { parseTrace.push('JSON.parse:get'); return function(text, ...rest) {
          parseTrace.push(`JSON.parse:call:${this === JSON}:${typeof text}`);
          if (text === '[1]') throw parseSentinel;
          return Reflect.apply(original.value, this, [text, ...rest]);
        }; }});
        const result = outcome(() => fn(make()));
        return {result, trace: [...trace, ...parseTrace]};
      } finally { Object.defineProperty(JSON, 'parse', original); }
    };
    referenceRow = exec(reference); defaultRow = exec(defaultRoute);
  } else {
    referenceRow = run(reference); defaultRow = run(defaultRoute);
  }
  const same = compare(referenceRow.result, defaultRow.result) && JSON.stringify(referenceRow.trace) === JSON.stringify(defaultRow.trace);
  rows.push({id, reference: {outcome: stripRaw(referenceRow.result), trace: referenceRow.trace}, default: {outcome: stripRaw(defaultRow.result), trace: defaultRow.trace}, matches: same});
}
function stripRaw(value) { const {raw: _raw, ...clean} = value; return clean; }

const pinPaths = [
  'src/model/serialization.ts', 'src/model/internal/scan-json-frame.ts', 'src/model/json.ts',
  'src/model/errors.ts', 'src/index-v4-default.ts',
  'scripts/rust-migration/r8/catalog-profile-reference-entry.ts',
  'scripts/rust-migration/r8/catalog-profile-default-entry.ts',
  'scripts/rust-migration/r8/read-json-value-catalog-packet.mjs',
];
const sourcePins = {};
for (const path of pinPaths) sourcePins[path] = createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
const result = {packet: 'r8-read-json-value-catalog-source-oracle-20261027-v1', runtime: {node: process.version, bun: process.versions.bun ?? null, v8: process.versions.v8}, sourcePins, count: rows.length, rows,
  scope: 'TypeScript reference and TypeScript default source bundles only; catalog profile forced synchronously around each call; no Rust, WASM, browser or installed SDK evidence.'};
await rm(temp, {recursive: true, force: true});
if (rows.some((row) => !row.matches)) process.exitCode = 1;
console.log(JSON.stringify(result, null, 2));
