import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateRecordValuesBoundedEvidence, validateRecordValuesHostSummary } from './record-values-bounded-evidence.mjs';

const root = process.cwd();
const darwinPath = 'docs/helix/04-build/evidence/rust-migration/r8-record-values-current-darwin-20261027';
const linuxPath = 'docs/helix/04-build/evidence/rust-migration/r8-record-values-current-linux-20261027';
const pin = (path, sha256) => ({ path, sha256 });

async function manifest() {
  const common = {
    'archive-package.json': '1bd5f6cc6db6a5e9ef0e395a19aa6504e8a9a130a2fcbd3faaf4effbac7bb23a',
    'installed-host-runner.mjs': '49ee9da33ced6d270e6407c1ba3db6e5fc25a5d09044de8f60bc8addbeb721e5',
    'installed-browser-runner.mjs': '6f43e4a1d94567c51a9a545d84155936286009cf2c07baedc880b68decd06fd0',
    'run-installed-replay.sh': 'd7e7fda0b5432d3b7202ed4398fbf95e01c0c286ef4fdb090f2b7b9a6949419b',
  };
  return {
    format: 'umf.r8.record-values-bounded-evidence/1', status: 'pass', operationVersion: '2.0.0', coreVersion: '0.10.0',
    contract: { id: 'CONTRACT-049', path: 'docs/helix/02-design/contracts/CONTRACT-049-schema-properties.md', sha256: 'e132de662742d75836aae5e22a008eb6421d16fd1663cf29f087c301f8e788e7' },
    sourceClosureSha256: 'a53fba2dcf8edb4907de646040e446f95c6af7c13b6f6abd165dcdde5a893c25',
    frozenPacket: pin(`${linuxPath}/frozen-typescript.json`, '50d52bab545eae6566e8da6064c4fbec6d8880c89b4a32c9f2c5c614d4a3b5a9'),
    hostAdmissionPacket: pin(`${linuxPath}/host-admission.json`, '622f7a65c70a02fe039660e142b77b5fcbfee80a049c9a0627c5332e83cd3fb8'),
    cohorts: [
      {
        id: 'darwin-arm64', evidencePath: darwinPath, archivePath: '/private/tmp/umf-security-not-current-darwin-20261027/archive/umf-sdk.tgz',
        archiveSha256: 'accf61b39c4213ab452fbfff4fe1a31b950934a36c321c74984df45088adcd6c',
        files: { 'archive-manifest.json': 'fe880f6925b70b45865b0736d0864223eed4b9c5d4f6f9759be949167f0c6e37', 'source-cohort.json': 'e684adc8f39829991346757a64bcc3c013b284d8a6cc368f239add5d79fa2203', 'node.json': '590ea744f490fe06c5f854a285322acb473cfed7f0143888ed8a729d6f85f64b', 'bun.json': '84712ea8a03754cc48ce252abb07348ac4b20c3fe70cc578d753198f88a07eb4', 'chromium.json': '45a5de8fcc3a6f53e7b296de97a9e15d9ec8e8ea425b7cea13be558aa0793c66', ...common },
      },
      {
        id: 'linux-x86_64', evidencePath: linuxPath, archivePath: '/private/tmp/umf-sdk-linux-e9ace728d.tgz',
        archiveSha256: 'dc3ec269f99266862ea078e23d166c4b50e30cc5b1fd0ef3cf337982b31bd93a',
        files: { 'archive-manifest.json': '73ed98d0cd3a4da32e67742d718be5774313a4c7fb6af1fa9e1eff43d708590f', 'archive-source-cohort.json': 'e684adc8f39829991346757a64bcc3c013b284d8a6cc368f239add5d79fa2203', 'node.json': 'a9c70d513cd451d87fe41fccd5dac58af505fcfe9b25197a388430a171874e90', 'bun.json': '8603f73a81753e77f663d8c467624ee48c1b5d404e41ebd27bb70cbbbe0f93a3', 'chromium.json': '27c713e995e964433bf72e8d4db577c7d6e95ff6b2c6b522c96dd2ed1c1eacb9', 'archive-members.json': '5045a498e1a81d6b3eb670947752de89c5fecf0a910bff20c0e2edc79890a37f', ...common },
      },
    ],
    acceptanceStatus: 'profile-amended-pending-replay', memoryQualificationStatus: 'not-established', measuredUpperBoundBytes: null,
  };
}

test('Record Values current profile validates as bounded evidence and remains not-retirable', async () => {
  const result = validateRecordValuesBoundedEvidence(await manifest(), { root });
  assert.equal(result.status, 'not-retirable');
  assert.equal(result.blockers.length, 2);
  assert.match(result.blockers[0], /CONTRACT-049.*independent acceptance review.*current-source fixed-point replay/);
  assert.match(result.blockers[1], /memory upper bound/);
});

test('Record Values profile fails closed on swapped archive, source, packet, harness, or host pin', async () => {
  const changes = [
    ['archive', m => { m.cohorts[0].archiveSha256 = m.cohorts[1].archiveSha256; }],
    ['source', m => { m.cohorts[0].files['source-cohort.json'] = '0'.repeat(64); }],
    ['packet', m => { m.frozenPacket.sha256 = '0'.repeat(64); }],
    ['harness', m => { m.cohorts[0].files['installed-browser-runner.mjs'] = '0'.repeat(64); }],
    ['host', m => { m.cohorts[1].files['chromium.json'] = m.cohorts[0].files['chromium.json']; }],
  ];
  for (const [label, change] of changes) {
    const candidate = await manifest();
    change(candidate);
    assert.throws(() => validateRecordValuesBoundedEvidence(candidate, { root }), /Record Values bounded evidence/, label);
  }
});

test('Record Values profile fails closed when browser controls or acceptance qualification are missing', async () => {
  const browser = await manifest();
  browser.cohorts[0].files['chromium.json'] = '27c713e995e964433bf72e8d4db577c7d6e95ff6b2c6b522c96dd2ed1c1eacb9';
  assert.throws(() => validateRecordValuesBoundedEvidence(browser, { root }), /pin mismatch/);

  for (const [label, field, value] of [
    ['missing measured-memory status', 'memoryQualificationStatus', 'qualified'],
    ['unresolved profile silently upgraded', 'acceptanceStatus', 'accepted'],
  ]) {
    const candidate = await manifest();
    candidate[field] = value;
    assert.throws(() => validateRecordValuesBoundedEvidence(candidate, { root }), /unresolved current-source acceptance or memory qualification/, label);
  }
});

test('Node and Bun summaries reject missing accessor traces and nonzero getter reads', async () => {
  for (const runtime of ['node', 'bun']) {
    const file = `${runtime === 'node' ? darwinPath : linuxPath}/${runtime}.json`;
    const summary = JSON.parse(await readFile(path.join(root, file), 'utf8'));
    const key = 'sourceAccessor';
    const missing = structuredClone(summary);
    delete missing.rawHostAdmission.dispatchByCase[key].getterReads;
    assert.throws(() => validateRecordValuesHostSummary(missing, runtime), /getter trace has missing or unknown fields/);
    const read = structuredClone(summary);
    read.rawHostAdmission.dispatchByCase[key].getterReads.source = 1;
    assert.throws(() => validateRecordValuesHostSummary(read, runtime), /dispatch or getter trace mismatch/);
  }
});
