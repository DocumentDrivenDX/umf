// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript-api';
import {editJsonSchemaNode, exportJsonSchema, importJsonSchema} from '../../../src/adapters/json-schema/index.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const packetPath = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r5-json-schema-tree-operations/predecessor.json');
const evidencePath = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-json-schema-edit-current-reference/current-reference.json');
const mode = process.argv[2] ?? '--check';
assert(['--check', '--write'].includes(mode), 'usage: bun scripts/rust-migration/r8/json-schema-edit-current-reference.mjs [--check|--write]');

const packetBytes = await readFile(packetPath);
const packet = JSON.parse(packetBytes);
const baseUri = 'https://schemas.example.test/tree.json';
const defaultSchema = '{"$schema":"https://json-schema.org/draft/2020-12/schema","type":"object","properties":{"amount":{"type":"number","minimum":0},"text":{"type":"string","minLength":1}},"$defs":{"nested":{"type":"string"}}}';
const doc = (schema, id = 'urn:umf:r5:tree') => importJsonSchema(schema, {id, baseUri});
const normalize = value => JSON.parse(JSON.stringify(value));

function actualFor(test) {
  const input = test.input ?? {};
  const source = input.schema ?? (test.id === 'edit.incomplete-schema-refused'
    ? '{"$schema":"https://example.test/custom","type":"object"}'
    : defaultSchema);
  const identity = test.id.includes('array-pointer') ? 'urn:umf:r5:tree-array'
    : test.id.includes('escaped-pointer') ? 'urn:umf:r5:tree-escaped'
      : test.id.includes('lone-surrogate') ? 'urn:umf:r5:tree-surrogate'
        : test.id.includes('incomplete-schema') ? 'urn:umf:r5:tree-unknown'
          : 'urn:umf:r5:tree';
  const original = doc(source, identity);
  if (test.id === 'edit.invalid-source-before-target-lookup') original.id = '';
  const before = JSON.stringify(original);
  try {
    if (test.id === 'edit.escaped-pointer-and-astral-key-success') {
      const slash = editJsonSchemaNode(original, input.pointers[0], input.replacement);
      const astral = editJsonSchemaNode(original, input.pointers[1], '"integer"');
      return {status: 'returned', value: {
        slashEditedSource: exportJsonSchema(slash), astralEditedSource: exportJsonSchema(astral),
        sourceUnchanged: JSON.stringify(original) === before,
      }};
    }
    const edited = editJsonSchemaNode(original, input.pointer, input.replacement);
    if (test.id === 'edit.success.changed-number-and-source-unchanged') {
      return {status: 'returned', value: {edited: normalize(edited), editedSource: exportJsonSchema(edited), sourceUnchanged: JSON.stringify(original) === before}};
    }
    if (test.id === 'edit.lone-surrogate-schema-refused-atomically') {
      return {status: 'returned', value: {edited: normalize(edited), sourceUnchanged: JSON.stringify(original) === before}};
    }
    return {status: 'returned', value: normalize(edited)};
  } catch (error) {
    const thrown = {status: 'threw', name: error.name, code: error.code ?? null, path: error.path ?? null, message: error.message};
    if (test.id === 'edit.lone-surrogate-schema-refused-atomically') {
      return {status: 'returned', value: {refusal: {name: thrown.name, code: thrown.code, path: thrown.path, message: thrown.message}, sourceUnchanged: JSON.stringify(original) === before}};
    }
    return thrown;
  }
}

const cases = packet.cases.filter(test => test.id.startsWith('edit.')).map(test => ({
  id: test.id,
  historicalOutcome: test.outcome,
  currentReferenceOutcome: actualFor(test),
}));
assert.equal(cases.length, 11, 'the bounded packet must contain the exact 11 edit cases');
const mismatchCount = cases.filter(row => JSON.stringify(row.historicalOutcome) !== JSON.stringify(row.currentReferenceOutcome)).length;
assert.equal(mismatchCount, 0, 'current TypeScript reference should remain aligned with the frozen case expectations');

const sourceFiles = [
  'src/model/native-json.ts', 'src/adapters/json-schema/index.ts',
];
const hash = async path => createHash('sha256').update(await readFile(resolve(root, path))).digest('hex');
async function sourceClosure(entries) {
  const config = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
  if (config.error) throw new Error('Unable to read repository TypeScript configuration');
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
  const found = new Set(), pending = [...entries];
  let edgeCount = 0;
  while (pending.length) {
    const path = pending.pop();
    if (found.has(path)) continue;
    found.add(path);
    const file = resolve(root, path), text = await readFile(file, 'utf8');
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS), specifiers = [];
    const visit = node => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifiers.push(node.moduleSpecifier.text);
      else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) specifiers.push(node.arguments[0].text);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    for (const specifier of specifiers) {
      if (!specifier.startsWith('.')) continue;
      const resolved = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule;
      if (!resolved) throw new Error(`Unresolved import ${specifier} from ${path}`);
      const absolute = resolve(resolved.resolvedFileName);
      if (!absolute.startsWith(`${root}/`) || absolute.includes('/node_modules/')) continue;
      edgeCount++;
      pending.push(absolute.slice(root.length + 1));
    }
  }
  const files = Object.fromEntries(await Promise.all([...found].sort().map(async path => [path, await hash(path)])));
  return {
    files,
    edgeCount,
    resolution: 'typescript-api AST static import/export traversal with tsconfig module resolution',
    externalInputs: {'package.json': await hash('package.json'), 'bun.lock': await hash('bun.lock')},
  };
}
const closure = await sourceClosure(sourceFiles);
const baselineClosure = packet.sourceClosure;
assert(baselineClosure?.files && baselineClosure?.externalInputs, 'historical packet must carry the TypeScript source closure');
const changedLocalInputs = Object.keys(closure.files).filter(path => baselineClosure.files[path] !== closure.files[path]);
const removedLocalInputs = Object.keys(baselineClosure.files).filter(path => closure.files[path] === undefined);
const changedExternalInputs = Object.keys(closure.externalInputs).filter(path => baselineClosure.externalInputs[path] !== closure.externalInputs[path]);
const captureScriptPath = 'scripts/rust-migration/r8/json-schema-edit-current-reference.mjs';
const record = {
  format: 'umf.r8-json-schema-edit-current-reference/1',
  status: 'pass',
  scope: 'Eleven frozen edit cases replayed against the current TypeScript reference in Bun. The sourceClosure is the TypeScript AST static import/export traversal from src/model/native-json.ts and src/adapters/json-schema/index.ts using repository tsconfig module resolution, plus package.json and bun.lock hashes. This is a current-reference receipt only; it contains no installed Rust candidate, Node/Bun addon, WASM, or Chromium parity claim.',
  runtime: {bun: Bun.version},
  packet: {
    path: 'docs/helix/04-build/evidence/rust-migration/r5-json-schema-tree-operations/predecessor.json',
    sha256: createHash('sha256').update(packetBytes).digest('hex'),
    editCaseCount: cases.length,
    historicalMismatchCount: mismatchCount,
  },
  cases,
  sourceClosure: closure,
  historicalClosureComparison: {
    baselinePacketSha256: createHash('sha256').update(packetBytes).digest('hex'),
    changedLocalInputs,
    removedLocalInputs,
    changedExternalInputs,
  },
  captureScriptSha256: await hash(captureScriptPath),
};
const expected = `${JSON.stringify(record, null, 2)}\n`;
if (mode === '--write') {
  await writeFile(evidencePath, expected);
  console.log(`wrote ${resolve(evidencePath)}`);
} else {
  const actual = await readFile(evidencePath, 'utf8');
  assert.equal(actual, expected, 'current-reference evidence is stale; rerun with --write and review the diff');
  console.log(`checked ${resolve(evidencePath)} (${cases.length} cases; current TypeScript reference only)`);
}
