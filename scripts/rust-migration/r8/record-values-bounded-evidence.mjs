// Validates the captured Record Values profile as bounded evidence only.
// Its pins are intentionally fixed to the reviewed Darwin/Linux packets so
// copied, swapped, or re-hashed claims cannot be promoted by editing a manifest.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const closure = 'a53fba2dcf8edb4907de646040e446f95c6af7c13b6f6abd165dcdde5a893c25';
const currentContractSha256 = 'e132de662742d75836aae5e22a008eb6421d16fd1663cf29f087c301f8e788e7';
const rawIds = ['sourceAccessor', 'identityAccessor', 'valuesAccessorBeforeSourceVersion', 'hiddenSource', 'symbolSource', 'customPrototypeSource', 'sparseValues', 'cyclicSource', 'nan', 'positiveInfinity', 'negativeInfinity', 'negativeZero', 'unsafeInteger', 'nonJsonValues', 'hiddenIdentity', 'symbolIdentity', 'customPrototypeIdentity', 'crossedInvalidSemanticSource', 'sourceThenIdentityThenValuesGetterCounts'];
const semanticIds = ['valid-present', 'required-absent', 'invalid-field-value', 'duplicate', 'undeclared', 'unknown-source', 'invalid-source-version', 'malformed-value-state', 'sol-extra-field-id', 'sol-empty-field-id', 'sol-extra-record-id', 'sol-missing-record-and-nonarray', 'sol-null-value-state', 'sol-unknown-value-state', 'sol-warn-duplicate', 'sol-escape-undeclared', 'sol-surrogate-present', 'sol-surrogate-absent', 'sol-null-record-identity', 'sol-missing-field-identity', 'sol-raw-unknown-path', 'sol-array-record-identity', 'sol-raw-identity-tilde', 'sol-raw-state-slash'];
const base = 'docs/helix/04-build/evidence/rust-migration/r8-record-values-current-';
const shared = {
  'archive-package.json': '1bd5f6cc6db6a5e9ef0e395a19aa6504e8a9a130a2fcbd3faaf4effbac7bb23a',
  'installed-host-runner.mjs': '49ee9da33ced6d270e6407c1ba3db6e5fc25a5d09044de8f60bc8addbeb721e5',
  'installed-browser-runner.mjs': '6f43e4a1d94567c51a9a545d84155936286009cf2c07baedc880b68decd06fd0',
  'run-installed-replay.sh': 'd7e7fda0b5432d3b7202ed4398fbf95e01c0c286ef4fdb090f2b7b9a6949419b',
};
const platformPins = {
  darwin: {
    archive: 'accf61b39c4213ab452fbfff4fe1a31b950934a36c321c74984df45088adcd6c',
    archiveManifest: 'fe880f6925b70b45865b0736d0864223eed4b9c5d4f6f9759be949167f0c6e37',
    source: 'e684adc8f39829991346757a64bcc3c013b284d8a6cc368f239add5d79fa2203',
    packet: '50d52bab545eae6566e8da6064c4fbec6d8880c89b4a32c9f2c5c614d4a3b5a9',
    admission: '622f7a65c70a02fe039660e142b77b5fcbfee80a049c9a0627c5332e83cd3fb8',
    node: '590ea744f490fe06c5f854a285322acb473cfed7f0143888ed8a729d6f85f64b',
    bun: '84712ea8a03754cc48ce252abb07348ac4b20c3fe70cc578d753198f88a07eb4',
    chromium: '45a5de8fcc3a6f53e7b296de97a9e15d9ec8e8ea425b7cea13be558aa0793c66',
  },
  linux: {
    archive: 'dc3ec269f99266862ea078e23d166c4b50e30cc5b1fd0ef3cf337982b31bd93a',
    archiveManifest: '73ed98d0cd3a4da32e67742d718be5774313a4c7fb6af1fa9e1eff43d708590f',
    source: 'e684adc8f39829991346757a64bcc3c013b284d8a6cc368f239add5d79fa2203',
    packet: '50d52bab545eae6566e8da6064c4fbec6d8880c89b4a32c9f2c5c614d4a3b5a9',
    admission: '622f7a65c70a02fe039660e142b77b5fcbfee80a049c9a0627c5332e83cd3fb8',
    node: 'a9c70d513cd451d87fe41fccd5dac58af505fcfe9b25197a388430a171874e90',
    bun: '8603f73a81753e77f663d8c467624ee48c1b5d404e41ebd27bb70cbbbe0f93a3',
    chromium: '27c713e995e964433bf72e8d4db577c7d6e95ff6b2c6b522c96dd2ed1c1eacb9',
  },
};

function fail(message) { throw new Error(`Record Values bounded evidence: ${message}`); }
function readHash(root, rel, expected) {
  const full = path.resolve(root, rel);
  const relative = path.relative(path.resolve(root), full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail(`unsafe evidence path ${rel}`);
  let bytes;
  try { bytes = fs.readFileSync(full); } catch { fail(`missing pinned file ${rel}`); }
  if (sha(bytes) !== expected) fail(`stale or swapped pin ${rel}`);
  return bytes;
}
function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) fail(`${label} has missing or unknown fields`);
}
export function validateRecordValuesHostSummary(doc, runtime) {
  if (doc.status !== 'pass' || doc.packageVersion !== '0.5.6') fail(`${runtime} runtime identity/status mismatch`);
  if (runtime !== 'chromium') {
    if (doc.runtime !== (runtime === 'node' ? 'v26.12.1' : 'Bun 1.4.3') || doc.semantic?.cases !== 24 || doc.semantic.defaultDispatches !== 24 || doc.semantic.referenceDispatches !== 0 || doc.rawHostAdmission?.cases !== 19 || doc.rawHostAdmission.defaultDispatches !== 20 || doc.rawHostAdmission.referenceDispatches !== 0 || doc.totalRecordValueRustDispatches !== 44) fail(`${runtime} semantic/raw case or dispatch totals are incomplete`);
    const dispatch = doc.rawHostAdmission.dispatchByCase;
    if (!dispatch || Object.keys(dispatch).length !== 19 || Object.keys(dispatch).sort().join('\0') !== [...rawIds].sort().join('\0')) fail(`${runtime} raw-host per-case dispatch inventory is incomplete`);
    for (const [id, item] of Object.entries(dispatch)) {
      if (id === 'sourceThenIdentityThenValuesGetterCounts') {
        if (item.default !== 2 || item.reference !== 0 || item.orderProbes !== 2) fail(`${runtime} order-probe dispatch mismatch`);
      } else {
        exactKeys(item.getterReads, ['source', 'identity', 'values'], `${runtime}/${id} getter trace`);
        if (item.default !== 1 || item.reference !== 0 || Object.values(item.getterReads).some(count => count !== 0)) fail(`${runtime}/${id} dispatch or getter trace mismatch`);
      }
    }
  } else {
    const result = doc.result;
    if (doc.runtime !== '153.0.8010.12' || doc.sourceClosureSha256 !== closure || doc.wasmRequested !== true || !/^[a-f0-9]{64}$/.test(doc.instrumentedGlueSha256 ?? '') || result?.semanticCases !== 24 || result.semanticDefaultDispatches !== 24 || result.semanticReferenceDispatches !== 0 || result.rawHostCases !== 19 || result.rawDefaultDispatches !== 20 || result.rawReferenceDispatches !== 0 || result.wasmBridgeCalls !== 46 || result.nodeGlobalsAbsent !== true) fail('Chromium semantic/raw/WASM/browser boundary controls are incomplete');
    if (Object.keys(result.dispatchByCase ?? {}).length !== 19 || Object.keys(result.dispatchByCase).sort().join('\0') !== [...rawIds].sort().join('\0')) fail('Chromium per-case raw-host dispatch inventory is incomplete');
    for (const [id, item] of Object.entries(result.dispatchByCase)) {
      if (id === 'sourceThenIdentityThenValuesGetterCounts') {
        if (item.default !== 2 || item.reference !== 0 || item.orderProbes !== 2) fail('Chromium order-probe dispatch mismatch');
      } else if (item.default !== 1 || item.reference !== 0) fail(`Chromium/${id} dispatch mismatch`);
    }
    if (result.large700k?.preservedLength !== 700000 || result.countLimit?.inputLength !== 100001 || result.countLimit?.error?.name !== 'UmfError' || result.countLimit.error.code !== 'LIMIT' || result.countLimit.error.path !== '/99999') fail('Chromium resource-control outcomes are incomplete');
  }
}

/** Validate captured R8 Record Values evidence as bounded profile data, never retirement. */
export function validateRecordValuesBoundedEvidence(manifest, { root }) {
  exactKeys(manifest, ['format', 'status', 'operationVersion', 'coreVersion', 'contract', 'sourceClosureSha256', 'frozenPacket', 'hostAdmissionPacket', 'cohorts', 'acceptanceStatus', 'memoryQualificationStatus', 'measuredUpperBoundBytes'], 'manifest');
  if (manifest.format !== 'umf.r8.record-values-bounded-evidence/1' || manifest.status !== 'pass' || manifest.operationVersion !== '2.0.0' || manifest.coreVersion !== '0.10.0') fail('manifest profile identity is unsupported');
  exactKeys(manifest.contract, ['id', 'path', 'sha256'], 'contract pin');
  if (manifest.contract.id !== 'CONTRACT-049' || manifest.contract.path !== 'docs/helix/02-design/contracts/CONTRACT-049-schema-properties.md' || manifest.contract.sha256 !== currentContractSha256) fail('contract pin does not identify the reviewed current CONTRACT-049 bytes');
  if (manifest.sourceClosureSha256 !== closure || manifest.acceptanceStatus !== 'profile-amended-pending-replay' || manifest.memoryQualificationStatus !== 'not-established' || manifest.measuredUpperBoundBytes !== null) fail('unresolved current-source acceptance or memory qualification was altered');
  if (!Array.isArray(manifest.cohorts) || manifest.cohorts.length !== 2) fail('both fixed host cohorts are required');
  exactKeys(manifest.frozenPacket, ['path', 'sha256'], 'frozen semantic packet');
  exactKeys(manifest.hostAdmissionPacket, ['path', 'sha256'], 'host-admission packet');
  if (manifest.frozenPacket.path !== `${base}linux-20261027/frozen-typescript.json` || manifest.frozenPacket.sha256 !== platformPins.linux.packet || manifest.hostAdmissionPacket.path !== `${base}linux-20261027/host-admission.json` || manifest.hostAdmissionPacket.sha256 !== platformPins.linux.admission) fail('frozen packet pins differ from the reviewed R5 captures');
  const frozen = JSON.parse(readHash(root, manifest.frozenPacket.path, platformPins.linux.packet).toString('utf8'));
  const admission = JSON.parse(readHash(root, manifest.hostAdmissionPacket.path, platformPins.linux.admission).toString('utf8'));
  if (frozen.cases?.length !== 24 || frozen.cases.some((item, index) => item.id !== semanticIds[index]) || Object.keys(admission.outcomes?.rawCases ?? {}).length !== 15) fail('frozen semantic/host-admission packet case inventory changed');
  const expandedRawIds = Object.keys(admission.outcomes.rawCases).flatMap(id => id === 'invalidNumbers' ? ['nan', 'positiveInfinity', 'negativeInfinity', 'negativeZero', 'unsafeInteger'] : [id]);
  if (expandedRawIds.length !== 19 || expandedRawIds.sort().join('\0') !== [...rawIds].sort().join('\0')) fail('frozen host-admission packet does not expand to the exact 19 raw cases');
  const seen = new Set();
  for (const cohort of manifest.cohorts) {
    exactKeys(cohort, ['id', 'evidencePath', 'archivePath', 'archiveSha256', 'files'], 'cohort');
    const platform = cohort.id === 'darwin-arm64' ? 'darwin' : cohort.id === 'linux-x86_64' ? 'linux' : null;
    if (!platform || seen.has(platform)) fail('unknown or duplicate host cohort');
    seen.add(platform);
    const pins = platformPins[platform];
    if (cohort.archiveSha256 !== pins.archive || typeof cohort.archivePath !== 'string' || !path.isAbsolute(cohort.archivePath)) fail(`${platform} archive pin is stale or lacks an exact archive path`);
    let archiveBytes;
    try { archiveBytes = fs.readFileSync(cohort.archivePath); } catch { fail(`${platform} exact SDK archive is unavailable`); }
    if (sha(archiveBytes) !== pins.archive) fail(`${platform} SDK archive hash mismatch`);
    const evidence = cohort.evidencePath;
    const sourceFile = platform === 'darwin' ? 'source-cohort.json' : 'archive-source-cohort.json';
    const files = {
      'archive-manifest.json': pins.archiveManifest,
      [sourceFile]: pins.source,
      'node.json': pins.node,
      'bun.json': pins.bun,
      'chromium.json': pins.chromium,
      ...shared,
      ...(platform === 'linux' ? { 'archive-members.json': '5045a498e1a81d6b3eb670947752de89c5fecf0a910bff20c0e2edc79890a37f' } : {}),
    };
    exactKeys(cohort.files, Object.keys(files), `${platform} file pins`);
    for (const [name, digest] of Object.entries(files)) {
      if (cohort.files[name] !== digest) fail(`${platform}/${name} declared pin mismatch (${cohort.files[name]} != ${digest})`);
      const bytes = readHash(root, path.join(evidence, name), digest);
      if (name === sourceFile) {
        const source = JSON.parse(bytes.toString('utf8')).sourceClosure;
        if (source?.sha256 !== closure || source.fileCount !== 3595 || source.transform?.status !== 'fixed-point' || source.transform.generatedInputs?.length !== 0) fail(`${platform} source closure profile mismatch`);
      }
      if (name === 'archive-manifest.json') {
        const archiveManifest = JSON.parse(bytes.toString('utf8'));
        if (archiveManifest.sourceTreeSha256 !== closure) fail(`${platform} archive manifest is for another source closure`);
      }
      if (['node.json', 'bun.json', 'chromium.json'].includes(name)) validateRecordValuesHostSummary(JSON.parse(bytes.toString('utf8')), name.slice(0, -5));
    }
  }
  const contract = readHash(root, manifest.contract.path, manifest.contract.sha256);
  if (!/^\s*id:\s*CONTRACT-049\s*$/m.test(contract.toString('utf8'))) fail('pinned contract identity mismatch');
  return {
    status: 'not-retirable',
    profile: '2.0.0/core 0.10.0 captured installed-route profile',
    blockers: [
      'the CONTRACT-049 current-profile amendment is pending independent acceptance review and fresh current-source fixed-point replay',
      'the 700,000-unit retained-value control is not a measured memory upper bound',
    ],
  };
}
