// SPDX-License-Identifier: MIT OR Apache-2.0
// Shared source-ordered string fixtures for the R8 import stage matrix.
export function matrixCases() {
  const cases = [];
  const add = (id, source, makeOptions) => cases.push({id, source, makeOptions});
  const root = 'https://example.test/root';
  add('success-three-distinct-uri-reads', '{}', (events) => {
    let n = 0;
    return Object.defineProperties({}, {
      baseUri: {get() { events.push(`baseUri#${++n}`); return `https://example.test/read-${n}`; }},
      resources: {get() { events.push('resources'); return {'https://example.test/dep': '{}'}; }},
      id: {get() { events.push('id'); return 'matrix-success'; }},
    });
  });
  add('invalid-base-uri-before-resources-and-root', '{', (events) => Object.defineProperties({}, {
    baseUri: {get() { events.push('baseUri#1'); return 'relative#bad'; }},
    resources: {get() { events.push('resources'); return {}; }},
  }));
  add('base-uri-getter-throws', '{', (events, sentinel) => Object.defineProperty({}, 'baseUri', {
    get() { events.push('baseUri#1'); throw sentinel; },
  }));
  add('resources-getter-throws', '{', (events, sentinel) => Object.defineProperties({}, {
    baseUri: {get() { events.push('baseUri#1'); return root; }},
    resources: {get() { events.push('resources'); throw sentinel; }},
  }));
  add('resource-ownKeys-trap-throws', '{', (events, sentinel) => Object.defineProperties({}, {
    baseUri: {get() { events.push('baseUri#1'); return root; }},
    resources: {get() { events.push('resources'); return new Proxy({}, {ownKeys() { events.push('ownKeys'); throw sentinel; }}); }},
  }));
  add('invalid-resource-uri-before-invalid-source', '{', (events) => ({
    baseUri: root, resources: {'relative#bad': '{'},
  }));
  add('first-resource-parse-before-later-invalid-uri', '{', (events) => {
    const resources = {};
    Object.defineProperties(resources, {
      'https://example.test/first': {enumerable: true, get() { events.push('resource:first:get'); return '{'; }},
      'relative#bad': {enumerable: true, get() { events.push('resource:later:get'); return '{}'; }},
    });
    return {baseUri: root, resources};
  });
  add('resource-parse-before-invalid-root', '{', (events) => ({
    baseUri: root, resources: {'https://example.test/first': '{'},
  }));
  add('valid-resources-root-parse-before-id', '{', (events) => Object.defineProperties({}, {
    baseUri: {get() { events.push('baseUri#1'); return root; }},
    resources: {get() { events.push('resources'); return {'https://example.test/dep': '{}'}; }},
    id: {get() { events.push('id'); return 'must-not-read'; }},
  }));
  add('payload-base-uri-read-throws-before-root', '{}', (events, sentinel) => {
    let n = 0;
    return Object.defineProperties({}, {
      baseUri: {get() { const read = ++n; events.push(`baseUri#${read}`); if (read === 2) throw sentinel; return root; }},
      resources: {get() { events.push('resources'); return {'https://example.test/dep': '{}'}; }},
    });
  });
  add('id-getter-throws-after-root', '{}', (events, sentinel) => Object.defineProperties({}, {
    baseUri: {get() { events.push('baseUri'); return root; }},
    resources: {get() { events.push('resources'); return {}; }},
    id: {get() { events.push('id'); throw sentinel; }},
  }));
  add('namespace-read-throws-after-id', '{}', (events, sentinel) => {
    let n = 0;
    return Object.defineProperties({}, {
      baseUri: {get() { const read = ++n; events.push(`baseUri#${read}`); if (read === 3) throw sentinel; return root; }},
      resources: {get() { events.push('resources'); return {}; }},
      id: {get() { events.push('id'); return 'namespace-throw'; }},
    });
  });
  add('resource-descriptor-trap-throws', '{', (events, sentinel) => ({
    baseUri: root,
    resources: new Proxy({}, {
      ownKeys() { events.push('ownKeys'); return ['https://example.test/dep']; },
      getOwnPropertyDescriptor() { events.push('descriptor'); throw sentinel; },
    }),
  }));
  add('resource-get-trap-throws', '{', (events, sentinel) => ({
    baseUri: root,
    resources: new Proxy({}, {
      ownKeys() { events.push('ownKeys'); return ['https://example.test/dep']; },
      getOwnPropertyDescriptor() { events.push('descriptor'); return {enumerable: true, configurable: true}; },
      get() { events.push('get'); throw sentinel; },
    }),
  }));
  add('symbol-and-non-enumerable-resource-keys-omitted', '{}', (events) => {
    const resources = Object.create(null);
    Object.defineProperty(resources, 'https://example.test/dep', {enumerable: true, get() { events.push('resource:get'); return '{}'; }});
    Object.defineProperty(resources, Symbol('hidden'), {enumerable: true, get() { events.push('symbol:get'); return '{'; }});
    Object.defineProperty(resources, 'https://example.test/hidden', {enumerable: false, get() { events.push('nonenumerable:get'); return '{'; }});
    return {baseUri: root, id: 'reflection-matrix', resources};
  });
  add('sparse-resource-array-omits-holes', '{}', () => ({baseUri: root, id: 'sparse-matrix', resources: new Array(3)}));
  add('null-prototype-resource-map', '{}', () => {
    const resources = Object.create(null);
    resources['https://example.test/dep'] = '{}';
    return {baseUri: root, id: 'null-prototype-matrix', resources};
  });
  add('schema-validation-refusal-after-all-host-observations', '{"type":"nonsense"}', (events) => {
    let n = 0;
    const options = Object.defineProperties({}, {
      baseUri: {get() { events.push(`baseUri#${++n}`); return `https://example.test/read-${n}`; }},
      resources: {get() { events.push('resources'); return {}; }},
      id: {get() { events.push('id'); return 'schema-invalid'; }},
    });
    return options;
  });
  return cases;
}
