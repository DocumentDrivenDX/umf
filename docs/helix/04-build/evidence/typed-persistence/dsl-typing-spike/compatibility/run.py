"""Exact diagnostic replay for the bounded compatibility fixture."""
from __future__ import annotations
from collections import Counter
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent

def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def validate_profile(profile: dict) -> None:
    if platform.python_version() != profile['python']:
        raise ValueError('Python pin mismatch')
    for name, version in profile['dependencies'].items():
        if importlib.metadata.version(name) != version:
            raise ValueError(f'dependency pin mismatch: {name}')
    for name, digest in profile['configurationSha256'].items():
        if sha(ROOT / name) != digest:
            raise ValueError(f'checker configuration mismatch: {name}')
    runtime = profile['runtimeAbi']
    if importlib.metadata.version(runtime['distribution']) != runtime['version']:
        raise ValueError('runtime distribution pin mismatch')
    import umf_access
    if umf_access.RUNTIME_ABI != runtime['abi']:
        raise ValueError('runtime protocol ABI mismatch')
    if ROOT in Path(umf_access.__file__).resolve().parents:
        raise ValueError('runtime resolved to development source')
    wheel = ROOT/'artifacts'/f'umf_access-{runtime["version"]}-py3-none-any.whl'
    if sha(wheel) != profile['runtimeWheelSha256']:
        raise ValueError('runtime wheel pin mismatch')
    with zipfile.ZipFile(wheel) as archive:
        if Path(umf_access.__file__).read_bytes() != archive.read('umf_access/__init__.py'):
            raise ValueError('installed runtime bytes differ from pinned wheel')


def main() -> int:
    profile=json.loads((ROOT/'profile.json').read_text())
    validate_profile(profile)
    output=ROOT/'results'
    output.mkdir(exist_ok=True)
    env=os.environ.copy()
    env['MYPYPATH']=str(ROOT/'generated')
    env['PYTHONPATH']=str(ROOT/'generated')
    env['MYPY_CACHE_DIR']=str(Path(tempfile.gettempdir())/'umf-tp001-mypy-cache')
    env['PYTHONDONTWRITEBYTECODE']='1'
    records=[]
    def execute(label: str, command: list[str], wanted: list[tuple[int,str]] | None=None) -> dict:
        result=subprocess.run(command,cwd=ROOT,env=env,text=True,capture_output=True)
        (output/f'{label}.stdout').write_text(result.stdout)
        (output/f'{label}.stderr').write_text(result.stderr)
        observed=[]
        if wanted is not None:
            if '-m' in command and 'mypy' in command:
                diagnostics=[json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
                observed=[(d['line'],d['code']) for d in diagnostics if d['severity']=='error']
            else:
                diagnostics=json.loads(result.stdout)['generalDiagnostics']
                observed=[(d['range']['start']['line']+1,d.get('rule','unknown')) for d in diagnostics if d['severity']=='error']
            passed=result.returncode==1 and Counter(observed)==Counter(wanted)
        else:
            passed=result.returncode==0
        record={'label':label,'command':command,'exitCode':result.returncode,'passed':passed}
        if wanted is not None: record.update(expected=wanted,observed=observed)
        records.append(record)
        return record
    mypy=[sys.executable,'-m','mypy','--config-file','mypy.ini','--output','json']
    pyright=[sys.executable,'-m','pyright','--outputjson','--pythonpath',sys.executable,'--project','pyrightconfig.json']
    execute('presence',[sys.executable,'-m','unittest','discover','-s','.','-p','test_presence.py'])
    execute('emission-controls',[sys.executable,'-m','unittest','discover','-s','.','-p','test_emission.py'])
    execute('profile-controls',[sys.executable,'-m','unittest','discover','-s','.','-p','test_profile.py'])
    for name,command in [('mypy',mypy),('pyright',pyright)]:
        execute(name+'-positive',command+['generated/models.py','generated/calls.py','positive.py'])
        expected=json.loads((ROOT/'expected.json').read_text())
        for filename,diagnostics in sorted(expected.items()):
            execute(name+'-'+filename[:-3],command+['negative/'+filename],[(diagnostics['line'],rule) for rule in diagnostics[name]])
    sources={str(p.relative_to(ROOT)):sha(p) for p in sorted(ROOT.rglob('*')) if p.is_file() and not set(p.relative_to(ROOT).parts)&{'results','__pycache__','.mypy_cache'}}
    report={'kind':'bounded-compatibility-spike','timestamp':datetime.now(timezone.utc).isoformat(),'sourceSpecificationRevision':'dd7b81f6bb5aa6a08cb97bb8c4882eed683dcaba','status':'pass' if all(r['passed'] for r in records) else 'fail','sliceStatus':'BOUNDED_COMPATIBILITY_ACCEPTED; production replay UNTESTED','scope':'spike-emitted fixture against exact installed minimal runtime wheel; not production generator/runtime acceptance','sources':sources,'governingSources':{str(path.relative_to(ROOT.parents[6])):sha(path) for path in [ROOT.parents[6]/name for name in ('docs/helix/04-build/typed-persistence-design.md','docs/helix/02-design/contracts/CONTRACT-067-access-sdk-generator.md','docs/helix/02-design/contracts/CONTRACT-068-generated-python-types.md','docs/helix/02-design/contracts/CONTRACT-071-query-command-catalog.md','docs/helix/02-design/technical-designs/TD-082-type-checked-query-declarations.md','docs/helix/04-build/evidence/typed-persistence/b-tp-000/verification.json')]},'profile':profile,'commands':records,'passedCommands':sum(r['passed'] for r in records),'totalCommands':len(records),'remaining':['Production generator and runtime ABI replay','Driver/platform and native target qualification']}
    (output/'report.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({'status':report['status'],'passedCommands':report['passedCommands'],'totalCommands':len(records),'failures':[r['label'] for r in records if not r['passed']]}))
    return 0 if report['status']=='pass' else 1

if __name__ == '__main__':
    raise SystemExit(main())
