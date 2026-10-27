// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, cp} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseNativeJson as typescriptParse} from '../../../src/model/native-json.ts';
import {nonStringCases} from './json-schema-import-nonstring-cases.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const toolchain = process.env.UMF_RUST_TOOLCHAIN ?? '/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin';
const target = '/private/tmp/umf-r8-parse-native-json-host-node-target';
const packageDir = '/private/tmp/umf-r8-parse-native-json-host-node-package/node';
const evidencePath = resolve(process.argv[2] ?? `${root}/docs/helix/04-build/evidence/rust-migration/r8-json-schema-parse-native-json-host/node.json`);
const child = Bun.spawn([`${toolchain}/cargo`, 'build', '--locked', '--offline', '--release', '--manifest-path', 'bindings/core/node/Cargo.toml'], {cwd: root, env: {...process.env, RUSTC: `${toolchain}/rustc`, CARGO_TARGET_DIR: target, CARGO_INCREMENTAL: '0'}, stdout: 'pipe', stderr: 'pipe'});
const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
assert.equal(await child.exited, 0, `${stdout}\n${stderr}`);
await mkdir(dirname(packageDir), {recursive: true});
await cp(`${root}/bindings/core/node`, packageDir, {recursive: true});
await Bun.write(`${packageDir}/umf_core_node.node`, await readFile(`${target}/release/libumf_core_node.dylib`));
const {createJsonSchemaEngine} = await import(`${packageDir}/index.js`);
const engine = createJsonSchemaEngine();
const observe = (fn, value, sentinel) => {
  try { return {kind: 'return', value: fn(value)}; }
  catch (error) { return {kind: 'throw', name: error?.name ?? typeof error, message: error?.message ?? String(error), code: error?.code ?? null, sameObject: error === sentinel}; }
};
const cases = nonStringCases().map(fixture => {
  const typescriptEvents = [], rustEvents = [];
  const typescriptSentinel = Object.assign(new Error('nonstring host sentinel'), {code: 'HOST_SENTINEL'});
  const rustSentinel = Object.assign(new Error('nonstring host sentinel'), {code: 'HOST_SENTINEL'});
  const typescriptInput = fixture.makeInput(typescriptEvents, typescriptSentinel);
  const rustInput = fixture.makeInput(rustEvents, rustSentinel);
  return {
    id: fixture.id,
    typescript: {events: typescriptEvents, outcome: observe(typescriptParse, typescriptInput, typescriptSentinel)},
    rustNode: {events: rustEvents, outcome: observe(value => engine.parseNativeJson(value), rustInput, rustSentinel)},
  };
});
assert(cases.some(item => item.typescript.events.length > 0 && item.rustNode.events.length === 0));
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const record = {
  format: 'umf.r8-json-schema-parse-native-json-host-node/1', status: 'observed',
  sourceRevision: (await Bun.$`git -C ${root} rev-parse HEAD`.text()).trim(),
  sourceState: 'dirty working tree; source identities pinned by hashes below',
  runtime: {bun: Bun.version, node: process.version, rustc: (await Bun.$`${toolchain}/rustc --version`.text()).trim()},
  qualification: 'Fresh opt-in Node addon compared with direct TypeScript parseNativeJson on the nine bounded wrong-type coercion/getter fixtures. The result is a host-boundary counterexample set, not wrong-type parity.',
  cases,
  artifacts: {addonSha256: await hash(`${packageDir}/umf_core_node.node`), runnerSha256: await hash(fileURLToPath(import.meta.url)), nodeFacadeSha256: await hash(`${root}/bindings/core/node/index.js`), wireCodecSha256: await hash(`${root}/bindings/core/node/src/wire.js`), rustWireSha256: await hash(`${root}/crates/umf-core-wire/src/lib.rs`), typescriptParserSha256: await hash(`${root}/src/model/native-json.ts`), fixtureSha256: await hash(`${root}/scripts/rust-migration/r8/json-schema-import-nonstring-cases.mjs`)},
};
await mkdir(dirname(evidencePath), {recursive: true});
await writeFile(evidencePath, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({evidencePath, cases: cases.length, status: 'observed'}, null, 2));
