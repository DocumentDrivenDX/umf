import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const [packagePath, outputPath, label, kind = 'node'] = process.argv.slice(2);
if (!packagePath || !outputPath || !label) {
  throw new Error('usage: host-replay.mjs package-dir output.json label [node|wasm]');
}
const evidenceRoot = new URL('../../../../docs/helix/04-build/evidence/rust-migration/', import.meta.url);
const sevenPath = new URL('r5-json-schema-bindings/predecessor.json', evidenceRoot);
const editPath = new URL('r5-json-schema-tree-operations/predecessor.json', evidenceRoot);
const [sevenBytes, editBytes] = await Promise.all([readFile(sevenPath), readFile(editPath)]);
const replayBytes = await readFile(new URL(import.meta.url));
const seven = JSON.parse(sevenBytes);
const edits = JSON.parse(editBytes);
const api = await import(pathToFileURL(`${packagePath}/index.js`));
const preparedRuntime = process.env.UMF_R8_PREPARED_RUNTIME === '1';
let engine;
let wasmHash = null;
if (kind === 'wasm') {
  const wasm = await import(pathToFileURL(`${packagePath}/pkg/umf_core_wasm.js`));
  const bytes = await readFile(`${packagePath}/pkg/umf_core_wasm_bg.wasm`);
  wasmHash = createHash('sha256').update(bytes).digest('hex');
  await wasm.default({module: bytes});
  engine = preparedRuntime
    ? api.createPreparedJsonSchemaEngine(wasm)
    : api.createJsonSchemaEngine(wasm);
} else {
  engine = preparedRuntime
    ? api.createPreparedJsonSchemaEngine()
    : api.createJsonSchemaEngine();
}

const baseUri = 'https://schemas.example.test/root.json';
const normalize = value => JSON.parse(JSON.stringify(value));
function outcome(fn) {
  try { return {status: 'returned', value: normalize(fn())}; }
  catch (error) {
    return {status: 'threw', name: error?.name ?? 'Error', code: error?.code ?? null, message: error?.message ?? String(error)};
  }
}
function documentFor(input, id) {
  if (input.document !== undefined) return input.document;
  return engine.importJsonSchema(input.schema ?? input.source, input.options ?? {id, baseUri});
}
function replayFacade(test) {
  const input = test.input ?? {};
  if (test.id.startsWith('import.')) {
    const options = input.options ?? {id: input.id, baseUri: input.baseUri, resources: Object.fromEntries(input.resources ?? [])};
    if (options.resources && Array.isArray(options.resources)) options.resources = Object.fromEntries(options.resources);
    return outcome(() => engine.importJsonSchema(input.text, options));
  }
  if (test.id === 'inspect-escaped-surrogate-key-diagnostic') {
    return outcome(() => engine.inspectJsonSchema(engine.importJsonSchema(input.source, {id: 'urn:umf:r5:surrogate-diagnostic', baseUri})));
  }
  if (test.id === 'get-literal-surrogate-utf16-pointer') {
    return outcome(() => engine.getJsonSchemaNode(documentFor(input, 'urn:umf:r5:utf16-key'), input.pointer));
  }
  if (test.id === 'copy-isolation-get-bundle-walk') {
    return outcome(() => {
      const snapshot = {getNode: engine.getJsonSchemaNode(input.document, '/properties/x'), bundle: engine.exportJsonSchemaBundle(input.document), walk: engine.walkJsonSchema(input.document)};
      const before = normalize(snapshot);
      snapshot.getNode.kind = 'null'; snapshot.bundle.source.id = 'mutated';
      snapshot.bundle.resources['https://schemas.example.test/z.json'] = 'mutated';
      if (snapshot.walk[1]) snapshot.walk[1].node.kind = 'null';
      return {preMutationSnapshot: before, mutatedReturnedCopies: snapshot,
        postMutationRereads: {getNode: engine.getJsonSchemaNode(input.document, '/properties/x'), bundle: engine.exportJsonSchemaBundle(input.document), walk: engine.walkJsonSchema(input.document)}};
    });
  }
  const document = documentFor(input, `urn:umf:r5:${test.id}`);
  if (test.id.startsWith('inspect')) return outcome(() => engine.inspectJsonSchema(document));
  if (test.id.startsWith('export.resources')) return outcome(() => engine.exportJsonSchemaResources(document));
  if (test.id.startsWith('export.bundle')) return outcome(() => engine.exportJsonSchemaBundle(document));
  if (test.id.startsWith('export')) return outcome(() => engine.exportJsonSchema(document));
  if (test.id.startsWith('get-and-walk-')) return outcome(() => ({get: outcome(() => engine.getJsonSchemaNode(document, input.pointer)), walk: engine.walkJsonSchema(document)}));
  if (test.id.startsWith('get')) return outcome(() => engine.getJsonSchemaNode(document, input.pointer));
  if (test.id.startsWith('walk')) return outcome(() => engine.walkJsonSchema(document));
  throw new Error(`No JSON Schema façade replay mapping for ${test.id}`);
}
function replayEdit(test) {
  const input = test.input ?? {};
  const schema = input.schema ?? (test.id === 'edit.incomplete-schema-refused'
    ? '{"$schema":"https://example.test/custom","type":"object"}'
    : '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"amount":{"type":"number","minimum":0},"text":{"type":"string","minLength":1}},"$defs":{"nested":{"type":"string"}}}');
  const identity = test.id.includes('array-pointer') ? 'urn:umf:r5:tree-array'
    : test.id.includes('escaped-pointer') ? 'urn:umf:r5:tree-escaped'
      : test.id.includes('lone-surrogate') ? 'urn:umf:r5:tree-surrogate'
        : test.id.includes('incomplete-schema') ? 'urn:umf:r5:tree-unknown' : 'urn:umf:r5:tree';
  // Match the frozen tree-operation harness: the target operation receives a
  // native document assembled from a parsed source tree, not an imported
  // document with import-time validation side effects.
  const original = {
    umf: '0.10.0', id: identity,
    vocabularies: {'umf.json-schema': {version: '0.1.0'}},
    modules: [{id: 'schema', namespace: 'https://schemas.example.test/tree.json', elements: [{id: 'schema', extensions: {
      'umf.json-schema': {dialect: 'https://json-schema.org/draft/2020-12/schema', baseUri: 'https://schemas.example.test/tree.json', root: engine.parseNativeJson(schema), resources: {}},
    }}]}],
  };
  if (test.id === 'edit.invalid-source-before-target-lookup') original.id = '';
  const before = JSON.stringify(original);
  try {
    if (test.id === 'edit.escaped-pointer-and-astral-key-success') {
      const slash = engine.editJsonSchemaNode(original, input.pointers[0], input.replacement);
      const astral = engine.editJsonSchemaNode(original, input.pointers[1], '"integer"');
      return {status: 'returned', value: {slashEditedSource: engine.exportJsonSchema(slash), astralEditedSource: engine.exportJsonSchema(astral), sourceUnchanged: JSON.stringify(original) === before}};
    }
    const edited = engine.editJsonSchemaNode(original, input.pointer, input.replacement);
    if (test.id === 'edit.success.changed-number-and-source-unchanged') {
      return {status: 'returned', value: {edited: normalize(edited), editedSource: engine.exportJsonSchema(edited), sourceUnchanged: JSON.stringify(original) === before}};
    }
    if (test.id === 'edit.lone-surrogate-schema-refused-atomically') {
      return {status: 'returned', value: {edited: normalize(edited), sourceUnchanged: JSON.stringify(original) === before}};
    }
    return {status: 'returned', value: normalize(edited)};
  } catch (error) {
    const thrown = {name: error?.name ?? 'Error', code: error?.code ?? null, path: error?.path ?? null, message: error?.message ?? String(error)};
    if (test.id === 'edit.lone-surrogate-schema-refused-atomically') {
      return {status: 'returned', value: {refusal: thrown, sourceUnchanged: JSON.stringify(original) === before}};
    }
    return {status: 'threw', ...thrown};
  }
}

const facadeRows = seven.cases.map(test => ({id: `facade:${test.id}`, expected: test.outcome, actual: replayFacade(test)}));
const editCases = edits.cases.filter(test => test.id.startsWith('edit.'));
const editRows = editCases.map(test => ({id: `edit:${test.id}`, expected: test.outcome, actual: replayEdit(test)}));
const rows = [...facadeRows, ...editRows];
const mismatches = rows.filter(row => JSON.stringify(row.expected) !== JSON.stringify(row.actual)).map(({id, expected, actual}) => ({id, expected, actual}));
const receipt = {
  format: 'umf-r8-json-schema-eight-operation-opt-in-replay/1', label, kind,
  engineFactory: preparedRuntime ? 'createPreparedJsonSchemaEngine' : 'createJsonSchemaEngine',
  runtime: {node: process.version, bun: typeof Bun === 'undefined' ? null : Bun.version},
  packetHashes: {
    facadeSeven: createHash('sha256').update(sevenBytes).digest('hex'),
    treeEditPredecessor: createHash('sha256').update(editBytes).digest('hex'),
  },
  replayScriptSha256: createHash('sha256').update(replayBytes).digest('hex'),
  scope: {
    operations: ['importJsonSchema', 'inspectJsonSchema', 'exportJsonSchema', 'exportJsonSchemaResources', 'exportJsonSchemaBundle', 'getJsonSchemaNode', 'walkJsonSchema', 'editJsonSchemaNode'],
    facadeCases: facadeRows.length, editCases: editRows.length,
    editSourcePacketContainsParserCases: edits.cases.length - editCases.length,
  },
  wasmSha256: wasmHash,
  matched: rows.length - mismatches.length,
  caseCount: rows.length,
  outcomeCounts: rows.reduce((counts, row) => { counts[row.actual.status] = (counts[row.actual.status] ?? 0) + 1; return counts; }, {}),
  mismatches,
  rows,
};
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({...receipt, rows: undefined}));
if (mismatches.length) process.exitCode = 1;
