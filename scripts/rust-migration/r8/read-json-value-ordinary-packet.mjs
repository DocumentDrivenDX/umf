import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readJsonValue as reference } from '../../../dist/umf.js';
import { readJsonValue as defaultRoute } from '../../../dist/umf-node.js';

// Frozen raw-source cases for the ordinary readJsonValue profile. Keep the
// functions here: their getters, proxies, coercions and sentinels are evidence.
const sentinel = Object.freeze({ sentinel: 'readJsonValue ordinary packet' });
const controlSentinel = Object.freeze({ control: 'deadline or meter callback sentinel' });
let trace = [];
let currentCaseId = '';
const note = (s) => trace.push(s);
const coercer = (id, hooks) => {
  const out = {};
  for (const key of Reflect.ownKeys(hooks)) Object.defineProperty(out, key, {
    configurable: true,
    value(...args) { note(`${id}.${String(key)}:${args.map(String).join(',')}`); return hooks[key](...args); },
  });
  return out;
};
const statefulLength = (values, tail = {}) => {
  let reads = 0;
  const target = { ...tail };
  return new Proxy(target, { get(t, key, receiver) {
    if (key === 'length') { reads++; note(`length:${reads}`); return values[reads - 1] ?? values.at(-1); }
    note(`get:${String(key)}`);
    return Reflect.get(t, key, receiver);
  } });
};

const cases = [
  ['yaml-string', () => 'a: 1\nb: [true, null]\n', 'yaml'],
  ['json-string', () => '{"b":2,"a":[true,null]}', 'json'],
  ['json-primitive-results', () => '[null,false,true,0,1,"x"]', 'json'],
  ['json-toPrimitive-string', () => coercer('primitive', { [Symbol.toPrimitive](hint) { return hint === 'string' ? '[1,true,null]' : 'wrong'; } }), 'json'],
  ['json-toPrimitive-number', () => coercer('primitive-number', { [Symbol.toPrimitive]() { return 0; } }), 'json'],
  ['json-toString', () => coercer('to-string', { toString() { return '{"ok":1}'; }, valueOf() { return 2; } }), 'json'],
  ['json-valueOf-fallback', () => coercer('value-of', { toString() { return {}; }, valueOf() { return '["fallback"]'; } }), 'json'],
  ['json-throwing-toPrimitive', () => coercer('throw-primitive', { [Symbol.toPrimitive]() { throw sentinel; }, toString() { return 'null'; } }), 'json'],
  ['json-throwing-toString', () => coercer('throw-string', { toString() { throw sentinel; }, valueOf() { return 'null'; } }), 'json'],
  ['json-throwing-valueOf', () => coercer('throw-value', { toString() { return {}; }, valueOf() { throw sentinel; } }), 'json'],
  ...[['undefined', undefined], ['null', null], ['false', false], ['zero', 0], ['negative-zero', -0], ['nan', NaN], ['bigint-zero', 0n], ['symbol', Symbol('s')], ['truthy-number', 7], ['truthy-boolean', true], ['truthy-bigint', 1n]].flatMap(([id, v]) => [['yaml', v], ['json', v]].map(([fmt, val]) => [`${fmt}-${id}`, () => val, fmt])),
  ['yaml-truthy-nonstring', () => ({}), 'yaml'],
  ['format-nonstring-no-coercion', () => 'x: 1\n', Object.freeze({ toString() { note('format-toString'); return 'json'; } })],
  ['first-length-getter', () => Object.defineProperty({}, 'length', { get() { note('length:get:1'); return 0; } }), 'yaml'],
  ['first-length-throws-sentinel', () => Object.defineProperty({}, 'length', { get() { note('length:throw'); throw sentinel; } }), 'yaml'],
  ['length-control-failure-outside-json-catch', () => Object.defineProperty({}, 'length', { get() { note('length:control-failure'); throw controlSentinel; } }), 'json'],
  ['first-length-throws-undefined', () => Object.defineProperty({}, 'length', { get() { note('length:throw-undefined'); throw undefined; } }), 'yaml'],
  ['stateful-length-two-reads', () => statefulLength([1, 3], { toString() { note('toString'); return '[7]'; } }), 'json'],
  ['second-length-throws-sentinel', () => {
    let reads = 0;
    return new Proxy({ toString() { note('toString'); return 'null'; } }, { get(t,k,r) {
      if (k === 'length' && ++reads === 1) { note('length:1'); return 0; }
      if (k === 'length') { note('length:2-throw'); throw sentinel; }
      return Reflect.get(t,k,r);
    } });
  }, 'json'],
  ['proxy-length-and-format', () => new Proxy({ toString() { note('toString'); return 'null'; } }, { get(t,k,r) { note(`proxy:${String(k)}`); return k === 'length' ? 0 : Reflect.get(t,k,r); } }), 'json'],
  ['callable-json-source', () => Object.assign(function source() {}, { toString() { note('callable.toString'); return 'true'; } }), 'json'],
  ['boxed-string-json', () => new String('{"boxed":true}'), 'json'],
  ['boxed-string-yaml', () => new String('x: 1'), 'yaml'],
  ['exact-limit-minus-one', () => ' '.repeat(3_999_999), 'json'],
  ['exact-limit', () => ' '.repeat(4_000_000), 'json'],
  ['exact-limit-plus-one', () => ' '.repeat(4_000_001), 'json'],
  ['exact-limit-valid', () => '"' + 'a'.repeat(3_999_998) + '"', 'json'],
  ['utf16-limit-astral-exact', () => '"' + '😀'.repeat(1_999_999) + '"', 'json'],
  ['utf16-limit-astral-plus-one', () => '"' + '😀'.repeat(1_999_999) + 'a"', 'json'],
  ['json-lone-surrogate-value', () => '"\\ud800"', 'json'],
  ['json-lone-surrogate-key', () => '{"\\ud800":"v"}', 'json'],
  ['yaml-lone-surrogate-value', () => '"\\uD800"\n', 'yaml'],
  ['yaml-lone-surrogate-key', () => '"\\uD800": 1\n', 'yaml'],
  ['yaml-lone-surrogate-error-path', () => '"\\uD800": 9007199254740993\n', 'yaml'],
  ['yaml-null-prototype-ordered-own-descriptors', () => 'z: 1\n__proto__: 2\na: 3\n', 'yaml'],
  ['array-own-index-under-inherited-setter', () => '[41,42]\n', 'yaml'],
  ['json-preflight-live-parse-lookup', () => '[1]', 'json'],
  ['resource-control-unavailable-public-api', () => 'null', 'yaml'],
];

const digest = (s) => createHash('sha256').update(Buffer.from(s, 'utf16le')).digest('hex');
function shape(value, seen = new Map()) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    if (typeof value === 'string') return { type: 'string', utf16Length: value.length, utf16Sha256: digest(value) };
    if (typeof value === 'number' && Number.isNaN(value)) return { type: 'number', value: 'NaN' };
    if (typeof value === 'number' && Object.is(value, -0)) return { type: 'number', value: '-0' };
    if (typeof value === 'bigint') return { type: 'bigint', value: String(value) };
    if (typeof value === 'symbol') return { type: 'symbol', value: String(value) };
    return { type: value === null ? 'null' : typeof value, value };
  }
  if (seen.has(value)) return { type: 'reference', id: seen.get(value) };
  const id = seen.size; seen.set(value, id);
  const proto = Object.getPrototypeOf(value);
  const prototype = proto === null ? 'null' : proto === Array.prototype ? 'Array.prototype' : proto === Object.prototype ? 'Object.prototype' : proto?.constructor?.name ?? 'other';
  const keys = Reflect.ownKeys(value);
  return {
    type: Array.isArray(value) ? 'array' : typeof value,
    id,
    prototype,
    extensible: Object.isExtensible(value),
    keys: keys.map((key) => typeof key === 'symbol' ? `symbol:${String(key)}` : key),
    descriptors: keys.map((key) => {
      const d = Object.getOwnPropertyDescriptor(value, key);
      return { key: typeof key === 'symbol' ? `symbol:${String(key)}` : key, enumerable: d.enumerable, configurable: d.configurable, writable: 'writable' in d ? d.writable : undefined, value: 'value' in d ? shape(d.value, seen) : undefined, getter: d.get ? d.get.name || '<anonymous>' : undefined, setter: d.set ? d.set.name || '<anonymous>' : undefined };
    }),
  };
}
function outcome(fn) {
  try { const value = fn(); return { kind: 'return', raw: value, shape: shape(value) }; }
  catch (error) {
    return { kind: 'throw', hasThrown: true, raw: error, identityIsSentinel: error === sentinel, identityIsControlSentinel: error === controlSentinel, constructorName: error?.constructor?.name, name: error?.name, code: error?.code, path: error?.path, message: error?.message, own: shape(error) };
  }
}
function runOne(fn, makeSource, format, dynamicParse = false) {
  trace = [];
  const run = () => {
    if (currentCaseId === 'array-own-index-under-inherited-setter') {
      let inheritedSetCount = 0;
      const old = Object.getOwnPropertyDescriptor(Array.prototype, '0');
      try {
        Object.defineProperty(Array.prototype, '0', { configurable: true, set(value) {
          inheritedSetCount++;
          Object.defineProperty(this, '0', { configurable: true, enumerable: true, writable: true, value });
        } });
        const observed = outcome(() => fn(makeSource(), format));
        observed.inheritedArrayIndexSetterCalls = inheritedSetCount;
        return observed;
      } finally { if (old) Object.defineProperty(Array.prototype, '0', old); else delete Array.prototype[0]; }
    }
    return outcome(() => fn(makeSource(), format));
  };
  if (!dynamicParse) return { outcome: run(), trace: [...trace] };
  const original = JSON.parse;
  const calls = [];
  try {
    Object.defineProperty(JSON, 'parse', { configurable: true, get() { calls.push('get:JSON.parse'); return function (text) { calls.push(`call:${this === JSON}:${String(text)}`); return original.call(this, text); }; } });
    const result = run();
    return { outcome: result, trace: [...trace, ...calls] };
  } finally { Object.defineProperty(JSON, 'parse', { configurable: true, writable: true, enumerable: false, value: original }); }
}

const rows = [];
for (const [id, makeSource, format] of cases) {
  currentCaseId = id;
  const dynamic = id === 'json-preflight-live-parse-lookup';
  const ref = runOne(reference, makeSource, format, dynamic);
  const actual = runOne(defaultRoute, makeSource, format, dynamic);
  const comparable = (outcome) => {
    const own = outcome.own;
    if (!own) return outcome.shape;
    if (!own.descriptors) return own;
    return { ...own, descriptors: own.descriptors.map((d) => ['stack','originalLine','originalColumn','line','column','sourceURL'].includes(d.key) ? { key: d.key, enumerable: d.enumerable, configurable: d.configurable, getter: d.getter, setter: d.setter, writable: d.writable } : d) };
  };
  const sameOutcome = (left, right) => left.outcome.kind === right.outcome.kind &&
    JSON.stringify(comparable(left.outcome)) === JSON.stringify(comparable(right.outcome)) &&
    (left.outcome.kind === 'return' ? isDeepStrictEqual(left.outcome.raw, right.outcome.raw) :
      (left.outcome.identityIsSentinel ? left.outcome.raw === sentinel && right.outcome.raw === sentinel :
        left.outcome.identityIsControlSentinel ? left.outcome.raw === controlSentinel && right.outcome.raw === controlSentinel :
        left.outcome.raw === undefined || right.outcome.raw === undefined ? left.outcome.raw === undefined && right.outcome.raw === undefined :
          left.outcome.constructorName === right.outcome.constructorName && left.outcome.name === right.outcome.name &&
          left.outcome.code === right.outcome.code && left.outcome.path === right.outcome.path && left.outcome.message === right.outcome.message)) &&
    left.outcome.identityIsSentinel === right.outcome.identityIsSentinel &&
    left.outcome.identityIsControlSentinel === right.outcome.identityIsControlSentinel &&
    left.outcome.hasThrown === right.outcome.hasThrown &&
    left.outcome.inheritedArrayIndexSetterCalls === right.outcome.inheritedArrayIndexSetterCalls &&
    JSON.stringify(left.trace) === JSON.stringify(right.trace);
  rows.push({ id, format: typeof format === 'string' ? format : 'non-string', reference: ref, default: actual,
    matches: sameOutcome(ref, actual) });
}
const clean = (r) => ({ ...r, outcome: Object.fromEntries(Object.entries(r.outcome).filter(([key]) => key !== 'raw')) });
for (const row of rows) { row.reference = clean(row.reference); row.default = clean(row.default); }
const result = { packet: 'r8-read-json-value-ordinary-20261027-v1', runtime: { node: process.version, bun: process.versions.bun ?? null, v8: process.versions.v8 }, count: rows.length, rows };
if (rows.some((row) => !row.matches)) process.exitCode = 1;
console.log(JSON.stringify(result, null, 2));
