"""Pinned installed-SDK proof that actual AshlarTarget has no SDK write ports."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import zipfile
from pathlib import Path

from access_type_diagnostics import validate_negative


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('environment','generated-root','ashlar-source','work-dir','snapshot'):
        parser.add_argument('--'+name,type=Path,required=True)
    args=parser.parse_args();repo=Path(__file__).resolve().parent.parent
    environment=args.environment.resolve();generated=args.generated_root.resolve();host=args.ashlar_source.resolve();out=args.work_dir.resolve();out.mkdir(parents=True,exist_ok=True)
    snapshot=json.loads(args.snapshot.read_text());wheel=Path(snapshot['wheel'])
    if hashlib.sha256(wheel.read_bytes()).hexdigest()!=snapshot['wheelSha256'] or Path(snapshot['python']).resolve()!=(environment/'bin/python').resolve():
        raise AssertionError('immutable installed snapshot differs')
    site=Path(subprocess.check_output([str(environment/'bin/python'),'-I','-c','import sysconfig;print(sysconfig.get_path("purelib"))'],text=True).strip())
    with zipfile.ZipFile(wheel) as archive:
        payloads={name:hashlib.sha256(archive.read(name)).hexdigest() for name in archive.namelist() if name.startswith('umf_access/') and not name.endswith('/')}
    if any(hashlib.sha256((site/name).read_bytes()).hexdigest()!=digest for name,digest in payloads.items()):
        raise AssertionError('installed SDK payload differs from wheel')
    def inventory(base):
        return {str(p.relative_to(base)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(base.rglob('*.py')) if '__pycache__' not in p.parts}
    start=inventory(host);generated_start=inventory(generated)
    if 'ashlar/access.py' not in start:
        raise AssertionError('actual AshlarTarget source required')
    expectations=json.loads((repo/'tests/compilation/python/static/engine-actions-negative-sites.json').read_text())
    files=[repo/case['path'] for case in expectations['cases']]
    env={k:v for k,v in os.environ.items() if k not in ('PYTHONPATH','MYPYPATH')}
    env['MYPYPATH']=os.pathsep.join(map(str,(generated,host)));env['PYTHONDONTWRITEBYTECODE']='1'
    report={'scope':'actual AshlarTarget lacks SDK action/replaying-action protocols; no native authority inference','snapshot':snapshot,'hostSourceStart':start,'generatedSourceStart':generated_start,'sdkPayloads':payloads,'temporal':'HELD','checkers':{}}
    for tool in ('mypy','pyright','ty'):
        executable=environment/'bin'/tool
        version=subprocess.check_output([str(executable),'--version'],text=True).strip()
        if version.split()[1]!=expectations['checkers'][tool]:raise AssertionError('checker pin mismatch')
        command=[str(executable)]
        if tool=='mypy':command+=['--python-executable',str(environment/'bin/python'),'--python-version','3.11','--check-untyped-defs','--namespace-packages','--explicit-package-bases','--follow-imports=silent','--cache-dir',str(out/'mypy-cache'),*map(str,files)]
        elif tool=='ty':command+=['check','--python-version','3.11','--python',str(environment),'--output-format','concise',*[arg for p in (site,generated,host) for arg in ('--extra-search-path',str(p))],*map(str,files)]
        else:
            config=out/'pyright.json';config.write_text(json.dumps({'include':[os.path.relpath(p,out) for p in files],'extraPaths':list(map(str,(site,generated,host))),'typeCheckingMode':'basic','pythonVersion':'3.11'}));command+=['--project',str(config),'--pythonpath',str(environment/'bin/python'),'--outputjson']
        result=subprocess.run(command,cwd=repo,env=env,text=True,capture_output=True,check=False)
        text=result.stdout+result.stderr;(out/(tool+'.log')).write_text(text)
        diagnostics=validate_negative(tool,text,expectations,repo,returncode=result.returncode,files=files)
        report['checkers'][tool]={'version':version,'exitCode':result.returncode,'diagnostics':[{'path':d.path,'line':d.line,'rule':d.rule} for d in diagnostics]}
    report['hostSourceEnd']=inventory(host)
    report['generatedSourceEnd']=inventory(generated)
    report['status']='PASS' if start==report['hostSourceEnd'] and generated_start==report['generatedSourceEnd'] else 'FAILED'
    (out/'result.json').write_text(json.dumps(report,indent=2)+'\n')
    if report['status']!='PASS':raise AssertionError('Ashlar source changed during check')
    print(json.dumps({'status':'PASS','sourceFiles':len(start),'negativeSites':sum(len(c['sites']) for c in expectations['cases']),'sdkPayloads':len(payloads)}))


if __name__=='__main__':
    main()
