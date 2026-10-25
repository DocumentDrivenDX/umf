// Node/Bun import smoke for the extracted browser package. Pass the wasm bytes
// directly because wasm-bindgen's web loader ordinarily fetches its URL.
import {copyFile, mkdir, mkdtemp, readFile, rm, unlink, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

const packageRoot = process.env.UMF_R7_WASM_PACKAGE;
if (!packageRoot) throw new Error('Set UMF_R7_WASM_PACKAGE to the extracted package directory');
const root = resolve(packageRoot);
const wrapper = await import(pathToFileURL(join(root, 'index.js')));
const wasm = await import(pathToFileURL(join(root, 'pkg/umf_core_wasm.js')));
await wasm.default({module_or_path: new Uint8Array(await readFile(join(root, 'pkg/umf_core_wasm_bg.wasm')))});
const core = wrapper.createEngine(wasm);
const copied = core.copyJson({retained: [1, 'two', null]});
if (copied.retained.length !== 3 || copied.retained[1] !== 'two') throw new Error('Extracted core package smoke failed');
const bit128 = wrapper.createBit128Engine(wasm);
if (bit128.parseBits128('f'.repeat(32)).hex !== 'f'.repeat(32)) throw new Error('Extracted bit128 package smoke failed');
const comparison = wrapper.createDocumentComparisonEngine(wasm, {snapshot: (value) => structuredClone(value)});
const diff = comparison.compareDocuments({z: 1, a: 'before'}, {z: 2, a: 'after'});
if (JSON.stringify(diff) !== JSON.stringify([
  {path: '/z', status: 'changed', before: 1, after: 2},
  {path: '/a', status: 'changed', before: 'before', after: 'after'},
])) throw new Error('Extracted document-comparison package mismatch');
const nulJoinedOrder = comparison.compareDocuments(
  [{id: 'a', value: 'first'}, {id: 'a\u0000a', value: 'second'}],
  [{id: 'a\u0000a', value: 'second'}, {id: 'a', value: 'first'}],
);
if (JSON.stringify(nulJoinedOrder) !== '[]') throw new Error('Extracted document-comparison NUL-join predecessor mismatch');
let measuredWork = 0;
const measuredComparison = wrapper.createDocumentComparisonEngine(wasm, {
  snapshot: (value) => structuredClone(value), controls: {meter: (amount) => measuredWork += amount},
});
measuredComparison.compareDocuments({x: 1}, {x: 2});
const limitedComparison = wrapper.createDocumentComparisonEngine(wasm, {
  snapshot: (value) => structuredClone(value), controls: {maxWork: measuredWork},
});
limitedComparison.compareDocuments({x: 1}, {x: 2});
limitedComparison.compareDocuments({x: 1}, {x: 2});
let comparisonsCancelled = false;
try { wrapper.createDocumentComparisonEngine(wasm, {snapshot: (value) => structuredClone(value), controls: {isCancelled: () => true}}).compareDocuments(null, true); }
catch (error) { comparisonsCancelled = error.code === 'CANCELLED'; }
if (!comparisonsCancelled) throw new Error('Extracted document-comparison cancellation mismatch');
let cancellationFirst = true;
const recoveringComparison = wrapper.createDocumentComparisonEngine(wasm, {
  snapshot: (value) => structuredClone(value),
  controls: {maxWork: measuredWork * 3, isCancelled: () => { if (cancellationFirst) { cancellationFirst = false; return true; } return false; }},
});
let recovered = false;
try { recoveringComparison.compareDocuments({x: 1}, {x: 2}); }
catch (error) { if (error.code !== 'CANCELLED') throw error; }
recovered = recoveringComparison.compareDocuments({x: 1}, {x: 2}).length === 1;
if (!recovered) throw new Error('Extracted document-comparison did not recover after cancellation');
// Exercise the full frozen predecessor corpus and published host refusal
// boundary against the exact extracted package, not source-tree wrappers.
const frozen = JSON.parse(await readFile(join(process.cwd(), 'docs/helix/04-build/evidence/rust-migration/r7-schema-comparison/predecessor-cases.json'), 'utf8'));
for (const row of frozen.cases) {
  const actual = comparison.compareDocuments(row.before, row.after);
  if (JSON.stringify(actual) !== JSON.stringify(row.expected)) throw new Error(`Frozen comparison mismatch: ${row.id}`);
}
let refusedAfter = 0;
const refusalBefore = Object.defineProperty({}, 'x', {enumerable: true, get() { throw Object.assign(new Error('before refused'), {code: 'NON_JSON', path: '/x'}); }});
const refusalAfter = Object.defineProperty({}, 'x', {enumerable: true, get() { refusedAfter++; return 1; }});
let beforeRefusal;
try { comparison.compareDocuments(refusalBefore, refusalAfter); } catch (error) { beforeRefusal = error; }
if (beforeRefusal?.code !== 'NON_JSON' || beforeRefusal?.path !== '/x' || refusedAfter !== 0) throw new Error('Extracted comparison before-first snapshot refusal mismatch');
const workControls = {maxWork: measuredWork};
const workEngine = wrapper.createDocumentComparisonEngine(wasm, {snapshot: (value) => structuredClone(value), controls: workControls});
let workRefusal;
const largeBefore = Object.fromEntries(Array.from({length: 100}, (_, index) => [`k${index}`, index]));
const largeAfter = Object.fromEntries(Array.from({length: 100}, (_, index) => [`k${index}`, index + 1]));
try { workEngine.compareDocuments(largeBefore, largeAfter); } catch (error) { workRefusal = error; }
const afterWorkRefusal = workEngine.compareDocuments({x: 1}, {x: 2});
if (workRefusal?.code !== 'RESOURCE_LIMIT' || afterWorkRefusal.length !== 1) throw new Error('Extracted comparison host work refusal/recovery mismatch');
const depth = (levels) => { let value = 0; for (let index = 0; index < levels; index++) value = {x: value}; return value; };
let depthRefusal;
try { comparison.compareDocuments(depth(300), depth(300)); } catch (error) { depthRefusal = error; }
if (!depthRefusal || !['LIMIT', 'RESOURCE_LIMIT'].includes(depthRefusal.code)) throw new Error('Extracted comparison depth refusal mismatch');
const failClosedRoot = await mkdtemp(join(tmpdir(), 'umf-r7-loader-fail-'));
const qualifyBadAsset = async (variant) => {
  const pkg = join(failClosedRoot, variant);
  const wasmDir = join(pkg, 'pkg');
  await mkdir(wasmDir, {recursive: true});
  const gluePath = join(wasmDir, `umf_core_wasm-${variant}.js`);
  await copyFile(join(root, 'pkg/umf_core_wasm.js'), gluePath);
  const assetPath = join(wasmDir, 'umf_core_wasm_bg.wasm');
  if (variant === 'invalid') await writeFile(assetPath, new Uint8Array([0, 1, 2]));
  else await unlink(assetPath).catch(() => {});
  const glue = await import(pathToFileURL(gluePath).href);
  let comparisonEngine;
  let refusal;
  try {
    const bytes = await readFile(assetPath);
    await glue.default({module_or_path: new Uint8Array(bytes)});
    comparisonEngine = wrapper.createDocumentComparisonEngine(glue, {snapshot: (value) => structuredClone(value)});
  } catch (error) { refusal = error; }
  if (!refusal || comparisonEngine) throw new Error(`Fresh ${variant} WASM package copy did not fail closed`);
  return {refused: true, comparisonEngineUnavailable: true};
};
let missingAsset, invalidWasm;
try {
  missingAsset = await qualifyBadAsset('missing');
  invalidWasm = await qualifyBadAsset('invalid');
} finally { await rm(failClosedRoot, {recursive: true, force: true}); }
console.log(JSON.stringify({status: 'pass', runtime: typeof Bun === 'undefined' ? 'node' : 'bun', core: true, bit128: true, documentComparison: {records: diff.length, frozenCases: frozen.cases.length, nulJoinedOrder: nulJoinedOrder.length, measuredWork, repeatedBudgetCalls: 2, cancellation: comparisonsCancelled, recovered, hostWorkRefusal: workRefusal.code, depthRefusal: depthRefusal.code, beforeFirstRefusal: beforeRefusal.code, refusalAfterReads: refusedAfter, missingWasmAssetRefusal: missingAsset.refused, missingAssetComparisonUnavailable: missingAsset.comparisonEngineUnavailable, invalidWasmRefusal: invalidWasm.refused, invalidAssetComparisonUnavailable: invalidWasm.comparisonEngineUnavailable}}));
