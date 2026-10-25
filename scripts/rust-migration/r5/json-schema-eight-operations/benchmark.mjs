import {importJsonSchema, inspectJsonSchema, exportJsonSchema} from '../../../../src/adapters/json-schema/index.ts';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const output = process.argv[2];
if (!output) throw new Error('usage: bun benchmark.mjs output.json');
const packagePath = process.env.UMF_R8_NODE_PACKAGE;
if (!packagePath) throw new Error('Set UMF_R8_NODE_PACKAGE to an isolated native package snapshot');
const {createJsonSchemaEngine, createPreparedJsonSchemaEngine} = await import(pathToFileURL(`${packagePath}/index.js`));
const source = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {account: {type: 'string', minLength: 1}, amount: {type: 'number', minimum: 0}},
  $defs: {nested: {type: 'object', properties: {enabled: {type: 'boolean'}}}},
});
const id = 'urn:umf:r8:benchmark';
const baseUri = 'https://schemas.example.test/benchmark.json';
const rounds = 20;
const time = fn => {
  const start = process.hrtime.bigint();
  for (let i = 0; i < rounds; i++) fn();
  return Number(process.hrtime.bigint() - start) / 1e6 / rounds;
};

const tsImportMs = time(() => importJsonSchema(source, {id, baseUri}));
const tsDocument = importJsonSchema(source, {id, baseUri});
const tsInspectMs = time(() => inspectJsonSchema(tsDocument));
const tsExportMs = time(() => exportJsonSchema(tsDocument));

const factoryStart = process.hrtime.bigint();
const rust = createJsonSchemaEngine();
const rustFactoryMs = Number(process.hrtime.bigint() - factoryStart) / 1e6;
const rustImportMs = time(() => rust.importJsonSchema(source, {id, baseUri}));
const rustDocument = rust.importJsonSchema(source, {id, baseUri});
const rustInspectMs = time(() => rust.inspectJsonSchema(rustDocument));
const rustExportMs = time(() => rust.exportJsonSchema(rustDocument));
const preparedFactoryStart = process.hrtime.bigint();
const prepared = createPreparedJsonSchemaEngine();
const preparedFactoryMs = Number(process.hrtime.bigint() - preparedFactoryStart) / 1e6;
const preparedImportMs = time(() => prepared.importJsonSchema(source, {id, baseUri}));
const preparedDocument = prepared.importJsonSchema(source, {id, baseUri});
const preparedInspectMs = time(() => prepared.inspectJsonSchema(preparedDocument));
const preparedExportMs = time(() => prepared.exportJsonSchema(preparedDocument));
const receipt = {
  format: 'umf-r8-json-schema-operation-benchmark/2', runtime: {bun: Bun.version, node: process.version},
  sourceBytes: new TextEncoder().encode(source).length, rounds, fixture: {source, id, baseUri},
  millisecondsPerCall: {
    typescript: {factory: null, import: tsImportMs, inspect: tsInspectMs, export: tsExportMs},
    rustStateless: {factoryOnce: rustFactoryMs, import: rustImportMs, inspect: rustInspectMs, export: rustExportMs},
    rustPrepared: {factoryOnce: preparedFactoryMs, import: preparedImportMs, inspect: preparedInspectMs, export: preparedExportMs},
  },
};
await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
