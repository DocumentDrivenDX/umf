// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gzipSync} from 'node:zlib';

const repo = resolve(import.meta.dir, '../../..');
const outDir = process.argv[2];
if (!outDir) throw new Error('usage: bun freeze-arrow-ipc-capture-predecessor.mjs OUT_DIR');
const {captureArrowIpc, exportArrowIpcCapture, inspectArrowIpcCapture, ARROW_IPC_MAX_BYTES} =
  await import(resolve(repo, 'src/adapters/arrow/capture.ts'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const summary = bytes => ({byteLength: bytes.length, sha256: sha256(bytes)});
const outcome = fn => {
  try { return {kind: 'return', value: fn()}; }
  catch (error) { return {kind: 'throw', error: {name: error?.name, code: error?.code ?? null,
    path: error?.path ?? null, message: String(error?.message ?? error)}}; }
};
const manifestPath = resolve(repo, 'fixtures/arrow/ipc-inputs/manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const cases = [];
for (const item of manifest.cases) {
  const input = new Uint8Array(await readFile(resolve(repo, 'fixtures/arrow/ipc-inputs', item.file)));
  const document = captureArrowIpc(input, {id: item.file});
  const before = JSON.stringify(document);
  const inspect = inspectArrowIpcCapture(document);
  const exported = exportArrowIpcCapture(document);
  cases.push({name: item.name, format: item.format, file: item.file, input: summary(input),
    document: {jsonSha256: sha256(Buffer.from(before)), jsonByteLength: Buffer.byteLength(before)},
    inspect, export: summary(exported), unchanged: before === JSON.stringify(document),
    byteEqual: Buffer.from(input).equals(Buffer.from(exported))});
}
const valid = new Uint8Array(await readFile(resolve(repo, 'fixtures/arrow/ipc-inputs/int64.stream.arrow')));
const trailing = new Uint8Array(valid.length + 3); trailing.set(valid); trailing.set([0, 255, 7], valid.length);
for (const [name, input] of [
  ['empty', new Uint8Array()], ['invalid', new Uint8Array([0, 255, 0])],
  ['truncated', valid.slice(0, 20)], ['trailing', trailing],
  ['at-limit', new Uint8Array(ARROW_IPC_MAX_BYTES)],
]) {
  const document = captureArrowIpc(input, {id: name});
  const before = JSON.stringify(document);
  const exported = exportArrowIpcCapture(document);
  cases.push({name, input: summary(input), document: {jsonSha256: sha256(Buffer.from(before)),
    jsonByteLength: Buffer.byteLength(before)}, inspect: inspectArrowIpcCapture(document),
    export: summary(exported), byteEqual: Buffer.from(input).equals(Buffer.from(exported))});
}
const oversize = outcome(() => captureArrowIpc(new Uint8Array(ARROW_IPC_MAX_BYTES + 1), {id: 'oversize'}));
const base = captureArrowIpc(new Uint8Array([1, 2, 3]), {id: 'guard'});
const mutations = [];
for (const [name, change] of [
  ['odd-hex', d => {d.modules[0].elements[0].extensions['umf.arrow.ipc'].bytes = 'f';}],
  ['non-hex', d => {d.modules[0].elements[0].extensions['umf.arrow.ipc'].bytes = 'xz';}],
  ['uppercase-hex', d => {d.modules[0].elements[0].extensions['umf.arrow.ipc'].bytes = 'FF';}],
  ['unknown-payload', d => {d.modules[0].elements[0].extensions['umf.arrow.ipc'].future = {retain: true};}],
  ['wrong-package-version', d => {d.vocabularies['umf.arrow.ipc'].version = '9.0.0';}],
  ['missing-source', d => {d.modules[0].elements = [];}],
  ['invalid-id', d => {d.id = '';}],
]) {
  const document = structuredClone(base); change(document);
  const before = JSON.stringify(document);
  const inspect = outcome(() => inspectArrowIpcCapture(document));
  const exported = outcome(() => Array.from(exportArrowIpcCapture(document)));
  mutations.push({name, document, inspect, exported, unchanged: before === JSON.stringify(document)});
}
const input = new Uint8Array([1, 2, 3]);
const copiedDocument = captureArrowIpc(input, {id: 'copy'}); input.fill(0);
const copyControl = {afterInputMutation: Array.from(exportArrowIpcCapture(copiedDocument))};
const firstExport = exportArrowIpcCapture(copiedDocument); firstExport.fill(0);
copyControl.afterOutputMutation = Array.from(exportArrowIpcCapture(copiedDocument));
const packet = {profile: 'umf.arrow-ipc-typescript-predecessor/1', contract: 'CONTRACT-016',
  source: 'src/adapters/arrow/capture.ts', fixtureManifest: summary(await readFile(manifestPath)),
  cases, oversize, mutations, copyControl};
await mkdir(outDir, {recursive: true});
const json = Buffer.from(JSON.stringify(packet));
await writeFile(resolve(outDir, 'typescript-arrow-ipc-capture.json.gz'), gzipSync(json, {mtime: 0}));
console.log(JSON.stringify({cases: cases.length, mutations: mutations.length,
  json: summary(json), gzip: summary(await readFile(resolve(outDir, 'typescript-arrow-ipc-capture.json.gz')))}));
