#!/usr/bin/env python3
"""Authenticate retained private wheel/proofs; never load UMF or build code."""
import argparse
import ast
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import zipfile

SOURCE = '3c0bb910c68712880459d76834f7beb8eb547104'
RUN = 41736469787
JOB = 126266839908
FAILED = 'test_private_native_envelope_exact_quota_and_one_below_refuse_before_publication'
WARM = 'test_private_same_handle_warm_replay_is_diagnostic_not_cold_feasibility'
TEST = 'python/tests/test_retained_codegen_native.py'
ALLOWED = {TEST, '.github/workflows/inspector-retained-continuation.yml',
           'tools/intake_inspector_retained_continuation.py',
           'tests/qualification/test_inspector_retained_continuation.py',
           'tests/qualification/fixtures/inspector-retained-continuation.json'}

def require(ok, message):
    if not ok: raise ValueError(message)


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''): h.update(chunk)
    return h.hexdigest()


def validate_run(run, jobs):
    require(run['id'] == RUN and run['head_sha'] == SOURCE and run['run_attempt'] == 1
            and run['event'] == 'workflow_dispatch' and run['workflow_id'] == 406306589
            and run['status'] == 'completed' and run['conclusion'] == 'failure', 'Original run binding differs')
    require(len(jobs['jobs']) == 1 and jobs['jobs'][0]['id'] == JOB, 'Original job differs')
    steps = {s['name']: s['conclusion'] for s in jobs['jobs'][0]['steps']}
    for name in ('Build only the private owner wheel with the existing locked hook',
                 'Independent native outer-envelope boundary controls',
                 'Fresh normal candidate install and existing affected control checks',
                 'Dispose only this hosted component target and consumer'):
        require(steps.get(name) == 'success', 'Original completed gate differs: ' + name)
    require(steps.get('Independent private native adapter and outer-envelope controls') == 'failure', 'Original failure differs')
    for name in ('Measure cold retained construction and unchanged public 17-case calls at 1M',
                 'Strict public retained-mode controls after measured cold fit'):
        require(steps.get(name) == 'skipped', 'Original missing-gate scope differs')


def extract(zip_path, dest, members):
    require(not dest.exists(), 'Intake destination must be fresh')
    with zipfile.ZipFile(zip_path) as archive:
        names = archive.namelist()
        require(len(names) == len(set(names)) and set(names) == set(members), 'Closed retained member roster differs')
        for info in archive.infolist():
            path = PurePosixPath(info.filename)
            require(not path.is_absolute() and '..' not in path.parts and '\\' not in info.filename
                    and not info.is_dir() and (info.external_attr >> 16) & 0o170000 in (0, 0o100000), 'Unsafe retained member')
            require(info.file_size == members[info.filename]['size'], 'Retained member size differs')
        # Roster/type/size checks precede extraction; payload hashes precede use.
        dest.mkdir()
        for name in names:
            target = dest / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(name) as src, target.open('xb') as dst:
                while chunk := src.read(1024 * 1024): dst.write(chunk)
            require(sha(target) == members[name]['sha256'], 'Retained member hash differs: ' + name)


def test_closure(original, corrected):
    def classes(text): return {c.name: c for c in ast.parse(text).body if isinstance(c, ast.ClassDef)}
    old, new = classes(original), classes(corrected)
    dump = lambda node: ast.dump(node, include_attributes=False)
    outside = lambda text: [ast.dump(n, include_attributes=False) for n in ast.parse(text).body if not (isinstance(n, ast.ClassDef) and n.name == 'PrivateNativeControlTests')]
    require(outside(original) == outside(corrected), 'Shared cumulative control/resources/public source changed')
    require(dump(old['PublicRetainedFeasibilityTests']) == dump(new['PublicRetainedFeasibilityTests']), 'Strict public tests changed')
    before = {n.name: n for n in old['PrivateNativeControlTests'].body if isinstance(n, ast.FunctionDef)}
    after = {n.name: n for n in new['PrivateNativeControlTests'].body if isinstance(n, ast.FunctionDef)}
    passed = [n for n in before if n.startswith('test_') and n != FAILED]
    require(len(passed) == 7, 'Original private gate census differs')
    observed = ast.parse("control.observed_failure = dict(code=caught.exception.code, message=str(caught.exception), path=caught.exception.path)").body[0]
    for name in before:
        if name == FAILED: continue
        require(name in after, 'Reused method absent: ' + name)
        candidate = after[name]
        if name == '_envelope_denial':
            # Sol-approved exact observation-only assignment; no other AST waiver.
            original_body = list(candidate.body)
            matches = [n for n in original_body if dump(n) == dump(observed)]
            require(len(matches) == 1, 'Exact reviewed observed_failure assignment required')
            candidate.body = [n for n in original_body if n is not matches[0]]
        require(dump(before[name]) == dump(candidate), 'Reused private fixture/control changed: ' + name)
    require(set(after) - set(before) == {WARM, '_trace_observer', '_retain_envelope_traces'}, 'Unexpected added private source')
    nonmethods = lambda c: [dump(n) for n in c.body if not isinstance(n, ast.FunctionDef)]
    require(nonmethods(old['PrivateNativeControlTests']) == nonmethods(new['PrivateNativeControlTests']), 'Private class fixture changed')
    require(FAILED in after and dump(before[FAILED]) != dump(after[FAILED]), 'Corrected failed method required')
    return passed


def main(args):
    root, owner, evidence = args.controller.resolve(), args.owner.resolve(), args.evidence.resolve()
    pins = json.loads((root / 'tests/qualification/fixtures/inspector-retained-continuation.json').read_text())
    git = lambda *a: subprocess.check_output(['git', '-C', str(root), *a], text=True).strip()
    require(git('rev-parse', 'HEAD') == args.controller_sha, 'Controller source differs')
    require(not git('status', '--porcelain', '--untracked-files=no'), 'Controller tracked files changed')
    changed = set(git('diff', '--name-only', SOURCE, 'HEAD').splitlines())
    require(changed <= ALLOWED and TEST in changed, 'Production/source closure changed or corrected independent test absent')
    require(subprocess.check_output(['git', '-C', str(owner), 'rev-parse', 'HEAD'], text=True).strip() == SOURCE, 'Original owner checkout differs')
    require(not subprocess.check_output(['git', '-C', str(owner), 'status', '--porcelain', '--untracked-files=no'], text=True).strip(), 'Original owner tracked files changed')
    require(sha(root / TEST) == args.corrected_test_sha256, 'Reviewed corrected test hash differs')
    passed = test_closure((owner / TEST).read_text(), (root / TEST).read_text())
    validate_run(json.loads((evidence/'run.json').read_text()), json.loads((evidence/'jobs.json').read_text()))
    artifact_rows = json.loads((evidence/'artifacts.json').read_text())['artifacts']
    retained = {}
    for key, row in pins['artifacts'].items():
        actual = [a for a in artifact_rows if a['id'] == row['id']]
        require(len(actual) == 1, 'Original artifact missing')
        actual = actual[0]
        require(not actual['expired'] and actual['name'] == row['name'] and actual['workflow_run']['id'] == RUN
                and actual['workflow_run']['head_sha'] == SOURCE and actual['digest'] == 'sha256:' + row['sha256'], 'Artifact API binding differs')
        archive = evidence / (key + '.zip')
        require(archive.stat().st_size == row['bytes'] and sha(archive) == row['sha256'], 'Retained ZIP differs')
        dest = evidence / key
        extract(archive, dest, row['members'])
        retained[key] = dest
    require(sha(evidence/'original-logs.zip') == pins['originalLogsSHA256'], 'Original job log archive differs')
    partial, cleanup = retained['partial'], retained['cleanup']
    original = json.loads((partial/'source-and-payload.json').read_text())
    require(original['source'] == SOURCE and original['limits'] == {'construction':1000000,'perCall':1000000}
            and original['privateFeasibilityOnly'] is True and original['publishable'] is False, 'Original source/allowances differ')
    cleanup_record = json.loads((cleanup/'cleanup.json').read_text())
    require(cleanup_record['source'] == SOURCE and cleanup_record['run'] == str(RUN)
            and cleanup_record['attempt'] == '1' and cleanup_record['ownedTargetAbsent'] is True
            and cleanup_record['ownedConsumerAbsent'] is True, 'Original cleanup differs')
    for name, marker in [('native-envelope-controls.log','6 passed; 0 failed'),('affected-existing-controls.log','8 passed'),
                         ('private-native-contract-controls.log','1 failed, 7 passed'),('pip-check.log','No broken requirements found.')]:
        require(marker in (partial/name).read_text(), 'Original gate log differs')
    wheel = partial / pins['wheel']['path']
    require(sha(wheel) == pins['wheel']['sha256'] and wheel.stat().st_size == pins['wheel']['bytes'], 'Original wheel differs')
    args.output.with_name('dependency-constraints.txt').write_text(''.join(name+'=='+version+'\n' for name,version in sorted(pins['dependencies'].items())))
    receipt = {'profile':'umf.private-inspector-retained-continuation-intake/1','artifactSource':SOURCE,
               'controllerSource':args.controller_sha,'correctedIndependentTestSHA256':args.corrected_test_sha256,
               'originalRun':RUN,'originalJob':JOB,'exactNormalResolverDependencies':pins['dependencies'],'wheel':dict(pins['wheel'],actualPath=str(wheel)),
               'reusedRustControls':6,'reusedLegacyControls':8,'reusedPrivateControls':passed,
               'rerunPrivateSelectors':['PrivateNativeControlTests::'+FAILED,'PrivateNativeControlTests::'+WARM],
               'newGates':['cold-construction/public-17-51-probe','PublicRetainedFeasibilityTests'],
               'maximumWorkConstruction':1000000,'maximumWorkPerCall':1000000,
               'readyForEnrollment':False,'publishable':False,'nativeRebuild':False}
    args.output.write_text(json.dumps(receipt,indent=2)+'\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    for name in ('controller','owner','evidence','output'): parser.add_argument('--'+name,type=Path,required=True)
    for name in ('controller-sha','corrected-test-sha256'): parser.add_argument('--'+name,required=True)
    main(parser.parse_args())
