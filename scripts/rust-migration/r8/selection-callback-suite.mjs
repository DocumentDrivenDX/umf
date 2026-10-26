const source = () => ({umf: '0.10.0', id: 'selection-callback-trace', vocabularies: {}, modules: [
  {id: 'sales', namespace: 'sales', elements: [
    {id: 'customer', name: 'Customer', scalarType: 'string', extensions: {}},
  ]},
]});
const manifest = id => ({id, version: '1.0.0', coreVersion: '0.10.0', description: id,
  schema: {type: 'object'}, semantics: 'validation callback', scopes: ['document'],
  capabilities: {validation: 'semantic', directions: [], evidence: []}});

function makeRegistry(Registry, events, handlers) {
  const registry = new Registry();
  for (const [id, handler] of Object.entries(handlers)) {
    registry.register(manifest(id), function(payload, context) {
      events.push(`callback:${id}`);
      events.push(`callback-original-this:${this === undefined ? 'undefined' : 'other'}`);
      return handler(payload, context, events);
    });
  }
  const rawGet = registry.get;
  registry.get = function(id, version) {
    events.push(`registry:get:${id}:${version}`);
    const found = rawGet.call(this, id, version);
    if (!found || !found.semantics) return found;
    const registration = {...found};
    const semantic = found.semantics;
    registration.semantics = function(...args) {
      events.push(`semantics-receiver:${this === registration ? 'registration' : 'other'}`);
      return Reflect.apply(semantic, this, args);
    };
    return registration;
  };
  return registry;
}

function documentFor(ids = ['alpha']) {
  const doc = source();
  doc.vocabularies = Object.fromEntries(ids.map(id => [id, {version: '1.0.0'}]));
  doc.extensions = Object.fromEntries(ids.map(id => [id, {value: id}]));
  return doc;
}

const warning = (code, path, message, extra) => ({code, path, message, severity: 'warning', ...(extra ? {extra} : {})});

function runOne({Registry, selectCoreElements, candidate, name, make}) {
  const run = candidateFlag => {
    const events = [];
    const input = make(events);
    const select = candidateFlag ? candidate : selectCoreElements;
    try {
      const value = select(input.source, input.query, input.registry);
      return {ok: true, value, events};
    } catch (error) {
      return {ok: false, error: {identity: input.expectedThrown === error,
        name: error?.name, code: error?.code, path: error?.path, message: error?.message,
        value: error === input.expectedThrown ? 'expected-object' : undefined}, events};
    }
  };
  const reference = run(false), rust = run(true);
  const equal = key => JSON.stringify(reference[key]) === JSON.stringify(rust[key]);
  return {name, reference, rust, comparison: {outcome: equal(reference.ok ? 'value' : 'error'), hostTrace: equal('events')}};
}

export function runSelectionCallbackSuite({Registry, selectCoreElements, candidate}) {
  const cases = [
    {name: 'warning-diagnostic', make: events => ({source: documentFor(), query: {references: 'none'}, registry: makeRegistry(Registry, events, {
      alpha: () => [warning('CALLER_WARNING', '/extensions/alpha', 'retained warning', {future: 'keep'})],
    })})},
    {name: 'callback-registration-and-warning-order', make: events => ({source: documentFor(['alpha', 'beta']), query: {references: 'none'}, registry: makeRegistry(Registry, events, {
      alpha: () => [warning('A', '/extensions/alpha', 'first')],
      beta: () => [warning('B', '/extensions/beta', 'second')],
    })})},
    {name: 'callback-throws-error', make: events => ({source: documentFor(), query: {references: 'none'}, registry: makeRegistry(Registry, events, {
      alpha: () => {throw new Error('callback failed');},
    })})},
    {name: 'callback-throws-custom-string', make: events => ({source: documentFor(), query: {references: 'none'}, registry: makeRegistry(Registry, events, {
      alpha: () => {throw {toString() {events.push('thrown:toString'); return 'custom callback failure';}};},
    })})},
    {name: 'callback-thrown-string-conversion-identity', make: events => {
      const expectedThrown = new Error('String conversion failed');
      const callbackError = {toString() {events.push('thrown:toString'); throw expectedThrown;}};
      return {source: documentFor(), query: {references: 'none'}, expectedThrown, registry: makeRegistry(Registry, events, {
        alpha: () => {throw callbackError;},
      })};
    }},
    {name: 'callback-custom-iterable-order', make: events => ({source: documentFor(), query: {references: 'none'}, registry: makeRegistry(Registry, events, {
      alpha: () => {
        let index = 0;
        return {[Symbol.iterator]() {
          events.push('diagnostics:iterator');
          return {next() {
            events.push(`diagnostics:next:${index}`);
            if (index++ === 0) return {done: false, value: warning('A', '/extensions/alpha', 'first')};
            if (index === 2) return {done: false, value: warning('B', '/extensions/alpha', 'second')};
            return {done: true};
          }};
        }};
      },
    })})},
    {name: 'callback-iterator-getter-throws-and-stringifies-in-place', make: events => ({source: documentFor(), query: {references: 'none'}, registry: makeRegistry(Registry, events, {
      alpha: () => ({get [Symbol.iterator]() {
        events.push('diagnostics:iterator-get');
        throw {toString() { events.push('diagnostics:thrown-toString'); return 'iterator getter failed'; }};
      }}),
    })})},
    {name: 'callback-undefined-result-native-spread-failure', make: events => ({source: documentFor(), query: {references: 'none'}, registry: makeRegistry(Registry, events, {
      alpha: () => { events.push('diagnostics:return-undefined'); return undefined; },
    })})},
    {name: 'callback-noncallable-iterator-native-spread-failure', make: events => ({source: documentFor(), query: {references: 'none'}, registry: makeRegistry(Registry, events, {
      alpha: () => ({[Symbol.iterator]: 17}),
    })})},
    {name: 'callback-receiver-context-and-prototype-boundary', make: events => {
      const input = documentFor();
      Object.defineProperty(input, '__proto__', {value: {marker: 'retained'}, enumerable: true, writable: true, configurable: true});
      return {source: input, query: {references: 'none'}, registry: makeRegistry(Registry, events, {
        alpha: function(payload, context) {
          events.push(`callback-original-this:${this === undefined ? 'undefined' : 'other'}`);
          events.push(`context-prototype:${Object.getPrototypeOf(context) === Object.prototype ? 'plain' : 'other'}`);
          events.push(`context-keys:${Reflect.ownKeys(context).join(',')}`);
          events.push(`context-document-prototype:${Object.getPrototypeOf(context.document) === null ? 'null' : 'other'}`);
          events.push(`context-document-module-prototype:${Object.getPrototypeOf(context.document.modules[0]) === null ? 'null' : 'other'}`);
          events.push(`context-own-proto:${Object.hasOwn(context.document, '__proto__')}:${context.document.__proto__?.marker}`);
          events.push(`payload-prototype:${Object.getPrototypeOf(payload) === null ? 'null' : 'other'}`);
          return [warning('CALLER_WARNING', '/extensions/alpha', 'retained warning')];
        },
      })};
    }},
    {name: 'callback-severity-read-after-all-callbacks', make: events => ({source: documentFor(['alpha', 'beta']), query: {references: 'none'}, registry: makeRegistry(Registry, events, {
      alpha: () => [new Proxy(warning('A', '/extensions/alpha', 'first'), {get(target, key, receiver) {
        if (key === 'severity') events.push('severity:alpha');
        return Reflect.get(target, key, receiver);
      }})],
      beta: () => [new Proxy(warning('B', '/extensions/beta', 'second'), {get(target, key, receiver) {
        if (key === 'severity') events.push('severity:beta');
        return Reflect.get(target, key, receiver);
      }})],
    })})},
    {name: 'callback-severity-some-short-circuit-after-emits', make: events => ({source: documentFor(['alpha', 'beta']), query: {references: 'none'}, registry: makeRegistry(Registry, events, {
      alpha: () => [new Proxy({...warning('A', '/extensions/alpha', 'first'), severity: 'error'}, {get(target, key, receiver) {
        if (key === 'severity') events.push('severity:alpha');
        return Reflect.get(target, key, receiver);
      }})],
      beta: () => [new Proxy(warning('B', '/extensions/beta', 'second'), {get(target, key, receiver) {
        if (key === 'severity') events.push('severity:beta');
        return Reflect.get(target, key, receiver);
      }})],
    })})},
    {name: 'callback-emit-field-getter-order', make: events => ({source: documentFor(), query: {references: 'none'}, registry: makeRegistry(Registry, events, {
      alpha: () => [new Proxy(warning('A', '/extensions/alpha', 'first'), {get(target, key, receiver) {
        if (['severity', 'path', 'code', 'message'].includes(key)) events.push(`emit:${key}`);
        return Reflect.get(target, key, receiver);
      }})],
    })})},
    {name: 'callback-malformed-diagnostic-field-order', make: events => ({source: documentFor(), query: {references: 'none'}, registry: makeRegistry(Registry, events, {
      alpha: () => [new Proxy({severity: 'warning', path: '/extensions/alpha', code: 'A'}, {get(target, key, receiver) {
        if (['severity', 'path', 'code', 'message'].includes(key)) events.push(`emit:${key}`);
        return Reflect.get(target, key, receiver);
      }})],
    })})},
    {name: 'callback-diagnostic-getter-throw-identity', make: events => {
      const expectedThrown = {diagnosticGetter: true};
      const diagnostic = new Proxy(warning('A', '/extensions/alpha', 'first'), {get(target, key, receiver) {
        if (key === 'severity') { events.push('emit:severity'); throw expectedThrown; }
        return Reflect.get(target, key, receiver);
      }});
      return {source: documentFor(), query: {references: 'none'}, expectedThrown,
        registry: makeRegistry(Registry, events, {alpha: () => [diagnostic]})};
    }},
    {name: 'callback-null-diagnostic-severity-refusal', make: events => ({source: documentFor(), query: {references: 'none'}, registry: makeRegistry(Registry, events, {
      alpha: () => [null],
    })})},
    {name: 'callback-undefined-diagnostic-severity-refusal', make: events => ({source: documentFor(), query: {references: 'none'}, registry: makeRegistry(Registry, events, {
      alpha: () => [undefined],
    })})},
    {name: 'callback-primitive-diagnostics', make: events => ({source: documentFor(), query: {references: 'none'}, registry: makeRegistry(Registry, events, {
      alpha: () => ['text', 5],
    })})},
  ];
  const results = cases.map(item => runOne({Registry, selectCoreElements, candidate, ...item}));
  return {format: 'umf.r8.selection-callback-trace/1', caseCount: results.length, cases: results,
    summary: {
      exactOutcomeMatches: results.filter(item => item.comparison.outcome).length,
      exactHostTraceMatches: results.filter(item => item.comparison.hostTrace).length,
      mismatches: results.filter(item => !item.comparison.outcome || !item.comparison.hostTrace).map(item => ({name: item.name, ...item.comparison})),
    }};
}
