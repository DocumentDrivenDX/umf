// Replay the frozen Arrow IPC predecessor packet through a freshly built Node NAPI package.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const repo = resolve(import.meta.dirname, '../../../..');
const packageRoot = process.env.UMF_ARROW_IPC_NODE_PACKAGE;
if (!packageRoot) throw new Error('Set UMF_ARROW_IPC_NODE_PACKAGE to the isolated fresh Node package');
const packetPath = resolve(repo, 'tests/rust-core/fixtures/r5-arrow-ipc-capture-predecessor-20261027/typescript-arrow-ipc-capture.json.gz');
const packet = JSON.parse(gunzipSync(await readFile(packetPath)));
const binding = await import(pathToFileURL(join(packageRoot, 'index.js')).href);
let metered = 0;
const createEngine = () => binding.createArrowIpcEngine({controls: {meter(amount) { metered += amount; }, now: () => Date.now(), deadlineMs: Date.now() + 120_000}});
const engine = createEngine();
const invoke = (method, ...args) => createEngine()[method](...args);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const summarizeBytes = bytes => ({byteLength: bytes.byteLength, sha256: hash(bytes)});
const outcome = fn => {
  try { return {kind: 'return', value: fn()}; }
  catch (error) { return {kind: 'throw', error: {name: error?.name, code: error?.code ?? null, path: error?.path ?? null, message: String(error?.message ?? error)}}; }
};
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const mismatches = [];
const boundarySkipped = [];
let calls = 0;
const mismatch = (name, operation, expected, actual) => mismatches.push({name, operation, expected, actual});
const compareOutcome = (name, operation, expected, actual) => {
  if (expected.kind !== actual.kind) { mismatch(name, operation, expected, actual); return; }
  if (expected.kind === 'throw') {
    const {code, message, path} = expected.error;
    const observed = actual.error;
    if (observed.code !== code || observed.message !== message || observed.path !== path) mismatch(name, operation, expected, actual);
  } else if (JSON.stringify(canonical(actual.value)) !== JSON.stringify(canonical(expected.value))) mismatch(name, operation, expected, actual);
};

assert.equal(binding.ARROW_IPC_PROFILE, 'umf-r8-arrow-ipc/0.1.0');
assert.equal(engine.profile, binding.ARROW_IPC_PROFILE);
assert.equal(engine.capabilities.complete, false);
for (const item of packet.cases) {
  if (process.env.UMF_ARROW_IPC_SKIP_BOUNDARY === '1' && item.input.byteLength >= 1_000_000) {
    boundarySkipped.push(item.name);
    continue;
  }
  let bytes;
  if (item.file) bytes = new Uint8Array(await readFile(resolve(repo, 'fixtures/arrow/ipc-inputs', item.file)));
  else if (item.name === 'empty') bytes = new Uint8Array();
  else if (item.name === 'invalid') bytes = new Uint8Array([0, 255, 0]);
  else if (item.name === 'truncated') bytes = new Uint8Array(await readFile(resolve(repo, 'fixtures/arrow/ipc-inputs/int64.stream.arrow'))).slice(0, 20);
  else if (item.name === 'trailing') {
    const original = new Uint8Array(await readFile(resolve(repo, 'fixtures/arrow/ipc-inputs/int64.stream.arrow')));
    bytes = new Uint8Array(original.length + 3); bytes.set(original); bytes.set([0, 255, 7], original.length);
  } else bytes = new Uint8Array(1_000_000);
  assert.deepEqual(summarizeBytes(bytes), item.input, `frozen source ${item.name}`);
  const captured = outcome(() => invoke('captureArrowIpc', bytes, {id: item.file ?? item.name})); calls++;
  if (captured.kind !== 'return') { mismatch(item.name, 'capture', item.document, captured); continue; }
  const serialized = Buffer.from(JSON.stringify(captured.value));
  const documentSummary = {jsonSha256: hash(serialized), jsonByteLength: serialized.length};
  if (JSON.stringify(documentSummary) !== JSON.stringify(item.document)) mismatch(item.name, 'capture-document', item.document, documentSummary);
  const inspection = outcome(() => invoke('inspectArrowIpcCapture', captured.value)); calls++;
  compareOutcome(item.name, 'inspect', {kind: 'return', value: item.inspect}, inspection);
  const exported = outcome(() => invoke('exportArrowIpcCapture', captured.value)); calls++;
  if (exported.kind !== 'return') mismatch(item.name, 'export', item.export, exported);
  else {
    const summary = summarizeBytes(exported.value);
    if (JSON.stringify(summary) !== JSON.stringify(item.export)) mismatch(item.name, 'export', item.export, summary);
    if (Buffer.compare(Buffer.from(bytes), Buffer.from(exported.value)) !== 0) mismatch(item.name, 'byte-equality', true, false);
  }
  process.stderr.write(`case ${item.name} done\n`);
}

for (const item of packet.mutations) {
  const inspection = outcome(() => invoke('inspectArrowIpcCapture', item.document)); calls++;
  compareOutcome(item.name, 'inspect', item.inspect, inspection);
  const exported = outcome(() => Array.from(invoke('exportArrowIpcCapture', item.document))); calls++;
  compareOutcome(item.name, 'export', item.exported, exported);
  process.stderr.write(`mutation ${item.name} done\n`);
}

if (process.env.UMF_ARROW_IPC_SKIP_BOUNDARY === '1') boundarySkipped.push('oversize');
else {
  const oversize = outcome(() => invoke('captureArrowIpc', new Uint8Array(1_000_001), {id: 'oversize'})); calls++;
  compareOutcome('oversize', 'capture', packet.oversize, oversize);
}
const input = new Uint8Array([1, 2, 3]);
const captured = invoke('captureArrowIpc', input, {id: 'copy'}); calls++; input.fill(0);
const afterInputMutation = Array.from(invoke('exportArrowIpcCapture', captured)); calls++;
const firstExport = invoke('exportArrowIpcCapture', captured); calls++; firstExport.fill(0);
const afterOutputMutation = Array.from(invoke('exportArrowIpcCapture', captured)); calls++;
if (JSON.stringify({afterInputMutation, afterOutputMutation}) !== JSON.stringify(packet.copyControl)) {
  mismatch('copy-control', 'input-output-copy', packet.copyControl, {afterInputMutation, afterOutputMutation});
}

const receipt = {format: 'umf-r8-arrow-ipc-capture-node-current-source/1', status: mismatches.length ? 'mismatch' : 'pass', runtime: process.versions.bun ? 'bun' : 'node', versions: {node: process.versions.node, bun: process.versions.bun ?? null, napi: process.versions.napi ?? null}, profile: binding.ARROW_IPC_PROFILE, cases: packet.cases.length - boundarySkipped.filter(name => packet.cases.some(item => item.name === name)).length, mutations: packet.mutations.length, calls, perCallTimeoutMs: 120_000, controlsMetered: metered > 0, metered, boundarySkipped, mismatches, noDefaultRouteClaim: true};
if (process.env.UMF_ARROW_IPC_RECEIPT) await writeFile(process.env.UMF_ARROW_IPC_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
if (mismatches.length) process.exitCode = 1;
