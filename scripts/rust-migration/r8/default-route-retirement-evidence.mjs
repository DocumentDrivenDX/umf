// Fail-closed exact-row retirement gate. Host success summaries are not proof:
// this validator reopens source, contract, archive-member, packet and raw-case files.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hashPattern = /^[a-f0-9]{64}$/;
const defaultRoutes = ['package-root-node', 'package-root-browser'];
const runtimes = ['node', 'bun', 'chromium'];
const requiredCohorts = {
  'darwin-arm64': { os: 'darwin', arch: 'aarch64', nodeArch: 'arm64', nativeTarget: 'aarch64-apple-darwin' },
  'linux-x86_64': { os: 'linux', arch: 'x86_64', nodeArch: 'x64', nativeTarget: 'x86_64-unknown-linux-gnu' },
};
const stable = value => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
    : value;
const canonical = value => JSON.stringify(stable(value));
const sameStringMap = (left, right) => {
  if (!left || !right || Array.isArray(left) || Array.isArray(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
};

function requireExactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) throw new Error(`${label} has missing or unknown fields`);
}

function verifyFixedPointTransform(transform, label) {
  requireExactKeys(transform, ['status', 'generatedInputs'], `${label} transform`);
  if (transform.status !== 'fixed-point' || !Array.isArray(transform.generatedInputs) || transform.generatedInputs.length !== 0) throw new Error(`${label} transform is not an exact fixed-point record`);
}

function readPinned(root, pin, label, json = false) {
  if (!pin || typeof pin !== 'object' || typeof pin.path !== 'string' || path.isAbsolute(pin.path) || pin.path.split(/[\\/]/).includes('..')) throw new Error(`${label} needs a safe repository-relative path`);
  if (!hashPattern.test(pin.sha256 ?? '')) throw new Error(`${label} needs a SHA-256`);
  const rootReal = fs.realpathSync(root);
  const full = fs.realpathSync(path.resolve(rootReal, pin.path));
  const relative = path.relative(rootReal, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label} resolves outside the evidence root`);
  const bytes = fs.readFileSync(full);
  if (sha(bytes) !== pin.sha256) throw new Error(`${label} hash mismatch: ${pin.path}`);
  return { bytes, json: json ? JSON.parse(bytes.toString('utf8')) : null };
}

export function tarMembers(bytes) {
  // The SDK packager writes deterministic gzip + ordinary USTAR regular files.
  // Keep this parser deliberately narrow: reject extensions and special files.
  const tar = gunzipSync(bytes);
  const members = Object.create(null);
  const files = Object.create(null);
  let offset = 0;
  let ended = false;
  let pendingPath = null;
  const field = (block, start, length) => block.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
  const paxPath = payload => {
    let cursor = 0;
    let result = null;
    while (cursor < payload.length) {
      const space = payload.indexOf(32, cursor);
      if (space < 0) throw new Error('archive PAX record has no length delimiter');
      const lengthText = payload.subarray(cursor, space).toString('ascii');
      if (!/^[1-9][0-9]*$/.test(lengthText)) throw new Error('archive PAX record length is invalid');
      const length = Number(lengthText);
      const end = cursor + length;
      if (!Number.isSafeInteger(length) || end > payload.length || payload[end - 1] !== 10) throw new Error('archive PAX record is truncated');
      const record = new TextDecoder('utf-8', { fatal: true }).decode(payload.subarray(space + 1, end - 1));
      const equals = record.indexOf('=');
      if (equals < 1 || record.slice(0, equals) !== 'path' || result !== null) throw new Error('archive PAX header has unsupported or duplicate metadata');
      result = record.slice(equals + 1);
      cursor = end;
    }
    if (!result) throw new Error('archive PAX header omits its path');
    return result;
  };
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      ended = true;
      break;
    }
    const storedChecksum = Number.parseInt(field(header, 148, 8).trim(), 8);
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
    if (!Number.isSafeInteger(storedChecksum) || checksum !== storedChecksum) throw new Error('archive tar header checksum is invalid');
    const type = header[156];
    const name = field(header, 0, 100);
    const prefix = field(header, 345, 155);
    const size = Number.parseInt(field(header, 124, 12).trim(), 8);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('archive member size is invalid');
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) throw new Error('archive member is truncated');
    const content = tar.subarray(dataStart, dataEnd);
    if (type === 120) {
      if (pendingPath !== null) throw new Error('archive has stacked PAX headers');
      pendingPath = paxPath(content);
      offset = dataStart + Math.ceil(size / 512) * 512;
      continue;
    }
    if (type !== 0 && type !== 48) throw new Error('archive contains an unsupported non-regular tar member');
    const member = pendingPath ?? (prefix ? `${prefix}/${name}` : name);
    pendingPath = null;
    if (!member.startsWith('package/') || member.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`archive member path is unsafe: ${member}`);
    if (Object.hasOwn(members, member)) throw new Error(`archive has duplicate member: ${member}`);
    members[member] = sha(content);
    files[member.slice('package/'.length)] = content;
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  if (!ended || pendingPath !== null || Object.keys(members).length === 0) throw new Error('archive tar is incomplete or empty');
  if (!tar.subarray(offset).every(byte => byte === 0)) throw new Error('archive has non-zero data after its tar end marker');
  return { members: Object.fromEntries(Object.entries(members).map(([name, digest]) => [name.slice('package/'.length), digest])), files };
}

function verifyArchive(root, cohort, expectedMembers, sourceManifestPin) {
  const { archive } = cohort;
  if (!hashPattern.test(archive.sha256 ?? '')) throw new Error('SDK archive needs an explicit SHA-256 pin');
  const bytes = path.isAbsolute(archive.path)
    ? fs.readFileSync(fs.realpathSync(archive.path))
    : readPinned(root, { path: archive.path, sha256: archive.sha256 }, 'SDK archive').bytes;
  if (sha(bytes) !== archive.sha256) throw new Error('SDK archive hash mismatch');
  const archiveContents = tarMembers(bytes);
  const actualKeys = Object.keys(archiveContents.members).sort();
  const expectedKeys = Object.keys(expectedMembers).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index] || archiveContents.members[key] !== expectedMembers[key])) {
    throw new Error('archive tar member map differs from the pinned archive member manifest');
  }
  const rustManifestBytes = archiveContents.files['dist/rust-default-manifest.json'];
  if (!rustManifestBytes) throw new Error('archive omits dist/rust-default-manifest.json');
  const rustManifest = JSON.parse(rustManifestBytes.toString('utf8'));
  const source = rustManifest.sourceClosure;
  const sourceDoc = readPinned(root, sourceManifestPin, 'live source closure manifest', true).json.sourceClosure;
  const archivePlatform = rustManifest.platform;
  const archivePlatformIdentity = archivePlatform && { os: archivePlatform.os, arch: archivePlatform.arch, nodeArch: archivePlatform.nodeArch, nativeTarget: archivePlatform.nativeTarget };
  if (canonical(archivePlatformIdentity) !== canonical(cohort.platform)) throw new Error(`${cohort.id} archive platform differs from its cohort pin`);
  verifyFixedPointTransform(source?.transform, 'archive Rust manifest source closure');
  verifyFixedPointTransform(sourceDoc?.transform, 'pinned live-source manifest');
  if (!source || source.sha256 !== archive.sourceClosureSha256 || source.capturedLiveSha256 !== archive.sourceClosureSha256 ||
      source.fileCount !== archive.sourceInputCount || canonical(source.transform) !== canonical(sourceDoc.transform) ||
      !sameStringMap(source.liveInputs, sourceDoc.inputs)) {
    throw new Error('archive Rust manifest source closure differs from the pinned live-source manifest');
  }
}

function contractIdFromMarkdown(source) {
  return source.match(/^\s*id:\s*([^\s]+)\s*$/m)?.[1] ?? null;
}

function verifyLiveSourceManifest(root, pin, archive) {
  const sourceDoc = readPinned(root, pin, 'live source manifest', true).json;
  const closure = sourceDoc.sourceClosure;
  if (!closure) throw new Error('live-source manifest is not a matching fixed-point closure');
  verifyFixedPointTransform(closure.transform, 'live-source manifest');
  if (closure.sha256 !== archive.sourceClosureSha256 || closure.capturedLiveSha256 !== archive.sourceClosureSha256 || closure.fileCount !== archive.sourceInputCount) throw new Error('live-source manifest is not a matching fixed-point closure');
  const inputs = closure.inputs;
  if (!inputs || Array.isArray(inputs) || Object.keys(inputs).length !== archive.sourceInputCount) throw new Error('live-source manifest input map is incomplete');
  const tree = crypto.createHash('sha256');
  for (const name of Object.keys(inputs).sort()) {
    const bytes = readPinned(root, { path: name, sha256: inputs[name] }, `live source ${name}`).bytes;
    tree.update(name); tree.update('\0'); tree.update(bytes); tree.update('\0');
  }
  if (tree.digest('hex') !== archive.sourceClosureSha256) throw new Error('recomputed live-source closure differs from archive');
  return inputs;
}

function verifyMemberManifest(root, pin, archivedPackagePin, archive, liveInputs) {
  const doc = readPinned(root, pin, 'archive member manifest', true).json;
  if (doc.status !== 'pass' || doc.algorithm !== 'sha256' || doc.archiveSha256 !== archive.sha256 || doc.packageManifestSha256 !== archive.packageManifestSha256 || !Number.isSafeInteger(doc.archiveMemberCount) || doc.archiveMemberCount < 1 || doc.verifiedMemberCount !== doc.archiveMemberCount) throw new Error('archive member manifest identity or verified-member counts are incomplete');
  const members = doc.members;
  if (!members || Array.isArray(members) || Object.keys(members).length !== doc.archiveMemberCount || Object.values(members).some(value => !hashPattern.test(value))) throw new Error('archive member hash map is invalid');
  if (members['package.json'] !== archive.packageManifestSha256) throw new Error('archive package manifest hash is not bound to the member map');
  const livePackageBytes = readPinned(root, { path: 'package.json', sha256: liveInputs['package.json'] }, 'live source package manifest').bytes;
  const livePackage = JSON.parse(livePackageBytes.toString('utf8'));
  const archivedPackageBytes = readPinned(root, archivedPackagePin, 'extracted archive package manifest').bytes;
  if (sha(archivedPackageBytes) !== members['package.json'] || sha(archivedPackageBytes) !== archive.packageManifestSha256) throw new Error('extracted package.json bytes do not match the archived member hash');
  const archivedPackage = JSON.parse(archivedPackageBytes.toString('utf8'));
  if (canonical(archivedPackage.exports) !== canonical(livePackage.exports)) throw new Error('archive package export conditions differ from live source package metadata');
  const expectedArchiveKeys = ['name', 'version', 'private', 'type', 'license', 'files', 'exports', 'dependencies'];
  if (Object.keys(archivedPackage).sort().join('\0') !== expectedArchiveKeys.sort().join('\0') || archivedPackage.name !== livePackage.name || archivedPackage.version !== livePackage.version || archivedPackage.private !== true || archivedPackage.type !== livePackage.type || archivedPackage.license !== livePackage.license || canonical(archivedPackage.files) !== canonical(['dist/']) || canonical(archivedPackage.dependencies ?? {}) !== canonical(livePackage.dependencies ?? {})) throw new Error('archive package metadata does not follow scripts/package-sdk.py transformation');
  const builderBytes = readPinned(root, { path: 'scripts/package-sdk.py', sha256: liveInputs['scripts/package-sdk.py'] }, 'live SDK package builder').bytes.toString('utf8');
  if (!builderBytes.includes("'exports': metadata['exports']") || !builderBytes.includes("'private': True") || !builderBytes.includes("'files': ['dist/']")) throw new Error('scripts/package-sdk.py package metadata transform changed');
  const nodeEntry = archivedPackage.exports?.['.']?.node;
  const browserEntry = archivedPackage.exports?.['.']?.browser;
  const referenceEntry = archivedPackage.exports?.['./reference']?.import;
  if (typeof nodeEntry !== 'string' || typeof browserEntry !== 'string' || typeof referenceEntry !== 'string') throw new Error('current package manifest lacks explicit Node, browser and ./reference entries');
  const routeMembers = { 'package-root-node': nodeEntry.replace(/^\.\//, ''), 'package-root-browser': browserEntry.replace(/^\.\//, ''), 'package-reference': referenceEntry.replace(/^\.\//, '') };
  if (Object.values(routeMembers).some(member => !members[member])) throw new Error('package export entry is absent from archive member map');
  return { members, routeMembers };
}

function verifyPacket(root, pin, op) {
  const packet = readPinned(root, pin, `${op.exportName} frozen packet`, true).json;
  requireExactKeys(packet, ['format', 'contractId', 'exportName', 'rustOwner', 'cases'], `${op.exportName} frozen packet`);
  if (packet.format !== 'umf.r8.default-route-retirement-packet/1' || packet.contractId !== op.contract.id || packet.exportName !== op.exportName || packet.rustOwner !== op.rustOwner || !Array.isArray(packet.cases) || packet.cases.length < 1) throw new Error(`${op.exportName} frozen packet identity is invalid`);
  const ids = new Set();
  for (const item of packet.cases) {
    requireExactKeys(item, ['id', 'input', 'expectedOutcome', 'expectedTrace', 'expectsRust'], `${op.exportName} packet case`);
    if (typeof item.id !== 'string' || !item.id || ids.has(item.id) || !Array.isArray(item.expectedTrace) || typeof item.expectsRust !== 'boolean') throw new Error(`${op.exportName} packet case identity or Rust-call expectation is invalid`);
    ids.add(item.id);
  }
  if (!packet.cases.some(item => item.expectsRust) || !packet.cases.some(item => !item.expectsRust)) throw new Error(`${op.exportName} packet must cover Rust execution and preflight refusal`);
  return { packet, packetSha256: pin.sha256, cases: new Map(packet.cases.map(item => [item.id, item])) };
}

function verifyHostReceipt(root, pin, op, packet, cohort, members, routeMembers) {
  const receipt = readPinned(root, pin, `${op.exportName}/${pin.runtime} raw receipt`, true).json;
  requireExactKeys(receipt, ['format', 'status', 'runtime', 'hostVersion', 'cohortId', 'hostPlatform', 'archiveSha256', 'sourceClosureSha256', 'packetSha256', 'defaultRoute', 'referenceRoute', 'cases'], `${op.exportName}/${cohort.id}/${pin.runtime} raw receipt`);
  if (receipt.format !== 'umf.r8.default-route-retirement-host-receipt/2' || receipt.status !== 'pass' || receipt.runtime !== pin.runtime || typeof receipt.hostVersion !== 'string' || !receipt.hostVersion) throw new Error(`${op.exportName}/${cohort.id}/${pin.runtime} raw receipt identity/status is invalid`);
  const expectedHostPlatform = { os: cohort.platform.os, arch: cohort.platform.nodeArch };
  if (receipt.cohortId !== cohort.id || canonical(receipt.hostPlatform) !== canonical(expectedHostPlatform) ||
      receipt.archiveSha256 !== cohort.archive.sha256 || receipt.sourceClosureSha256 !== cohort.archive.sourceClosureSha256 || receipt.packetSha256 !== packet.packetSha256) {
    throw new Error(`${op.exportName}/${cohort.id}/${pin.runtime} archive, source closure, host platform or packet identity mismatch`);
  }
  const expectedRoute = pin.runtime === 'chromium' ? 'package-root-browser' : 'package-root-node';
  const expectedArtifact = pin.runtime === 'chromium' ? 'dist/umf_core_wasm_bg.wasm' : 'dist/umf_core_node.node';
  for (const [name, route, requiredMembers] of [
    ['defaultRoute', expectedRoute, true],
    ['referenceRoute', 'package-reference', false],
  ]) {
    const routeEvidence = receipt[name];
    requireExactKeys(routeEvidence, ['routeId', 'entryMember', 'entrySha256', 'artifactMembers'], `${op.exportName}/${pin.runtime} ${name}`);
    if (routeEvidence.routeId !== route || routeEvidence.entryMember !== routeMembers[route] || members[routeEvidence.entryMember] !== routeEvidence.entrySha256 || !hashPattern.test(routeEvidence.entrySha256 ?? '')) throw new Error(`${op.exportName}/${pin.runtime} ${name} entry is not bound to its package condition and archive member`);
    if (!Array.isArray(routeEvidence.artifactMembers) || (requiredMembers && (routeEvidence.artifactMembers.length !== 1 || routeEvidence.artifactMembers[0]?.path !== expectedArtifact))) throw new Error(`${op.exportName}/${pin.runtime} ${name} artifact member does not identify the exact runtime payload`);
    for (const artifact of routeEvidence.artifactMembers) {
      requireExactKeys(artifact, ['path', 'sha256'], `${op.exportName}/${pin.runtime} artifact member`);
      if (!hashPattern.test(artifact.sha256 ?? '') || members[artifact.path] !== artifact.sha256) throw new Error(`${op.exportName}/${pin.runtime} artifact hash does not match archive member ${artifact.path}`);
    }
  }
  if (!Array.isArray(receipt.cases) || receipt.cases.length !== packet.cases.size) throw new Error(`${op.exportName}/${pin.runtime} raw case inventory is incomplete`);
  const seen = new Set();
  for (const result of receipt.cases) {
    requireExactKeys(result, ['id', 'defaultOutcome', 'defaultTrace', 'defaultRustCalls', 'referenceOutcome', 'referenceTrace', 'referenceRustCalls'], `${op.exportName}/${pin.runtime} case result`);
    const expected = packet.cases.get(result.id);
    if (!expected || seen.has(result.id)) throw new Error(`${op.exportName}/${pin.runtime} has an unknown or duplicate packet case`);
    seen.add(result.id);
    if (canonical(result.defaultOutcome) !== canonical(expected.expectedOutcome) || canonical(result.defaultTrace) !== canonical(expected.expectedTrace)) throw new Error(`${op.exportName}/${pin.runtime}/${result.id} default outcome/trace differs from frozen packet`);
    if (canonical(result.referenceOutcome) !== canonical(expected.expectedOutcome) || canonical(result.referenceTrace) !== canonical(expected.expectedTrace)) throw new Error(`${op.exportName}/${pin.runtime}/${result.id} reference outcome/trace differs from frozen packet`);
    if (!Number.isSafeInteger(result.defaultRustCalls) || (expected.expectsRust ? result.defaultRustCalls < 1 : result.defaultRustCalls !== 0) || result.referenceRustCalls !== 0) throw new Error(`${op.exportName}/${pin.runtime}/${result.id} invocation trace violates the frozen Rust-call expectation or reference zero-Rust control`);
  }
}

export function validateBoundedDefaultRouteEvidence(manifest, rows, { root }) {
  if (!manifest || manifest.format !== 'umf.r8.default-route-retirement-evidence/2' || manifest.status !== 'pass') throw new Error('unsupported or non-pass bounded default-route evidence');
  requireExactKeys(manifest, ['format', 'status', 'liveSourceManifest', 'cohorts', 'operations'], 'retirement manifest');
  requireExactKeys(manifest.liveSourceManifest, ['path', 'sha256'], 'live source manifest');
  if (!Array.isArray(manifest.cohorts) || manifest.cohorts.length !== Object.keys(requiredCohorts).length) throw new Error('retirement evidence requires exactly the darwin-arm64 and linux-x86_64 cohorts');
  const cohorts = new Map();
  for (const cohort of manifest.cohorts) {
    requireExactKeys(cohort, ['id', 'platform', 'archive', 'memberManifest', 'archivePackageManifest'], 'archive cohort');
    if (!Object.hasOwn(requiredCohorts, cohort.id) || cohorts.has(cohort.id)) throw new Error('retirement evidence has an unknown or duplicate archive cohort');
    requireExactKeys(cohort.platform, ['os', 'arch', 'nodeArch', 'nativeTarget'], `${cohort.id} platform`);
    if (canonical(cohort.platform) !== canonical(requiredCohorts[cohort.id])) throw new Error(`${cohort.id} platform pin is invalid`);
    requireExactKeys(cohort.archive, ['path', 'sha256', 'sourceClosureSha256', 'sourceInputCount', 'generatedTransformCount', 'packageManifestSha256'], `${cohort.id} archive`);
    for (const [label, pin] of [['archive member manifest', cohort.memberManifest], ['extracted archive package manifest', cohort.archivePackageManifest]]) requireExactKeys(pin, ['path', 'sha256'], `${cohort.id} ${label}`);
    const archive = cohort.archive;
    if (typeof archive.path !== 'string' || !archive.path || !hashPattern.test(archive.sha256 ?? '') || !hashPattern.test(archive.sourceClosureSha256 ?? '') || !hashPattern.test(archive.packageManifestSha256 ?? '') || !Number.isSafeInteger(archive.sourceInputCount) || archive.sourceInputCount < 1 || archive.generatedTransformCount !== 0) throw new Error(`${cohort.id} archive must identify a fixed-point source closure and pinned archive path`);
    cohorts.set(cohort.id, cohort);
  }
  if (Object.keys(requiredCohorts).some(id => !cohorts.has(id))) throw new Error('retirement evidence is missing a required archive cohort');
  const [firstCohort] = cohorts.values();
  const liveInputs = verifyLiveSourceManifest(root, manifest.liveSourceManifest, firstCohort.archive);
  const sourceIdentity = {
    sourceClosureSha256: firstCohort.archive.sourceClosureSha256,
    sourceInputCount: firstCohort.archive.sourceInputCount,
    generatedTransformCount: firstCohort.archive.generatedTransformCount,
  };
  const cohortArchiveData = new Map();
  for (const cohort of cohorts.values()) {
    const archive = cohort.archive;
    if (archive.sourceClosureSha256 !== sourceIdentity.sourceClosureSha256 || archive.sourceInputCount !== sourceIdentity.sourceInputCount || archive.generatedTransformCount !== sourceIdentity.generatedTransformCount) throw new Error(`${cohort.id} archive does not share the fixed-point source closure`);
    const { members, routeMembers } = verifyMemberManifest(root, cohort.memberManifest, cohort.archivePackageManifest, archive, liveInputs);
    verifyArchive(root, cohort, members, manifest.liveSourceManifest);
    cohortArchiveData.set(cohort.id, { members, routeMembers });
  }
  if (!liveInputs['package.json'] || !liveInputs['scripts/package-sdk.py']) throw new Error('live source closure omits package.json or scripts/package-sdk.py');
  if (!Array.isArray(manifest.operations) || manifest.operations.length === 0) throw new Error('retirement evidence needs operations');
  const byPair = new Map();
  const usedLogical = new Set();
  const referenceRows = rows.filter(row => row.routeId === 'package-reference');
  for (const op of manifest.operations) {
    requireExactKeys(op, ['exportName', 'logicalDeclarationKey', 'contract', 'rustOwner', 'rows', 'packet', 'receiptCohorts'], `operation ${op?.exportName ?? '?'}`);
    if (typeof op.exportName !== 'string' || typeof op.logicalDeclarationKey !== 'string' || !op.logicalDeclarationKey || typeof op.rustOwner !== 'string' || !op.rustOwner) throw new Error('operation identity, contract and Rust owner are required');
    if (usedLogical.has(op.logicalDeclarationKey)) throw new Error(`duplicate retirement operation: ${op.logicalDeclarationKey}`);
    usedLogical.add(op.logicalDeclarationKey);
    requireExactKeys(op.contract, ['id', 'path', 'sha256'], `${op.exportName} contract`);
    if (typeof op.contract.id !== 'string' || !/^CONTRACT-[0-9]{3}$/.test(op.contract.id) || !op.contract.path.startsWith(`docs/helix/02-design/contracts/${op.contract.id}-`)) throw new Error(`${op.exportName} contract identity/path is invalid`);
    const contractBytes = readPinned(root, op.contract, `${op.exportName} contract`).bytes;
    if (contractIdFromMarkdown(contractBytes.toString('utf8')) !== op.contract.id || liveInputs[op.contract.path] !== op.contract.sha256) throw new Error(`${op.exportName} contract ID or current-source closure binding is invalid`);
    const packet = verifyPacket(root, op.packet, op);
    if (liveInputs[op.packet.path] !== op.packet.sha256) throw new Error(`${op.exportName} packet is not in the current fixed-point source closure`);
    if (!Array.isArray(op.rows) || op.rows.length !== 2) throw new Error(`${op.exportName} must identify exactly two default-route rows`);
    const seenRoutes = new Set();
    for (const identity of op.rows) {
      requireExactKeys(identity, ['routeId', 'logicalDeclarationKey', 'exportName', 'source', 'sourceSha256', 'declarationKind'], `${op.exportName} row identity`);
      if (!defaultRoutes.includes(identity.routeId) || seenRoutes.has(identity.routeId)) throw new Error(`${op.exportName} must identify one Node and one browser row`);
      seenRoutes.add(identity.routeId);
      if (identity.logicalDeclarationKey !== op.logicalDeclarationKey || identity.exportName !== op.exportName || !hashPattern.test(identity.sourceSha256 ?? '')) throw new Error(`${op.exportName} row identity does not match operation`);
      const matches = rows.filter(row => row.routeId === identity.routeId && row.logicalDeclarationKey === identity.logicalDeclarationKey && row.exportName === identity.exportName);
      if (matches.length !== 1) throw new Error(`${op.exportName} must resolve to exactly one current ${identity.routeId} row`);
      const row = matches[0];
      if (row.rowKind !== 'executable' || row.source !== identity.source || row.sourceSha256 !== identity.sourceSha256 || row.declarationKind !== identity.declarationKind) throw new Error(`${op.exportName} ${identity.routeId} row is stale or not executable`);
      if (row.sourceSelectedImplementation?.rustOwner !== op.rustOwner || row.acceptedRustOperation !== op.rustOwner) throw new Error(`${op.exportName} ${identity.routeId} does not select the accepted Rust owner`);
      readPinned(root, { path: row.source, sha256: row.sourceSha256 }, `${op.exportName} ${identity.routeId} current source`);
      if (liveInputs[row.source] !== row.sourceSha256) throw new Error(`${op.exportName} ${identity.routeId} source is not in the current fixed-point closure`);
    }
    if (seenRoutes.size !== 2) throw new Error(`${op.exportName} lacks a default route row`);
    const refMatches = referenceRows.filter(row => row.logicalDeclarationKey === op.logicalDeclarationKey && row.exportName === op.exportName);
    if (refMatches.length !== 1 || refMatches[0].sourceSelectedImplementation !== null) throw new Error(`${op.exportName} lacks the explicit TypeScript reference row`);
    if (!Array.isArray(op.receiptCohorts) || op.receiptCohorts.length !== cohorts.size) throw new Error(`${op.exportName} needs receipts for both archive cohorts`);
    const seenCohorts = new Set();
    for (const receiptGroup of op.receiptCohorts) {
      requireExactKeys(receiptGroup, ['cohortId', 'receipts'], `${op.exportName} receipt cohort`);
      const cohort = cohorts.get(receiptGroup.cohortId);
      if (!cohort || seenCohorts.has(receiptGroup.cohortId)) throw new Error(`${op.exportName} has an unknown or duplicate receipt cohort`);
      seenCohorts.add(receiptGroup.cohortId);
      if (!Array.isArray(receiptGroup.receipts) || receiptGroup.receipts.length !== runtimes.length) throw new Error(`${op.exportName}/${cohort.id} needs Node, Bun and Chromium receipts`);
      const seenRuntimes = new Set();
      const { members, routeMembers } = cohortArchiveData.get(cohort.id);
      for (const pin of receiptGroup.receipts) {
        requireExactKeys(pin, ['runtime', 'path', 'sha256'], `${op.exportName}/${cohort.id} receipt pin`);
        if (!runtimes.includes(pin.runtime) || seenRuntimes.has(pin.runtime)) throw new Error(`${op.exportName}/${cohort.id} has missing or duplicate host receipt`);
        seenRuntimes.add(pin.runtime);
        verifyHostReceipt(root, pin, op, packet, cohort, members, routeMembers);
        const route = pin.runtime === 'chromium' ? 'package-root-browser' : 'package-root-node';
        const key = `${route}\0${op.logicalDeclarationKey}`;
        const existing = byPair.get(key) ?? { status: 'bounded', contractId: op.contract.id, rustOwner: op.rustOwner, evidence: [{ path: op.contract.path, sha256: op.contract.sha256 }, { path: op.packet.path, sha256: op.packet.sha256 }] };
        existing.evidence.push({ path: pin.path, sha256: pin.sha256 });
        byPair.set(key, existing);
      }
      if (seenRuntimes.size !== runtimes.length) throw new Error(`${op.exportName}/${cohort.id} needs all three host receipts`);
    }
    if (seenCohorts.size !== cohorts.size) throw new Error(`${op.exportName} is missing a required cohort receipt group`);
  }
  return byPair;
}

export function validateDefaultRouteRetirementEvidence(manifest, rows, { root }) {
  if (manifest?.format === 'umf.r8.default-route-retirement-evidence/2') {
    throw new Error('CONTRACT acceptance coverage required: /2 bounded default-route evidence cannot retire ledger rows');
  }
  throw new Error('unsupported default-route retirement evidence; no retirement schema is currently accepted');
}
