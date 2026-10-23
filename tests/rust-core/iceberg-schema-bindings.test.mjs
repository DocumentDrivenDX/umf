import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createIcebergSchemaEngine} from '../../bindings/core/node/index.js';

const root = resolve(import.meta.dir, '../..');
const frozen = JSON.parse(readFileSync(resolve(root, 'docs/helix/04-build/evidence/rust-migration/r5-iceberg-schema/baseline.json'), 'utf8'));
const fixture = path => readFileSync(resolve(root, path), 'utf8');
const capture = operation => {
  try { return {status: 'ok', value: operation()}; }
  catch (error) { return {status: 'error', code: error.code, message: error.message, path: error.path}; }
};
const encoded = value => JSON.stringify(value);

test('Node/Bun Iceberg engine replays the immutable 35-case predecessor packet', () => {
  const engine = createIcebergSchemaEngine();
  expect(frozen.authoredCases).toHaveLength(35);
  for (const row of frozen.authoredCases) {
    const imported = capture(() => engine.importSchema(fixture(row.path), row.id));
    const expectedImport = row.operations.import;
    if (expectedImport.status === 'error') {
      expect(imported).toMatchObject({status: 'error', code: expectedImport.error.code, message: expectedImport.error.message});
      continue;
    }
    expect(imported.status).toBe('ok');
    const document = imported.value;
    expect(document.id).toBe(row.id);
    expect(engine.inspect(document)).toEqual(row.operations.inspect);
    expect(engine.exportSchema(document)).toBe(row.operations.export.nativeJson);

    const get = row.operations.get;
    expect(encoded(engine.getNode(document, get.path))).toBe(encoded(get.value));
    const missing = capture(() => engine.getNode(document, '/missing'));
    expect(missing).toMatchObject({status: 'error', code: row.operations.getMissing.error.code, message: row.operations.getMissing.error.message});

    const proposal = row.operations.proposeEdit;
    const edited = engine.proposeNodeEdit(document, proposal.path, proposal.replacement);
    expect(edited.validation).toEqual(proposal.validation);
    expect(engine.exportSchema(edited.document)).toBe(proposal.export);
    expect(engine.exportSchema(document)).toBe(proposal.sourceAfter);
  }
}, 120000);

test('pinned-resource engine preserves UTF-16, meters per operation, and keeps diagnostics ordered', () => {
  const source = '{"type":"struct","schema-id":0,"fields":[{"id":1,"name":"\\ud800","type":"string","required":true}]}';
  const original = createIcebergSchemaEngine().importSchema(source, 'utf16-binding');
  const tagged = createIcebergSchemaEngine().getNode(original, '/fields/0/name');
  expect(tagged.kind).toBe('string');
  expect(tagged.value.length).toBe(1);
  expect(tagged.value.charCodeAt(0)).toBe(0xd800);
  expect(createIcebergSchemaEngine().exportSchema(original)).toContain('\\ud800');

  let work = 0;
  const metered = createIcebergSchemaEngine({controls: {meter: amount => { work += amount; }}});
  const validation = metered.inspect(original);
  const firstOperationWork = work;
  expect(firstOperationWork).toBeGreaterThan(0);
  expect(validation.diagnostics.map(item => item.code)).toEqual(['ICEBERG_CONTEXT_UNVERIFIED']);
  metered.inspect(original);
  expect(work).toBe(firstOperationWork * 2);

  const perOperation = createIcebergSchemaEngine({controls: {maxWork: firstOperationWork}});
  expect(perOperation.inspect(original)).toEqual(validation);
  expect(perOperation.inspect(original)).toEqual(validation);
  expect(capture(() => createIcebergSchemaEngine({controls: {maxWork: 0}}).inspect(original)).code).toBe('RESOURCE_LIMIT');
  expect(capture(() => createIcebergSchemaEngine({controls: {isCancelled: () => true}}).inspect(original)).code).toBe('CANCELLED');
  expect(capture(() => createIcebergSchemaEngine({controls: {now: () => 11, deadlineMs: 10}}).inspect(original)).code).toBe('DEADLINE');
});

test('WASM Iceberg wrapper uses the same five-operation wire surface and rejects unavailable hosts', async () => {
  const wasm = await import('../../bindings/core/wasm/index.js');
  const requests = [];
  const fakeModule = {
    icebergSchemaProfileVersion() { return wasm.ICEBERG_SCHEMA_PROFILE; },
    executeIcebergWire(wire) {
      const encodedRequest = JSON.parse(wire);
      const request = decodeTransport(encodedRequest);
      requests.push(request);
      const value = request.op.endsWith('.inspect')
        ? {valid: true, complete: false, diagnostics: []}
        : request.op.endsWith('.export') ? 'native-json'
          : request.op.endsWith('.getNode') ? {kind: 'string', value: 'node'}
            : request.op.endsWith('.proposeNodeEdit') ? {document: {id: 'candidate'}, validation: {valid: true, complete: false, diagnostics: []}}
              : {umf: '0.10.0', id: request.id};
      return JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: JSON.stringify(transport(value))});
    },
  };
  const api = wasm.createIcebergSchemaEngine(fakeModule);
  const document = api.importSchema('{"type":"struct"}', 'wasm-test');
  expect(document.id).toBe('wasm-test');
  expect(api.exportSchema(document)).toBe('native-json');
  expect(api.inspect(document).valid).toBe(true);
  expect(api.getNode(document, '/name').value).toBe('node');
  expect(api.proposeNodeEdit(document, '/name', '"next"').document.id).toBe('candidate');
  expect(requests.map(item => item.op)).toEqual([
    'iceberg.schema.import', 'iceberg.schema.export', 'iceberg.schema.inspect', 'iceberg.schema.getNode', 'iceberg.schema.proposeNodeEdit',
  ]);
  expect(await wasm.initializeIcebergSchemaWasm(async () => fakeModule, {WebAssembly: {instantiate() {}}})).toBeDefined();
  await expect(wasm.initializeIcebergSchemaWasm(async () => fakeModule, {})).rejects.toThrow('WASM_RUNTIME_UNAVAILABLE');
  expect(() => wasm.createIcebergSchemaEngine({...fakeModule, icebergSchemaProfileVersion: () => 'other'})).toThrow('RUST_WASM_BINDING_PROFILE_MISMATCH');
});

function decodeTransport(wire) {
  if (wire.kind === 'object') return Object.fromEntries(wire.members.map(member => [stringFromUnits(member.key), decodeTransport(member.value)]));
  if (wire.kind === 'array') return wire.items.map(decodeTransport);
  if (wire.kind === 'string') return stringFromUnits(wire.units);
  if (wire.kind === 'null') return null;
  if (wire.kind === 'boolean') return wire.value;
  if (wire.kind === 'number') return Number.NaN;
  throw new TypeError('Unknown test transport tag');
}

function stringFromUnits(units) { return String.fromCharCode(...units); }
function transport(value) {
  if (value === null) return {kind: 'null'};
  if (typeof value === 'boolean') return {kind: 'boolean', value};
  if (typeof value === 'number') return {kind: 'number', bits: '0000000000000000'};
  if (typeof value === 'string') return {kind: 'string', units: Array.from({length: value.length}, (_, i) => value.charCodeAt(i))};
  if (Array.isArray(value)) return {kind: 'array', items: value.map(transport)};
  return {kind: 'object', members: Object.entries(value).map(([key, entry]) => ({key: Array.from({length: key.length}, (_, i) => key.charCodeAt(i)), value: transport(entry)}))};
}
