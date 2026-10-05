"""Seal only successful logged container execution; retain prior records in Git."""
import hashlib, json, os, re, subprocess
from pathlib import Path

out = Path('fixtures/validation/core-check-refresh')
def load(path): return json.loads(Path(path).read_text())
def digest(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def save(path, value): Path(path).write_text(json.dumps(value, indent=2) + '\n')
def checked(path):
    row = load(path)
    assert row['exitCode'] == 0 and digest(row['log']) == row['logSha256'], f'Unsuccessful or changed execution: {path}'
    return row
def summary(row):
    matches = list(re.finditer(r'\n\s*(\d+) pass\n\s*(\d+) fail\n\s*(\d+) expect\(\) calls\nRan (\d+) tests across (\d+) files\.', Path(row['log']).read_text()))
    assert matches, 'Missing test summary'
    passed, failed, assertions, tests, files = map(int, matches[-1].groups())
    assert failed == 0 and passed == tests
    return dict(passed=passed, failed=failed, assertions=assertions, tests=tests, files=files)
def previous(path, revision):
    raw = subprocess.check_output(['git', 'show', f'{revision}:{path}'])
    return {'revision': revision, 'path': str(path), 'sha256': hashlib.sha256(raw).hexdigest()}

runtime = load(out / 'container-runtime.json')
sealing_runtime = {'imageId': os.environ.get('UMF_REPLAY_IMAGE_ID'), 'replayScriptSha256': digest('/opt/replay.py'), 'sealScriptSha256': digest('/opt/seal.py')}
source = runtime['sourceRevision']
native = load(out / 'native-browser.json')
assert native['complete'] and native['commands'] == [row['command'] for row in native['runs']]
for row in native['runs'] + load(out / 'auxiliary.json')['runs']:
    assert row['exitCode'] == 0 and digest(row['log']) == row['logSha256']
publication = load(out / 'publication.json')
gate = checked(out / 'container-gates.json')
counts = summary(gate)
integrity = checked(out / 'container-integrity.json')
closures = [json.loads(line) for line in Path(integrity['log']).read_text().splitlines() if line.startswith('{')]
assert len(closures) == 6 and all(row['currentEvidenceVerified'] for row in closures)
gatepath = out / 'gates.json'
save(gatepath, {'complete': True, 'sourceRevision': source, 'uniqueTests': counts['tests'],
                'files': counts['files'], 'failed': 0, 'runs': [{**gate, 'results': counts}],
                'previousEvidence': previous(gatepath, source),
                'scope': 'One complete eight-file admission run; no nested or repeated tests added.'})

acceptpath = Path('fixtures/validation/core-semantic-types-acceptance.json')
accept = load(acceptpath)
affected = checked(out / 'container-affected.json')
oracle = load('fixtures/validation/core-semantic-types-oracle.json')
browser = load('fixtures/validation/core-semantic-types-browser.json')
assert oracle['agreed'] == oracle['cases'] == 14
assert len(browser['checks']) == 48 and browser['cases'] == 14 and len(browser['externalRequests']) == 0
accept.update(sourceRevision=source, parentRevision=runtime['parentRevision'], runtime={**runtime, 'chromium': native['expectedBrowser']},
              sealingRuntime=sealing_runtime, containerReplay={'path': str(out / 'container-runtime.json'), 'sha256': digest(out / 'container-runtime.json')},
              previousContainerEvidence=previous(acceptpath, source))
accept.setdefault('preContainerFinalChecks', accept['finalChecks'])
accept.setdefault('preContainerExploratoryChecks', accept['exploratoryChecks'])
audit_run = next(row for row in load(out / 'auxiliary.json')['runs'] if row['command'] == ['bun', 'run', 'test:schemas'])
audit_text = Path(audit_run['log']).read_text()
audit_objects = []
position = 0
while True:
    start = audit_text.find('{', position)
    if start < 0: break
    value, consumed = json.JSONDecoder().raw_decode(audit_text[start:])
    audit_objects.append(value); position = start + consumed
package_audit = next(row for row in audit_objects if 'packages' in row)
schema_audit = next(row for row in audit_objects if 'schemas' in row)
assert package_audit['passed'] == package_audit['packages'] and not package_audit['failures']
assert schema_audit['passed'] == schema_audit['schemas'] and not schema_audit['failures']
accept['finalChecks'] = {'affected': summary(affected), 'typecheck': 'passed', 'build': 'passed',
                       'packages': {'passed': package_audit['passed'], 'total': package_audit['packages']}, 'schemas': {'passed': schema_audit['passed'], 'total': schema_audit['schemas']},
                       'browser': {'checks': 48, 'cases': 14, 'externalRequests': 0},
                       'independentShapeOracle': {'agreed': oracle['agreed'], 'cases': oracle['cases']}}
accept['finalChecks']['regression'] = publication['regression']
accept['finalChecks']['uniqueGates'] = {'passed': counts['tests'], 'failed': 0, 'files': counts['files']}
accept['exploratoryChecks'] = {'broad': {**publication['regression'], 'tests': publication['regression']['passed']}, 'retainedGates': counts}
accept['subsequentCheckRepair'] = {'path': str(gatepath), 'sha256': digest(gatepath), 'nativeBrowserCommands': len(native['runs']),
                                 'scope': 'Every retained native/browser command freshly executed in the container; historical post-parent browser counts do not apply.'}
retired = {path: sha for path, sha in accept['sha256'].items() if not Path(path).is_file()}
if retired: accept['retiredFingerprints'] = {'reason': 'Paths removed by the parent API amendment; original fingerprints retained without a current verification claim.', 'sha256': retired}
accept['sha256'] = {path: digest(path) for path in accept['sha256'] if Path(path).is_file()}
for directory in ['src', 'scripts', 'spec', 'tests', 'native']:
    for path in subprocess.check_output(['git', 'ls-files', directory], text=True).splitlines():
        if Path(path).is_file() and path.endswith(('.ts', '.py', '.json', '.sql')): accept['sha256'][path] = digest(path)
accept['sha256'][str(gatepath)] = digest(gatepath)
accept['sha256'][str(out / 'container-runtime.json')] = digest(out / 'container-runtime.json')
accept['sha256'][affected['log']] = affected['logSha256']
save(acceptpath, accept)
regression = publication['regression']
sealpath = out / 'final-seal.json'
paths = [out / name for name in ['native-browser.json', 'auxiliary.json', 'regression.json', 'publication.json', 'gates.json',
                                'container-runtime.json', 'container-gates.json', 'container-integrity.json', 'container-affected.json']]
paths += [Path(gate['log']), Path(integrity['log']), Path(affected['log']), acceptpath]
save(sealpath, {'complete': True, 'sourceRevision': source, 'uniqueTests': regression['passed'] + counts['tests'],
                'uniqueTestFiles': regression['files'] + counts['files'], 'regressionTests': regression['passed'],
                'gateTests': counts['tests'], 'nativeBrowserInventoryCommands': len(native['runs']), 'currentProofConcepts': 6, 'sealingRuntime': sealing_runtime,
                'previousEvidence': previous(sealpath, source),
                'scope': 'Fresh container native/browser inventory, disjoint regression and complete gates; affected and auxiliary overlaps excluded. No native-equivalence or publisher-validator-parity claim.',
                'sha256': {str(path): digest(path) for path in paths}})
print(json.dumps({'sealed': True, 'uniqueTests': regression['passed'] + counts['tests'], 'gateTests': counts['tests']}))
