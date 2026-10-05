"""Replay retained check commands without fabricating or publishing successful results."""
import argparse, hashlib, json, os, subprocess, shutil, concurrent.futures
from pathlib import Path
ROOT = Path.cwd()
OUT = Path('fixtures/validation/core-check-refresh')
BASE = 'cc1446fdf919107ec2782d6eaa85cc8bf38fffa6'
def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def inventory(name):
    return json.loads(subprocess.check_output(['git','show',f'{BASE}:fixtures/validation/{name}.json']))
def commands():
    rows=[]
    for name in ['field-gate-refresh-evidence','key-native-refresh','key-gate-refresh-evidence']:
        rows += [r['command'] for r in inventory(name)['runs']]
    relationship=json.loads(subprocess.check_output(['bun','-e',"import {relationshipRefreshCommands} from './scripts/core-ideals/relationship-gate-inputs'; process.stdout.write(JSON.stringify(relationshipRefreshCommands));"]))
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'relationship-commands.json').write_text(json.dumps(relationship,indent=2)+'\n')
    rows += relationship
    seen=set();result=[]
    for c in rows:
        c=list(c)
        if len(c)>1 and c[1]=='test': continue  # counted regression is a separate execution
        if c[0].endswith('/python'): c[0]='.venv/bin/python'
        key=tuple(c)
        if key not in seen: seen.add(key);result.append(c)
    # Build once at the beginning: later builds erase specialized browser bundles.
    first=[c for c in result if c[:2]==['bun','run']]
    return first+[c for c in result if c[:2]!=['bun','run']]
def run(resume):
    OUT.mkdir(parents=True,exist_ok=True)
    plan=commands();manifest=OUT/'native-browser.json'
    record=json.loads(manifest.read_text()) if resume and manifest.exists() else {'complete':False,'baselineRevision':BASE,'expectedBrowser':os.environ.get('UMF_EXPECTED_CHROMIUM_VERSION','148.0.7778.0'),'commands':plan,'runs':[],'failedAttempts':[]}
    assert record['commands']==plan,'Command inventory changed; start a new replay'
    while record['runs'] and record['runs'][-1]['exitCode']!=0:
        failed=record['runs'].pop()
        old=Path(failed['log']);kept=OUT/f"failed-{len(record['failedAttempts'])+1:03d}.log"
        shutil.copyfile(old,kept);failed['log']=str(kept)
        record['failedAttempts'].append(failed)
    for r in record['runs']: assert digest(r['log'])==r['logSha256'],'Execution log changed'
    for i,c in enumerate(plan[len(record['runs']):],start=len(record['runs'])):
        print(json.dumps({'step':i+1,'total':len(plan),'command':c}),flush=True)
        log=OUT/f'{i+1:03d}.log'
        with log.open('wb') as f: p=subprocess.run(c,stdout=f,stderr=subprocess.STDOUT,env=os.environ)
        record['runs'].append({'command':c,'exitCode':p.returncode,'log':str(log),'logSha256':digest(log)})
        manifest.write_text(json.dumps(record,indent=2)+'\n')
        if p.returncode: raise SystemExit(f'Failed {c}; inspect {log}')
    record['complete']=True
    manifest.write_text(json.dumps(record,indent=2)+'\n')
    print(json.dumps({'complete':True,'commands':len(plan)}),flush=True)
def prepare_namespaces():
    root=Path('.cache/tablespec-python/tablespec');root.mkdir(parents=True,exist_ok=True)
    for source in Path('native/tablespec').glob('*runtime/*.py'):
        target=root/source.name
        if not target.exists():target.symlink_to('../../../'+str(source))
    for directory in ['inference','schemas']:(root/directory).mkdir(exist_ok=True)
    for target,source in [('inference/domain_types.py','relationship-runtime/domain_types.py'),('domain_types.yaml','relationship-runtime/domain_types.yaml'),('schemas/generators.py','cardinality-runtime/generators.py')]:
        p=root/target
        if not p.exists():p.symlink_to(Path(os.path.relpath(Path('native/tablespec')/source,p.parent)))
    for name in ['rdf-venv','linkml-venv']:
        p=Path('.cache')/name
        if not p.exists():p.symlink_to('../.venv',target_is_directory=True)
def counted_regression():
    paths=sorted(p for p in subprocess.check_output(['rg','--files','tests'],text=True).splitlines() if p.endswith('.test.ts') and not ('/core-ideals/' in p and (p.endswith('conformance.test.ts') or p.endswith('evidence.test.ts'))))
    groups=[[],[],[],[]]
    for path in paths:
        category=path.split('/')[1]
        if category in ['rdf','rdfxml','jsonld','shacl']:
            index=sum(len(g) for g in groups[:2])%2
        elif category in ['typespec','smithy','openapi','json-schema','protobuf','projections','graphql']:index=2
        else:index=3
        groups[index].append(path)
    def execute(item):
        i,group=item;command=['bun','test',*group];log=OUT/f'regression-{i+1}.log'
        with log.open('wb') as f: child=subprocess.run(command,stdout=f,stderr=subprocess.STDOUT,env=os.environ)
        return {'command':command,'exitCode':child.returncode,'log':str(log),'logSha256':digest(log)}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: rows=list(pool.map(execute,enumerate(groups)))
    (OUT/'regression.json').write_text(json.dumps({'runs':rows,'scope':'Disjoint explicit live-test file shards; eight admission/evidence files are checked separately'},indent=2)+'\n')
    if any(r['exitCode'] for r in rows):raise SystemExit('Live regression failed; inspect shard logs')
def auxiliary():
    relationship=json.loads((OUT/'relationship-commands.json').read_text())
    plan=[c for c in relationship if c[:2]==['bun','test']]+[
        ['.venv/bin/python','scripts/core-ideals/field-tablespec-oracle.py'],
        ['.venv/bin/python','scripts/core-ideals/field-tablespec-projection-oracle.py'],
        ['bun','scripts/core-semantic-types-browser.ts'],['bun','run','typecheck'],['bun','run','test:schemas']]
    record={'runs':[]}
    for i,c in enumerate(plan):
        log=OUT/f'auxiliary-{i+1}.log'
        with log.open('wb') as f: child=subprocess.run(c,stdout=f,stderr=subprocess.STDOUT,env=os.environ)
        record['runs'].append({'command':c,'exitCode':child.returncode,'log':str(log),'logSha256':digest(log)})
        (OUT/'auxiliary.json').write_text(json.dumps(record,indent=2)+'\n')
        if child.returncode:raise SystemExit('Auxiliary check failed; inspect '+str(log))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--resume',action='store_true');p.add_argument('--regression',action='store_true');p.add_argument('--auxiliary',action='store_true');p.add_argument('--prepare-namespaces',action='store_true');args=p.parse_args()
    if args.prepare_namespaces:prepare_namespaces()
    elif args.regression:counted_regression()
    elif args.auxiliary:auxiliary()
    else:run(args.resume)
