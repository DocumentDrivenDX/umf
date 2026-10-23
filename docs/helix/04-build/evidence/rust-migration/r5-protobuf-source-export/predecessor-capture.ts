// SPDX-License-Identifier: MIT OR Apache-2.0
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { importProtobufDescriptorSet, importProtobufSources, exportProtobufSources, PROTOBUF_EXTENSION } from '../../../../../../src/adapters/protobuf';

const hash = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const capturePath = 'docs/helix/04-build/evidence/rust-migration/r5-protobuf-source-export/predecessor-capture.ts';
const descriptorBytes = new Uint8Array(await readFile('fixtures/protobuf/authored.pb'));

function payload(doc: any): any { return doc.modules[0].elements[0].extensions[PROTOBUF_EXTENSION]; }
function summarizeError(error: any) {
  return { ok: false, code: error?.code ?? null, message: error?.message ?? String(error), path: error?.path ?? null };
}
async function capture(name: string, run: () => Promise<any>) {
  try { return { name, ...await run() }; }
  catch (error) { return { name, result: summarizeError(error) }; }
}

const originalFiles = { 'root.proto': 'syntax = "proto3";\nmessage A { string label = 1; }\n', 'unicode-😀.proto': 'message B { string note = 1; }\n' };
const imported = await importProtobufSources({ files: originalFiles, roots: ['root.proto'] }, {
  async compile() { return { descriptorSet: new Uint8Array(), compiler: 'capture-compiler/1' }; },
}, { id: 'source-export-capture' });
const editedDescriptor = await importProtobufDescriptorSet(descriptorBytes, { id: 'edited-descriptor' });
payload(imported).descriptorSet = payload(editedDescriptor).descriptorSet;

const successful = await capture('edited-current-descriptor-and-original-archive', async () => {
  let calls = 0;
  let emittedBytes: { sha256: string; byteLength: number } | undefined;
  const emittedFiles = { 'generated.proto': 'message Edited {}\n' };
  const result = await exportProtobufSources(imported, { async emit(bytes) {
    calls += 1;
    (imported as any).id = 'mutated during callback';
    emittedBytes = { sha256: hash(bytes), byteLength: bytes.byteLength };
    return { files: emittedFiles, compiler: 'capture-compiler/1', printer: 'capture-printer/1' };
  } });
  emittedFiles['generated.proto'] = 'mutated after callback';
  const returnedFile = result.files['generated.proto'];
  const returnedSourceId = result.source.id;
  result.source.id = 'changed returned source';
  return {
    result: { ok: true, calls, descriptorBytesToEmitter: emittedBytes,
      output: { files: { 'generated.proto': returnedFile }, compiler: result.compiler, printer: result.printer,
        archive: payload(result.source).sourceArchive,
        sourceId: returnedSourceId,
        inputIdAfterReturnMutation: imported.id,
        diagnosticCodes: result.diagnostics.map((d: any) => d.code),
        layoutDiagnostic: result.diagnostics.at(-1) } },
  };
});

const cases = [successful,
  await capture('invalid-document-before-emitter', async () => {
    let calls = 0;
    try { await exportProtobufSources({} as any, { async emit() { calls++; return { files: {}, compiler: 'c', printer: 'p' }; } }); }
    catch (error) { return { result: summarizeError(error), calls }; }
  }),
  ...await Promise.all([
    ['null-result', null], ['missing-files', { compiler: 'c', printer: 'p' }],
    ['array-files', { files: [], compiler: 'c', printer: 'p' }],
    ['missing-compiler', { files: {}, printer: 'p' }], ['missing-printer', { files: {}, compiler: 'c' }],
    ['empty-name', { files: { '': 'x' }, compiler: 'c', printer: 'p' }],
    ['non-string-source', { files: { 'a.proto': 7 }, compiler: 'c', printer: 'p' }],
    ['unknown-emitter-field', { files: {}, compiler: 'c', printer: 'p', future: { keep: true } }],
  ].map(async ([name, result]) => capture(`invalid-emitter-${name}`, async () => {
    let callbackBytes: { sha256: string; byteLength: number } | undefined;
    try {
      const output = await exportProtobufSources(imported, { async emit(bytes) { callbackBytes = { sha256: hash(bytes), byteLength: bytes.byteLength }; return result as any; } });
      return { result: { ok: true, files: output.files, compiler: output.compiler, printer: output.printer,
        unknownFields: Object.keys(output).filter(k => !['files', 'compiler', 'printer', 'source', 'diagnostics'].includes(k)),
        archive: payload(output.source).sourceArchive, diagnosticCodes: output.diagnostics.map((d: any) => d.code) }, callbackDescriptorBytes: callbackBytes };
    } catch (error) { return { result: summarizeError(error), callbackDescriptorBytes: callbackBytes }; }
  }))),
  await capture('invalid-emitter-copy-number-precedence', async () => {
    try { await exportProtobufSources(imported, { async emit() { return { files: {}, compiler: 'c', printer: 'p', future: Number.NaN } as any; } }); }
    catch (error) { return { result: summarizeError(error) }; }
  }),
  await capture('callback-mutates-document-before-source-copy', async () => {
    const changed = structuredClone(imported);
    changed.id = 'before callback';
    let descriptorBytesToEmitter: { sha256: string; byteLength: number } | undefined;
    const result = await exportProtobufSources(changed, { async emit(bytes) {
      descriptorBytesToEmitter = { sha256: hash(bytes), byteLength: bytes.byteLength };
      changed.id = 'after callback';
      payload(changed).futureRepresentation = { retain: true };
      return { files: { 'generated.proto': 'message Edited {}\n' }, compiler: 'capture-compiler/1', printer: 'capture-printer/1' };
    } });
    return { result: { ok: true, descriptorBytesToEmitter, sourceId: result.source.id,
      sourceUnknownPayload: payload(result.source).futureRepresentation,
      diagnosticCodes: result.diagnostics.map((d: any) => d.code) } };
  }),
  ...await Promise.all(['unknown-payload-field-before-emitter', 'unknown-source-archive-field-before-emitter'].map(name => capture(name, async () => {
    const changed = structuredClone(imported);
    if (name.startsWith('unknown-payload')) payload(changed).futureRepresentation = { retain: true };
    else payload(changed).sourceArchive.futureArchiveField = { retain: true };
    let calls = 0;
    try { await exportProtobufSources(changed, { async emit() { calls++; return { files: {}, compiler: 'c', printer: 'p' }; } }); }
    catch (error) { return { result: summarizeError(error), calls }; }
  }))),
];

const hashes: Record<string, string> = {};
for (const path of ['src/adapters/protobuf/source.ts', 'src/adapters/protobuf/index.ts', 'tests/protobuf/source.test.ts',
  'docs/helix/02-design/contracts/CONTRACT-001-core-envelope.md', 'docs/helix/02-design/contracts/CONTRACT-002-json-schema.md',
  'docs/helix/02-design/contracts/CONTRACT-003-protobuf.md', 'docs/helix/02-design/contracts/CONTRACT-004-semantic-types.md',
  'docs/helix/02-design/contracts/CONTRACT-005-extensions.md', 'docs/helix/02-design/contracts/CONTRACT-006-document.md',
  'docs/helix/02-design/contracts/CONTRACT-007-*.md', 'docs/helix/02-design/contracts/CONTRACT-008-*.md',
  'docs/helix/02-design/contracts/CONTRACT-009-*.md', 'docs/helix/02-design/contracts/CONTRACT-010-*.md',
  'docs/helix/02-design/contracts/CONTRACT-011-*.md', 'docs/helix/02-design/technical-designs/TD-003-protobuf-descriptors.md',
  'docs/helix/04-build/rust-migration-plan.md', 'fixtures/protobuf/authored.pb', 'docs/helix/04-build/evidence/rust-migration/r5-protobuf-source-export/predecessor-capture.ts']) {
  if (path.includes('*')) continue;
  try { hashes[path] = hash(await readFile(path)); } catch { /* Not all contract filenames use the numbered guess. */ }
}
for (const path of (await readdir('docs/helix/02-design/contracts')).filter(x => /^CONTRACT-(00[1-9]|010|011)-.*\.md$/.test(x)).map(x => `docs/helix/02-design/contracts/${x}`)) {
  hashes[path] = hash(await readFile(path));
}
const report = { artifactId: 'R5-PROTOBUF-SOURCE-EXPORT-PREDECESSOR', status: 'captured', runtime: { bun: Bun.version, node: process.versions.node }, sourceHashes: hashes, fixture: { path: 'fixtures/protobuf/authored.pb', sha256: hash(descriptorBytes), byteLength: descriptorBytes.byteLength }, cases };
process.stdout.write(JSON.stringify(report) + '\n');
