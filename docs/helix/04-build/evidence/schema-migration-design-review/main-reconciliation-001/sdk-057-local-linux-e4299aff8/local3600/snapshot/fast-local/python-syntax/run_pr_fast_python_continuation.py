#!/usr/bin/env python3
"""Run only the still-unattempted Python syntax command inside attempt004's original budget."""
import datetime, hashlib, importlib.util, json, pathlib, time
BASE = pathlib.Path('/private/tmp/run_pr_fast_local_v4.py')
BASE_SHA = '09a7eae86f13ec6bb22b2477aca6c05911fb692f101097a7dc79df326f0782b3'
ROOT = pathlib.Path('/private/tmp/migration-pr-fast-local-e4299aff8-004')
DRIVER = pathlib.Path('/private/tmp/run_pr_fast_python_continuation_receipt.json')
assert hashlib.sha256(BASE.read_bytes()).hexdigest() == BASE_SHA
spec = importlib.util.spec_from_file_location('prfast', BASE)
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
prior = json.loads((ROOT / 'evidence/receipt.json').read_text())
assert prior['status'] == 'FAIL_OR_UNKNOWN'
assert [row['name'] for row in prior['commands']] == ['source-copy','runtime-identity','locked-dependency-install']
assert prior['commands'][-1]['timedOut'] is True and prior['commands'][-1]['exitCode'] == -9
finished = datetime.datetime.fromisoformat(prior['finishedUtc'].replace('Z','+00:00'))
now = datetime.datetime.now(datetime.timezone.utc)
base_elapsed = prior['elapsedSeconds'] + max(0.0,(now-finished).total_seconds())
logs = list((ROOT/'evidence').glob('*.stdout.log')) + list((ROOT/'evidence').glob('*.stderr.log'))
prior_logs = sum(p.stat().st_size for p in logs)
assert prior_logs == prior['aggregateCapturedLogBytes'] and prior_logs <= mod.LOG_CAP
work = ROOT/'work'
before = json.loads((work/'evidence/source-manifest-before.json').read_text())
run = mod.Run(ROOT); run.started = time.monotonic() - base_elapsed; run.deadline = run.started + mod.TOTAL_SECONDS; run.log_bytes = prior_logs
command = 'set -eu; export HOME=/work/home PYTHONPYCACHEPREFIX=/work/pycache; python -m compileall -q python scripts'
row = run.container('python-syntax-compile-continuation', command, 'none', 90, work)
after = mod.input_manifest(work/'source')
assert before['sha256'] == after['sha256'], 'copied source changed during compileall'
mod.write_json(ROOT/'evidence/source-manifest-after-python.json', after)
compiled = [p for p in (work/'pycache').rglob('*.pyc') if p.is_file()]
receipt = {'profile':'umf.pr-fast-local-equivalent-python-continuation/1','status':'LOCAL_LINUX_PY311_SYNTAX_PASS' if row['exitCode']==0 else 'FAIL_OR_UNKNOWN',
 'baseReceiptPath':str(ROOT/'evidence/receipt.json'),'baseReceiptSha256':hashlib.sha256((ROOT/'evidence/receipt.json').read_bytes()).hexdigest(),
 'baseDriverSha256':BASE_SHA,'continuationDriverSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
 'sourceCommit':prior['source']['expectedCommit'],'sourceTree':prior['source']['expectedTree'],'sourceCopyManifestSha256':before['sha256'],
 'runtimeImage':prior['runtimeImage'],'python':'Python 3.11.17','requiredWorkflowPython':'Python 3.12',
 'command':row,'compiledBytecodeFiles':len(compiled),'sourceManifestUnchanged':True,
 'totalAggregateLimitSeconds':mod.TOTAL_SECONDS,'aggregateElapsedAtContinuationStartSeconds':round(base_elapsed,3),
 'aggregateElapsedAtContinuationEndSeconds':round(time.monotonic()-run.started,3),
 'aggregateLogLimitBytes':mod.LOG_CAP,'aggregateCapturedLogBytes':run.log_bytes,
 'cleanup':run.cleanup,'qualification':'Local Linux syntax check only; does not establish the remaining pr-fast checks or Python 3.12.'}
mod.write_json(DRIVER,receipt)
print(json.dumps(receipt,sort_keys=True,indent=2))
