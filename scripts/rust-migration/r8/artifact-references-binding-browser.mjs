// SPDX-License-Identifier: MIT OR Apache-2.0
// Real Chromium differential replay for the opt-in artifact-reference WASM wire.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {chromium} from 'playwright';
import {encodeWire} from '../../../bindings/core/wasm/src/wire.js';
import {generateDomainPackSchema} from '../../../src/domain-packs/schema.ts';
import {createValidator} from '../../../src/validation/schema.ts';

const root = resolve(import.meta.dirname, '../../..');
const toolchain = '/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin';
const bindgen = '/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen';
const target = '/private/tmp/umf-r8-artifact-ref-binding-cargo';
const output = '/private/tmp/umf-r8-artifact-ref-binding-browser';
const wasmOut = `${output}/wasm`;
const entryOut = `${output}/artifact-references-binding-browser-entry.js`;
const evidencePath = resolve(process.argv[2] ?? 'docs/helix/04-build/evidence/rust-migration/r8-artifact-reference-binding/chromium.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFile(resolve(root, path));
const run = async (command, args, env = {}) => {
  const child = Bun.spawn([command, ...args], {cwd: root, env: {...process.env, ...env}, stdout: 'pipe', stderr: 'pipe'});
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  const code = await child.exited;
  if (code) throw new Error(`${command} ${args.join(' ')} failed (${code})\n${stdout}\n${stderr}`);
  return {stdout: stdout.trim(), stderr: stderr.trim()};
};
const validateStructure = createValidator().compile(generateDomainPackSchema());
const checkStructure = (label, pack) => {
  if (!validateStructure(pack)) throw new Error(`${label} is not structurally valid: ${JSON.stringify(validateStructure.errors)}`);
};

await mkdir(wasmOut, {recursive: true});
await run(`${toolchain}/cargo`, ['build', '--locked', '--offline', '--release', '--manifest-path', 'bindings/core/wasm/Cargo.toml', '--target', 'wasm32-unknown-unknown'], {
  CARGO_TARGET_DIR: target,
  RUSTC: `${toolchain}/rustc`,
});
const bindgenVersion = await run(bindgen, ['--version']);
assert.equal(bindgenVersion.stdout, 'wasm-bindgen 0.2.100');
await Bun.$`${bindgen} --target web --out-dir ${wasmOut} --out-name umf_core_wasm ${target}/wasm32-unknown-unknown/release/umf_core_wasm.wasm`.quiet();
const bundle = await Bun.build({entrypoints: ['scripts/rust-migration/r8/artifact-references-binding-browser-entry.ts'], target: 'browser', format: 'esm', outdir: output});
if (!bundle.success) throw new Error(bundle.logs.map(item => item.message).join('\n'));

const loneSurrogate = '\ud800';
const source = {kind: 'external', data_kind: 'unknown', reference: 'https://example.org/source', format: 'json'};
const pack = {
  id: 'artifact-reference-browser-fixture', version: '1.0.0', domain_types: {identity: {description: 'fixture'}},
  sources: {[loneSurrogate]: source},
  schemas: [{id: 'format-mismatch', format: 'json', reference: 'schema.json'}],
  artifact_collections: [
    {version: '1.0.0', id: 'duplicate', title: 'First', view: 'other', semantic_kinds: ['fixture'], source_ids: [loneSurrogate, 'missing-source'], loader_inventory_source_id: 'missing-inventory', metadata_schema_ids: ['format-mismatch'], derived_schema_ids: [loneSurrogate, 'missing-schema'], ontology_schema_ids: ['format-mismatch']},
    {version: '1.0.0', id: 'duplicate', title: 'Second', view: 'other', semantic_kinds: ['fixture'], source_ids: [loneSurrogate]},
  ],
};
checkStructure('reference parity fixture', pack);
const largeCollection = (id, prefix) => ({version: '1.0.0', id, title: id, view: 'other', semantic_kinds: ['fixture'], source_ids: Array.from({length: 5_000}, (_, index) => `${prefix}-${index}`), loader_inventory_source_id: `${prefix}-inventory`});
const capPack = {
  id: 'artifact-reference-cap-fixture', version: '1.0.0', domain_types: {identity: {}}, sources: {present: source},
  artifact_collections: [largeCollection('first', 'a'), largeCollection('second', 'b')],
};
checkStructure('cap refusal fixture', capPack);
const payload = {
  referenceWire: encodeWire({op: 'artifactReferences/inspect', pack}),
  capWire: encodeWire({op: 'artifactReferences/inspect', pack: capPack}),
  missingPackWire: encodeWire({op: 'artifactReferences/inspect'}),
  deniedControlWire: encodeWire({ok: false, code: 'TEST_DENIED', message: 'host refused work'}),
};

const pageErrors = [];
const requests = [];
let browser;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('request', request => requests.push(request.url()));
  await page.goto('about:blank');
  const glueSource = await readFile(`${wasmOut}/umf_core_wasm.js`, 'utf8');
  const wasmBase64 = (await readFile(`${wasmOut}/umf_core_wasm_bg.wasm`)).toString('base64');
  const entrySource = await readFile(entryOut, 'utf8');
  await page.evaluate(async ({glueSource, wasmBase64, entrySource, payload}) => {
    const wasm = Uint8Array.from(atob(wasmBase64), character => character.charCodeAt(0));
    const glueUrl = URL.createObjectURL(new Blob([glueSource], {type: 'text/javascript'}));
    const module = await import(glueUrl);
    await module.default(wasm);
    globalThis.artifactReferenceWasmModule = module;
    globalThis.artifactReferenceInputs = payload;
    const entryUrl = URL.createObjectURL(new Blob([entrySource], {type: 'text/javascript'}));
    await import(entryUrl);
  }, {glueSource, wasmBase64, entrySource, payload});
  await page.waitForFunction(() => Boolean(window.artifactReferenceResults), undefined, {timeout: 30000});
  const results = await page.evaluate(() => window.artifactReferenceResults);
  assert.deepEqual(results.reference.rust.diagnosticUnits, results.reference.typescriptDiagnosticUnits);
  assert.equal(results.reference.rust.status, 'ok');
  assert(results.reference.rust.diagnosticUnits.some(units => units.at(-1) === 0xD800));
  assert.deepEqual(results.hostRefusal, {status: 'error', code: 'TEST_DENIED', messageUnits: Array.from('host refused work', character => character.charCodeAt(0))});
  assert.equal(results.capRefusal.status, 'error');
  assert.equal(results.capRefusal.code, 'RESOURCE_LIMIT');
  assert.equal(results.missingPackRefusal.status, 'error');
  assert.equal(results.missingPackRefusal.code, 'REQUEST');
  assert.deepEqual(pageErrors, []);
  const externalRequests = requests.filter(url => !url.startsWith('blob:') && !url.startsWith('about:'));
  assert.deepEqual(externalRequests, []);
  const receipt = {
    format: 'umf.r8.artifact-reference-binding.chromium/1', status: 'pass', optInOnly: true, defaultRouteChanged: false,
    qualification: 'Fresh Rust 1.90 WASM build and wasm-bindgen 0.2.100 replay in real Chromium. Structurally validated reference and cap fixtures are compared against the current TypeScript ordered pass; UTF-16 output code units, host refusal and wire admission are recorded. This does not qualify arbitrary host objects or default-route selection.',
    tools: {bun: Bun.version, cargo: (await run(`${toolchain}/cargo`, ['--version'])).stdout, rustc: (await run(`${toolchain}/rustc`, ['--version'])).stdout, wasmBindgen: bindgenVersion.stdout, chromium: browser.version()},
    controls: {structuralFixturesValidated: true, exactTypescriptDiagnosticUnitParity: true, loneSurrogateRetained: true, hostControlRefusal: true, profileCapRefusal: true, missingPackRefusal: true, wasmExecutedInChromium: true, pageErrors: pageErrors.length, externalRequests: externalRequests.length},
    limits: {maxCollections: 64, maxSchemas: 1000, maxReferenceEntries: 10000},
    outcomes: results,
    artifacts: {
      sourceSha256: Object.fromEntries(await Promise.all([
      ['crates/umf-core/src/artifact_references.rs', 'crates/umf-core/src/artifact_references.rs'],
      ['crates/umf-core-wire/src/artifact_references_binding.rs', 'crates/umf-core-wire/src/artifact_references_binding.rs'],
      ['crates/umf-core-wire/src/lib.rs', 'crates/umf-core-wire/src/lib.rs'],
      ['bindings/core/wasm/src/lib.rs', 'bindings/core/wasm/src/lib.rs'],
      ['bindings/core/wasm/index.js', 'bindings/core/wasm/index.js'],
      ['bindings/core/wasm/src/wire.d.ts', 'bindings/core/wasm/src/wire.d.ts'],
      ['bindings/core/wasm/src/wire.js', 'bindings/core/wasm/src/wire.js'],
      ['src/domain-packs/artifacts.ts', 'src/domain-packs/artifacts.ts'],
      ['src/domain-packs/schema.ts', 'src/domain-packs/schema.ts'],
      ['scripts/rust-migration/r8/artifact-references-binding-browser-entry.ts', 'scripts/rust-migration/r8/artifact-references-binding-browser-entry.ts'],
      ['scripts/rust-migration/r8/artifact-references-binding-browser.mjs', 'scripts/rust-migration/r8/artifact-references-binding-browser.mjs'],
      ].map(async ([key, path]) => [key, sha(await read(path))]))),
      wasmSha256: sha(await readFile(`${wasmOut}/umf_core_wasm_bg.wasm`)),
      wasmGlueSha256: sha(await readFile(`${wasmOut}/umf_core_wasm.js`)),
      browserEntrySha256: sha(await readFile(entryOut)),
    },
  };
  assert(Object.entries(receipt.controls).every(([key, value]) => key === 'pageErrors' || key === 'externalRequests' ? value === 0 : value === true));
  await mkdir(dirname(evidencePath), {recursive: true});
  await writeFile(evidencePath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({evidencePath, chromium: browser.version(), outcomes: Object.keys(results), controls: receipt.controls}, null, 2));
} finally {
  await browser?.close();
}
