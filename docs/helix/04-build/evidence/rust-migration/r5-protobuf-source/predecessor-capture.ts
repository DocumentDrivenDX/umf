// SPDX-License-Identifier: MIT OR Apache-2.0
// Read-only capture of the frozen TypeScript Protobuf source-import boundary.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { importProtobufSources, inspectProtobuf, exportProtobufDescriptorSet } from '../../../../../../src/adapters/protobuf/index';
import type { ProtobufSourceCompiler } from '../../../../../../src/adapters/protobuf/source';

const compiler: ProtobufSourceCompiler = {
  async compile() { return { descriptorSet: new Uint8Array(), compiler: 'capture-compiler/1' }; },
};
const source = { files: { 'root.proto': 'syntax = "proto3";\nmessage A {}\n' }, roots: ['root.proto'] };
const capture = async (work: () => unknown | Promise<unknown>) => {
  try { return { ok: true, value: await work() }; }
  catch (error) {
    const item = error as { code?: unknown; message?: unknown; path?: unknown };
    return { ok: false, code: item.code ?? null, message: String(item.message ?? error), path: item.path ?? null };
  }
};
const requestCase = async (name: string, input: unknown, suppliedCompiler?: ProtobufSourceCompiler) => {
  let calls = 0;
  const observed: ProtobufSourceCompiler = { async compile(request) {
    calls++;
    return suppliedCompiler
      ? suppliedCompiler.compile(request)
      : { descriptorSet: new Uint8Array(), compiler: 'capture-compiler/1' };
  } };
  const result = await capture(() => importProtobufSources(input as never, observed, { id: 'capture' }));
  return { name, result: result.ok ? { ok: true, archive: (result.value as any).modules[0].elements[0].extensions['umf.protobuf'].sourceArchive } : result, compilerCalls: calls };
};

const document = await importProtobufSources(source, compiler, { id: 'capture' });
const payload = document.modules[0]!.elements[0]!.extensions['umf.protobuf'] as any;
const unknownArchive = structuredClone(document);
(unknownArchive.modules[0]!.elements[0]!.extensions['umf.protobuf'] as any).sourceArchive.future = true;
const unknownPayload = structuredClone(document);
(unknownPayload.modules[0]!.elements[0]!.extensions['umf.protobuf'] as any).future = true;
const oversized = { files: { 'root.proto': '\0'.repeat(700_000) }, roots: ['root.proto'] };
const cases = [
  await requestCase('success-empty-descriptor-set', source),
  await requestCase('unsafe-number-before-unknown-key', { ...source, future: Number.NaN }),
  await requestCase('missing-shape-before-unknown-key', { future: true }),
  await requestCase('unknown-key-before-invalid-file-value', { files: { 'root.proto': 3 }, roots: ['root.proto'], future: true }),
  await requestCase('invalid-file-value', { files: { 'root.proto': 3 }, roots: ['root.proto'] }),
  await requestCase('missing-root', { files: {}, roots: ['missing.proto'] }),
  await requestCase('duplicate-roots', { files: { 'root.proto': 'x' }, roots: ['root.proto', 'root.proto'] }),
  await requestCase('700k-nul-source', oversized),
  await requestCase('compiler-error-propagates', source, { async compile() { throw new Error('compiler refused'); } }),
  await requestCase('empty-compiler-identity', source, { async compile() { return { descriptorSet: new Uint8Array(), compiler: '' }; } }),
  await requestCase('malformed-compiler-descriptor-bytes', source, { async compile() { return { descriptorSet: new Uint8Array([0x80]), compiler: 'capture-compiler/1' }; } }),
  { name: 'unknown-payload-export-guard', result: await capture(() => exportProtobufDescriptorSet(unknownPayload)), compilerCalls: null },
  { name: 'unknown-source-archive-export-guard', result: await capture(() => exportProtobufDescriptorSet(unknownArchive)), compilerCalls: null },
];
const hashes: Record<string, string> = {};
for (const path of [
  'src/adapters/protobuf/source.ts', 'src/adapters/protobuf/index.ts', 'tests/protobuf/source.test.ts',
  'docs/helix/02-design/contracts/CONTRACT-003-protobuf.md',
  'docs/helix/02-design/technical-designs/TD-003-protobuf-descriptors.md',
  'fixtures/protobuf/legacy.proto', 'fixtures/protobuf/modern.proto', 'fixtures/protobuf/edition.proto',
  'fixtures/protobuf/upstream/google/protobuf/descriptor.proto',
  'scripts/protobuf-source-oracle.py', 'scripts/protobuf-behavior-oracle.py',
  'native/protobuf/go.mod', 'native/protobuf/go.sum', 'native/protobuf/compiler.go',
  'native/protobuf/emitter.go', 'native/protobuf/main_cli.go', 'native/protobuf/main_wasm.go', 'native/protobuf/worker.js',
]) {
  hashes[path] = createHash('sha256').update(await readFile(path)).digest('hex');
}
const output = {
  artifactId: 'R5-PROTOBUF-SOURCE-IMPORT-PREDECESSOR',
  status: 'captured',
  runtime: { bun: Bun.version, node: process.versions.node },
  sourceHashes: hashes,
  success: {
    id: document.id,
    moduleIds: document.modules.map((module) => module.id),
    payloadKeys: Object.keys(payload).sort(),
    archive: payload.sourceArchive,
    inspection: inspectProtobuf(document),
  },
  cases,
};
console.log(JSON.stringify(output));
