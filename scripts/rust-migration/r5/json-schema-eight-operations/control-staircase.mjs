import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const [packagePath, outputPath, mode = 'prepared-node'] = process.argv.slice(2);
if (!packagePath || !outputPath || !['prepared-node', 'stateless-node', 'prepared-wasm', 'stateless-wasm'].includes(mode)) {
  throw new Error('usage: control-staircase.mjs package-dir output.json [prepared-node|stateless-node|prepared-wasm|stateless-wasm]');
}
const api = await import(pathToFileURL(`${packagePath}/index.js`));
const wasm = mode.endsWith('-wasm') ? await import(pathToFileURL(`${packagePath}/pkg/umf_core_wasm.js`)) : null;
if (wasm) await wasm.default({module: await readFile(`${packagePath}/pkg/umf_core_wasm_bg.wasm`)});
const prepared = mode.startsWith('prepared-');
const make = options => prepared
  ? wasm ? api.createPreparedJsonSchemaEngine(wasm, options) : api.createPreparedJsonSchemaEngine(options)
  : wasm ? api.createJsonSchemaEngine(wasm, options) : api.createJsonSchemaEngine(options);
const source = '{"type":"object","properties":{"x":{"type":"number"}},"$defs":{"nested":{"type":"string"}}}';
const unmetered = make();
const document = unmetered.importJsonSchema(source, {id: 'urn:umf:r8:controls', baseUri: 'https://example.test/schema.json'});
const operationCases = [
  {phase: 'preflight', maxWork: 0, invoke: engine => engine.walkJsonSchema(document)},
  {phase: 'request-decode-and-dispatch', maxWork: 2, invoke: engine => engine.walkJsonSchema(document)},
  {phase: 'validation', maxWork: 2_000, invoke: engine => engine.importJsonSchema(source, {id: 'urn:umf:r8:validation', baseUri: 'https://example.test/validation.json'})},
  {phase: 'result-output', maxWork: 10_000, invoke: engine => engine.exportJsonSchemaBundle(document)},
  {phase: 'cancellation', controls: {isCancelled: () => true}, invoke: engine => engine.walkJsonSchema(document)},
  {phase: 'deadline', controls: {deadlineMs: 10, now: () => 11}, invoke: engine => engine.walkJsonSchema(document)},
  {phase: 'meter-first-callback', controls: {meter: () => { throw new Error('r8-operation-meter-first'); }}, invoke: engine => engine.walkJsonSchema(document)},
  {phase: 'meter-late-output-callback', controls: {meter: (_amount, calls) => { if (calls === 4) throw new Error('r8-operation-meter-late'); }}, invoke: engine => engine.exportJsonSchemaBundle(document)},
];
const operationRows = [];
for (const item of operationCases) {
  const trace = [];
  let outcome;
  try {
    const supplied = item.controls ?? {};
    const engine = make({controls: {...supplied, ...(item.maxWork === undefined ? {} : {maxWork: item.maxWork}), meter: amount => {
      trace.push(amount);
      supplied.meter?.(amount, trace.length);
    }}});
    const value = item.invoke(engine);
    outcome = {status: 'returned', shape: Array.isArray(value) ? 'array' : typeof value};
  } catch (error) {
    outcome = {status: 'threw', name: error?.name ?? 'Error', code: error?.code ?? null, path: error?.path ?? null};
  }
  operationRows.push({phase: item.phase, maxWork: item.maxWork, outcome, meterCalls: trace.length, meterUnits: trace.reduce((sum, amount) => sum + amount, 0), meterTrace: trace});
}

const setupRows = [];
if (prepared) {
  for (const maxWork of [0, 1, 100, 1_000, 10_000, 100_000, 10_000_000, 100_000_000, 500_000_000]) {
    const trace = [];
    try {
      make({resourceControls: {maxWork, meter: amount => trace.push(amount)}});
      setupRows.push({maxWork, outcome: 'returned', meterCalls: trace.length, meterUnits: trace.reduce((sum, amount) => sum + amount, 0), meterTrace: trace});
    } catch (error) {
      setupRows.push({maxWork, outcome: 'threw', code: error?.code ?? null, meterCalls: trace.length, meterUnits: trace.reduce((sum, amount) => sum + amount, 0), meterTrace: trace});
    }
  }
  let meterCalls = 0;
  try {
    make({resourceControls: {meter: () => { meterCalls++; throw new Error('r8-resource-meter-hook'); }}});
    setupRows.push({id: 'meter-hook-failure', outcome: 'unexpected-return', meterCalls});
  } catch (error) {
    setupRows.push({id: 'meter-hook-failure', outcome: 'threw', code: error?.code ?? null, meterCalls});
  }
}

let controlsGetterTouched = false;
let controlsGetterOutcome;
try {
  make(Object.defineProperty({}, 'controls', {get() { controlsGetterTouched = true; throw new Error('controls getter reached'); }}));
  controlsGetterOutcome = 'returned';
} catch (error) {
  controlsGetterOutcome = `${error?.name ?? 'Error'}:${error?.message ?? String(error)}`;
}

const receipt = {
  format: 'umf-r8-json-schema-control-staircase/1', mode,
  engineFactory: prepared ? 'createPreparedJsonSchemaEngine' : 'createJsonSchemaEngine',
  runtime: {node: process.version, bun: typeof Bun === 'undefined' ? null : Bun.version},
  sourceSha256: createHash('sha256').update(await readFile(`${packagePath}/index.js`)).digest('hex'),
  setupSemantics: prepared ? 'one-time bounded factory Context; resourceControls are setup-only' : 'legacy stateless route has no separate resource setup phase',
  operationSemantics: 'each row creates a fresh operation engine and Context/host bridge; meter trace is the exact host-controlled callback sequence',
  setupRows, operationRows,
  controlsGetter: {touched: controlsGetterTouched, outcome: controlsGetterOutcome},
};
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({...receipt, operationRows: operationRows.map(({meterTrace, ...row}) => row), setupRows: setupRows.map(({meterTrace, ...row}) => row)}));
