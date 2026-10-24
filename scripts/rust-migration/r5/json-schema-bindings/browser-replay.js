const baseUri = 'https://schemas.example.test/root.json';
const normalize = (value) => JSON.parse(JSON.stringify(value));
function outcome(fn) {
  try { return {status: 'returned', value: normalize(fn())}; }
  catch (error) { return {status: 'threw', name: error?.name ?? 'Error', code: error?.code ?? null, message: error?.message ?? String(error)}; }
}
function documentFor(engine, input, id) {
  if (input.document !== undefined) return input.document;
  return engine.importJsonSchema(input.schema ?? input.source, input.options ?? {id, baseUri});
}
function replay(engine, c) {
  const input = c.input ?? {};
  if (c.id.startsWith('import.')) {
    const options = input.options ?? {id: input.id, baseUri: input.baseUri, resources: Object.fromEntries(input.resources ?? [])};
    if (options.resources && Array.isArray(options.resources)) options.resources = Object.fromEntries(options.resources);
    return outcome(() => engine.importJsonSchema(input.text, options));
  }
  if (c.id === 'inspect-escaped-surrogate-key-diagnostic') return outcome(() => engine.inspectJsonSchema(engine.importJsonSchema(input.source, {id: 'urn:umf:r5:surrogate-diagnostic', baseUri})));
  if (c.id === 'get-literal-surrogate-utf16-pointer') return outcome(() => engine.getJsonSchemaNode(documentFor(engine, input, 'urn:umf:r5:utf16-key'), input.pointer));
  if (c.id === 'copy-isolation-get-bundle-walk') {
    return outcome(() => {
      const snapshot = {getNode: engine.getJsonSchemaNode(input.document, '/properties/x'), bundle: engine.exportJsonSchemaBundle(input.document), walk: engine.walkJsonSchema(input.document)};
      const preMutationSnapshot = normalize(snapshot);
      snapshot.getNode.kind = 'null'; snapshot.bundle.source.id = 'mutated';
      snapshot.bundle.resources['https://schemas.example.test/z.json'] = 'mutated';
      if (snapshot.walk[1]) snapshot.walk[1].node.kind = 'null';
      return {preMutationSnapshot, mutatedReturnedCopies: snapshot, postMutationRereads: {getNode: engine.getJsonSchemaNode(input.document, '/properties/x'), bundle: engine.exportJsonSchemaBundle(input.document), walk: engine.walkJsonSchema(input.document)}};
    });
  }
  const doc = documentFor(engine, input, `urn:umf:r5:${c.id}`);
  if (c.id.startsWith('inspect')) return outcome(() => engine.inspectJsonSchema(doc));
  if (c.id.startsWith('export.resources')) return outcome(() => engine.exportJsonSchemaResources(doc));
  if (c.id.startsWith('export.bundle')) return outcome(() => engine.exportJsonSchemaBundle(doc));
  if (c.id.startsWith('export')) return outcome(() => engine.exportJsonSchema(doc));
  if (c.id.startsWith('get-and-walk-')) return outcome(() => ({get: outcome(() => engine.getJsonSchemaNode(doc, input.pointer)), walk: engine.walkJsonSchema(doc)}));
  if (c.id.startsWith('get')) return outcome(() => engine.getJsonSchemaNode(doc, input.pointer));
  if (c.id.startsWith('walk')) return outcome(() => engine.walkJsonSchema(doc));
  throw new Error(`No replay mapping for ${c.id}`);
}
const api = await import('./package/index.js');
const engine = await api.initializeJsonSchemaWasm();
const predecessorBytes = await (await fetch('./predecessor.json')).arrayBuffer();
const predecessor = JSON.parse(new TextDecoder().decode(predecessorBytes));
const results = [];
for (let index = 0; index < predecessor.cases.length; index++) {
  const c = predecessor.cases[index];
  results.push({id: c.id, expected: c.outcome, actual: replay(engine, c)});
  await fetch('/progress', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({lastCompleted: index + 1, caseCount: predecessor.cases.length, id: c.id})});
  await new Promise((resolve) => setTimeout(resolve, 0));
}
const mismatches = results.filter((row) => JSON.stringify(row.expected) !== JSON.stringify(row.actual)).map(({id, expected, actual}) => ({id, expected, actual}));
const receipt = {format: 'umf-r5-json-schema-browser-replay-v1', browser: navigator.userAgent, caseCount: results.length, matched: results.length - mismatches.length, mismatches, results};
localStorage.setItem('umf-r5-json-schema-browser-replay', JSON.stringify(receipt));
await fetch('/receipt', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(receipt)});
document.body.textContent = JSON.stringify({format: receipt.format, browser: receipt.browser, caseCount: receipt.caseCount, matched: receipt.matched, mismatches: mismatches.map(({id}) => id)});
