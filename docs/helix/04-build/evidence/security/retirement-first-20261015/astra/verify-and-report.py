"""Independent static/receipt validation. Does not execute the native probe."""
import hashlib
import json
from pathlib import Path

ROOT = Path('/Users/erik/.codex/worktrees/security-main-integration/umf')
OUT = Path('/private/tmp/umf-retirement-first-astra-20261015')
SELF = 'tools/security/pg-retirement-first-probe.py'
RECEIPT = 'docs/helix/04-build/evidence/security/pg-retirement-first-component.json'
sha = lambda data: hashlib.sha256(data).hexdigest()
receipt_bytes = (ROOT / RECEIPT).read_bytes()
receipt = json.loads(receipt_bytes)
sources = {p: (ROOT / p).read_bytes() for p in receipt['sourceDigests']}
assert sha(sources[SELF]) == '4ac26e4617d02da9f25d42eff51993d778adce9a6382159fcdab7276976c185d'
assert len(sources) == 5
assert {p: sha(data) for p, data in sources.items()} == receipt['sourceDigests']
assert receipt['status'] == 'passed'
assert receipt['acceptanceCriteria'] == ['US-057-AC2', 'US-057-AC5', 'US-057-AC7']
assert receipt['acceptanceCasesPromoted'] == []
assert receipt['nativeImplementationQualified'] is False

def exact(left, right):
    assert type(left) is type(right)
    if isinstance(left, dict):
        assert left.keys() == right.keys()
        for key in left:
            exact(left[key], right[key])
    elif isinstance(left, list):
        assert len(left) == len(right)
        for a, b in zip(left, right):
            exact(a, b)
    else:
        assert left == right

observations = receipt['observations']
assert len(observations) == len({x['id'] for x in observations}) == 40
for observation in observations:
    exact(observation['expected'], observation['observed'])
by_id = {x['id']: x['observed'] for x in observations}
exact(by_id['reader:ordinary-role'], ['umf_sec_alice', 'umf_sec_alice', False, False])
exact(by_id['issuer:ordinary-role'], ['umf_sec_issuer', 'umf_sec_issuer', False, False])
assert by_id['engine'] == '170009'
assert receipt['hostAuthentication'] and all(x == {'type': 'host', 'error': None, 'method': 'scram-sha-256'} for x in receipt['hostAuthentication'])
assert [s['id'] for s in receipt['schedules']] == ['retirement-commit', 'retirement-rollback', 'unsafe-claim-omitted']
for schedule in receipt['schedules']:
    identity = schedule['id']
    locks = schedule['locks']
    holders = [x[0] for x in locks if x[1:] == ['ExclusiveLock', True]]
    waiters = [x[0] for x in locks if x[1:] == ['ShareLock', False]]
    assert len(holders) == len(waiters) == 1 and holders[0] != waiters[0]
    exact(schedule['barrier'], {'blockers': holders, 'waitType': 'Lock', 'waitEvent': 'advisory'})
    expected = {'kind': 'rows', 'ids': ['RA', 'RAB']} if identity == 'unsafe-claim-omitted' else {'kind': 'refused', 'sqlstate': '42501', 'message': 'Publisher custody unavailable'}
    exact(schedule['outcome'], expected)
    exact(by_id[identity + ':after-release'], expected)
    assert by_id[identity + ':no-early-outcome'] is False
    assert by_id[identity + ':durable-state'] == ('pending' if identity == 'retirement-rollback' else 'released')
    assert by_id[identity + ':same-reader-recovery'] == waiters[0]
original = sources['tests/security/native/pg-raw-persistent-drain.sql'].decode()
begin = original.index('CREATE FUNCTION security_drain.read_enrolled(')
end = original.index('REVOKE ALL ON FUNCTION security_drain.read_enrolled(', begin)
safe = original[begin:end].replace('CREATE FUNCTION ', 'CREATE OR REPLACE FUNCTION ', 1)
begin = safe.index(' UPDATE security_drain.publisher p SET state=')
end = safe.index(' RETURN QUERY ', begin)
unsafe = safe[:begin] + ' -- Deliberately unsafe: no lease claim or terminal-state check.\n' + safe[end:]
assert sha(safe.encode()) == receipt['safeReadDefinitionSha256']
assert sha(unsafe.encode()) == receipt['unsafeReadDefinitionSha256']
assert by_id['restored-definition'] == safe.split('AS $$', 1)[1].split('$$;', 1)[0]
cleanup = receipt['cleanup']
assert cleanup['ownershipLabelMatched'] is True and cleanup['removed'] is True
assert cleanup['remainingOwnedContainers'] == 0 and cleanup['dataVolumeRemoved'] is True
assert isinstance(cleanup['dataVolume'], str) and cleanup['dataVolume']
controls = json.loads((OUT / 'cleanup-controls-r6.json').read_text())
assert controls['sourceSha256'] == sha(sources[SELF])
assert len(controls['results']) == 10 and all(x['passed'] is True for x in controls['results'])

for path, data in {**sources, RECEIPT: receipt_bytes}.items():
    snapshot = OUT / 'reviewed-sources' / path
    snapshot.parent.mkdir(parents=True, exist_ok=True)
    snapshot.write_bytes(data)
governing = [
    'docs/helix/01-frame/user-stories/US-057-security-lifecycle.md',
    'docs/helix/02-design/contracts/CONTRACT-063-security-enforcement.md',
    'docs/helix/03-test/security/pg-raw.md',
    'docs/helix/04-build/evidence/security/retirement-first-20261015/README.md',
]
report = {
    'status': 'completed',
    'conclusion': 'No remaining actionable findings within the stated retirement-first component scope.',
    'reviewer': 'Independent review subagent requested for Astra Ultra review',
    'date': '2026-10-15',
    'scope': 'Authored PG17.9 read-committed retirement-first component; original SQL fixtures, native barriers, unsafe claim-omission control, cleanup and evidence attribution.',
    'helixCatalog': '/Users/erik/.codex/plugins/cache/helix/helix/0.17.0/workflows',
    'sourcePath': str(ROOT / SELF),
    'sourceSha256': sha(sources[SELF]),
    'sourceDigests': receipt['sourceDigests'],
    'receiptPath': str(ROOT / RECEIPT),
    'receiptSha256': sha(receipt_bytes),
    'nativeRunId': receipt['runId'],
    'versions': receipt['versions'],
    'imageId': receipt['imageId'],
    'governingDigests': {p: sha((ROOT / p).read_bytes()) for p in governing},
    'verification': {
        'matchingUniqueNativeObservations': 40,
        'nativeSchedulesChecked': 3,
        'capturedSourceDigestsCurrent': 5,
        'derivedSafeAndUnsafeDefinitionsMatch': True,
        'originalRoutineBodyRestored': True,
        'exactExclusiveHolderAndSharedWaiterCorrespondence': True,
        'ordinaryOriginalSessionIdentityVerified': True,
        'cleanupReceiptChecks': cleanup,
        'mockOnlyCleanupControlsPassed': 10,
        'nativeCampaignIndependentlyReplayed': False,
        'independentNativeAccess': 'Read-only inspection of local PostgreSQL image volume metadata; no duplicate native campaign.',
        'nativeReplayLimitation': 'The reviewer inspected the root-executed final native receipt and log and checked source/receipt correspondence. It did not independently repeat the native concurrency schedules. The fault controls model subprocess outcomes and do not establish general daemon or crash recovery.',
    },
    'resolvedFindings': [
        {
            'id': 'R1', 'priority': 2, 'classification': 'cleanup', 'status': 'resolved',
            'title': 'Recover owned fixture after an unknown Docker-create outcome',
            'originalProblem': 'A timeout or nonzero Docker client outcome before assignment of the container ID left container=None and skipped cleanup even when creation had occurred.',
            'fixVerified': 'Creation-attempt tracking recovers only the exact preselected name, checks the exact run label and fails on absent/ambiguous ownership rather than claiming cleanup.',
            'evidence': ['cleanup-timeout-control.json', 'cleanup-timeout-original-control.py', 'cleanup-controls.json', 'cleanup-controls-r6.json'],
            'captureLimit': 'The initial fault control did not freeze or hash a pre-fix source snapshot. Its original logic and result are retained as historical evidence; the final controls pin the final source SHA256.',
        },
        {
            'id': 'R2', 'priority': 2, 'classification': 'cleanup', 'status': 'resolved',
            'title': 'Remove and verify the anonymous PostgreSQL data volume',
            'originalProblem': 'docker rm -f removed the container but omitted the anonymous PGDATA volume declared by the PostgreSQL17 image.',
            'fixVerified': 'Cleanup verifies the single expected PGDATA mount and no binds, captures its exact volume name, runs docker rm -f -v, and requires that exact volume to be absent from a successful volume inventory.',
            'evidence': ['anonymous-volume-observation.json', 'cleanup-controls-r6.json', RECEIPT],
            'captureLimit': 'Prior-run volumes were not inventoried or deleted by this reviewer; the final native cleanup receipt applies to the final run only.',
        },
    ],
    'findings': [],
    'remainingFindings': [],
    'acceptanceCriteriaSupportedAsComponentOnly': ['US-057-AC2', 'US-057-AC5', 'US-057-AC7'],
    'acceptanceCasesPromoted': [],
    'nativeImplementationQualified': False,
    'scopeAssessment': [
        'The changed AC3-to-AC5 attribution is appropriate: no assignment removal occurs; this exercises publication-token reuse and custody.',
        'The commit and rollback schedules prove refusal of the same previously consumed token after an observed native retirement-first wait. Rollback leaves pending custody; it does not demonstrate non-MVCC generation rollback recovery.',
        'The unsafe control preserves the native guard and removes the claim, then returns the already-authorized RA/RAB rows after terminal retirement. This is a useful custody-enforcement control, not a demonstrated cross-resource authorization bypass.',
        'Synchronous fetch completion is explicitly distinguished from final consumer/transport release. Live Python result references do not establish complete host-custody drain.',
        'No L03, full backend, graph/Delta, authenticated issuer service, public pg-runtime decoder, complete writer closure, arbitrary snapshot schedule, or general recovery claim follows.',
        'Broader evidence-audit status is outside this review; no repository-wide green-suite claim is made.',
    ],
    'artifacts': {
        p.name: sha(p.read_bytes()) for p in OUT.iterdir()
        if p.is_file() and p.name not in {'review.json', 'verify-and-report.py'}
    },
    'undo': 'Remove the new probe and component evidence/documentation additions; the probe installs only into its disposable owned fixture and does not change the original SQL fixtures or production implementation.',
}
assert {p: sha((ROOT / p).read_bytes()) for p in sources} == receipt['sourceDigests']
assert sha((ROOT / RECEIPT).read_bytes()) == sha(receipt_bytes)
(OUT / 'review.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'status': report['status'], 'remainingFindings': 0, 'resolvedFindings': 2,
                  'sourceSha256': report['sourceSha256'], 'receiptSha256': report['receiptSha256']}))
