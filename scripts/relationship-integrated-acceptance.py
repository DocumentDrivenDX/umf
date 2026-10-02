#!/usr/bin/env python3
"""Verify and publish final relationship integration evidence. Standard library only.

Run from the integration checkout, or pass --root. No output is written unless
--publish is supplied. The default output is the proposed durable acceptance path.
Normalized gate inputs are described in relationship-integrated-acceptance-inputs.md.
"""
import argparse, collections, hashlib, json, re, subprocess
from pathlib import Path

P = argparse.ArgumentParser(description=__doc__)
P.add_argument('--root', default='.')
P.add_argument('--manifest', default='fixtures/validation/relationship-integrated-compatibility-refresh.json')
P.add_argument('--regression', default='fixtures/validation/relationship-integrated-refresh/regression-result.json')
P.add_argument('--old-gates', default='fixtures/validation/relationship-integrated-refresh/conformance-runs.json')
P.add_argument('--relationship-gate', required=True)
P.add_argument('--versions', required=True, help='Evidence-backed native/browser versions and scopes JSON')
P.add_argument('--document', action='append', default=[], help='Final docs to fingerprint (repeatable); defaults to README/architecture/test-plan/implementation')
P.add_argument('--output', default='fixtures/validation/relationship-integrated-acceptance-evidence.json')
P.add_argument('--publish', action='store_true')
A = P.parse_args()
ROOT = Path(A.root).resolve()
OUT = (ROOT / A.output).resolve()
DURABLE = ROOT / 'fixtures/validation/relationship-integrated-final'
DIGEST = re.compile(r'[a-f0-9]{64}')
verified, blobs = {}, {}

def require(condition, message):
    if not condition:
        raise SystemExit('REFUSED: ' + message)

def path(value):
    p = (ROOT / value).resolve()
    require(p.is_relative_to(ROOT), 'Input outside checkout: ' + str(value))
    require(p != OUT, 'Acceptance output cannot be its own verification input')
    require(p.is_file(), 'Missing input: ' + str(p))
    return p

def relative(p):
    return str(p.relative_to(ROOT))

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def check(value, expected=None):
    p = path(value); h = digest(p)
    if expected is not None:
        require(isinstance(expected, str) and DIGEST.fullmatch(expected), 'Malformed hash: ' + str(value))
        require(h == expected, 'Changed verified input: ' + str(value))
    verified[relative(p)] = h
    return p

def load(value):
    return json.loads(check(value).read_text())

def hashes(record, label, required=True):
    values = record.get('sha256')
    require(isinstance(values, dict) and (values or not required), 'Missing source fingerprints: ' + label)
    for p, h in values.items():
        check(p, h)

def archive(p, prefix):
    """Keep original bytes; final records point to durable paths, never cache logs."""
    p = path(p); h = digest(p)
    if relative(p).startswith('fixtures/'):
        return relative(p)
    target = DURABLE / (prefix + '-' + h[:16] + '-' + p.name)
    blobs[relative(target)] = p.read_bytes()
    verified[relative(target)] = h
    return relative(target)

def summary(text, label):
    # The last anchored Bun summary is the outer invocation. Nested gate suites
    # are deliberately not added. Its file count must equal explicit CLI files.
    patterns = {'tests': r'^\s*(\d+) pass\s*$', 'failures': r'^\s*(\d+) fail\s*$',
                'assertions': r'^\s*(\d+) expect\(\) calls\s*$',
                'files': r'^Ran \d+ tests? across (\d+) files?\.'}
    text = re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', text)
    result = {}
    for key, pattern in patterns.items():
        hits = re.findall(pattern, text, re.M)
        if key == 'assertions' and not hits:
            result[key] = 0
        else:
            require(bool(hits), 'Missing final Bun ' + key + ' summary: ' + label)
            result[key] = int(hits[-1])
    require(result['tests'] > 0 and result['failures'] == 0, 'No passing top-level suite: ' + label)
    return result

all_runs, test_runs, covered = [], [], set()
def run(record, label, count_tests=False):
    require(record.get('exitCode') == 0, 'Unsuccessful required run: ' + label)
    command = record.get('command')
    require(isinstance(command, list) and command and all(isinstance(x, str) for x in command), 'Invalid command: ' + label)
    log = check(record['log'], record['logSha256'])
    result = {'command': command, 'exitCode': 0, 'log': archive(relative(log), label), 'logSha256': digest(log)}
    if count_tests and command[:2] == ['bun', 'test']:
        require(command[2:] and all(not x.startswith('-') and x.endswith('.test.ts') for x in command[2:]), 'Counted bun test commands allow only explicit test paths; no flags: ' + label)
        files = [relative(path(x)) for x in command[2:]]
        require(files and len(files) == len(set(files)), 'Explicit unique test paths required: ' + label)
        require(not covered.intersection(files), 'Duplicate top-level test files: ' + str(sorted(covered.intersection(files))))
        counts = summary(log.read_text(), label)
        require(counts['files'] == len(files), 'Final summary is not the explicit top-level invocation: ' + label)
        for key, actual in counts.items():
            if record.get(key) is not None:
                require(record[key] == actual, 'Recorded/log count mismatch: ' + label + ' ' + key)
        result.update(counts); result['testFiles'] = files
        covered.update(files); test_runs.append(result)
    all_runs.append(result)
    return result

manifest = load(A.manifest); regression = load(A.regression)
old = load(A.old_gates); gate = load(A.relationship_gate); versions = load(A.versions)
require(manifest.get('complete') is True, 'Compatibility manifest incomplete')
hashes(manifest, 'compatibility manifest')
require(collections.Counter(tuple(c) for c in manifest['commands']) == collections.Counter(tuple(r['command']) for r in manifest['runs']), 'Required compatibility command inventory differs from completed runs')
for i, r in enumerate(manifest['runs']):
    run(r, 'compatibility-' + str(i))  # overlapping focused suites are not added to final counts
failed = []
for i, r in enumerate(manifest.get('failedAttempts', [])):
    log = check(r['log'], r['logSha256'])
    failed.append({**r, 'log': archive(relative(log), 'failed-' + str(i))})
require(regression.get('refreshSha256') == digest(path(A.manifest)), 'Regression used a different compatibility manifest')
check(regression['testInputs'], regression['testInputsSha256'])
inputs = load(regression['testInputs'])
require(isinstance(inputs, dict) and inputs, 'Empty test-input snapshot')
for p, h in inputs.items():
    check(p, h)
run(regression, 'regression', True)
require(old.get('complete') is True, 'Previous ideal gate replay incomplete')
for concept in ['field', 'nullability', 'cardinality', 'facets', 'key']:
    require(any(r['command'] == ['bun', 'scripts/core-ideals/' + concept + '-conformance.ts'] for r in old['runs']), 'Missing old gate: ' + concept)
for i, r in enumerate(old['runs']):
    run(r, 'old-gate-' + str(i), True)
require(gate.get('complete') is True and gate.get('idealAdmitted') is True and gate.get('priorityDelivery') is True, 'Relationship admission and priority delivery must both pass')
require(gate.get('nativeEquivalence') is False, 'Unexpected native equivalence claim')
hashes(gate, 'relationship gate')
require(gate.get('runs'), 'Relationship gate has no execution records')
require(any(r.get('command') == ['bun', 'scripts/core-ideals/relationship-conformance.ts'] and r.get('exitCode') == 0 for r in gate['runs']), 'Missing successful actual relationship-conformance command')
fixed = {name:'fixtures/validation/relationship-'+name+'.json' for name in ['admission','delivery','conformance','gate-refresh']}
for name, p in fixed.items():
    require(p in gate['sha256'], 'Normalized gate must hash fixed proof: ' + p)
    check(p, gate['sha256'][p])
admission, delivery, conformance, refresh = (load(fixed[n]) for n in ['admission','delivery','conformance','gate-refresh'])
require(admission.get('idealAdmitted') is True and delivery.get('priorityDelivery') is True, 'Actual relationship admission/delivery proof did not pass')
require(all(r.get('nativeEquivalence') is False for r in [admission,delivery,conformance,refresh]), 'Actual relationship proof claims native equivalence')
require(refresh.get('complete') is True, 'Actual relationship refresh incomplete')
require(isinstance(conformance.get('admission'), dict) and isinstance(conformance.get('delivery'), dict) and {**conformance['admission'], 'nativeEquivalence': conformance['nativeEquivalence']} == admission and {**conformance['delivery'], 'nativeEquivalence': conformance['nativeEquivalence']} == delivery, 'Combined relationship proof differs from separate results')
qualification = admission.get('qualification', {}); evidence = delivery.get('evidence', {})
refresh_hash = digest(path(fixed['gate-refresh']))
require(qualification.get('path') == fixed['gate-refresh'] and qualification.get('sha256') == refresh_hash and evidence.get('refreshSha256') == refresh_hash, 'Relationship qualification references a different refresh')
require(qualification.get('versions') and qualification['versions'] == evidence.get('versions'), 'Relationship qualification versions disagree')
require(set(delivery.get('systems', [])) == {'tablespec','postgresql','sqlserver','avro','parquet'}, 'Actual delivery does not cover five priority systems')
useful = admission.get('usefulSystems', [])
require(admission.get('minimumUsefulPriorityMappings') == 2 and len(set(useful)) >= 2 and set(useful) <= set(delivery['systems']), 'Actual admission lacks two useful priority systems')
require(useful == evidence.get('usefulSystems') and admission.get('usefulMappings') == evidence.get('usefulMappings'), 'Useful mapping evidence disagrees')
require(all(type(admission['usefulMappings'].get(system)) is int and admission['usefulMappings'][system] > 0 for system in useful), 'Empty useful mapping witness')
for key in ['sourceHashes','proofHashes']:
    require(isinstance(refresh.get(key), dict) and refresh[key] and refresh[key] == evidence.get(key), 'Relationship refresh/evidence hash inventory differs: ' + key)
    for p, h in refresh[key].items():
        check(p, h)
require(refresh.get('commands'), 'Relationship refresh has no actual commands')
for i, r in enumerate(refresh['commands']):
    run({**r, 'logSha256':r['sha256']}, 'relationship-refresh-' + str(i))

for i, r in enumerate(gate['runs']):
    run(r, 'relationship-gate-' + str(i), True)
for label, source in [('old-gate', old), ('relationship-gate', gate)]:
    for i, r in enumerate(source.get('failedAttempts', [])):
        log = check(r['log'], r['logSha256'])
        failed.append({**r, 'log': archive(relative(log), label + '-failed-' + str(i))})
actual_files = {relative(p) for p in (ROOT / 'tests').rglob('*.test.ts')}
require(covered == actual_files, 'Incomplete top-level coverage; missing=' + str(sorted(actual_files-covered)) + '; extra=' + str(sorted(covered-actual_files)))
require(actual_files <= {relative(path(p)) for p in inputs}, 'Regression input snapshot does not fingerprint every discovered test')

def version_checks(entry, label):
    checks = entry.get('checks', [])
    require(checks, 'Missing native version pointer checks: ' + label)
    witnessed = []
    for item in checks:
        require(item['path'] in entry['evidence'], 'Version check must reference hashed evidence: ' + label)
        value = json.loads(path(item['path']).read_text())
        for part in item['pointer'].split('/')[1:] if item['pointer'] else []:
            part = part.replace('~1','/').replace('~0','~')
            value = value[int(part)] if isinstance(value, list) else value[part]
        require(value == item['expected'], 'Version evidence differs: ' + label + ' ' + item['pointer'])
        witnessed.append(value)
    listed = list(entry['versions'].values()) if 'versions' in entry else [entry['version']]
    require(all(v in witnessed for v in listed), 'Every published version requires an exact checked value: ' + label)

# Versions are supplied from actual evidence, never inferred from package labels.
require(versions.get('systems') and versions.get('browser'), 'Missing pinned versions/scopes')
for system, entry in versions['systems'].items():
    require(entry.get('versions') and entry.get('scope') and entry.get('evidence'), 'Incomplete version claim: ' + system)
    for p, h in entry['evidence'].items():
        check(p, h)
    version_checks(entry, system)
require({'tablespec','postgresql','sqlserver','avro','parquet','graphql','rdf','linkml'} <= set(versions['systems']), 'Missing priority/additional native versions')
require(versions['browser'].get('version') and versions['browser'].get('evidence'), 'Browser version must have evidence')
for p, h in versions['browser']['evidence'].items():
    check(p, h)
version_checks(versions['browser'], 'browser')

schemas = load('fixtures/json-schema-audit.json'); packages = load('fixtures/extension-package-audit.json')
require(schemas['passed'] == schemas['schemas'] and not schemas.get('failures'), 'Schema audit did not pass')
require(packages['passed'] == packages['packages'] and not packages.get('failures'), 'Package audit did not pass')
# Require execution evidence rather than deriving static success from file presence.
commands = [r['command'] for r in all_runs]
for name in ['typecheck', 'build', 'test:schemas']:
    require(any(c in (['bun','run',name], ['bun',name]) for c in commands), 'Missing successful static command: ' + name)

documents = A.document or ['docs/helix/README.md','docs/helix/02-design/architecture.md','docs/helix/03-test/test-plan.md','docs/helix/04-build/implementation-plan.md']
for p in documents:
    check(p)
    require('{{' not in path(p).read_text(), 'Unfilled documentation placeholder: ' + p)

# Recheck immutable inputs immediately before writing, then normalize all cache
# inputs into durable byte snapshots. Do not hash this output or mutate inputs.
for p, h in list(verified.items()):
    if p not in blobs:
        require(digest(path(p)) == h, 'Input changed during verification: ' + p)
durable_hashes = {}
for p, h in list(verified.items()):
    if p in blobs:
        durable_hashes[p] = h
    elif p.startswith(('.cache/', 'dist/')):
        durable_hashes[archive(p, 'input')] = h
    else:
        durable_hashes[p] = h
revision = subprocess.check_output(['git','rev-parse','HEAD'], cwd=ROOT, text=True).strip()
result = {'scope':'Fresh integrated relationship/binding/generator compatibility and complete unique top-level test inventory; qualified native subsets only',
          'testedRevision':revision,'workingTreeFingerprintsAuthoritative':True,
          'integratedAccepted':True,'idealAdmitted':True,'priorityDelivery':True,'nativeEquivalence':False,
          'compatibilityCommands':len(manifest['runs']),
          'verification':{k:sum(r[k] for r in test_runs) for k in ['tests','files','assertions','failures']},
          'counting':'Only disjoint explicit top-level bun test files from regression, old gates and relationship gate; nested and focused replay suites excluded',
          'schemas':schemas['schemas'],'packages':packages['packages'],'nativeVersionsAndScopes':versions,
          'topLevelTestRuns':test_runs,'runs':all_runs,'retainedFailedAttempts':failed,
          'limits':['No native-equivalence graduation','Metadata/schema carrier acceptance does not establish referential enforcement','Generated SDL/DDL is not downstream runtime execution or deployed migration','Broader product and native-system scope remains outside this queue acceptance'],
          'sha256':dict(sorted(durable_hashes.items()))}
text = json.dumps(result, indent=2) + '\n'
if A.publish:
    require(OUT.is_relative_to(ROOT / 'fixtures/validation'), 'Output must be durable validation evidence')
    for p, data in blobs.items():
        target = ROOT / p; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUT.with_suffix(OUT.suffix + '.tmp'); temporary.write_text(text); temporary.replace(OUT)
    print('Published', relative(OUT), result['verification'])
else:
    print(text)
