import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verifyPacket, verifyHostReceipt, validateDefaultRouteRetirementEvidence } from './default-route-retirement-evidence.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const operation = {
  exportName: 'inspectCoreCardinality',
  rustOwner: 'umf_core::cardinality::inspect_core_cardinality',
  contract: { id: 'CONTRACT-040' },
};
const outcome = { status: 'returned', value: { cardinality: 'array' } };
const cases = [
  { id: 'known', input: { kind: 'known' }, expectedOutcome: outcome, expectedTrace: [], expectedDefaultRustCalls: 1 },
  { id: 'host-refusal', input: { kind: 'proxy' }, expectedOutcome: { status: 'threw', code: 'PROXY' }, expectedTrace: ['ownKeys'], expectedDefaultRustCalls: 1 },
];
const packet = (contractId = 'CONTRACT-040') => ({ format: 'umf.r8.default-route-retirement-packet/2', profile: 'all-rust', contractId, exportName: operation.exportName, rustOwner: operation.rustOwner, cases: structuredClone(cases) });
const cohort = { id: 'darwin-arm64', platform: { os: 'darwin', nodeArch: 'arm64' }, archive: { sha256: 'a'.repeat(64), sourceClosureSha256: 'b'.repeat(64) } };
const members = { 'dist/umf-node.js': 'c'.repeat(64), 'dist/umf_core_node.node': 'd'.repeat(64), 'dist/umf.js': 'e'.repeat(64) };
const routes = { 'package-root-node': 'dist/umf-node.js', 'package-reference': 'dist/umf.js' };

async function pin(root, name, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  await writeFile(path.join(root, name), bytes);
  return { path: name, sha256: sha(bytes) };
}

function receipt(packetSha256) {
  return {
    format: 'umf.r8.default-route-retirement-host-receipt/2', status: 'pass', runtime: 'node', hostVersion: 'fixture',
    cohortId: cohort.id, hostPlatform: { os: 'darwin', arch: 'arm64' }, archiveSha256: cohort.archive.sha256,
    sourceClosureSha256: cohort.archive.sourceClosureSha256, packetSha256,
    defaultRoute: { routeId: 'package-root-node', entryMember: 'dist/umf-node.js', entrySha256: members['dist/umf-node.js'], artifactMembers: [{ path: 'dist/umf_core_node.node', sha256: members['dist/umf_core_node.node'] }] },
    referenceRoute: { routeId: 'package-reference', entryMember: 'dist/umf.js', entrySha256: members['dist/umf.js'], artifactMembers: [] },
    cases: cases.map(item => ({ id: item.id, defaultOutcome: item.expectedOutcome, defaultTrace: item.expectedTrace, defaultRustCalls: 1, referenceOutcome: item.expectedOutcome, referenceTrace: item.expectedTrace, referenceRustCalls: 0 })),
  };
}

test('all-Rust Cardinality packets require exact case-level calls and a zero-Rust reference route', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-all-rust-packet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packetPin = await pin(root, 'packet.json', packet());
  const verifiedPacket = verifyPacket(root, packetPin, operation);
  const good = receipt(packetPin.sha256);
  const goodPin = await pin(root, 'receipt.json', good);
  assert.doesNotThrow(() => verifyHostReceipt(root, { ...goodPin, runtime: 'node' }, operation, verifiedPacket, cohort, members, routes));
  for (const [name, change] of [
    ['skipped-default-call', r => { r.cases[1].defaultRustCalls = 0; }],
    ['extra-default-call', r => { r.cases[0].defaultRustCalls = 2; }],
    ['reference-called-rust', r => { r.cases[0].referenceRustCalls = 1; }],
    ['missing-case', r => { r.cases.pop(); }],
    ['duplicate-case', r => { r.cases[1].id = r.cases[0].id; }],
    ['changed-refusal-trace', r => { r.cases[1].defaultTrace = []; }],
  ]) {
    const changed = structuredClone(good); change(changed);
    const changedPin = await pin(root, `${name}.json`, changed);
    assert.throws(() => verifyHostReceipt(root, { ...changedPin, runtime: 'node' }, operation, verifiedPacket, cohort, members, routes), name);
  }
});

test('all-Rust packet rejects false preflight claims and invalid case inventories after rehash', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-all-rust-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, change] of [
    ['zero-call', p => { p.cases[1].expectedDefaultRustCalls = 0; }],
    ['missing-call', p => { delete p.cases[0].expectedDefaultRustCalls; }],
    ['mixed-profile', p => { p.cases[0].expectsRust = true; }],
    ['duplicate-id', p => { p.cases[1].id = p.cases[0].id; }],
    ['empty-cases', p => { p.cases = []; }],
    ['wrong-profile', p => { p.profile = 'mixed'; }],
  ]) {
    const changed = packet(); change(changed);
    const changedPin = await pin(root, `${name}.json`, changed);
    assert.throws(() => verifyPacket(root, changedPin, operation), name);
  }
  const otherOperation = { ...operation, exportName: 'unrelatedOperation' };
  const otherPacket = { ...packet(), exportName: otherOperation.exportName };
  const otherPin = await pin(root, 'unrelated.json', otherPacket);
  assert.throws(() => verifyPacket(root, otherPin, otherOperation), /unsupported/);
  const wrongContractOperation = { ...operation, contract: { id: 'CONTRACT-062' } };
  const wrongContractPin = await pin(root, 'wrong-contract.json', packet('CONTRACT-062'));
  assert.throws(() => verifyPacket(root, wrongContractPin, wrongContractOperation), /requires CONTRACT-040/);
});

test('legacy mixed packet still requires real Rust and zero-call preflight cases', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-mixed-packet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const legacy = { format: 'umf.r8.default-route-retirement-packet/1', contractId: 'CONTRACT-040', exportName: operation.exportName, rustOwner: operation.rustOwner, cases: cases.map((item, index) => ({ id: item.id, input: item.input, expectedOutcome: item.expectedOutcome, expectedTrace: item.expectedTrace, expectsRust: index === 0 })) };
  const mixedPin = await pin(root, 'mixed.json', legacy);
  assert.doesNotThrow(() => verifyPacket(root, mixedPin, operation));
  legacy.cases.pop();
  const missingPin = await pin(root, 'missing-preflight.json', legacy);
  assert.throws(() => verifyPacket(root, missingPin, operation), /preflight refusal/);
});

test('bounded /2 Cardinality evidence still cannot retire a default-route row', () => {
  assert.throws(
    () => validateDefaultRouteRetirementEvidence({ format: 'umf.r8.default-route-retirement-evidence/2' }, [], { root: process.cwd() }),
    /CONTRACT acceptance coverage required.*cannot retire/,
  );
});

const securityNotOperation = {
  exportName: 'securityNot',
  rustOwner: 'umf_core::security_logic::security_not',
  contract: { id: 'CONTRACT-062' },
};
const securityIds = ['T', 'F', 'U', 'null', 'number', 'boolean', 'unknown-string', 'array', 'object', 'null-prototype', 'accessor', 'proxy-ownKeys', 'proxy-getPrototype', 'proxy-get'];
const securityExpected = id => ['T', 'F', 'U'].includes(id)
  ? { kind: 'return', value: ({ T: 'F', F: 'T', U: 'U' })[id], trace: [] }
  : { kind: 'throw', name: 'UmfError', constructor: 'UmfError', code: 'SECURITY_TRUTH', message: 'Invalid security truth', path: '', trace: [] };
const securityPacket = () => ({
  format: 'umf.r8.default-route-retirement-packet/3', profile: 'security-not', contractId: 'CONTRACT-062',
  exportName: 'securityNot', rustOwner: securityNotOperation.rustOwner,
  cases: securityIds.map(id => ({ id, input: { case: id }, expectedOutcome: securityExpected(id), expectedTrace: [], expectedDefaultRustCalls: ['T', 'F', 'U'].includes(id) ? 1 : 0 })),
});

test('securityNot acceptance packet binds all 14 exact truth, invalid-input, trace and Rust-dispatch cases', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-security-not-packet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const good = securityPacket();
  const goodPin = await pin(root, 'security-not.json', good);
  const verified = verifyPacket(root, goodPin, securityNotOperation);
  assert.equal(verified.securityNot, true);
  assert.equal(verified.cases.size, 14);

  for (const [name, mutate] of [
    ['truth-result', p => { p.cases[0].expectedOutcome.value = 'T'; }],
    ['invalid-error-class', p => { p.cases[3].expectedOutcome.name = 'UmfCoreError'; p.cases[3].expectedOutcome.constructor = 'UmfCoreError'; }],
    ['invalid-code', p => { p.cases[3].expectedOutcome.code = 'RESOURCE_LIMIT'; }],
    ['effect-trace', p => { p.cases[10].expectedTrace.push('getter'); }],
    ['rust-dispatch', p => { p.cases[0].expectedDefaultRustCalls = 0; }],
    ['invalid-dispatch', p => { p.cases[3].expectedDefaultRustCalls = 1; }],
    ['case-order', p => { [p.cases[0], p.cases[1]] = [p.cases[1], p.cases[0]]; }],
    ['case-omission', p => { p.cases.pop(); }],
    ['input-alias', p => { p.cases[0].input.case = 'F'; }],
    ['wrong-operation', p => { p.exportName = 'securityAnd'; }],
  ]) {
    const changed = structuredClone(good); mutate(changed);
    const changedPin = await pin(root, `${name}.json`, changed);
    assert.throws(() => verifyPacket(root, changedPin, securityNotOperation), /securityNot packet|identity is invalid/ , name);
  }
});

test('securityNot host receipts require exact outcomes, traces and default/reference dispatch counts', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-security-not-receipt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packetPin = await pin(root, 'packet.json', securityPacket());
  const verifiedPacket = verifyPacket(root, packetPin, securityNotOperation);
  const securityCohort = { ...cohort, platform: { os: 'darwin', nodeArch: 'arm64' } };
  const securityMembers = { ...members };
  const securityRoutes = { ...routes };
  const good = receipt(packetPin.sha256);
  good.format = 'umf.r8.default-route-retirement-host-receipt/3';
  good.cases = securityIds.map(id => ({
    id, defaultOutcome: securityExpected(id), defaultTrace: [], defaultRustCalls: ['T', 'F', 'U'].includes(id) ? 1 : 0,
    referenceOutcome: securityExpected(id), referenceTrace: [], referenceRustCalls: 0,
  }));
  const goodPin = await pin(root, 'good-receipt.json', good);
  assert.doesNotThrow(() => verifyHostReceipt(root, { ...goodPin, runtime: 'node' }, securityNotOperation, verifiedPacket, securityCohort, securityMembers, securityRoutes));
  for (const [name, mutate] of [
    ['changed-truth', r => { r.cases[0].defaultOutcome.value = 'T'; }],
    ['changed-invalid-error', r => { r.cases[3].defaultOutcome.name = 'UmfCoreError'; }],
    ['observed-effect', r => { r.cases[10].defaultTrace.push('getter'); }],
    ['skipped-rust-call', r => { r.cases[0].defaultRustCalls = 0; }],
    ['called-rust-for-invalid', r => { r.cases[3].defaultRustCalls = 1; }],
    ['reference-rust-call', r => { r.cases[0].referenceRustCalls = 1; }],
    ['missing-case', r => { r.cases.pop(); }],
  ]) {
    const changed = structuredClone(good); mutate(changed);
    const changedPin = await pin(root, `${name}.json`, changed);
    assert.throws(() => verifyHostReceipt(root, { ...changedPin, runtime: 'node' }, securityNotOperation, verifiedPacket, securityCohort, securityMembers, securityRoutes), name);
  }
});
