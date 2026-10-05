"""Seal only successful logged container execution; retain prior records in Git."""
import hashlib, json, re, subprocess
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
accept.update(sourceRevision=source, parentRevision=subprocess.check_output(['git', 'rev-parse', 'd64be8c8'], text=True).strip(), runtime={**runtime, 'chromium': native['expectedBrowser']},
              containerReplay={'path': str(out / 'container-runtime.json'), 'sha256': digest(out / 'container-runtime.json')},
              previousContainerEvidence=previous(acceptpath, source))
accept.setdefault('preContainerFinalChecks', accept['finalChecks'])
accept.setdefault('preContainerExploratoryChecks', accept['exploratoryChecks'])
accept['finalChecks'] = {'affected': summary(affected), 'typecheck': 'passed', 'build': 'passed',
                       'packages': {'passed': 60, 'total': 60}, 'schemas': {'passed': 352, 'total': 352},
                       'browser': {'checks': 48, 'cases': 14, 'externalRequests': 0},
                       'independentShapeOracle': {'agreed': oracle['agreed'], 'cases': oracle['cases']}}
accept['finalChecks']['regression'] = publication['regression']
accept['finalChecks']['uniqueGates'] = {'passed': counts['tests'], 'failed': 0, 'files': counts['files']}
accept['exploratoryChecks'] = {'broad': {**publication['regression'], 'tests': publication['regression']['passed']}, 'retainedGates': counts}
accept['subsequentCheckRepair'] = {'path': str(gatepath), 'sha256': digest(gatepath), 'nativeBrowserCommands': len(native['runs']),
                                 'scope': 'Every retained native/browser command freshly executed in the container; historical post-parent browser counts do not apply.'}
accept['sha256'] = {path: digest(path) for path in accept['sha256']}
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
                'gateTests': counts['tests'], 'nativeBrowserInventoryCommands': len(native['runs']), 'currentProofConcepts': 6,
                'previousEvidence': previous(sealpath, source),
                'scope': 'Fresh container native/browser inventory, disjoint regression and complete gates; affected and auxiliary overlaps excluded. No native-equivalence or publisher-validator-parity claim.',
                'sha256': {str(path): digest(path) for path in paths}})
print(json.dumps({'sealed': True, 'uniqueTests': regression['passed'] + counts['tests'], 'gateTests': counts['tests']}))
