"""Publish or verify compact, source-exact TLC evidence; retain compressed original traces."""
import argparse
import gzip
import hashlib
import json
import re
import runpy
from datetime import datetime, timezone
from pathlib import Path

BASE = Path(__file__).resolve().parent
OUT = BASE.parent / 'evidence' / 'protocol'
digest = lambda data: hashlib.sha256(data).hexdigest()
file_digest = lambda path: digest(path.read_bytes())

def verify_case(case, log):
    found = re.search(r'Invariant (\w+) is violated', log)
    actual = found[1] if found else None
    if case['expected']:
        assert case['exitCode'] == 12 and actual == case['expected'], case['name']
    else:
        assert case['exitCode'] == 0 and 'Model checking completed. No error has been found.' in log, case['name']
    return actual

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--verify', action='store_true')
    a = p.parse_args()
    model = BASE / 'Protocol.tla'
    runner = BASE / 'run_protocol.py'
    runtime = runpy.run_path(str(runner))
    witness_runner = BASE / 'run_protocol_witnesses.py'
    witness_model = BASE / 'ProtocolWitnesses.tla'
    primary_cases = runtime['cases']()
    cases = primary_cases + runpy.run_path(str(witness_runner))['cases']()
    if a.verify:
        report = json.loads((OUT / 'report.json').read_text())
        assert report['allPassed'] and report['requiredCases'] == len(cases)
        assert report['jarSha256'] == runtime['JAR_SHA']
        assert report['modelSha256'] == file_digest(model)
        assert report['runnerSha256'] == file_digest(runner)
        assert report['witnessRunnerSha256'] == file_digest(witness_runner)
        assert report['witnessModelSha256'] == file_digest(witness_model)
        assert report['publisherSha256'] == file_digest(Path(__file__).resolve())
        assert {c['name'] for c in cases} == {c['name'] for c in report['results']}
        expected_cases = {c['name']: c for c in cases}
        for case in report['results']:
            assert all(case[k] == v for k,v in expected_cases[case['name']].items()), case['name']
            assert case['module'] == expected_cases[case['name']].get('module','Protocol')
            config = BASE / case['configuration']
            assert file_digest(config) == case['configSha256'], case['name']
            packed = (OUT / case['compressedLog']).read_bytes()
            assert digest(packed) == case['compressedLogSha256'], case['name']
            raw = gzip.decompress(packed)
            assert digest(raw) == case['logSha256'], case['name']
            verify_case(case, raw.decode())
        print(json.dumps(dict(verifiedCases=len(cases), allPassed=True)))
        return
    entries = []
    timelines = ['# Protocol counterexamples and reachability traces', '',
                 'These action sequences are extracted from the retained original TLC traces.',
                 'A named invariant violation is expected for each mutant or negative witness.',
                 'Compressed logs retain every original state and diagnostic.', '']
    java_version = None
    for expected in cases:
        name = expected['name']
        case = json.loads((OUT / (name + '.json')).read_text())
        assert case['passed'] and case['modelSha256'] == file_digest(model), name
        assert case['runnerSha256'] == file_digest(witness_runner if expected.get('module') == 'ProtocolWitnesses' else runner), name
        if expected.get('module') == 'ProtocolWitnesses':
            assert case['witnessModelSha256'] == file_digest(witness_model), name
        assert all(case[k] == expected[k] for k in expected), name
        cfg = BASE / ('protocol-' + name + '.cfg')
        assert file_digest(cfg) == case['configSha256'], name
        raw = (OUT / (name + '.log')).read_bytes()
        assert digest(raw) == case['logSha256'], name
        actual = verify_case(case, raw.decode())
        packed = gzip.compress(raw, mtime=0)
        target = OUT / (name + '.log.gz')
        target.write_bytes(packed)
        actions = re.findall(r'State \d+: <([^\n]+)>', raw.decode())
        compact = [{**{k: case[k] for k in ['name','n','dispositions','faults','faultProfile','results','responsive','lookupLimit','variant','expected','temporal','exitCode','stateCounts','completeWithoutViolation']},
                    'module':case.get('module','Protocol'),'actualViolation':actual,'configuration':cfg.name,'configSha256':case['configSha256'],
                    'compressedLog':target.name,'compressedLogSha256':digest(packed),'logSha256':digest(raw)}]
        entries.extend(compact)
        java_version = case['javaVersion']
        if actions:
            timelines += ['## ' + name, '', 'Expected violation: `' + str(actual) + '`.', '',
                          ' → '.join('`' + re.sub(r' line .*', '', step) + '`' for step in actions), '']
    report = dict(requiredCases=len(cases), primaryCases=len(primary_cases), supplementalWitnesses=len(cases)-len(primary_cases), allPassed=True, publishedUtc=datetime.now(timezone.utc).isoformat(),
                  modelSha256=file_digest(model), runnerSha256=file_digest(runner), witnessRunnerSha256=file_digest(witness_runner), witnessModelSha256=file_digest(witness_model), publisherSha256=file_digest(Path(__file__).resolve()),
                  jarSha256=case['jarSha256'], javaVersion=java_version,
                  assurance='Completed bounded coordination checks; no unbounded theorem or implementation refinement',
                  bounds=['One trusted namespace, one immutable instance; two input labels',
                          'Two-step combined-fault profiles; three-step crash and stable progress cuts',
                          'One volatile-observation crash/restart, one lease takeover, one action retirement, one action-authority revocation, one operator revocation',
                          'Faults begin after durable submit; post-terminal control changes and retirement/revocation of settled slots omitted',
                          'Each invocation slot has a distinct fixed action/binding; shared-revision aliasing is outside these cases',
                          'One same-ticket redelivery; lookup limit one, or two in crash-recovery cuts; two abstract elapsed-budget ticks',
                          'Exact result classes committed/rejected/conflict/failed; three-step crash cut uses committed/failed',
                          'First step action/irreversible/qualified no-effect profiles; remaining steps action-compensated'],
                  assumptions=['Atomic durable native effect and original disposition; closed-ticket custody is additional to base tx/1 replay',
                               'Policy revocation serializes with its qualified native transaction; admitted revisions may finish after retirement',
                               'Evidence and authenticated bindings have trusted issuer/scope predicates; no cryptographic or policy implementation proof',
                               'Stable liveness cuts disable faults, require responsive lookups and weak fairness separately for worker/gateway/provider/observer'],
                  exclusions=['Wire parsing, full typed/reference admission and value domains are allocated to schema/library conformance',
                              'Submission/control replay byte equality, complete audit encoding and multi-tenant policy enforcement require separate native custody witnesses',
                              'Real elapsed clocks, all 32 steps, unbounded failures/concurrency, storage capacity and implementation refinement are not proved',
                              'No saga executor, installed browser binding or production provider is qualified by these checks'],results=entries)
    (OUT / 'report.json').write_text(json.dumps(report,indent=2)+'\n')
    (OUT / 'traces.md').write_text('\n'.join(timelines).rstrip()+'\n')
    print(json.dumps(dict(publishedCases=len(cases), allPassed=True)))

if __name__ == '__main__':
    main()
