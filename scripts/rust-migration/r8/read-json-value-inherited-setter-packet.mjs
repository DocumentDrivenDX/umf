// SPDX-License-Identifier: MIT OR Apache-2.0
// Source-only oracle for inherited Array.prototype[0] setter effects during parsing.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

const root = resolve(import.meta.dirname, '../../..');
const temp = await mkdtemp(join(tmpdir(), 'umf-inherited-setter-'));
const refBundle = join(temp, 'reference.mjs');
const defaultBundle = join(temp, 'default.mjs');
function build(entry, outfile) {
  const built = spawnSync('bun', ['build', entry, '--target=node', '--format=esm', `--outfile=${outfile}`], {cwd: root, encoding: 'utf8'});
  if (built.status !== 0) throw new Error(`Bun source build failed for ${entry}: ${built.stderr || built.stdout}`);
}
build('scripts/rust-migration/r8/inherited-setter-reference-entry.ts', refBundle);
build('scripts/rust-migration/r8/inherited-setter-default-entry.ts', defaultBundle);
const [{read: reference, isUmfError: refIsUmfError}, {read: defaultRoute, isUmfError: defaultIsUmfError}] = await Promise.all([
  import(pathToFileURL(refBundle)), import(pathToFileURL(defaultBundle)),
]);

const inputs = [
  ['yaml-null', 'null\n', 'yaml'], ['yaml-boolean', 'true\n', 'yaml'],
  ['yaml-number', '41\n', 'yaml'], ['yaml-string', 'word\n', 'yaml'],
  ['yaml-empty-document', '', 'yaml'], ['yaml-empty-flow-array', '[]\n', 'yaml'],
  ['yaml-flow-array-one', '[41]\n', 'yaml'], ['yaml-flow-array-two', '[41,42]\n', 'yaml'],
  ['yaml-nested-flow-arrays', '[[1],[2]]\n', 'yaml'], ['yaml-block-array-two', '- 41\n- 42\n', 'yaml'],
  ['yaml-block-map-two', 'a: 1\nb: 2\n', 'yaml'], ['yaml-flow-map-two', '{a: 1, b: 2}\n', 'yaml'],
  ['yaml-flow-map-nested', '{a: [1, 2], b: {c: 3}}\n', 'yaml'],
  ['yaml-block-array-of-maps', '- a: 1\n- b: 2\n', 'yaml'],
  ['json-null', 'null', 'json'], ['json-number', '41', 'json'],
  ['json-empty-array', '[]', 'json'], ['json-array-two', '[41,42]', 'json'],
  ['json-nested-array', '[[1],[2]]', 'json'], ['json-map-array', '{"x":[1,2]}', 'json'],
];
const sentinel = Object.freeze({marker: 'inherited-index-setter-sentinel'});

function phaseLabels(stack, callNumber) {
  for (const line of stack.split('\n')) {
    if (callNumber === 1 && /(?:LineCounter\.addNewLine|Parser\.parse|at parse \()/.test(line)) return ['parser.parse.line-start'];
    for (const name of ['stream', 'flowCollection', 'blockMap', 'blockSequence', 'blockCollection']) {
      if (new RegExp(`(?:Parser\\.${name}|at ${name} \\()`).test(line)) return [`parser.${name}`];
    }
    if (/resolveFlowCollection/.test(line)) return ['compose.resolveFlowCollection'];
    if (/resolveBlockMap/.test(line)) return ['compose.resolveBlockMap'];
    if (/resolveBlockSeq/.test(line)) return ['compose.resolveBlockSeq'];
    if (/composeNode/.test(line)) return ['compose.composeNode.error-record'];
    if (/compose-node/.test(line)) return ['compose.composeNode'];
    if (/compose\/composer\.js/.test(line)) return ['compose.composer'];
  }
  return ['other'];
}

function shape(value, seen = new Map()) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
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
    values: keys.map((key) => [typeof key === 'symbol' ? `symbol:${String(key)}` : key, 'value' in Object.getOwnPropertyDescriptor(value, key) ? shape(Object.getOwnPropertyDescriptor(value, key).value, seen) : '[accessor]']),
  };
}

function observe(route, isUmfError, source, format, behavior = {}) {
  let calls = 0;
  let busy = false;
  let trace = '';
  const original = Object.getOwnPropertyDescriptor(Array.prototype, '0');
  const throwAt = behavior.throwAt ?? 0;
  const always = behavior.always ?? false;
  const throwUndefined = behavior.throwUndefined ?? false;
  const mutation = behavior.mutation ?? 'define-own-index';
  try {
    Object.defineProperty(Array.prototype, '0', {configurable: true, set(value) {
      if (busy) {
        Object.defineProperty(this, '0', {configurable: true, enumerable: true, writable: true, value});
        return;
      }
      calls++;
      busy = true;
      let stack = '';
      try { stack = new Error().stack ?? ''; }
      finally { busy = false; }
      trace += `${calls}\t${phaseLabels(stack, calls).join('>')}\n`;
      if (always || (Array.isArray(throwAt) ? throwAt.includes(calls) : throwAt > 0 && calls === throwAt)) {
        if (throwUndefined) throw undefined;
        throw sentinel;
      }
      if (mutation === 'define-own-index') Object.defineProperty(this, '0', {configurable: true, enumerable: true, writable: true, value});
      else if (mutation === 'set-length-and-index') {
        this.length = Math.max(this.length, 1);
        Object.defineProperty(this, '0', {configurable: true, enumerable: true, writable: true, value});
      } else if (mutation === 'omit-own-index') {
        // Intentionally leave index 0 inherited to expose repeated parser writes.
      }
    }});
    try {
      const value = route(source, format);
      return {kind: 'return', value: shape(value), calls, trace: trace.trimEnd().split('\n').filter(Boolean)};
    } catch (error) {
      return {kind: 'throw', isUmfError: isUmfError(error), isSentinel: error === sentinel,
        isUndefined: error === undefined, name: error?.name, code: error?.code, path: error?.path,
        message: error?.message, calls, trace: trace.trimEnd().split('\n').filter(Boolean)};
    }
  } finally {
    if (original) Object.defineProperty(Array.prototype, '0', original);
    else delete Array.prototype[0];
  }
}

function runCase(route, isError, item) {
  const [id, source, format, behavior = {}] = item;
  return {id, source, format, behavior, outcome: observe(route, isError, source, format, behavior)};
}
const cases = inputs.map(([id, source, format]) => [id, source, format, {}]);
const probeSource = '[41,42]\n';
for (let n = 1; n <= 6; n++) cases.push([`throw-sentinel-at-${n}`, probeSource, 'yaml', {throwAt: n}]);
cases.push(['throw-sentinel-always', probeSource, 'yaml', {always: true}]);
cases.push(['throw-undefined-at-1', probeSource, 'yaml', {throwAt: 1, throwUndefined: true}]);
cases.push(['throw-undefined-at-5', probeSource, 'yaml', {throwAt: 5, throwUndefined: true}]);
cases.push(['throw-sentinel-at-compose-and-error-record', probeSource, 'yaml', {throwAt: [5, 6]}]);
cases.push(['throw-undefined-at-compose-and-error-record', probeSource, 'yaml', {throwAt: [5, 6], throwUndefined: true}]);
cases.push(['throw-undefined-always', probeSource, 'yaml', {always: true, throwUndefined: true}]);
for (const mutation of ['set-length-and-index', 'omit-own-index']) {
  for (const [id, source, format] of inputs.filter(([name]) => /array|nested-flow|block-array/.test(name))) {
    cases.push([`${id}-mutation-${mutation}`, source, format, {mutation}]);
  }
}

const rows = cases.map((item) => {
  const expected = runCase(reference, refIsUmfError, item);
  const actual = runCase(defaultRoute, defaultIsUmfError, item);
  return {...expected, default: actual.outcome, matches: isDeepStrictEqual(expected.outcome, actual.outcome)};
});
const sourceFiles = [
  'src/model/serialization.ts', 'src/model/errors.ts', 'src/index-v4-default.ts',
  'scripts/rust-migration/r8/inherited-setter-reference-entry.ts',
  'scripts/rust-migration/r8/inherited-setter-default-entry.ts',
  'scripts/rust-migration/r8/read-json-value-inherited-setter-packet.mjs',
  'node_modules/yaml/dist/parse/line-counter.js', 'node_modules/yaml/dist/parse/parser.js',
  'node_modules/yaml/dist/compose/resolve-flow-collection.js', 'node_modules/yaml/dist/compose/resolve-block-map.js',
  'node_modules/yaml/dist/compose/compose-node.js', 'node_modules/yaml/dist/compose/composer.js',
  'package.json', 'bun.lock',
];
const sourcePins = {};
for (const path of sourceFiles) sourcePins[path] = createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
const receipt = {
  packet: 'r8-read-json-value-inherited-setter-source-oracle-20261027-v1',
  runtime: {node: process.version, bun: process.versions.bun ?? null, v8: process.versions.v8},
  mode: 'TypeScript reference model and public V4 default source bundles; Array.prototype[0] inherited setter installed per route invocation and restored in finally',
  sourcePins, count: rows.length, matched: rows.filter((row) => row.matches).length,
  mismatchCount: rows.filter((row) => !row.matches).length, rows,
  scope: 'Source-only Node/Bun oracle; no Rust, WASM, browser, SDK, or release qualification. Stack receipts retain portable phase labels, not engine-specific locations.',
};
await rm(temp, {recursive: true, force: true});
if (rows.some((row) => !row.matches)) process.exitCode = 1;
console.log(JSON.stringify(receipt, null, 2));
