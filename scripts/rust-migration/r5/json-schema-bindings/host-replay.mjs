import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const [predecessorPath, packagePath, outputPath, label, kind = 'node'] = process.argv.slice(2);
if (!predecessorPath || !packagePath || !outputPath || !label) {
  throw new Error('usage: host-replay.mjs predecessor.json package-dir output.json label [node|wasm]');
}
const predecessorBytes = await readFile(predecessorPath);
const predecessor = JSON.parse(predecessorBytes);
const api = await import(pathToFileURL(`${packagePath}/index.js`));
let engine;
if (kind === 'wasm') {
  const wasm = await import(pathToFileURL(`${packagePath}/pkg/umf_core_wasm.js`));
  await wasm.default({module: await readFile(`${packagePath}/pkg/umf_core_wasm_bg.wasm`)});
  engine = api.createJsonSchemaEngine(wasm);
} else {
  engine = api.createJsonSchemaEngine();
}
const baseUri = 'https://schemas.example.test/root.json';
const normalize = (value) => JSON.parse(JSON.stringify(value));
function outcome(fn) {
  try { return {status: 'returned', value: normalize(fn())}; }
  catch (error) {
    return {status: 'threw', name: error?.name ?? 'Error', code: error?.code ?? null, message: error?.message ?? String(error)};
  }
}
function documentFor(input, id) {
  if (input.document !== undefined) return input.document;
  const options = input.options ?? {id, baseUri};
  return engine.importJsonSchema(input.schema ?? input.source, options);
}
function replay(c) {
  const input = c.input ?? {};
  if (c.id.startsWith('import.')) {
    const options = input.options ?? {
      id: input.id,
      baseUri: input.baseUri,
      resources: Object.fromEntries(input.resources ?? []),
    };
    if (options.resources && Array.isArray(options.resources)) options.resources = Object.fromEntries(options.resources);
    return outcome(() => engine.importJsonSchema(input.text, options));
  }
  if (c.id === 'inspect-escaped-surrogate-key-diagnostic') {
    return outcome(() => engine.inspectJsonSchema(engine.importJsonSchema(input.source, {id: 'urn:umf:r5:surrogate-diagnostic', baseUri} )));
  }
  if (c.id === 'get-literal-surrogate-utf16-pointer') {
    const doc = documentFor(input, 'urn:umf:r5:utf16-key');
    return outcome(() => engine.getJsonSchemaNode(doc, input.pointer));
  }
  if (c.id === 'copy-isolation-get-bundle-walk') {
    const doc = input.document;
    return outcome(() => {
      const snapshot = {getNode: engine.getJsonSchemaNode(doc, '/properties/x'), bundle: engine.exportJsonSchemaBundle(doc), walk: engine.walkJsonSchema(doc)};
      const preMutationSnapshot = normalize(snapshot);
      snapshot.getNode.kind = 'null'; snapshot.bundle.source.id = 'mutated';
      snapshot.bundle.resources['https://schemas.example.test/z.json'] = 'mutated';
      if (snapshot.walk[1]) snapshot.walk[1].node.kind = 'null';
      const postMutationRereads = {getNode: engine.getJsonSchemaNode(doc, '/properties/x'), bundle: engine.exportJsonSchemaBundle(doc), walk: engine.walkJsonSchema(doc)};
      return {preMutationSnapshot, mutatedReturnedCopies: snapshot, postMutationRereads};
    });
  }
  const doc = documentFor(input, `urn:umf:r5:${c.id}`);
  switch (true) {
    case c.id.startsWith('inspect'): return outcome(() => engine.inspectJsonSchema(doc));
    case c.id.startsWith('export') && !c.id.startsWith('export.resources') && !c.id.startsWith('export.bundle'): return outcome(() => engine.exportJsonSchema(doc));
    case c.id.startsWith('export.resources'): return outcome(() => engine.exportJsonSchemaResources(doc));
    case c.id.startsWith('export.bundle'): return outcome(() => engine.exportJsonSchemaBundle(doc));
    case c.id.startsWith('get.'): return outcome(() => engine.getJsonSchemaNode(doc, input.pointer));
    case c.id.startsWith('walk.'): return outcome(() => engine.walkJsonSchema(doc));
    case c.id.startsWith('walk-excludes-'): return outcome(() => engine.walkJsonSchema(doc));
    case c.id.startsWith('get-and-walk-'): return outcome(() => ({get: outcome(() => engine.getJsonSchemaNode(doc, input.pointer)), walk: engine.walkJsonSchema(doc)}));
    default: throw new Error(`No replay mapping for ${c.id}`);
  }
}
const results = predecessor.cases.map((c, index) => {
  console.error(`${label} case ${index + 1}/${predecessor.cases.length}: ${c.id}`);
  return {id: c.id, expected: c.outcome, actual: replay(c)};
});
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const mismatches = results.filter((row) => !equal(row.expected, row.actual)).map(({id, expected, actual}) => ({id, expected, actual}));
const receipt = {
  format: 'umf-r5-json-schema-host-replay-v1',
  label,
  kind,
  runtime: {node: process.version, bun: typeof Bun === 'undefined' ? null : Bun.version},
  predecessorSha256: createHash('sha256').update(predecessorBytes).digest('hex'),
  caseCount: results.length,
  matched: results.length - mismatches.length,
  mismatches,
  results,
};
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({label, caseCount: receipt.caseCount, matched: receipt.matched, mismatches: mismatches.length, predecessorSha256: receipt.predecessorSha256}));
