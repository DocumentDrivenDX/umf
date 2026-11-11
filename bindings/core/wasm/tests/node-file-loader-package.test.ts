import {cp, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildNodeWasmRuntime} from '../node-package-build.js';

const root = process.cwd();
const output = await mkdtemp(join(tmpdir(), 'umf-node-wasm-loader-'));
try {
  const runtime = join(output, 'dist/runtime/wasm');
  const pkg = join(runtime, 'pkg');
  await mkdir(pkg, {recursive: true});
  await writeFile(join(output, 'package.json'), JSON.stringify({
    name: '@umf/core', type: 'module', exports: {
      './runtime/wasm': {
        node: './dist/runtime/wasm/index-node.js',
        import: './dist/runtime/wasm/index.js',
      },
    },
  }));
  await buildNodeWasmRuntime(root, runtime);
  for (const asset of ['umf_core_wasm.js', 'umf_core_wasm_bg.wasm']) {
    await cp(join(root, 'bindings/core/wasm/pkg', asset), join(pkg, asset));
  }
  const child = spawnSync('node', ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import {initializeWasm} from '@umf/core/runtime/wasm';
    assert.ok(process.versions.node);
    assert.equal(process.versions.bun, undefined);
    globalThis.fetch = () => { throw new Error('Node fetch must not load file URLs'); };
    const engine = await initializeWasm();
    assert.equal(engine.copyJson({ok: true}).ok, true);
    console.log(JSON.stringify({node: process.execPath, version: process.versions.node, bun: process.versions.bun ?? null}));
  `], {cwd: output, encoding: 'utf8'});
  if (child.status !== 0) throw new Error(child.stderr || child.stdout || 'Node package consumer failed');
  console.log('Node conditional package default WASM initialization passed:', child.stdout.trim());
} finally {
  await rm(output, {recursive: true, force: true});
}
