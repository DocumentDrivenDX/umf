# SPDX-License-Identifier: MIT OR Apache-2.0
"""Check generated declarations and exact reviewed misuse sites with three checkers."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess
from access_type_diagnostics import validate_negative

parser=argparse.ArgumentParser()
parser.add_argument('--environment',type=Path,required=True)
parser.add_argument('--work-dir',type=Path,required=True)
parser.add_argument('--generated-dir',type=Path,help='Verify an already generated package inventory, without running a generator')
args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
work=args.work_dir.resolve();work.mkdir(parents=True,exist_ok=True)
environment=args.environment.resolve();generated=args.generated_dir.resolve() if args.generated_dir else work/'generated'
base=root/'tests/unified/native-types'
if args.generated_dir is None:
    subprocess.run(['bun',str(root/'tests/unified/table-client-fixture.ts'),str(generated)],cwd=root,check=True)
    subprocess.run(['bun',str(root/'tests/unified/table-client-fixture.ts'),str(generated),'--domains'],cwd=root,check=True)
negative=base/'negative.py'
domain_negative=base/'domain_negative.py'
rules={6:('arg-type','reportArgumentType','invalid-argument-type'),7:('call-arg','reportCallIssue','missing-argument'),8:('arg-type','reportArgumentType','invalid-argument-type'),9:('attr-defined','reportAttributeAccessIssue','unresolved-attribute'),10:('attr-defined','reportAttributeAccessIssue','unresolved-attribute')}
lines=negative.read_text().splitlines()
spec={'version':'umf-static-negative-sites/0.1','cases':[{'path':negative.relative_to(root).as_posix(),'sourceSha256':hashlib.sha256(negative.read_bytes()).hexdigest(),'sites':[{'line':line,'source':lines[line-1].strip(),'rules':dict(zip(('mypy','pyright','ty'),([r] for r in values)))}for line,values in rules.items()]}]}
domain_rules={n:('arg-type','reportArgumentType','invalid-argument-type') for n in range(8,12)}
domain_rules[12]=('call-arg','reportCallIssue','unknown-argument')
domain_lines=domain_negative.read_text().splitlines()
spec['cases'].append({'path':domain_negative.relative_to(root).as_posix(),'sourceSha256':hashlib.sha256(domain_negative.read_bytes()).hexdigest(),'sites':[{'line':line,'source':domain_lines[line-1].strip(),'rules':dict(zip(('mypy','pyright','ty'),([r] for r in values)))}for line,values in domain_rules.items()]})
report={}
for tool in ('mypy','pyright','ty'):
    report[tool]={}
    for phase in ('positive','negative'):
        files=[generated/'native_demo',generated/'domain_demo',base/'positive.py',base/'domain_positive.py'] if phase=='positive' else [negative,domain_negative]
        command=[str(environment/'bin'/tool)]
        if tool=='mypy':command+=['--python-version','3.11','--check-untyped-defs','--cache-dir',str(work/'mypy-cache'),*map(str,files)]
        elif tool=='ty':command+=['check','--python-version','3.11','--python',str(environment),'--extra-search-path',str(generated),'--output-format','concise',*map(str,files)]
        else:
            config=work/(phase+'.json')
            config.write_text(json.dumps({'include':[os.path.relpath(f,work) for f in files],'extraPaths':[str(generated)],'typeCheckingMode':'basic','pythonVersion':'3.11'}))
            command+=['--project',str(config),'--outputjson']
        result=subprocess.run(command,cwd=root,env=dict(os.environ,MYPYPATH=str(generated)),capture_output=True,text=True)
        output=result.stdout+result.stderr
        (work/(tool+'-'+phase+'.log')).write_text(output)
        if phase=='positive':assert result.returncode==0,output
        else:validate_negative(tool,output,spec,root,returncode=result.returncode,files=[negative,domain_negative])
        report[tool][phase]={'passed':True,'exitCode':result.returncode}
(work/'results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
