// SPDX-License-Identifier: MIT OR Apache-2.0
// Expanded direct-source tests for defining an explicitly bounded host bridge.
const root = 'https://example.test/root';
const safeOptions = () => ({id: 'boundary-probe', baseUri: root, resources: {}});
export function boundaryCases() {
  const cases = [];
  const add = (id, position, input, options = safeOptions, throwsPrimitive = false) => cases.push({id, position, input, options: options ?? safeOptions, throwsPrimitive});
  const define = (events, length, coercion, label = '') => Object.defineProperties({}, {
    length: {get() { events.push(`${label}length`); return typeof length === 'function' ? length(events) : length; }},
    [Symbol.toPrimitive]: {value(hint) { events.push(`${label}toPrimitive:${hint}`); return typeof coercion === 'function' ? coercion(events, hint) : coercion; }},
  });
  add('root-length-string-numeric', 'root', events => define(events, '2', '{}'));
  add('root-length-number-valueof-before-coercion', 'root', events => define(events, {
    valueOf() { events.push('length:valueOf'); return 2; },
  }, '{}'));
  add('root-length-greater-than-limit-stops-before-coercion', 'root', events => define(events, 4_000_001, '{}'));
  add('root-length-exact-limit-allows-coercion', 'root', events => define(events, 4_000_000, '{}'));
  add('root-length-coercion-greater-than-limit-stops-before-source-coercion', 'root', events => define(events, events => ({
    [Symbol.toPrimitive](hint) { events.push(`length:toPrimitive:${hint}`); return 4_000_001; },
  }), '{}'));
  add('root-length-throws-primitive', 'root', (events, sentinel) => Object.defineProperty({}, 'length', {
    get() { events.push('length'); throw sentinel; },
  }), undefined, 'primitive');
  add('root-length-throws-object', 'root', (events, sentinel) => Object.defineProperty({}, 'length', {
    get() { events.push('length'); throw sentinel; },
  }));
  add('root-coercion-returns-number', 'root', events => define(events, 2, 17));
  add('root-coercion-returns-boolean', 'root', events => define(events, 2, false));
  add('root-coercion-returns-null', 'root', events => define(events, 2, null));
  add('root-coercion-returns-symbol', 'root', events => define(events, 2, Symbol('coercion-result')));
  add('root-coercion-returns-object', 'root', events => define(events, 2, {}));
  add('root-coercion-returns-over-limit-valid-json', 'root', events => define(events, 2, ' '.repeat(4_000_001) + '{}'));
  add('root-coercion-returns-duplicate-key-json', 'root', events => define(events, 2, '{"a":1,"a":2}'));
  add('root-coercion-throws-primitive', 'root', (events, sentinel) => define(events, 2, () => { throw sentinel; }), undefined, 'primitive');
  add('root-coercion-throws-object', 'root', (events, sentinel) => define(events, 2, () => { throw sentinel; }));
  add('root-malformed-coerced-json-before-second-length', 'root', events => define(events, 2, '{'));
  add('root-native-json-valid-object-then-yaml-source-refusal', 'root', events => define(events, 2, '{}'));
  add('root-null-before-length', 'root', () => null);
  add('root-undefined-before-length', 'root', () => undefined);
  add('root-number-primitive', 'root', () => 17);
  add('resource-length-limit-before-coercion-and-root', 'resource', events => define(events, 4_000_001, '{}'));
  add('resource-coercion-failure-before-root', 'resource', (events, sentinel) => define(events, 2, () => { throw sentinel; }));
  add('resource-valid-coercion-yaml-refusal-before-root', 'resource', events => define(events, 2, '{}'));
  add('resource-invalid-json-refusal-before-root', 'resource', events => define(events, 2, '{'));
  add('root-length-then-toString-then-length-changes-to-limit', 'root', events => {
    let n = 0;
    return Object.defineProperties({}, {
      length: {get() { events.push(`length#${++n}`); return n === 1 ? 2 : 4_000_001; }},
      toString: {value() { events.push('toString'); return '{}'; }},
    });
  });
  add('root-second-length-throws-after-rust-success', 'root', (events, sentinel) => {
    let n = 0;
    return Object.defineProperties({}, {
      length: {get() { events.push(`length#${++n}`); if (n === 2) throw sentinel; return 2; }},
      toString: {value() { events.push('toString'); return '{}'; }},
    });
  });
  add('root-length-compare-coercion-throws', 'root', events => Object.defineProperties({}, {
    length: {get() { events.push('length'); return {[Symbol.toPrimitive](hint) { events.push(`length:toPrimitive:${hint}`); throw 'length failure'; }}; }},
    toString: {value() { events.push('toString'); return '{}'; }},
  }));
  add('resource-valid-root-invalid-resource', 'resource', events => define(events, 2, '{}'), () => ({
    id: 'boundary-resource', baseUri: root,
    resources: {'https://example.test/dep': events => define(events, 2, '{')},
  }));
  for (const item of cases) {
    const makeInput = item.input;
    item.makeInput = makeInput;
  }
  return cases;
}

export function prepareBoundaryCase(fixture, events, sentinels) {
  const thrown = fixture.throwsPrimitive ? sentinels.primitive : sentinels.object;
  const input = fixture.input(events, thrown);
  const options = fixture.options(events, thrown);
  if (fixture.position === 'root') return {source: input, options};
  if (fixture.id === 'resource-valid-root-invalid-resource') options.resources['https://example.test/dep'] = input;
  else options.resources['https://example.test/dep'] = input;
  return {source: '{}', options};
}
