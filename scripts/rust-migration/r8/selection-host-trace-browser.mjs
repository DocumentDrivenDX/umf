// Real Chromium replay of the same opt-in Selection host trace used by Node/Bun.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(import.meta.dirname, '../../..');
const receiptPath = resolve(process.argv[2] ?? 'docs/helix/04-build/evidence/rust-migration/r8-selection-host-trace/chromium.json');
const output = '/private/tmp/umf-r8-selection-host-trace-browser';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFile(resolve(root, path));
const json = async path => JSON.parse(await read(path));
const manifest = await json('dist/rust-default-manifest.json');
assert.equal(manifest.sourceClosure?.transform?.status, 'fixed-point');
const referenceBytes = await read('dist/umf.js');
assert.equal(sha(referenceBytes), manifest.assets?.['dist/umf.js']);
const wasmBytes = await read('dist/umf_core_wasm_bg.wasm');
assert.equal(sha(wasmBytes), manifest.assets?.['dist/umf_core_wasm_bg.wasm']);
const glueBytes = await read('bindings/core/wasm/pkg/umf_core_wasm.js');

const entrySourcePath = resolve(output, 'selection-host-trace-browser-entry.ts');
const helperPath = resolve(root, 'bindings/core/wasm/src/host-json.js');
const suitePath = resolve(root, 'scripts/rust-migration/r8/selection-host-suite.mjs');
const referencePath = resolve(root, 'dist/umf.js');
await writeFile(entrySourcePath, `import {coreElementSelectionHostInput} from ${JSON.stringify(helperPath)};\n`
  + `import {runSelectionHostSuite} from ${JSON.stringify(suitePath)};\n`
  + `import {Registry, UmfError, selectCoreElements} from ${JSON.stringify(referencePath)};\n`
  + `export function runSelectionBrowserTrace(module,payload) { const candidate=(source,query,registry)=>coreElementSelectionHostInput(module,payload.resources,source,query,registry,UmfError); return runSelectionHostSuite({Registry,selectCoreElements,createCandidate:candidate,candidateLabel:'private-wasm-host-json'}); }\n`);
const bundle = await Bun.build({
  entrypoints: [entrySourcePath],
  target: 'browser', format: 'esm', outdir: output,
});
if (!bundle.success) throw new Error(bundle.logs.map(item => item.message).join('\n'));
const entryBytes = await readFile(resolve(output, 'selection-host-trace-browser-entry.js'));
const resources = Object.fromEntries(await Promise.all([
  ['coreSchema', 'spec/core/schema.json'],
  ['referenceSchema', 'spec/core/semantic-type-reference.schema.json'],
  ['packageSchema', 'spec/core/extension-package.schema.json'],
  ['constraints', 'spec/metamodel/generated/core-constraints.json'],
  ['domainPolicy', 'spec/metamodel/generated/domain-policy.json'],
].map(async ([key, path]) => [key, await json(path)])));
const selectedFiles = [
  'src/model/selection.ts', 'src/model/json.ts', 'src/validation/document.ts',
  'src/validation/constraint-kernel.ts', 'src/registry/registry.ts',
  'bindings/core/wasm/src/host-json.js', 'bindings/core/wasm/src/lib.rs',
  'crates/umf-core/src/selection.rs',
  'crates/umf-core/src/selection_host_json.rs', 'crates/umf-core/src/host_json.rs',
  'crates/umf-core-wire/src/lib.rs', 'spec/core/schema.json',
  'spec/core/semantic-type-reference.schema.json', 'spec/core/extension-package.schema.json',
  'spec/metamodel/generated/core-constraints.json', 'spec/metamodel/generated/domain-policy.json',
];
const selectedSourceHashes = Object.fromEntries(await Promise.all(selectedFiles.map(async path => [path, sha(await read(path))])));
const sourceDrift = selectedFiles.flatMap(path => {
  const expected = manifest.sourceClosure.inputs?.[path];
  return expected === undefined || expected !== selectedSourceHashes[path] ? [{path, expected: expected ?? null, actual: selectedSourceHashes[path]}] : [];
});

const browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto('about:blank');
  const response = await page.evaluate(async ({glueSource, wasmBase64, entrySource, resources: inputResources}) => {
    const globals = {process: typeof globalThis.process, Buffer: typeof globalThis.Buffer,
      require: typeof globalThis.require, ownRequire: Object.hasOwn(globalThis, 'require')};
    const glueUrl = URL.createObjectURL(new Blob([glueSource], {type: 'text/javascript'}));
    const wasm = Uint8Array.from(atob(wasmBase64), char => char.charCodeAt(0));
    const wasmModule = await import(glueUrl);
    await wasmModule.default(wasm);
    const entryUrl = URL.createObjectURL(new Blob([entrySource], {type: 'text/javascript'}));
    const entry = await import(entryUrl);
    try {
      const result = entry.runSelectionBrowserTrace(wasmModule,{resources: inputResources});
      return {globals, result, wasmOperation: typeof wasmModule.executeCoreElementSelectionHostJson};
    } catch (error) {
      return {globals, wasmOperation: typeof wasmModule.executeCoreElementSelectionHostJson,
        error: {name: error?.name, message: error?.message, stack: error?.stack}};
    }
  }, {glueSource: glueBytes.toString('utf8'), wasmBase64: wasmBytes.toString('base64'), entrySource: entryBytes.toString('utf8'), resources});
  assert.deepEqual(pageErrors, []);
  assert.equal(response.wasmOperation, 'function');
  assert.deepEqual(response.globals.process, 'undefined');
  assert.deepEqual(response.globals.Buffer, 'undefined');
  const result = response.result;
  const comparisons = Object.fromEntries(Object.entries(result.cases).map(([name, item]) => [name, item.comparison]));
  const receipt = {
    format: 'umf.r8.selection-host-trace.chromium/1',
    status: sourceDrift.length === 0 ? 'diagnostic-selection-subset-pinned-opt-in-comparison' : 'diagnostic-source-drift-non-authoritative',
    runtime: {bun: Bun.version, chromium: browser.version(), userAgent: await page.evaluate(() => navigator.userAgent)},
    candidate: 'executeCoreElementSelectionHostJson through private WASM host helper; package default root not changed',
    package: {manifestSourceClosureSha256: sha(Buffer.from(JSON.stringify(manifest.sourceClosure))), referenceBundleSha256: sha(referenceBytes), checkedInWasmGlueSha256: sha(glueBytes), wasmBinarySha256: sha(wasmBytes), bundledEntrySha256: sha(entryBytes)},
    sourceClosureVerification: {selectionInputCount: selectedFiles.length, driftCount: sourceDrift.length, drift: sourceDrift, selectedSourceHashes},
    caseCount: Object.keys(result.cases).length,
    cases: result.cases,
    summary: {
      exactValueAndErrorMatches: Object.values(comparisons).filter(value => value.valueOrErrorEqual).length,
      exactOutputShapeMatches: Object.values(comparisons).filter(value => value.outputShapeEqual).length,
      exactHostTraceMatches: Object.values(comparisons).filter(value => value.hostTraceEqual).length,
      mismatches: Object.entries(comparisons).filter(([, value]) => !value.valueOrErrorEqual || !value.outputShapeEqual || !value.hostTraceEqual).map(([name, value]) => ({name, ...value})),
    },
    browserGlobals: response.globals,
    wasmOperation: response.wasmOperation,
    browserHarnessError: response.error ?? null,
    pageErrors,
    limits: ['Real Chromium, diagnostic private opt-in host route only.', 'The full manifest source closure may contain concurrent edits outside this selected Selection source subset; this receipt pins and verifies only the listed live inputs against the earlier fixed-point dist manifest.', 'Uses the exact manifest-pinned WASM binary with older checked-in wasm-bindgen glue. Compatibility is established only by instantiation and this focused replay; this is not the exact installed package cohort.', 'Chromium reports a global require function in this harness world; process and Buffer remain undefined. The trace does not attribute the require binding to UMF code.', 'No default-root cutover or complete predecessor parity claim.'],
  };
  await mkdir(resolve(receiptPath, '..'), {recursive: true});
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({receiptPath, chromium: receipt.runtime.chromium, caseCount: receipt.caseCount, summary: receipt.summary}, null, 2));
} finally {
  await browser.close();
}
