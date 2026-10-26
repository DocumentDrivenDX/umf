// SPDX-License-Identifier: MIT OR Apache-2.0
// Direct-source host probes for importJsonSchema non-string parser inputs.
export function nonStringCases() {
  const cases = [];
  const rootOptions = events => ({id: 'nonstring', baseUri: 'https://example.test/root', resources: {}});
  const add = (id, position, makeInput) => cases.push({id, position, makeInput});
  add('root-length-getter-and-toString', 'root', events => Object.defineProperties({}, {
    length: {get() { events.push('length'); return 2; }},
    toString: {value() { events.push('toString'); return '{}'; }},
  }));
  add('root-symbol-primitive', 'root', () => Symbol('root-source'));
  add('root-symbol-toPrimitive', 'root', events => ({
    [Symbol.toPrimitive](hint) { events.push(`toPrimitive:${hint}`); return '{}'; },
  }));
  add('root-toString-throws', 'root', (events, sentinel) => ({
    toString() { events.push('toString'); throw sentinel; },
  }));
  add('root-toPrimitive-throws-before-toString', 'root', (events, sentinel) => ({
    [Symbol.toPrimitive](hint) { events.push(`toPrimitive:${hint}`); throw sentinel; },
    toString() { events.push('toString'); return '{}'; },
  }));
  add('root-length-getter-throws-before-coercion', 'root', (events, sentinel) => Object.defineProperties({}, {
    length: {get() { events.push('length'); throw sentinel; }},
    toString: {value() { events.push('toString'); return '{}'; }},
  }));
  add('resource-length-getter-and-toString-before-root', 'resource', events => Object.defineProperties({}, {
    length: {get() { events.push('resource:length'); return 2; }},
    toString: {value() { events.push('resource:toString'); return '{}'; }},
  }));
  add('resource-symbol-source', 'resource', () => Symbol('resource-source'));
  add('resource-toPrimitive-throws-before-root', 'resource', (events, sentinel) => ({
    [Symbol.toPrimitive](hint) { events.push(`resource:toPrimitive:${hint}`); throw sentinel; },
  }));
  return cases;
}

// Put a source in the requested position while keeping all other inputs
// ordinary strings and options own-data properties.
export function optionsFor(fixture, input, events) {
  if (fixture.position === 'root') return {source: input, options: {id: 'nonstring', baseUri: 'https://example.test/root', resources: {}}};
  return {source: '{}', options: {id: 'nonstring-resource', baseUri: 'https://example.test/root', resources: {'https://example.test/dep': input}}};
}
