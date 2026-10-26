// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';

const evidence = 'docs/helix/04-build/evidence/rust-migration/r8-json-schema-eight-operations';
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const [typescript, nodeNative, wasm, browserReceipt] = await Promise.all([
  readJson('/private/tmp/umf-import-matrix-ts.json'),
  readJson('/private/tmp/umf-import-matrix-node.json'),
  readJson(`${evidence}/import-host-parity-matrix-wasm.json`),
  readJson(`${evidence}/staged-import-browser.json`),
]);
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const byId = packet => new Map(packet.cases.map(item => [item.id, item]));
const tsCases = byId(typescript), nodeCases = byId(nodeNative), wasmCases = byId(wasm);
const ids = [...tsCases.keys()];
if (ids.length !== nodeCases.size || ids.length !== wasmCases.size || ids.some(id => !nodeCases.has(id) || !wasmCases.has(id))) {
  throw new Error('Profile case sets differ');
}
const exactOutcome = x => JSON.stringify(x.outcome);
const cases = ids.map(id => {
  const ts = tsCases.get(id), node = nodeCases.get(id), browser = wasmCases.get(id);
  const checks = {
    orderedHostEffects: JSON.stringify(ts.events) === JSON.stringify(node.events) && JSON.stringify(ts.events) === JSON.stringify(browser.events),
    orderedDispatchStages: JSON.stringify(node.stages) === JSON.stringify(browser.stages),
    exactOutcome: exactOutcome(ts) === exactOutcome(node) && exactOutcome(ts) === exactOutcome(browser),
  };
  return {id, checks, profiles: {typescript: ts, nodeNative: node, wasmChromium: browser}};
});
const receipt = {
  format: 'umf.r8-json-schema-import-stage-parity/1',
  status: cases.every(item => Object.values(item.checks).every(Boolean)) ? 'pass' : 'mismatch',
  qualification: `${cases.length} source-bound importJsonSchema cases using string root/resource inputs were run against direct TypeScript, a freshly built Node native addon under Node 26, and freshly built WASM in real Chromium. Checks compare ordered host effects, Node/WASM stage dispatch sequences, and exact thrown outcome fields or complete returned document objects. This is a bounded string-input observation; it does not establish non-string parser/coercion behavior, full required-case closure, installed package parity, general JSON Schema equivalence, or default-route eligibility.`,
  source: {
    entry: {path: 'src/adapters/json-schema/index.ts', sha256: await sha('src/adapters/json-schema/index.ts'), scope: 'entry file only'},
    cases: {path: 'scripts/rust-migration/r8/json-schema-import-stage-matrix-cases.mjs', sha256: await sha('scripts/rust-migration/r8/json-schema-import-stage-matrix-cases.mjs')},
    directRunner: {path: 'scripts/rust-migration/r8/json-schema-import-stage-matrix-runner.mjs', sha256: await sha('scripts/rust-migration/r8/json-schema-import-stage-matrix-runner.mjs')},
    browserRunner: {path: 'scripts/rust-migration/r8/json-schema-staged-wasm-browser.mjs', sha256: await sha('scripts/rust-migration/r8/json-schema-staged-wasm-browser.mjs')},
    browserEntry: {path: 'scripts/rust-migration/r8/json-schema-staged-wasm-browser-entry.ts', sha256: await sha('scripts/rust-migration/r8/json-schema-staged-wasm-browser-entry.ts')},
    freshNodeAddon: {path: '/private/tmp/umf-core-node-r8-fresh.node', sha256: await sha('/private/tmp/umf-core-node-r8-fresh.node')},
    freshWasm: browserReceipt.artifacts.wasmSha256,
    freshWasmGlue: browserReceipt.artifacts.wasmGlueSha256,
  },
  runtimes: {
    typescript: {host: 'Bun 1.4.3', entry: 'direct import of current TypeScript source'},
    nodeNative: {host: 'Node.js 26.12.1', addon: 'fresh Cargo release build with Rust 1.90.0'},
    wasmChromium: {host: 'Chromium 153.0.8010.12', wasm: 'fresh Cargo release build with Rust 1.90.0; wasm-bindgen 0.2.100'},
  },
  counts: {cases: cases.length, allHostEffectChecksPass: cases.filter(x => x.checks.orderedHostEffects).length, allDispatchChecksPass: cases.filter(x => x.checks.orderedDispatchStages).length, allOutcomeChecksPass: cases.filter(x => x.checks.exactOutcome).length},
  mismatches: cases.filter(item => Object.values(item.checks).some(value => !value)).map(item => ({id: item.id, checks: item.checks})),
  cases,
};
await writeFile(`${evidence}/import-host-parity-matrix.json`, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({status: receipt.status, counts: receipt.counts, mismatches: receipt.mismatches}, null, 2));
