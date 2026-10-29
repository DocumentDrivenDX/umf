// Fail-closed exact-row retirement gate. Host success summaries are not proof:
// this validator reopens source, contract, archive-member, packet and raw-case files.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import {coreFacetResourceCaseIds,validateCoreFacetResourceEvidence} from './core-facets-resource-suite.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hashPattern = /^[a-f0-9]{64}$/;
const defaultRoutes = ['package-root-node', 'package-root-browser'];
const runtimes = ['node', 'bun', 'chromium'];
const requiredCohorts = {
  'darwin-arm64': { os: 'darwin', arch: 'aarch64', nodeArch: 'arm64', nativeTarget: 'aarch64-apple-darwin' },
  'linux-x86_64': { os: 'linux', arch: 'x86_64', nodeArch: 'x64', nativeTarget: 'x86_64-unknown-linux-gnu' },
};
const securityNotCases = ['T', 'F', 'U', 'null', 'number', 'boolean', 'unknown-string', 'array', 'object', 'null-prototype', 'accessor', 'proxy-ownKeys', 'proxy-getPrototype', 'proxy-get'];
const securityNotOutcome = id => ['T', 'F', 'U'].includes(id)
  ? { kind: 'return', value: ({ T: 'F', F: 'T', U: 'U' })[id], trace: [] }
  : { kind: 'throw', name: 'UmfError', constructor: 'UmfError', code: 'SECURITY_TRUTH', message: 'Invalid security truth', path: '', trace: [] };
const facetsPacketFiles = ['frozen-typescript.json', 'meaning-cases.json', 'regression-cases.json', 'exact-errors.json', 'expanded-cases.json'];
const facetsPacketProfile = Object.freeze({
  inspectCoreFacets: 'umf_core::facets::inspect_core_facets',
  declareCoreFacets: 'umf_core::facets::declare_core_facets',
  verifyCoreFacetDeclaration: 'umf_core::facets::verify_core_facet_declaration',
  historicalCoreFacetPatch: 'umf_core::facets::historical_core_facet_patch',
});
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

function readCohortFile(root, cohortPath, relativePath, digest, label, json = false) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).some(part => !part || part === '.' || part === '..')) throw new Error(`${label} needs a safe cohort-relative path`);
  const full = path.posix.join(path.posix.dirname(cohortPath), relativePath);
  return readPinned(root, { path: full, sha256: digest }, label, json);
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
  return { archiveContents, archiveSha512: `sha512-${crypto.createHash('sha512').update(bytes).digest('base64')}` };
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

function facetsExpectedCases(root, exportName) {
  const base = 'docs/helix/04-build/evidence/rust-migration/r5-core-facets/';
  const files = facetsPacketFiles;
  const source = Object.fromEntries(files.map(file => {
    const sourcePath = file === 'expanded-cases.json'
      ? 'scripts/rust-migration/r8/facets-retirement-packets/expanded-cases.json'
      : path.join(base, file);
    const bytes = fs.readFileSync(path.resolve(root, sourcePath));
    return [file, { value: JSON.parse(bytes.toString('utf8')), sha256: sha(bytes) }];
  }));
  const p = Object.fromEntries(files.map(file => [file, source[file].value]));
  const frozen = p['frozen-typescript.json'], meaning = p['meaning-cases.json'];
  const regressions = p['regression-cases.json'].cases, errors = p['exact-errors.json'].cases;
  const expanded = p['expanded-cases.json'];
  const returned = value => ({ status: 'returned', value });
  const threw = error => ({ status: 'threw', name: 'UmfError', code: error.code, message: error.message, path: error.path });
  const row = (id, args, expectedOutcome, expectedDefaultRustCalls = 1, expectedDefaultRustOperations = [], expectedTrace = []) => ({ id, input: { args }, expectedOutcome, expectedTrace, expectedDefaultRustCalls, expectedDefaultRustOperations });
  const inspect = (id, doc, identity, outcome) => row(id, [doc, identity], outcome, 1, ['inspectCoreFacets']);
  const cases = {
    inspectCoreFacets: [
      inspect('known', frozen.receipt.target, frozen.identity, returned(frozen.inspection)),
      ...meaning.inspections.map((item, i) => inspect(i === 0 ? 'range' : 'collectionSize', meaning.source, item.identity, returned(item))),
      ...Object.entries(expanded.inspections).map(([id, item]) => row(id, item.args, item.outcome, 1, ['inspectCoreFacets'])),
      inspect('loneSurrogateQualifier', regressions.loneSurrogateQualifier.source, regressions.loneSurrogateQualifier.identity, returned(regressions.loneSurrogateQualifier.outcome)),
      inspect('invalidIdentity', frozen.source, {}, threw(errors.invalidIdentity)),
      inspect('invalidSource', { ...structuredClone(frozen.source), umf: '0.9.0' }, frozen.identity, threw(errors.invalidSource)),
      inspect('recordRoleSourceRefusal', (() => { const v = structuredClone(frozen.source); v.modules[0].elements[0].kind = 'record'; return v; })(), frozen.identity, threw(errors.recordRoleSourceRefusal)),
      { id: 'identityAccessor', input: { hostCase: 'inspect-identity-accessor' }, expectedOutcome: threw({ code: 'NON_JSON', message: 'Hidden fields and accessors cannot be serialized faithfully', path: '/element' }), expectedTrace: ['source:getPrototypeOf', 'source:ownKeys', 'source:ownKeys', 'identity:getPrototypeOf', 'identity:ownKeys', 'identity:ownKeys', 'identity:getOwnPropertyDescriptor:module', 'identity:getOwnPropertyDescriptor:element'], expectedDefaultRustCalls: 0, expectedDefaultRustOperations: [] },
    ],
    declareCoreFacets: [
      row('base', [frozen.source, frozen.identity, frozen.request], returned(frozen.receipt), 2, ['admitCoreFacetRequest', 'declareCoreFacets']),
      row('unknownFacetPreserved', [frozen.unknownFacetDeclaration.source, frozen.unknownFacetDeclaration.identity, frozen.unknownFacetDeclaration.request], returned(frozen.unknownFacetDeclaration), 2, ['admitCoreFacetRequest', 'declareCoreFacets']),
      row('lengthMerge', [regressions.lengthMerge.source, regressions.lengthMerge.identity, regressions.lengthMerge.request], returned(regressions.lengthMerge.outcome), 2, ['admitCoreFacetRequest', 'declareCoreFacets']),
      row('unknownUnit', (() => { const s = structuredClone(frozen.source); s.modules[0].elements[0].scalarType = 'string'; s.modules[0].elements[0].facets = { length: { max: 8, unit: 'future-unit' } }; return [s, frozen.identity, { length: { max: 4, unit: 'unicode-scalar' } }]; })(), threw(errors.unknownUnit), 2, ['admitCoreFacetRequest', 'declareCoreFacets']),
      row('targetConflict', (() => { const s = structuredClone(frozen.source); s.modules[0].elements[0].scalarType = 'integer'; return [s, frozen.identity, { length: { max: 4, unit: 'byte' } }]; })(), threw(errors.targetConflict), 2, ['admitCoreFacetRequest', 'declareCoreFacets']),
      row('invalidRequest', [frozen.source, frozen.identity, { precision: 3 }], threw(errors.invalidRequest), 1, ['admitCoreFacetRequest']),
      { id: 'invalidRequestBeforeSource', input: { hostCase: 'declare-invalid-request-before-source' }, expectedOutcome: threw(errors.invalidRequest), expectedTrace: ['request:getPrototypeOf', 'request:ownKeys', 'request:ownKeys', 'request:getOwnPropertyDescriptor:precision'], expectedDefaultRustCalls: 1, expectedDefaultRustOperations: ['admitCoreFacetRequest'] },
      { id: 'sourceAccessor', input: { hostCase: 'declare-source-accessor' }, expectedOutcome: threw({ code: 'NON_JSON', message: 'Hidden fields and accessors cannot be serialized faithfully', path: '/future' }), expectedTrace: ['source:getPrototypeOf', 'source:ownKeys', 'source:ownKeys', 'source:getOwnPropertyDescriptor:future'], expectedDefaultRustCalls: 1, expectedDefaultRustOperations: ['admitCoreFacetRequest'] },
      row('unknownUnitWithInvalidBound', (() => { const s = structuredClone(frozen.source); s.modules[0].elements[0].scalarType = 'string'; s.modules[0].elements[0].facets = { length: { max: -1, unit: 'future-unit' } }; return [s, frozen.identity, { length: { max: 4, unit: 'unicode-scalar' } }]; })(), threw(errors.unknownUnitWithInvalidBound), 2, ['admitCoreFacetRequest', 'declareCoreFacets']),
      ...Object.entries(expanded.declarations).map(([id, item]) => row(id, item.args, item.outcome, 2, ['admitCoreFacetRequest', 'declareCoreFacets'])),
    ],
    verifyCoreFacetDeclaration: [
      row('valid', [frozen.receipt, frozen.receipt.target], returned(frozen.receipt), 2, ['prepareCoreFacetVerification', 'finishCoreFacetVerification']),
      row('stale', [frozen.receipt, frozen.source], threw(errors.stale), 2, ['prepareCoreFacetVerification', 'finishCoreFacetVerification']),
      row('forged', [(() => { const r = structuredClone(frozen.receipt); r.request.integerWidth.bits = 32; return r; })(), frozen.receipt.target], threw(errors.forged), 1, ['prepareCoreFacetVerification']),
      row('malformedReceipt', [{ operation: 'declare-core-facets', version: '3.0.0' }, frozen.source], threw(errors.malformedReceipt), 1, ['prepareCoreFacetVerification']),
      row('malformedReceiptBeforeCurrentCopy', [regressions.verifyMalformedBeforeCurrentCopy.receipt, 9007199254740992], threw(regressions.verifyMalformedBeforeCurrentCopy.outcome.error), 1, ['prepareCoreFacetVerification']),
      row('forgedReceiptBeforeCurrentCopy', [regressions.verifyForgedBeforeCurrentCopy.receipt, 9007199254740992], threw(regressions.verifyForgedBeforeCurrentCopy.outcome.error), 1, ['prepareCoreFacetVerification']),
      { id: 'malformedReceiptBeforeCurrent', input: { hostCase: 'verify-malformed-before-current' }, expectedOutcome: threw(errors.malformedReceipt), expectedTrace: ['receipt:getPrototypeOf', 'receipt:ownKeys', 'receipt:ownKeys', 'receipt:getOwnPropertyDescriptor:operation', 'receipt:getOwnPropertyDescriptor:version'], expectedDefaultRustCalls: 1, expectedDefaultRustOperations: ['prepareCoreFacetVerification'] },
      ...Object.entries(expanded.verification).map(([id, item]) => id === 'crossDocument'
        ? row(`saved-${id}`, item.args, item.outcome, 2, ['prepareCoreFacetVerification', 'finishCoreFacetVerification'])
        : { id: `saved-${id}`, input: { hostCase: `verify-saved-${id}`, args: item.args }, expectedOutcome: item.outcome, expectedTrace: [], expectedDefaultRustCalls: 2, expectedDefaultRustOperations: ['prepareCoreFacetVerification', 'finishCoreFacetVerification'] }),
    ],
    historicalCoreFacetPatch: [
      ...regressions.historical.map((item, i) => row(`historical-${i}`, [item.input], item.outcome.ok ? returned(item.outcome.value) : threw(item.outcome.error), 1, ['historicalCoreFacetPatch'])),
      row('historical-success-representable-projection', expanded.historicalSuccess.args, expanded.historicalSuccess.outcome, 1, ['historicalCoreFacetPatch']),
      row('unsafeIntegerCopyRefusal', [{ integerWidth: { bits: 9007199254740992, signed: true } }], threw(regressions.unsafeIntegerCopyRefusal.outcome.error), 0, []),
    ],
  };
  if (!Object.hasOwn(cases, exportName)) throw new Error(`${exportName} Core Facets packet profile is unsupported`);
  return { predecessorHashes: Object.fromEntries(files.map(file => [file, source[file].sha256])), cases: cases[exportName] };
}

export function createCoreFacetsRetirementPacket(root, exportName) {
  const expected = facetsExpectedCases(root, exportName);
  const rustOwner = facetsPacketProfile[exportName];
  if (!rustOwner) throw new Error(`${exportName} Core Facets packet profile is unsupported`);
  return { format: 'umf.r8.default-route-retirement-packet/4', profile: 'core-facets', contractId: 'CONTRACT-040', exportName, rustOwner, predecessorHashes: expected.predecessorHashes, cases: expected.cases };
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

export function verifyPacket(root, pin, op) {
  const packet = readPinned(root, pin, `${op.exportName} frozen packet`, true).json;
  const allRust = packet?.format === 'umf.r8.default-route-retirement-packet/2';
  const securityNot = packet?.format === 'umf.r8.default-route-retirement-packet/3';
  const coreFacets = packet?.format === 'umf.r8.default-route-retirement-packet/4';
  requireExactKeys(packet, allRust
    ? ['format', 'profile', 'contractId', 'exportName', 'rustOwner', 'cases']
    : securityNot ? ['format', 'profile', 'contractId', 'exportName', 'rustOwner', 'cases']
      : coreFacets ? ['format', 'profile', 'contractId', 'exportName', 'rustOwner', 'predecessorHashes', 'cases']
      : ['format', 'contractId', 'exportName', 'rustOwner', 'cases'], `${op.exportName} frozen packet`);
  if ((allRust ? packet.profile !== 'all-rust' : securityNot ? packet.profile !== 'security-not' : coreFacets ? packet.profile !== 'core-facets' : packet.format !== 'umf.r8.default-route-retirement-packet/1') || packet.contractId !== op.contract.id || packet.exportName !== op.exportName || packet.rustOwner !== op.rustOwner || !Array.isArray(packet.cases) || packet.cases.length < 1) throw new Error(`${op.exportName} frozen packet identity is invalid`);
  if (allRust && op.contract.id !== 'CONTRACT-040') throw new Error(`${op.exportName} all-Rust Cardinality packet requires CONTRACT-040`);
  if (allRust && !['inspectCoreCardinality', 'declareCoreCardinality', 'verifyCoreCardinalityDeclaration'].includes(op.exportName)) throw new Error(`${op.exportName} all-Rust packet profile is unsupported`);
  if (securityNot && (op.contract.id !== 'CONTRACT-062' || op.exportName !== 'securityNot' || op.rustOwner !== 'umf_core::security_logic::security_not')) throw new Error(`${op.exportName} securityNot acceptance profile identity is unsupported`);
  if (coreFacets) {
    const expectedOwner = facetsPacketProfile[op.exportName];
    if (op.contract.id !== 'CONTRACT-040' || !expectedOwner || op.rustOwner !== expectedOwner) throw new Error(`${op.exportName} Core Facets packet requires its exact CONTRACT-040 operation and Rust owner`);
    requireExactKeys(packet.predecessorHashes, facetsPacketFiles, `${op.exportName} Core Facets predecessor hash map`);
    const expected = facetsExpectedCases(root, op.exportName);
    if (canonical(packet.predecessorHashes) !== canonical(expected.predecessorHashes) || canonical(packet.cases) !== canonical(expected.cases)) throw new Error(`${op.exportName} packet differs from the exact R5 Core Facets predecessor cases, outcomes, ordered traces or dispatch profile`);
  }
  const ids = new Set();
  for (const item of packet.cases) {
    requireExactKeys(item, coreFacets
      ? ['id', 'input', 'expectedOutcome', 'expectedTrace', 'expectedDefaultRustCalls', 'expectedDefaultRustOperations']
      : allRust || securityNot ? ['id', 'input', 'expectedOutcome', 'expectedTrace', 'expectedDefaultRustCalls']
      : ['id', 'input', 'expectedOutcome', 'expectedTrace', 'expectsRust'], `${op.exportName} packet case`);
    if (typeof item.id !== 'string' || !item.id || ids.has(item.id) || !Array.isArray(item.expectedTrace)) throw new Error(`${op.exportName} packet case identity or Rust-call expectation is invalid`);
    if (allRust ? (!Number.isSafeInteger(item.expectedDefaultRustCalls) || item.expectedDefaultRustCalls < 1) : coreFacets ? (!Number.isSafeInteger(item.expectedDefaultRustCalls) || item.expectedDefaultRustCalls < 0) : securityNot ? ![0, 1].includes(item.expectedDefaultRustCalls) : typeof item.expectsRust !== 'boolean') throw new Error(`${op.exportName} packet case identity or Rust-call expectation is invalid`);
    if (coreFacets && (!Array.isArray(item.expectedDefaultRustOperations) || item.expectedDefaultRustOperations.some(operation => typeof operation !== 'string' || !operation) || item.expectedDefaultRustOperations.length !== item.expectedDefaultRustCalls)) throw new Error(`${op.exportName} packet case must bind an exact Rust operation sequence to its dispatch count`);
    ids.add(item.id);
  }
  if (!allRust && !securityNot && !coreFacets && (!packet.cases.some(item => item.expectsRust) || !packet.cases.some(item => !item.expectsRust))) throw new Error(`${op.exportName} packet must cover Rust execution and preflight refusal`);
  if (securityNot) {
    if (packet.cases.length !== securityNotCases.length || packet.cases.some((item, index) => {
      const id = securityNotCases[index];
      return item.id !== id || canonical(item.input) !== canonical({ case: id }) || canonical(item.expectedOutcome) !== canonical(securityNotOutcome(id)) || canonical(item.expectedTrace) !== '[]' || item.expectedDefaultRustCalls !== (['T', 'F', 'U'].includes(id) ? 1 : 0);
    })) throw new Error('securityNot packet must match the exact 14-case truth, invalid-input, trace and Rust-dispatch profile');
  }
  return { packet, packetSha256: pin.sha256, allRust, securityNot, coreFacets, cases: new Map(packet.cases.map(item => [item.id, item])) };
}

export function requirePacketProfileForManifest(manifestFormat, packet) {
  if (packet.coreFacets && manifestFormat !== 'umf.r8.default-route-retirement-evidence/4') throw new Error('Core Facets packets require the exact /4 four-operation manifest');
  if (manifestFormat === 'umf.r8.default-route-retirement-evidence/4' && !packet.coreFacets) throw new Error('/4 Core Facets evidence accepts only the exact core-facets packet profile');
}

export function verifyHostReceipt(root, pin, op, packet, cohort, members, routeMembers) {
  const receipt = readPinned(root, pin, `${op.exportName}/${pin.runtime} raw receipt`, true).json;
  requireExactKeys(receipt, ['format', 'status', 'runtime', 'hostVersion', 'cohortId', 'hostPlatform', 'archiveSha256', 'sourceClosureSha256', 'packetSha256', 'defaultRoute', 'referenceRoute', 'cases'], `${op.exportName}/${cohort.id}/${pin.runtime} raw receipt`);
  const receiptFormat = packet.securityNot ? 'umf.r8.default-route-retirement-host-receipt/3' : packet.coreFacets ? 'umf.r8.default-route-retirement-host-receipt/4' : 'umf.r8.default-route-retirement-host-receipt/2';
  if (receipt.format !== receiptFormat || receipt.status !== 'pass' || receipt.runtime !== pin.runtime || typeof receipt.hostVersion !== 'string' || !receipt.hostVersion) throw new Error(`${op.exportName}/${cohort.id}/${pin.runtime} raw receipt identity/status is invalid`);
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
    requireExactKeys(result, packet.coreFacets
      ? ['id', 'defaultOutcome', 'defaultTrace', 'defaultRustCalls', 'defaultRustOperations', 'referenceOutcome', 'referenceTrace', 'referenceRustCalls']
      : ['id', 'defaultOutcome', 'defaultTrace', 'defaultRustCalls', 'referenceOutcome', 'referenceTrace', 'referenceRustCalls'], `${op.exportName}/${pin.runtime} case result`);
    const expected = packet.cases.get(result.id);
    if (!expected || seen.has(result.id)) throw new Error(`${op.exportName}/${pin.runtime} has an unknown or duplicate packet case`);
    seen.add(result.id);
    if (canonical(result.defaultOutcome) !== canonical(expected.expectedOutcome) || canonical(result.defaultTrace) !== canonical(expected.expectedTrace)) throw new Error(`${op.exportName}/${pin.runtime}/${result.id} default outcome/trace differs from frozen packet`);
    if (canonical(result.referenceOutcome) !== canonical(expected.expectedOutcome) || canonical(result.referenceTrace) !== canonical(expected.expectedTrace)) throw new Error(`${op.exportName}/${pin.runtime}/${result.id} reference outcome/trace differs from frozen packet`);
    if (packet.coreFacets && canonical(result.defaultRustOperations) !== canonical(expected.expectedDefaultRustOperations)) throw new Error(`${op.exportName}/${pin.runtime}/${result.id} default Rust operation order differs from frozen packet`);
    if (!Number.isSafeInteger(result.defaultRustCalls) || (packet.allRust || packet.securityNot || packet.coreFacets ? result.defaultRustCalls !== expected.expectedDefaultRustCalls : (expected.expectsRust ? result.defaultRustCalls < 1 : result.defaultRustCalls !== 0)) || result.referenceRustCalls !== 0) throw new Error(`${op.exportName}/${pin.runtime}/${result.id} invocation trace violates the frozen Rust-call expectation or reference zero-Rust control`);
  }
}

const coreFacetsOperations = ['inspectCoreFacets', 'declareCoreFacets', 'verifyCoreFacetDeclaration', 'historicalCoreFacetPatch'];
const acceptanceCohortIds = ['darwin-arm64', 'linux-x86_64'];
const acceptanceRuntimes = ['node', 'bun', 'chromium'];
const assetStates = ['intact', 'missing', 'corrupt'];
const acceptanceHash = value => typeof value === 'string' && hashPattern.test(value);

export function validateCoreFacetAssetControlEvidence(receipt, archive, archiveMembers) {
  requireExactKeys(receipt, ['format', 'status', 'scope', 'archiveSha256', 'package', 'originalAssets', 'cases'], 'Core Facets installed asset controls');
  if (receipt.format !== 'umf.r8.core-facets-installed-asset-controls/1' || receipt.status !== 'pass' || receipt.archiveSha256 !== archive.sha256 || receipt.package?.name !== '@umf/core') throw new Error('Core Facets asset controls do not bind the accepted archive');
  requireExactKeys(receipt.originalAssets, ['native', 'wasm'], 'Core Facets original asset hashes');
  const assets = { native: 'dist/umf_core_node.node', wasm: 'dist/umf_core_wasm_bg.wasm' };
  for (const [kind, member] of Object.entries(assets)) {
    requireExactKeys(receipt.originalAssets[kind], ['path', 'sha256', 'bytes'], `Core Facets ${kind} asset hash`);
    const asset = receipt.originalAssets[kind];
    if (asset.path !== member || archiveMembers[member] !== asset.sha256 || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1) throw new Error(`Core Facets ${kind} original asset does not match the archive manifest`);
  }
  if (!Array.isArray(receipt.cases) || receipt.cases.length !== 9) throw new Error('Core Facets asset controls must contain exactly nine runtime/state cases');
  const expected = new Set();
  for (const runtime of ['node', 'bun']) for (const state of assetStates) expected.add(`${runtime}/${state}`);
  for (const state of assetStates) expected.add(`chromium/${state}`);
  for (const item of receipt.cases) {
    const runtime = item?.runtime?.toLowerCase();
    const state = item?.state;
    const key = `${runtime}/${state}`;
    if (!expected.delete(key)) throw new Error(`Core Facets asset controls contain an unknown or duplicate case: ${key}`);
    const kind = runtime === 'chromium' ? 'wasm' : 'native';
    if (item.asset !== assets[kind] || typeof item.version !== 'string' || !item.version) throw new Error(`${key} asset identity is invalid`);
    if (state === 'intact') {
      if (runtime === 'chromium') {
        if (item.outcome?.status !== 'returned' || item.wasmRequested !== true || item.externalRequests !== 0) throw new Error('Chromium intact WASM control did not execute without external requests');
        if (item.outcome.result?.meaning?.state !== 'known' || item.outcome.result?.meaning?.facets?.integerWidth?.bits !== 16) throw new Error('Chromium intact WASM control did not return the expected facet result');
      } else if (item.exitCode !== 0 || !Array.isArray(item.nativeOperations) || !item.nativeOperations.includes('model/inspectCoreFacets')) {
        throw new Error(`${runtime} intact native control lacks an actual Rust inspection trace`);
      }
    } else if (runtime === 'chromium') {
      if (item.outcome?.status !== 'threw' || item.wasmRequested !== true || item.externalRequests !== 0 || /returned/.test(JSON.stringify(item.outcome))) throw new Error(`Chromium ${state} WASM control failed to refuse without fallback`);
      if (!['import', 'operation'].includes(item.outcome.phase) || !/wasm|webassembly|fetch|compile|instantiate|module/i.test(`${item.outcome.name ?? ''} ${item.outcome.message ?? ''} ${item.outcome.stack ?? ''}`)) throw new Error(`Chromium ${state} WASM control failed for an unrelated reason`);
    } else if (item.exitCode === 0 || /"status"\s*:\s*"returned"/.test(item.stdout ?? '') || !item.error || typeof item.error.message !== 'string') {
      throw new Error(`${runtime} ${state} native control failed to refuse without fallback`);
    } else if (!['import', 'operation'].includes(item.error.phase) || !/\.node|native|shared librar|dlopen|module_not_found/i.test(`${item.error.code ?? ''} ${item.error.message}`)) {
      throw new Error(`${runtime} ${state} native control failed for an unrelated reason`);
    }
    if (state === 'corrupt' && (!acceptanceHash(item.mutatedAssetSha256) || item.mutatedAssetSha256 === receipt.originalAssets[kind].sha256)) throw new Error(`${runtime} corrupt asset control lacks a changed mutated asset digest`);
    if (runtime === 'chromium' && (item.wasmRequested !== true || item.externalRequests !== 0)) throw new Error(`Chromium ${state} control must request the installed WASM and make no external requests`);
  }
  if (expected.size) throw new Error(`Core Facets asset controls are incomplete: ${[...expected].join(', ')}`);
  return true;
}

function validateCoreFacetsAcceptanceCohort(root, pin, manifest, cohort, packetByOperation, manifestReceiptPins) {
  requireExactKeys(pin, ['cohortId', 'cohort'], 'Core Facets acceptance cohort pin');
  requireExactKeys(pin.cohort, ['path', 'sha256'], `${pin.cohortId} acceptance cohort file pin`);
  if (pin.cohortId !== cohort.id) throw new Error('acceptance cohort id does not match the pinned archive cohort');
  const doc = readPinned(root, pin.cohort, `${cohort.id} dependency-installed cohort`, true).json;
  requireExactKeys(doc, ['format', 'status', 'scope', 'archive', 'sourceClosure', 'consumer', 'negativeControls', 'hosts', 'resourceSuite', 'installedAssetControls', 'linuxX64', 'retirementHostReceipts'], `${cohort.id} dependency-installed cohort`);
  if (doc.format !== 'umf.r8.core-facets-dependency-installed/1' || doc.status !== 'pass') throw new Error(`${cohort.id} dependency-installed cohort is unsupported or non-pass`);
  if (doc.archive?.sha256 !== cohort.archive.sha256 || doc.sourceClosure?.sha256 !== cohort.archive.sourceClosureSha256 || doc.archive.bytes < 1) throw new Error(`${cohort.id} dependency-installed archive/source closure differs from the accepted manifest`);
  const sourceClosure = doc.sourceClosure;
  if (!Number.isSafeInteger(sourceClosure.fileCount) || sourceClosure.fileCount !== cohort.archive.sourceInputCount || sourceClosure.initialCheck?.sha256 !== sourceClosure.sha256 || sourceClosure.finalCheck?.sha256 !== sourceClosure.sha256 || sourceClosure.initialCheck?.fileCount !== sourceClosure.fileCount || canonical(sourceClosure.initialCheck) !== canonical(sourceClosure.finalCheck)) throw new Error(`${cohort.id} initial/final source closure checks do not match`);

  const lockPin = { path: path.posix.join(path.posix.dirname(pin.cohort.path), 'consumer-lock.json'), sha256: doc.consumer?.lock?.sha256 };
  const lockBytes = readPinned(root, lockPin, `${cohort.id} consumer-lock.json`).bytes;
  const lock = JSON.parse(lockBytes.toString('utf8'));
  if (lock.lockfileVersion !== 3 || lock.lockfileVersion !== doc.consumer.lock.lockfileVersion) throw new Error(`${cohort.id} dependency lock must be the pinned npm v3 lock`);
  const archiveBytes = path.isAbsolute(cohort.archive.path)
    ? fs.readFileSync(fs.realpathSync(cohort.archive.path))
    : readPinned(root, { path: cohort.archive.path, sha256: cohort.archive.sha256 }, `${cohort.id} accepted SDK archive`).bytes;
  if (sha(archiveBytes) !== cohort.archive.sha256 || archiveBytes.length !== doc.archive.bytes) throw new Error(`${cohort.id} accepted SDK archive hash or byte length differs`);
  const archiveIntegrity = `sha512-${crypto.createHash('sha512').update(archiveBytes).digest('base64')}`;
  if (doc.consumer?.manager !== 'npm' || doc.consumer.offline !== true || canonical(doc.consumer.installFlags) !== canonical(['--offline', '--ignore-scripts', '--no-audit', '--no-fund']) || doc.consumer.lock.archiveIntegrity !== archiveIntegrity) throw new Error(`${cohort.id} consumer install and SHA-512 archive integrity are invalid`);
  const lockEntries = lock.packages;
  if (!lockEntries || Array.isArray(lockEntries)) throw new Error(`${cohort.id} consumer lock package map is missing`);
  const dependencies = Object.entries(lockEntries).filter(([name]) => name && name !== 'node_modules/@umf/core');
  if (dependencies.length === 0 || dependencies.length !== doc.consumer.lock.integrityDependencyCount) throw new Error(`${cohort.id} consumer lock dependency inventory is incomplete`);
  for (const [name, item] of dependencies) if (!/^sha(1|512|384)-[A-Za-z0-9+/]+=*$/.test(item?.integrity ?? '')) throw new Error(`${cohort.id} dependency lock entry lacks integrity: ${name}`);
  const pkgMember = tarMembers(archiveBytes).files['package.json'];
  if (!pkgMember) throw new Error(`${cohort.id} archive omits package.json`);
  const pkg = JSON.parse(pkgMember.toString('utf8'));
  const packageLock = lockEntries['node_modules/@umf/core'];
  if (doc.consumer.package?.name !== '@umf/core' || doc.consumer.package.path !== 'node_modules/@umf/core' || doc.consumer.package.version !== pkg.version || packageLock?.version !== pkg.version || packageLock.integrity !== archiveIntegrity || !String(packageLock.resolved ?? '').startsWith('file:')) throw new Error(`${cohort.id} installed package identity does not bind the archive`);
  if (doc.consumer.dependencies && canonical(doc.consumer.dependencies) !== canonical(pkg.dependencies ?? {})) throw new Error(`${cohort.id} resolved dependency versions differ from package.json`);
  for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
    const entry = lockEntries[`node_modules/${name}`];
    if (entry?.version !== version || !/^sha(1|512|384)-[A-Za-z0-9+/]+=*$/.test(entry?.integrity ?? '')) throw new Error(`${cohort.id} direct dependency lock integrity/version is invalid: ${name}`);
  }
  const installedSuffix = '/node_modules/@umf/core/';
  for (const runtime of ['node', 'bun']) {
    const routes = doc.consumer.resolvedRoutes?.[runtime];
    if (!routes || !String(routes.root).startsWith('file:') || !String(routes.reference).startsWith('file:') || !new URL(routes.root).pathname.includes(installedSuffix) || !new URL(routes.reference).pathname.includes(installedSuffix) || !routes.root.endsWith('/dist/umf-node.js') || !routes.reference.endsWith('/dist/umf.js')) throw new Error(`${cohort.id} ${runtime} did not resolve the installed default and reference routes`);
  }
  if (doc.negativeControls?.lockWithoutIntegrityRejected !== true || doc.negativeControls?.wrongInstalledIdentityRejected !== true || doc.negativeControls?.wrongArchiveIdentityRejected !== true || doc.negativeControls?.wrongDefaultRouteRejected !== true || doc.negativeControls?.wrongResolvedDefaultRouteRejected !== true) throw new Error(`${cohort.id} dependency-installed negative controls are incomplete`);

  const archiveMemberMap = tarMembers(archiveBytes).members;
  if (doc.resourceSuite?.format !== 'umf.r8.core-facets-resource-suite/1' || doc.resourceSuite.caseCount !== 14 || !acceptanceHash(doc.resourceSuite.harnessSha256)) throw new Error(`${cohort.id} resource suite identity is invalid`);
  const resourcePath = 'scripts/rust-migration/r8/core-facets-resource-suite.mjs';
  const liveSourceInputs = readPinned(root, manifest.liveSourceManifest, 'live source manifest', true).json.sourceClosure?.inputs;
  if (sha(fs.readFileSync(path.resolve(root, resourcePath))) !== doc.resourceSuite.harnessSha256 || liveSourceInputs?.[resourcePath] !== doc.resourceSuite.harnessSha256) throw new Error(`${cohort.id} resource suite is not bound to current source`);
  const hostEntries = new Map();
  if (!Array.isArray(doc.hosts) || doc.hosts.length !== acceptanceRuntimes.length) throw new Error(`${cohort.id} needs exactly three raw runtime receipts`);
  for (const hostPin of doc.hosts) {
    requireExactKeys(hostPin, ['name', 'sha256', 'path'], `${cohort.id} raw host receipt pin`);
    if (!acceptanceRuntimes.some(runtime => hostPin.name === `${cohort.id}-${runtime}.json`) || !acceptanceHash(hostPin.sha256) || hostEntries.has(hostPin.name)) throw new Error(`${cohort.id} has an unknown or duplicate raw runtime receipt`);
    const raw = readCohortFile(root, pin.cohort.path, hostPin.path, hostPin.sha256, `${cohort.id} raw runtime receipt ${hostPin.name}`, true).json;
    const runtime = hostPin.name.slice(`${cohort.id}-`.length, -'.json'.length);
    if (raw.format !== 'umf.r8.core-facets-installed/1' || raw.status !== 'pass' || raw.host !== runtime || raw.cohort !== cohort.id || raw.archive?.sha256 !== cohort.archive.sha256 || raw.sourceClosure?.sha256 !== cohort.archive.sourceClosureSha256 || !raw.observation) throw new Error(`${cohort.id}/${runtime} raw replay receipt identity is invalid`);
    validateCoreFacetResourceEvidence(raw.observation.resourceEvidence, { deepEqual(actual, expected, message) { if (canonical(actual) !== canonical(expected)) throw new Error(message); }, equal(actual, expected, message) { if (actual !== expected) throw new Error(message); }, match(actual, pattern, message) { if (!pattern.test(actual)) throw new Error(message); } });
    if (runtime === 'chromium' && (raw.browser?.wasmNetworkRequest !== true || !Array.isArray(raw.browser.externalRequests) || raw.browser.externalRequests.length !== 0)) throw new Error(`${cohort.id} Chromium raw replay did not use local installed WASM`);
    hostEntries.set(runtime, { pin: hostPin, raw });
  }
  if (hostEntries.size !== acceptanceRuntimes.length) throw new Error(`${cohort.id} raw runtime receipts are incomplete`);
  if (!Array.isArray(doc.resourceSuite.hosts) || doc.resourceSuite.hosts.length !== acceptanceRuntimes.length) throw new Error(`${cohort.id} resource suite needs three host receipts`);
  const resourceRuntimes = new Set();
  for (const resourceHost of doc.resourceSuite.hosts) {
    requireExactKeys(resourceHost, ['runtime', 'path', 'sha256', 'cases'], `${cohort.id} resource host record`);
    if (!acceptanceRuntimes.includes(resourceHost.runtime) || resourceRuntimes.has(resourceHost.runtime)) throw new Error(`${cohort.id} resource host inventory is invalid`);
    resourceRuntimes.add(resourceHost.runtime);
    const sourceHost = hostEntries.get(resourceHost.runtime);
    if (!sourceHost || resourceHost.path !== sourceHost.pin.path || resourceHost.sha256 !== sourceHost.pin.sha256 || canonical(resourceHost.cases) !== canonical(sourceHost.raw.observation.resourceEvidence)) throw new Error(`${cohort.id}/${resourceHost.runtime} resource evidence differs from its raw host receipt`);
  }
  if (resourceRuntimes.size !== acceptanceRuntimes.length) throw new Error(`${cohort.id} resource host receipts are incomplete`);

  const assetPin = doc.installedAssetControls;
  requireExactKeys(assetPin, ['path', 'sha256', 'archiveSha256', 'caseCount', 'status'], `${cohort.id} installed asset-control pin`);
  if (assetPin.archiveSha256 !== cohort.archive.sha256 || assetPin.caseCount !== 9 || assetPin.status !== 'pass') throw new Error(`${cohort.id} installed asset-control summary is invalid`);
  const assetReceipt = readCohortFile(root, pin.cohort.path, assetPin.path, assetPin.sha256, `${cohort.id} installed asset controls`, true).json;
  validateCoreFacetAssetControlEvidence(assetReceipt, cohort.archive, archiveMemberMap);

  if (!Array.isArray(doc.retirementHostReceipts) || doc.retirementHostReceipts.length !== coreFacetsOperations.length * acceptanceRuntimes.length) throw new Error(`${cohort.id} needs exactly 12 operation/runtime retirement receipts`);
  const receiptByKey = new Map();
  for (const item of doc.retirementHostReceipts) {
    requireExactKeys(item, ['runtime', 'operation', 'path', 'sha256', 'caseCount'], `${cohort.id} operation/runtime receipt map`);
    const key = `${item.operation}\0${item.runtime}`;
    if (!coreFacetsOperations.includes(item.operation) || !acceptanceRuntimes.includes(item.runtime) || receiptByKey.has(key) || !acceptanceHash(item.sha256) || !Number.isSafeInteger(item.caseCount) || item.caseCount < 1) throw new Error(`${cohort.id} has an invalid or duplicate operation/runtime receipt pin`);
    receiptByKey.set(key, item);
  }
  for (const op of manifest.operations) {
    const packet = packetByOperation.get(op.exportName);
    const group = op.receiptCohorts.find(item => item.cohortId === cohort.id);
    if (!packet || !group) throw new Error(`${cohort.id} lacks the matching ${op.exportName} manifest receipt group`);
    for (const runtime of acceptanceRuntimes) {
      const indexed = receiptByKey.get(`${op.exportName}\0${runtime}`);
      const manifestPin = group.receipts.find(item => item.runtime === runtime);
      if (!indexed || !manifestPin || indexed.caseCount !== packet.cases.size) throw new Error(`${cohort.id} ${op.exportName}/${runtime} receipt map is incomplete`);
      const expectedPath = path.posix.join(path.posix.dirname(pin.cohort.path), indexed.path);
      if (manifestPin.path !== expectedPath || manifestPin.sha256 !== indexed.sha256) throw new Error(`${cohort.id} ${op.exportName}/${runtime} receipt does not match the manifest pin`);
      readCohortFile(root,pin.cohort.path,indexed.path,indexed.sha256,`${cohort.id} ${op.exportName}/${runtime} retirement receipt`);
    }
  }
  return { path: pin.cohort.path, sha256: pin.cohort.sha256 };
}

export function validateCoreFacetsAcceptanceCohorts(acceptanceCohorts, manifest, rows, { root }) {
  if (!Array.isArray(acceptanceCohorts) || acceptanceCohorts.length !== acceptanceCohortIds.length) throw new Error('Core Facets acceptance requires exactly the Darwin and Linux cohort pins');
  const manifestCohorts = new Map(manifest.cohorts.map(cohort => [cohort.id, cohort]));
  const pins = new Map();
  for (let index=0;index<acceptanceCohortIds.length;index++) {
    const pin=acceptanceCohorts[index],expectedId=acceptanceCohortIds[index];
    if (pin?.cohortId !== expectedId || pins.has(pin.cohortId)) throw new Error('Core Facets acceptance cohort order/identity must be exactly darwin-arm64 then linux-x86_64');
    requireExactKeys(pin,['cohortId','cohort'],`${expectedId} acceptance cohort pin`);
    requireExactKeys(pin.cohort,['path','sha256'],`${expectedId} acceptance cohort file pin`);
    if (typeof pin.cohort.path !== 'string' || path.isAbsolute(pin.cohort.path) || pin.cohort.path.split(/[\\/]/).includes('..') || path.posix.basename(pin.cohort.path) !== 'cohort.json' || !acceptanceHash(pin.cohort.sha256)) throw new Error(`${expectedId} acceptance cohort pin must name a safe, hashed cohort.json`);
    pins.set(pin.cohortId,pin);
  }
  const bounded=validateBoundedDefaultRouteEvidence(manifest,rows,{root});
  const packetByOperation = new Map(manifest.operations.map(op => [op.exportName, verifyPacket(root, op.packet, op)]));
  const acceptanceEvidence = new Map();
  for (const cohortId of acceptanceCohortIds) {
    const cohort=manifestCohorts.get(cohortId);
    if (!cohort) throw new Error(`Core Facets acceptance has no manifest archive for ${cohortId}`);
    const pin=validateCoreFacetsAcceptanceCohort(root,pins.get(cohortId),manifest,cohort,packetByOperation,manifest.operations);
    acceptanceEvidence.set(cohortId,pin);
  }
  // The acceptance bundle augments each already-validated bounded row with its
  // cohort pin, then promotes only the exact Core Facets eight-row slice.
  const out=new Map();
  for(const [key,item] of bounded){
    const evidence=[...item.evidence];
    for(const pin of acceptanceEvidence.values())evidence.push(pin);
    out.set(key,{...item,status:'retired',evidence});
  }
  if(out.size!==8)throw new Error('Core Facets acceptance must retire exactly eight default-route rows');
  return out;
}

export function validateBoundedDefaultRouteEvidence(manifest, rows, { root }) {
  if (!manifest || !['umf.r8.default-route-retirement-evidence/2', 'umf.r8.default-route-retirement-evidence/3', 'umf.r8.default-route-retirement-evidence/4'].includes(manifest.format) || manifest.status !== 'pass') throw new Error('unsupported or non-pass bounded default-route evidence');
  const facetsManifest = manifest.format === 'umf.r8.default-route-retirement-evidence/4';
  requireExactKeys(manifest, facetsManifest
    ? (Object.hasOwn(manifest,'acceptanceCohorts') ? ['format', 'profile', 'status', 'liveSourceManifest', 'cohorts', 'operations', 'acceptanceCohorts'] : ['format', 'profile', 'status', 'liveSourceManifest', 'cohorts', 'operations'])
    : ['format', 'status', 'liveSourceManifest', 'cohorts', 'operations'], 'retirement manifest');
  if (facetsManifest) {
    const expected = ['inspectCoreFacets', 'declareCoreFacets', 'verifyCoreFacetDeclaration', 'historicalCoreFacetPatch'];
    if (manifest.profile !== 'core-facets' || !Array.isArray(manifest.operations) || manifest.operations.length !== expected.length || manifest.operations.some((item, index) => item?.exportName !== expected[index])) throw new Error('/4 Core Facets evidence requires the exact ordered four-operation profile');
  }
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
    if (manifest.format === 'umf.r8.default-route-retirement-evidence/3' && !packet.securityNot) throw new Error('/3 retirement accepts only the CONTRACT-062 securityNot profile');
    if (manifest.format === 'umf.r8.default-route-retirement-evidence/2' && packet.securityNot) throw new Error('securityNot acceptance requires the /3 retirement manifest');
    requirePacketProfileForManifest(manifest.format, packet);
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
        const existing = byPair.get(key) ?? { status: manifest.format === 'umf.r8.default-route-retirement-evidence/3' ? 'accepted' : 'bounded', contractId: op.contract.id, rustOwner: op.rustOwner, evidence: [{ path: op.contract.path, sha256: op.contract.sha256 }, { path: op.packet.path, sha256: op.packet.sha256 }] };
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
  if (manifest?.format === 'umf.r8.default-route-retirement-evidence/3' && manifest.operations?.some(op => op?.exportName === 'validateCoreRecordValues')) {
    throw new Error('Record Values bounded evidence is not-retirable: the CONTRACT-049 current-profile amendment is pending independent acceptance review and fresh current-source fixed-point replay; measured memory bounds are not established');
  }
  if (manifest?.format === 'umf.r8.default-route-retirement-evidence/2') {
    throw new Error('CONTRACT acceptance coverage required: /2 bounded default-route evidence cannot retire ledger rows');
  }
  if (manifest?.format === 'umf.r8.default-route-retirement-evidence/3') {
    const accepted = validateBoundedDefaultRouteEvidence(manifest, rows, { root });
    if ([...accepted.values()].some(item => item.status !== 'accepted') || accepted.size !== 2) throw new Error('/3 securityNot retirement must cover exactly its Node and browser default routes');
    return new Map([...accepted].map(([key, item]) => [key, { ...item, status: 'retired' }]));
  }
  if (manifest?.format === 'umf.r8.default-route-retirement-evidence/4') {
    if (Object.hasOwn(manifest,'acceptanceCohorts')) return validateCoreFacetsAcceptanceCohorts(manifest.acceptanceCohorts,manifest,rows,{root});
    const bounded = validateBoundedDefaultRouteEvidence(manifest, rows, { root });
    if (bounded.size !== 8 || [...bounded.values()].some(item => item.status !== 'bounded')) throw new Error('/4 Core Facets packet evidence remains bounded and must cover exactly four operations across Node and browser routes');
    return bounded;
  }
  throw new Error('unsupported default-route retirement evidence; no retirement schema is currently accepted');
}
