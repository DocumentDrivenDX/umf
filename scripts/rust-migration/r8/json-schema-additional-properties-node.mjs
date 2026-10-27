// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, cp} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {importJsonSchema as tsImport, inspectJsonSchema as tsInspect} from '../../../src/adapters/json-schema/index.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const toolchain = process.env.UMF_RUST_TOOLCHAIN ?? '/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin';
const target = '/private/tmp/umf-r8-json-schema-additional-properties-node-target';
const packageDir = '/private/tmp/umf-r8-json-schema-additional-properties-node-package/node';
const evidencePath = resolve(process.argv[2] ?? `${root}/docs/helix/04-build/evidence/rust-migration/r8-json-schema-additional-properties/node.json`);
const build = Bun.spawn([`${toolchain}/cargo`, 'build', '--locked', '--offline', '--release', '--manifest-path', 'bindings/core/node/Cargo.toml'], {
  cwd: root, env: {...process.env, RUSTC: `${toolchain}/rustc`, CARGO_TARGET_DIR: target, CARGO_INCREMENTAL: '0'}, stdout: 'pipe', stderr: 'pipe',
});
const [buildOut, buildErr] = await Promise.all([new Response(build.stdout).text(), new Response(build.stderr).text()]);
assert.equal(await build.exited, 0, `${buildOut}\n${buildErr}`);
await mkdir(packageDir, {recursive: true});
await cp(`${root}/bindings/core/node`, packageDir, {recursive: true});
await Bun.write(`${packageDir}/umf_core_node.node`, await readFile(`${target}/release/libumf_core_node.dylib`));
const {createJsonSchemaEngine} = await import(`${packageDir}/index.js`);
const engine = createJsonSchemaEngine();
const baseUri = 'https://schemas.example.test/additional-properties.json';
const cases = [
  ['additional-properties-false', '{"type":"object","properties":{"known":{"type":"string"}},"additionalProperties":false}'],
  ['additional-properties-schema-valued', '{"type":"object","properties":{"known":{"type":"string"}},"additionalProperties":{"type":"integer","minimum":1}}'],
  ['nested-additional-properties-false', '{"type":"object","properties":{"child":{"type":"object","additionalProperties":false}}}'],
  ['nested-additional-properties-schema-valued', '{"type":"object","properties":{"child":{"type":"object","additionalProperties":{"type":"integer","minimum":1}}}}'],
  ['unsupported-nested-schema-keyword-remains-incomplete', '{"type":"object","additionalProperties":{"pattern":"x"}}'],
];
const summarize = value => ({valid:value.valid,complete:value.complete,diagnostics:value.diagnostics.map(({code,path,severity})=>({code,path,severity}))});
const results = cases.map(([id,schema]) => {
  const ts = summarize(tsInspect(tsImport(schema, {id:`urn:umf:r8:${id}`, baseUri})));
  const native = summarize(engine.inspectJsonSchema({umf:'0.10.0',id:`urn:umf:r8:${id}`,vocabularies:{'umf.json-schema':{version:'0.1.0'}},modules:[{id:'schema',namespace:baseUri,elements:[{id:'schema',extensions:{'umf.json-schema':{dialect:'https://json-schema.org/draft/2020-12/schema',baseUri,root:engine.parseNativeJson(schema),resources:{}}}}]}]}));
  if (id.startsWith('unsupported-')) {
    assert(ts.complete && !native.complete, 'negative control preserves existing Rust profile boundary');
    assert(native.diagnostics.some(item => item.code === 'JSON_SCHEMA_VALIDATOR_LIMIT'));
  } else assert.deepEqual(native, ts, id);
  return {id,typescript:ts,rustNode:native};
});
assert(results.slice(0,4).every(item => item.typescript.valid && item.typescript.complete && item.typescript.diagnostics.length === 0));
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const record = {
  format:'umf.r8-json-schema-additional-properties-node/1', status:'pass',
  sourceRevision:(await Bun.$`git -C ${root} rev-parse HEAD`.text()).trim(), sourceState:'dirty working tree; source identities are pinned by the artifact hashes below',
  qualification:'Fresh isolated Rust Node addon opt-in inspectJsonSchema compared with direct TypeScript in Bun. Four additionalProperties false/schema-valued cases (root/nested) match and are complete. The nested pattern schema is intentionally outside Rust validator profile; TypeScript accepts it as complete, Rust remains incomplete. No default-route claim.',
  runtime:{bun:Bun.version,node:process.version,rustc:(await Bun.$`${toolchain}/rustc --version`.text()).trim()}, cases:results,
  artifacts:{nodeAddonSha256:await hash(`${packageDir}/umf_core_node.node`),runnerSha256:await hash(fileURLToPath(import.meta.url)),coreInspectorSha256:await hash(`${root}/crates/umf-core/src/json_schema_inspect.rs`),coreTestSha256:await hash(`${root}/crates/umf-core/tests/r5_json_schema_inspect.rs`),nodeFacadeSha256:await hash(`${root}/bindings/core/node/index.js`),typescriptAdapterSha256:await hash(`${root}/src/adapters/json-schema/index.ts`)},
};
await mkdir(dirname(evidencePath), {recursive:true});
await writeFile(evidencePath,JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify({cases:results.length,status:'pass',evidencePath},null,2));
