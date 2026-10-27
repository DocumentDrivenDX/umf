// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const repo = resolve(import.meta.dir, '../../..');
const outDir = process.argv[2];
if (!outDir) throw new Error('usage: bun freeze-arrow-typescript-outcomes.mjs OUT_DIR');
const {
  exportArrowSchema, getArrowNode, importArrowSchema, inspectArrow, proposeArrowNodeEdit,
} = await import(resolve(repo, 'src/adapters/arrow/index.ts'));
const inputPath = resolve(repo, 'fixtures/arrow/schema-cases.json');
const inputBytes = await readFile(inputPath);
const corpus = JSON.parse(inputBytes.toString('utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const byteRecord = value => {
  const bytes = Buffer.from(value, 'utf8');
  return {utf8Base64: bytes.toString('base64'), utf8Sha256: sha(bytes), utf8Length: bytes.length};
};
const stringify = value => JSON.stringify(value);
const outcome = (operation, run) => {
  try {
    const value = run();
    const outputJson = stringify(value);
    return {
      operation, kind: 'return', value, outputJson,
      outputJsonBytes: byteRecord(outputJson),
      ...(typeof value === 'string' ? {nativeOutputBytes: byteRecord(value)} : {}),
    };
  } catch (error) {
    const message = String(error?.message ?? error);
    let diagnostics;
    try {
      const parsed = JSON.parse(message);
      if (Array.isArray(parsed)) diagnostics = parsed;
    } catch {}
    return {
      operation, kind: 'throw',
      error: {
        name: error?.name ?? typeof error,
        constructor: error?.constructor?.name ?? null,
        code: error?.code ?? null,
        path: error?.path ?? null,
        message,
        ...(diagnostics ? {diagnostics} : {}),
      },
    };
  }
};
const documentJson = document => stringify(document);
const sourceText = value => JSON.stringify(value);
const corpusRows = [];

for (let index = 0; index < corpus.length; index++) {
  const item = corpus[index];
  const inputJson = sourceText(item.input);
  const imported = outcome('importArrowSchema', () => importArrowSchema(inputJson, {id: item.id}));
  const row = {
    id: item.id, corpusIndex: index, inputJson, inputBytes: byteRecord(inputJson),
    options: {id: item.id}, operations: {importArrowSchema: imported},
    inputStringUnchanged: inputJson === sourceText(item.input),
  };
  if (imported.kind === 'return') {
    const document = imported.value;
    const before = documentJson(document);
    const calls = [
      ['inspectArrow', () => inspectArrow(document)],
      ['exportArrowSchema', () => exportArrowSchema(document)],
      ['getArrowNode', () => getArrowNode(document, '')],
      ['proposeArrowNodeEdit', () => proposeArrowNodeEdit(document, '/fields/0/name', sourceText(item.id + '-edited'))],
    ];
    row.operations.inputDocumentBeforeSha256 = sha(Buffer.from(before));
    row.operations.immutability = {};
    for (const [name, run] of calls) {
      row.operations[name] = outcome(name, run);
      const after = documentJson(document);
      row.operations.immutability[name] = {unchanged: before === after, afterSha256: sha(Buffer.from(after))};
    }
  }
  corpusRows.push(row);
}

const focused = [];
function focusInput(name, inputJson, id) {
  const row = {name, inputJson, inputBytes: byteRecord(inputJson), id};
  row.import = outcome('importArrowSchema', () => importArrowSchema(inputJson, {id}));
  if (row.import.kind === 'return') {
    const document = row.import.value;
    const originalJson = documentJson(document);
    row.operations = {};
    for (const [operation, run] of [
      ['inspectArrow', () => inspectArrow(document)],
      ['exportArrowSchema', () => exportArrowSchema(document)],
      ['getArrowNode', () => getArrowNode(document, '')],
    ]) row.operations[operation] = outcome(operation, run);
    const after = documentJson(document);
    row.operations.immutability = {
      beforeSha256: sha(Buffer.from(originalJson)),
      afterSha256: sha(Buffer.from(after)),
      unchanged: originalJson === after,
    };
    return {row, document};
  }
  return {row, document: null};
}

const unknownText = '{"fields":[{"name":"future","nullable":true,"type":{"name":"future_type","parameter":9007199254740993},"dictionary":{"id":9223372036854775807},"metadata":[{"key":"same","value":"first"},{"key":"same","value":"last"}]}],"extra":9007199254740993.1}';
const unknown = focusInput('future-type-duplicate-metadata-exact-numbers', unknownText, 'future');
unknown.row.operations.getArrowNode = outcome('getArrowNode', () => getArrowNode(unknown.document, '/fields/0/type/parameter'));
unknown.row.operations.proposeArrowNodeEdit = outcome('proposeArrowNodeEdit', () => proposeArrowNodeEdit(unknown.document, '/fields/0/name', '"changed"'));
unknown.row.operations.afterAllSha256 = sha(Buffer.from(documentJson(unknown.document)));
unknown.row.operations.inputUnchanged = unknown.row.operations.immutability.unchanged;
focused.push(unknown.row);

const invalidTexts = [
  ['invalid-json', '{"fields":[', 'bad-json'],
  ['invalid-integer-width', '{"fields":[{"name":"bad","nullable":true,"type":{"name":"int","bitWidth":7,"isSigned":true}}]}', 'bad-width'],
  ['invalid-time-width', '{"fields":[{"name":"bad","nullable":true,"type":{"name":"time","unit":"NANOSECOND","bitWidth":32}}]}', 'bad-time'],
  ['invalid-decimal-precision', '{"fields":[{"name":"bad","nullable":true,"type":{"name":"decimal","bitWidth":32,"precision":20,"scale":0}}]}', 'bad-decimal'],
  ['missing-required-list-child', '{"fields":[{"name":"bad","nullable":true,"type":{"name":"list"}}]}', 'bad-list'],
  ['invalid-map-key-nullability', '{"fields":[{"name":"m","nullable":true,"type":{"name":"map","keysSorted":false},"children":[{"name":"entries","nullable":false,"type":{"name":"struct"},"children":[{"name":"key","nullable":true,"type":{"name":"utf8"}},{"name":"value","nullable":true,"type":{"name":"utf8"}}]}]}]}', 'bad-map'],
  ['invalid-run-end-nullability', '{"fields":[{"name":"runs","nullable":true,"type":{"name":"runendencoded"},"children":[{"name":"run_ends","nullable":true,"type":{"name":"int","bitWidth":16,"isSigned":true}},{"name":"values","nullable":true,"type":{"name":"utf8"}}]}]}', 'bad-runs'],
  ['dictionary-id-fractional', '{"fields":[{"name":"d","nullable":true,"type":{"name":"utf8"},"dictionary":{"id":9223372036854775807.5}}]}', 'bad-id-fractional'],
  ['dictionary-id-overflow', '{"fields":[{"name":"d","nullable":true,"type":{"name":"utf8"},"dictionary":{"id":9223372036854775808}}]}', 'bad-id-overflow'],
  ['dictionary-id-nonfinite-exponent', '{"fields":[{"name":"d","nullable":true,"type":{"name":"utf8"},"dictionary":{"id":1e10000}}]}', 'bad-id-exponent'],
];
for (const [name, text, id] of invalidTexts) {
  focused.push({
    name, inputJson: text, inputBytes: byteRecord(text), id,
    import: outcome('importArrowSchema', () => importArrowSchema(text, {id})),
  });
}

const focusedValid = [
  ['dictionary-scientific-integer', '{"fields":[{"name":"d","nullable":true,"type":{"name":"utf8"},"dictionary":{"id":1e3}}]}', 'scientific'],
  ['map-layout', '{"fields":[{"name":"map","nullable":true,"type":{"name":"map","keysSorted":false},"children":[{"name":"entries","nullable":false,"type":{"name":"struct"},"children":[{"name":"key","nullable":false,"type":{"name":"utf8"}},{"name":"value","nullable":true,"type":{"name":"utf8"}}]}]}]}', 'map'],
  ['run-end-layout', '{"fields":[{"name":"runs","nullable":true,"type":{"name":"runendencoded"},"children":[{"name":"run_ends","nullable":false,"type":{"name":"int","bitWidth":16,"isSigned":true}},{"name":"values","nullable":true,"type":{"name":"utf8"}}]}]}', 'runs'],
];
for (const [name, text, id] of focusedValid) {
  const entry = focusInput(name, text, id);
  entry.row.operations.getArrowNode = outcome('getArrowNode', () => getArrowNode(entry.document, '/fields/0'));
  entry.row.operations.proposeArrowNodeEdit = outcome('proposeArrowNodeEdit', () => proposeArrowNodeEdit(entry.document, '/fields/0/name', JSON.stringify(id + '-edited')));
  entry.row.operations.inputUnchangedAfterEdit = entry.row.operations.immutability.unchanged;
  focused.push(entry.row);
}

const baseText = '{"fields":[{"name":"field","nullable":true,"type":{"name":"utf8"},"children":[],"metadata":[]}],"metadata":[]}';
const base = focusInput('operation-errors-and-edit-controls', baseText, 'controls');
const doc = base.document;
const beforeControls = documentJson(doc);
const editControls = [
  ['get-missing-pointer', () => getArrowNode(doc, '/fields/3/name')],
  ['get-invalid-pointer-escape', () => getArrowNode(doc, '/fields/0/name/~2')],
  ['edit-invalid-json-replacement', () => proposeArrowNodeEdit(doc, '/fields/0/name', '{')],
  ['edit-missing-pointer', () => proposeArrowNodeEdit(doc, '/fields/3/name', '"x"')],
  ['edit-invalid-type', () => proposeArrowNodeEdit(doc, '/fields/0/type', '{"name":"int","bitWidth":7,"isSigned":true}')],
  ['edit-success', () => proposeArrowNodeEdit(doc, '/fields/0/name', '"renamed"')],
];
const controlRow = {name: 'operation-errors-and-edit-controls', inputJson: baseText, inputBytes: byteRecord(baseText), id: 'controls', operations: {}};
for (const [name, run] of editControls) {
  controlRow.operations[name] = outcome(name, run);
  controlRow.operations[name + 'InputUnchanged'] = beforeControls === documentJson(doc);
}
controlRow.operations.inputBeforeSha256 = sha(Buffer.from(beforeControls));
controlRow.operations.inputAfterSha256 = sha(Buffer.from(documentJson(doc)));
focused.push(controlRow);

const unknownRepresentation = focusInput('unknown-representation-field', baseText, 'representation');
unknownRepresentation.document.modules[0].elements[0].extensions['umf.arrow'].future = {keep: true};
const representationBefore = documentJson(unknownRepresentation.document);
const representationRow = {name: 'unknown-representation-field', inputJson: baseText, inputBytes: byteRecord(baseText), id: 'representation', operations: {}};
for (const [name, run] of [
  ['inspectArrow', () => inspectArrow(unknownRepresentation.document)],
  ['exportArrowSchema', () => exportArrowSchema(unknownRepresentation.document)],
  ['getArrowNode', () => getArrowNode(unknownRepresentation.document, '/fields/0/name')],
  ['proposeArrowNodeEdit', () => proposeArrowNodeEdit(unknownRepresentation.document, '/fields/0/name', '"renamed"')],
]) {
  representationRow.operations[name] = outcome(name, run);
  representationRow.operations[name + 'InputUnchanged'] = representationBefore === documentJson(unknownRepresentation.document);
}
focused.push(representationRow);

const sentinel = {reason: 'proxy getPrototypeOf'};
const proxy = new Proxy(doc, {getPrototypeOf() { throw sentinel; }});
let caught;
try { inspectArrow(proxy); } catch (error) { caught = error; }
focused.push({
  name: 'proxy-reflection-throw-identity', operation: 'inspectArrow',
  thrownObjectIdentityPreserved: caught === sentinel,
  thrownName: caught?.name ?? null,
  thrownMessage: String(caught?.message ?? caught),
});

const packet = {
  format: 'umf.arrow.typescript-public-schema-replay/1',
  scope: 'Current TypeScript public Arrow schema JSON adapter only; no Rust/NAPI/WASM/native Arrow or PyArrow outcomes are included.',
  operationNames: ['importArrowSchema', 'inspectArrow', 'exportArrowSchema', 'getArrowNode', 'proposeArrowNodeEdit'],
  source: {
    repositoryPath: '.', corpusPath: 'fixtures/arrow/schema-cases.json',
    corpusSha256: sha(inputBytes), corpusCaseCount: corpus.length,
    authoredCoverage: '52 authored Arrow schema JSON cases; per case each of the five public operations is captured, with getArrowNode at the root pointer and proposal replacing /fields/0/name.',
    nativeOracleEvidence: 'Separate sources include fixtures/arrow/capability-results.json and public-ipc-oracle-results.json; this packet does not inherit or extend those native/PyArrow claims.',
  },
  encoding: {
    json: 'Each successful operation stores its exact JSON.stringify result and its UTF-8 base64, byte length, and SHA-256.',
    export: 'exportArrowSchema additionally stores the exact native JSON UTF-8 bytes independently of JSON-string escaping.',
    errors: 'Thrown outcomes preserve exact name, constructor, code, path, and message.',
  },
  corpus: corpusRows, focused,
};
await mkdir(outDir, {recursive: true});
const packetBytes = Buffer.from(JSON.stringify(packet, null, 2) + '\n', 'utf8');
const packetPath = outDir + '/typescript-arrow-schema-outcomes.json';
await writeFile(packetPath, packetBytes, {flag: 'wx'});
const summary = {
  status: 'frozen', packetPath, packetSha256: sha(packetBytes), packetBytes: packetBytes.length,
  corpusCaseCount: corpus.length,
  operationOutcomes: Object.fromEntries(packet.operationNames.map(name => [name, corpusRows.filter(row => row.operations[name]).length])),
  successfulCorpusImports: corpusRows.filter(row => row.operations.importArrowSchema.kind === 'return').length,
  failedCorpusImports: corpusRows.filter(row => row.operations.importArrowSchema.kind === 'throw').length,
  focusedCaseCount: focused.length,
  exactCorpusInputSha256: sha(inputBytes),
  difficultHostBehavior: focused.find(row => row.name === 'proxy-reflection-throw-identity'),
};
await writeFile(outDir + '/summary.json', JSON.stringify(summary, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify(summary, null, 2));
