// Source-frozen selection host cases. This file intentionally contains no
// generated expectations: each run compares the same-host TS reference and
// opt-in Rust facade, then records their observable differences.
export const sourceDocument = () => ({
  umf: '0.10.0', id: 'selection-host-trace', vocabularies: {}, modules: [
    {id: 'sales', namespace: 'sales', elements: [
      {id: 'customer', name: 'Customer', scalarType: 'string', extensions: {}},
      {id: 'account', name: 'Account', scalarType: 'integer', extensions: {}, references: [{role: 'owner', module: 'sales', element: 'customer', future: 'keep'}]},
    ]},
  ],
});

function extensionDocument(ids = ['alpha']) {
  const vocabularies = Object.fromEntries(ids.map(id => [id, {version: '1.0.0'}]));
  return {...sourceDocument(), vocabularies,
    extensions: Object.fromEntries(ids.map(id => [id, {value: id}]))};
}

function packageManifest(id) {
  return {id, version: '1.0.0', coreVersion: '0.10.0', description: `Host trace ${id}`,
    schema: {type: 'object'}, semantics: 'Host callback supplied by the registered caller',
    scopes: ['document'], capabilities: {validation: 'semantic', directions: [], evidence: []}};
}

function makeRegistry(Registry, events, handlers = {}, kindRuntime) {
  const registry = new Registry(kindRuntime);
  const registrations = new Map();
  for (const id of Object.keys(handlers)) {
    const callback = handlers[id];
    registry.register(packageManifest(id), function(payload, context) {
      events.push(`callback:${id}`);
      events.push(`callback-this:${this === registrations.get(id) ? 'registration' : this === undefined ? 'undefined' : 'other'}`);
      events.push(`callback-context:${context.path}:${context.scope}`);
      return callback(payload, context, events);
    });
    registrations.set(id, registry.get(id, '1.0.0'));
  }
  const original = registry.registrations;
  registry.registrations = function() {
    events.push('registry:registrations');
    return original.call(this);
  };
  return registry;
}

function outcome(thunk, events, expectedThrown) {
  try {
    const value = thunk();
    const proto = object => object && typeof object === 'object'
      ? Object.getPrototypeOf(object) === null ? 'null' : Object.getPrototypeOf(object) === Object.prototype ? 'plain' : 'other'
      : typeof object;
    const outputPrototypes = value && typeof value === 'object' ? {
      result: proto(value), source: proto(value.source), query: proto(value.query),
      validation: proto(value.sourceValidation), selection: proto(value.selection),
      firstEntry: proto(value.selection?.[0]), firstElement: proto(value.selection?.[0]?.element),
    } : undefined;
    const outputShape = [];
    const visit = (object, path, depth) => {
      if (!object || typeof object !== 'object' || depth > 3) return;
      const keys = Reflect.ownKeys(object);
      outputShape.push({path, keys: keys.map(String), descriptors: keys.map(key => {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        return {key: String(key), enumerable: descriptor?.enumerable === true,
          kind: descriptor && Object.hasOwn(descriptor, 'value') ? 'data' : descriptor ? 'accessor' : 'missing'};
      })});
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        if (descriptor && Object.hasOwn(descriptor, 'value')) visit(descriptor.value, `${path}/${String(key)}`, depth + 1);
      }
    };
    visit(value, '$', 0);
    return {ok: true, value, outputPrototypes, outputShape, events};
  }
  catch (error) {
    const thrownIdentity = expectedThrown !== undefined && error === expectedThrown;
    if (thrownIdentity) return {ok: false, thrownIdentity, error: {kind: 'caller-thrown-object'}, events};
    const data = (key) => {
      if (!error || (typeof error !== 'object' && typeof error !== 'function')) return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(error, key);
      return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
    };
    const errorKeys = error && (typeof error === 'object' || typeof error === 'function') ? Reflect.ownKeys(error).map(String) : [];
    return {ok: false, thrownIdentity, error: {
      name: data('name') ?? (error instanceof Error ? 'Error' : typeof error),
      code: data('code'), path: data('path'), message: data('message'),
      stack: error instanceof Error ? error.stack : data('stack'),
      ownKeys: errorKeys,
    }, events};
  }
}

function registryExtensions(registry) {
  return registry.registrations().map(({manifest, kinds, semantics}) => ({manifest, kinds, semantics}));
}

function proxyJson(value, label, events, failAt) {
  return new Proxy(value, {
    getPrototypeOf(target) { events.push(`${label}:getPrototypeOf`); return Reflect.getPrototypeOf(target); },
    ownKeys(target) { events.push(`${label}:ownKeys`); if (failAt?.at === 'ownKeys') throw failAt.error; return Reflect.ownKeys(target); },
    getOwnPropertyDescriptor(target, key) { events.push(`${label}:descriptor:${String(key)}`); return Reflect.getOwnPropertyDescriptor(target, key); },
  });
}

function compare(a, b) {
  const canonical = value => JSON.stringify(value);
  return {
    valueOrErrorEqual: canonical({ok: a.ok, value: a.value, error: a.error, thrownIdentity: a.thrownIdentity}) ===
      canonical({ok: b.ok, value: b.value, error: b.error, thrownIdentity: b.thrownIdentity}),
    outputShapeEqual: canonical(a.outputShape ?? a.error?.ownKeys) === canonical(b.outputShape ?? b.error?.ownKeys),
    hostTraceEqual: canonical(a.events) === canonical(b.events),
  };
}

export function runSelectionHostSuite({Registry, selectCoreElements, createCandidate, candidateLabel}) {
  const cases = {};
  const runPair = (name, make) => {
    const leftEvents = [], rightEvents = [];
    const left = make(leftEvents, false);
    const right = make(rightEvents, true);
    const reference = outcome(() => selectCoreElements(left.source, left.query, left.registry), leftEvents, left.expectedThrown);
    const optIn = outcome(() => createCandidate(right.source, right.query, right.registry), rightEvents, right.expectedThrown);
    cases[name] = {reference, optIn, comparison: compare(reference, optIn)};
  };

  runPair('warning-diagnostic', events => ({source: extensionDocument(), query: {references: 'none'},
    registry: makeRegistry(Registry, events, {alpha: () => [{code: 'CALLER_WARNING', path: '/extensions/alpha', message: 'retained warning', severity: 'warning'}]})}));

  runPair('callback-registration-order', events => ({source: extensionDocument(['alpha', 'beta']), query: {references: 'none'},
    registry: makeRegistry(Registry, events, {
      alpha: () => [{code: 'A', path: '/extensions/alpha', message: 'A warning', severity: 'warning'}],
      beta: () => [{code: 'B', path: '/extensions/beta', message: 'B warning', severity: 'warning'}],
    })}));

  runPair('callback-throws-error', events => ({source: extensionDocument(), query: {references: 'none'},
    registry: makeRegistry(Registry, events, {alpha: () => {throw new Error('callback failed');}})}));

  runPair('callback-throws-string', events => ({source: extensionDocument(), query: {references: 'none'},
    registry: makeRegistry(Registry, events, {alpha: () => {throw 'callback failed';}})}));

  runPair('callback-throws-custom-to-string', events => ({source: extensionDocument(), query: {references: 'none'},
    registry: makeRegistry(Registry, events, {alpha: () => {throw {toString() {events.push('thrown:toString'); return 'custom callback failure';}};}})}));

  runPair('callback-invalid-result', events => ({source: extensionDocument(), query: {references: 'none'},
    registry: makeRegistry(Registry, events, {alpha: () => 'not-an-array'})}));

  runPair('invalid-query-before-registry-reflection', events => ({source: sourceDocument(), query: {references: 'none', unexpected: true},
    registry: makeRegistry(Registry, events, {})}));

  runPair('invalid-source-before-callback', events => {
    const invalid = extensionDocument(); invalid.modules[0].elements[0].id = '';
    return {source: invalid, query: {references: 'none'},
      registry: makeRegistry(Registry, events, {alpha: () => [{code: 'UNEXPECTED', path: '', message: 'must not run', severity: 'error'}]})};
  });

  runPair('empty-result-still-runs-source-validation', events => ({source: extensionDocument(), query: {references: 'none', names: []},
    registry: makeRegistry(Registry, events, {alpha: () => [{code: 'CALLER_WARNING', path: '/extensions/alpha', message: 'retained warning', severity: 'warning'}]})}));

  runPair('budget-before-registry-callback', events => {
    const source = sourceDocument();
    source.extensions = {alpha: {oversized: Array(100_001).fill(0)}};
    return {source, query: {references: 'none'},
      registry: makeRegistry(Registry, events, {alpha: () => [{code: 'UNEXPECTED', path: '', message: 'must not run', severity: 'error'}]})};
  });

  runPair('kind-runtime-delegation', events => {
    const kindRuntime = {validateDocument(source, registrations) {
      events.push(`kindRuntime:validateDocument:${registrations.length}`);
      return {valid: true, complete: true, diagnostics: []};
    }};
    return {source: sourceDocument(), query: {references: 'none'}, registry: makeRegistry(Registry, events, {}, kindRuntime)};
  });

  {
    const leftEvents = [], rightEvents = [];
    const make = events => ({source: proxyJson(sourceDocument(), 'source', events),
      query: proxyJson({references: 'none'}, 'query', events), registry: makeRegistry(Registry, events, {})});
    const left = make(leftEvents), right = make(rightEvents);
    const reference = outcome(() => selectCoreElements(left.source, left.query, left.registry), leftEvents);
    const optIn = outcome(() => createCandidate(right.source, right.query, right.registry), rightEvents);
    cases['source-then-query-copy-and-output-prototypes'] = {reference, optIn, comparison: compare(reference, optIn)};
  }

  const thrown = new Error('host source trap');
  {
    const leftEvents = [], rightEvents = [];
    const make = events => {
      const registry = makeRegistry(Registry, events, {});
      return {source: proxyJson(sourceDocument(), 'source', events, {at: 'ownKeys', error: thrown}),
        query: proxyJson({references: 'none'}, 'query', events), registry};
    };
    const left = make(leftEvents), right = make(rightEvents);
    const reference = outcome(() => selectCoreElements(left.source, left.query, left.registry), leftEvents, thrown);
    const optIn = outcome(() => createCandidate(right.source, right.query, right.registry), rightEvents, thrown);
    cases['source-proxy-before-query'] = {reference, optIn, comparison: compare(reference, optIn)};
  }

  return {format: 'umf.r8.selection-host-trace/1', candidateLabel, cases};
}

export {registryExtensions};
