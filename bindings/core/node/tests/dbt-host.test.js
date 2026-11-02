import {describe, expect, test} from 'bun:test';
import {createDbtOperations, DBT_PROFILE, isDbtHostError} from '../src/dbt.js';
import {createDbtEngine} from '../index.js';
import {encodeWire, fromWire} from '../src/wire.js';
import {importDbtManifest, inspectDbtManifest} from '../../../../src/adapters/dbt/index.ts';
import {importDbtArtifact, inspectDbtArtifact} from '../../../../src/adapters/dbt/artifact.ts';
import {importDbtSemanticManifest, inspectDbtSemanticManifest} from '../../../../src/adapters/dbt/semantic.ts';
import {selectDbtManifestDependencies} from '../../../../src/adapters/dbt/selection.ts';
import packet from '../../../../tests/rust-core/dbt-parity-freeze.json' with {type: 'json'};

describe('opt-in Rust dbt facade', () => {
  test('forwards the public DBT operation family with the requested payload fields', () => {
    const requests = [];
    const dbt = createDbtOperations((op, fields) => {
      requests.push({op, fields});
      if (op === 'prepareManifestSelectionBounds') return {minimum: 1, maximum: 64};
      if (op === 'prepareManifestSelectionRootItem') return false;
      if (op === 'prepareManifestSelectionSettings') return fields.options;
      if (op === 'finishManifestSelection') return {source: {}, selection: {}};
      return fields;
    });
    const document = {umf: '0.10.0'};
    const source = '{"metadata":{}}';
    const options = {id: 'fixture'};
    dbt.importDbtManifest(source, options);
    dbt.exportDbtManifest(document);
    dbt.inspectDbtManifest(document);
    dbt.getDbtManifestNode(document, '/metadata');
    dbt.proposeDbtManifestNodeEdit(document, '/metadata', source);
    dbt.importDbtArtifact(source, options);
    dbt.exportDbtArtifact(document);
    dbt.inspectDbtArtifact(document);
    dbt.getDbtArtifactNode(document, '/metadata');
    dbt.proposeDbtArtifactNodeEdit(document, '/metadata', source);
    dbt.importDbtSemanticManifest(source, options);
    dbt.exportDbtSemanticManifest(document);
    dbt.inspectDbtSemanticManifest(document);
    dbt.getDbtSemanticManifestNode(document, '/metadata');
    dbt.proposeDbtSemanticManifestNodeEdit(document, '/metadata', source);
    dbt.inspectDbtManifestGraph(document);
    dbt.selectDbtManifestDependencies(document, {roots: ['model.x.a']});

    expect(dbt.profile).toBe(DBT_PROFILE);
    expect(requests.map(request => request.op)).toEqual([
      'importManifest', 'exportManifest', 'inspectManifest', 'getManifestNode', 'editManifest',
      'importArtifact', 'exportArtifact', 'inspectArtifact', 'getArtifactNode', 'editArtifact',
      'importSemanticManifest', 'exportSemanticManifest', 'inspectSemanticManifest',
      'getSemanticManifestNode', 'editSemanticManifest', 'inspectManifestGraph',
      'prepareManifestSelectionBounds', 'prepareManifestSelectionRootItem',
      'prepareManifestSelectionSettings', 'prepareManifestSelectionGraph',
      'prepareManifestSelectionRootItem', 'finishManifestSelection',
    ]);
    expect(requests[0].fields).toEqual({text: source, options});
    expect(requests.at(-1).fields.roots).toEqual(['model.x.a']);
  });

  test('selection stages raw roots and optional settings for Rust validation', () => {
    const seen = [];
    const dbt = createDbtOperations((op, fields) => {
      seen.push({op, fields});
      if (op === 'prepareManifestSelectionBounds') return {minimum: 1, maximum: 64};
      if (op === 'prepareManifestSelectionRootItem') return false;
      if (op === 'prepareManifestSelectionSettings') return fields.options;
      return {source: {}, selection: {}};
    });
    dbt.selectDbtManifestDependencies({}, {roots: ['x'], includeMacros: null});
    expect(seen.map(item => item.op)).toEqual([
      'prepareManifestSelectionBounds', 'prepareManifestSelectionRootItem',
      'prepareManifestSelectionSettings', 'prepareManifestSelectionGraph',
      'prepareManifestSelectionRootItem', 'finishManifestSelection',
    ]);
    expect(seen[1].fields.item).toBe('x');
    expect(seen[2].fields.options).toEqual({includeMacros: null});
    expect(seen[5].fields.roots).toEqual(['x']);
  });

  test('import reads id once and preserves parser-before-non-JSON-id precedence', () => {
    const calls = [];
    let reads = 0;
    const options = {get id() { reads++; return undefined; }};
    const dbt = createDbtOperations((op, fields) => { calls.push(op); return fields; }, {
      prepareTransaction(transaction) { transaction.hostWork = () => {}; },
      copyJson(value) {
        if (Object.hasOwn(value, 'id') && value.id === undefined) {
          const error = Object.assign(new Error('Value is not JSON-compatible'), {code: 'NON_JSON', path: '/id'});
          throw error;
        }
        return value;
      },
      isHostJsonResponseError(error) { return error?.code === 'NON_JSON'; },
    });
    let caught;
    try { dbt.importDbtManifest('{}', options); } catch (error) { caught = error; }
    expect(reads).toBe(1);
    expect(calls).toEqual(['prepareImportText']);
    expect(caught).toMatchObject({code: 'DBT_MANIFEST_DOCUMENT', message: '[{"code":"NON_JSON","path":"/id","message":"Value is not JSON-compatible","severity":"error"}]'});
    expect(isDbtHostError(caught)).toBe(true);
  });

  test('caller exceptions from id access and document copy retain identity', () => {
    const thrown = Object.assign(new Error('caller failure'), {code: 'DBT_MANIFEST_DOCUMENT'});
    const dbt = createDbtOperations(() => { throw new Error('unexpected native call'); }, {
      copyJson() { throw thrown; }, isHostJsonResponseError() { return false; },
    });
    expect(() => dbt.importDbtManifest('{}', {get id() { throw thrown; }})).toThrow(thrown);
    expect(() => dbt.exportDbtManifest({})).toThrow(thrown);
    expect(isDbtHostError(thrown)).toBe(false);
  });

  test('selection invokes real getters, some, and iterator in predecessor order', () => {
    const events = [];
    const roots = ['model.x.a'];
    roots.some = function (callback) { events.push('some'); return Array.prototype.some.call(this, callback); };
    roots[Symbol.iterator] = function* () { events.push('iterator'); yield 'model.x.a'; };
    let reads = 0;
    const options = {
      get roots() { events.push(`roots-${++reads}`); return roots; },
      get includeMacros() { events.push('includeMacros'); return false; },
      get maxDepth() { events.push('maxDepth'); return 2; },
      get maxNodes() { events.push('maxNodes'); return 4; },
    };
    const dbt = createDbtOperations((op, fields) => {
      events.push(op);
      if (op === 'prepareManifestSelectionBounds') return {minimum: 1, maximum: 64};
      if (op === 'prepareManifestSelectionRootItem') return false;
      if (op === 'prepareManifestSelectionSettings') return fields.options;
      if (op === 'finishManifestSelection') return {source: {}, selection: {}};
      return null;
    }, {copyJson(value) { events.push('copy'); return value; }});
    dbt.selectDbtManifestDependencies({}, options);
    expect(events.filter(event => event.startsWith('roots-'))).toEqual([
      'roots-1', 'roots-2', 'roots-3', 'roots-4', 'roots-5',
    ]);
    expect(events.filter(event => event === 'includeMacros' || event === 'maxDepth' || event === 'maxNodes')).toEqual([
      'includeMacros', 'includeMacros', 'maxDepth', 'maxDepth', 'maxNodes', 'maxNodes',
    ]);
    expect(events.indexOf('some')).toBeLessThan(events.indexOf('copy'));
    expect(events.indexOf('prepareManifestSelectionGraph')).toBeLessThan(events.indexOf('iterator'));
    expect(events.indexOf('iterator')).toBeLessThan(events.indexOf('finishManifestSelection'));
  });

  test('a custom root iterator cannot escape the declared bounded root count', () => {
    const roots = ['model.x.a'];
    roots[Symbol.iterator] = function* () { for (let index = 0; index < 65; index++) yield `model.x.${index}`; };
    const dbt = createDbtOperations((op, fields) => {
      if (op === 'prepareManifestSelectionBounds') return {minimum: 1, maximum: 64};
      if (op === 'prepareManifestSelectionRootItem') return false;
      if (op === 'prepareManifestSelectionSettings') return fields.options;
      if (op === 'finishManifestSelection') throw new Error('unbounded iterator reached native selection');
      return null;
    });
    let caught;
    try { dbt.selectDbtManifestDependencies({}, {roots}); } catch (error) { caught = error; }
    expect(caught?.code).toBe('RESOURCE_LIMIT');
    expect(isDbtHostError(caught)).toBe(true);
  });
});

// Replay the same complete outcomes over the actual JS/native boundary.
// One runtime and one process cover the family rather than rebuilding per case.
test('production native DBT host matches the complete frozen predecessor packet', () => {
  const engine = createDbtEngine();
  const routes = {
    importManifest: ['importDbtManifest', 'text', 'options'],
    exportManifest: ['exportDbtManifest', 'document'],
    inspectManifest: ['inspectDbtManifest', 'document'],
    getManifestNode: ['getDbtManifestNode', 'document', 'path'],
    editManifest: ['proposeDbtManifestNodeEdit', 'document', 'path', 'text'],
    importArtifact: ['importDbtArtifact', 'text', 'options'],
    exportArtifact: ['exportDbtArtifact', 'document'],
    inspectArtifact: ['inspectDbtArtifact', 'document'],
    getArtifactNode: ['getDbtArtifactNode', 'document', 'path'],
    editArtifact: ['proposeDbtArtifactNodeEdit', 'document', 'path', 'text'],
    importSemanticManifest: ['importDbtSemanticManifest', 'text', 'options'],
    exportSemanticManifest: ['exportDbtSemanticManifest', 'document'],
    inspectSemanticManifest: ['inspectDbtSemanticManifest', 'document'],
    getSemanticManifestNode: ['getDbtSemanticManifestNode', 'document', 'path'],
    editSemanticManifest: ['proposeDbtSemanticManifestNodeEdit', 'document', 'path', 'text'],
    inspectManifestGraph: ['inspectDbtManifestGraph', 'document'],
    selectManifestDependencies: ['selectDbtManifestDependencies', 'document', 'options'],
  };
  const units = text => Array.from({length: text.length}, (_, i) => text.charCodeAt(i));
  for (const item of packet.cases) {
    const request = fromWire(JSON.parse(item.requestWire));
    const [method, ...arguments_] = routes[request.op.slice(4)];
    let actual;
    try {
      actual = {status: 'ok', wire: encodeWire(engine[method](...arguments_.map(key => request[key])))};
    } catch (error) {
      actual = {status: 'error', code: error.code ?? null, pathUnits: units(error.path ?? ''), messageUnits: units(error.message)};
    }
    // Avoid dumping an entire native document on mismatch.
    expect(JSON.stringify(actual) === JSON.stringify(item.expected), item.label).toBe(true);
  }
}, 60000);

test('production DBT host preserves malformed import and inspect outcomes', () => {
  const engine = createDbtEngine();
  const cases = [
    [importDbtManifest, engine.importDbtManifest, inspectDbtManifest, engine.inspectDbtManifest,
      '{"metadata":{"dbt_schema_version":"https://schemas.getdbt.com/dbt/manifest/v99.json"}}'],
    [importDbtArtifact, engine.importDbtArtifact, inspectDbtArtifact, engine.inspectDbtArtifact,
      '{"metadata":{"dbt_schema_version":"https://schemas.getdbt.com/dbt/run-results/v99.json"}}'],
    [importDbtSemanticManifest, engine.importDbtSemanticManifest, inspectDbtSemanticManifest, engine.inspectDbtSemanticManifest,
      '{"project_configuration":{}}'],
  ];
  const outcome = operation => {
    try { return {status: 'ok', wire: encodeWire(operation())}; }
    catch (error) { return {status: 'error', code: error.code ?? null, path: error.path ?? '', message: error.message}; }
  };
  for (const [predecessorImport, rustImport, predecessorInspect, rustInspect, text] of cases) {
    for (const id of [undefined, () => {}, Symbol('id'), 1, null, {extra: 'kept'}]) {
      expect(outcome(() => rustImport(text, {id}))).toEqual(outcome(() => predecessorImport(text, {id})));
      expect(outcome(() => rustImport('{', {id}))).toEqual(outcome(() => predecessorImport('{', {id})));
    }
    const predecessorDocument = predecessorImport(text, {id: 'malformed-inspect'});
    const invalidDocument = {...predecessorDocument, id: undefined};
    expect(outcome(() => rustInspect(invalidDocument))).toEqual(outcome(() => predecessorInspect(invalidDocument)));
  }
}, 60000);

test('DBT host-copy work shares the operation cancellation bridge', () => {
  let cancelled = false;
  const input = new Proxy({}, {
    ownKeys(target) { cancelled = true; return Reflect.ownKeys(target); },
  });
  const engine = createDbtEngine({controls: {isCancelled: () => cancelled}});
  let caught;
  try { engine.inspectDbtManifest(input); } catch (error) { caught = error; }
  expect(caught?.code).toBe('CANCELLED');
});

test('selection retains an accepted negative-zero depth value', () => {
  const source = '{"metadata":{"dbt_schema_version":"https://schemas.getdbt.com/dbt/manifest/v99.json"}}';
  const document = importDbtManifest(source, {id: 'negative-zero-depth'});
  const original = selectDbtManifestDependencies(document, {roots: ['model.x.a'], maxDepth: -0});
  const native = createDbtEngine().selectDbtManifestDependencies(document, {roots: ['model.x.a'], maxDepth: -0});
  expect(Object.is(original.selection.maxDepth, -0)).toBe(true);
  expect(Object.is(native.selection.maxDepth, -0)).toBe(true);
});
