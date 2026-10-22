"""Actual private owner semantic allocation regressions, no native admission."""
import hashlib,json,os,re,subprocess,sys
from pathlib import Path
ROOT=Path('/Users/erik/.codex/worktrees/1598/umf');OWNER=Path('/Users/erik/Projects/weft');SELF=ROOT/'tools/security/weft-semantic-allocation.py'
if Path.cwd().resolve()!=ROOT or Path(__file__).resolve()!=SELF or len(sys.argv)!=1:raise RuntimeError('Unknown exact allocation test invocation')
TOOL=Path('/private/tmp/weft-toolchain/rustup/toolchains/1.90.0-aarch64-apple-darwin/bin')
inventory_path=ROOT/'tools/security/source_demand_inputs.py'
inventory_bytes=inventory_path.read_bytes()
inventory_namespace={'__file__':str(inventory_path),'__name__':'source_demand_inputs_captured'}
exec(compile(inventory_bytes,str(inventory_path),'exec'),inventory_namespace)
selected_inputs=inventory_namespace['selected_inputs']
paths,presence,aliases=selected_inputs(); paths.add(SELF)
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
pins={str(p):digest(p) for p in sorted(paths)}
if inventory_path.read_bytes()!=inventory_bytes or pins[str(inventory_path)]!=hashlib.sha256(inventory_bytes).hexdigest():raise RuntimeError('Captured input policy changed')
env={**os.environ,'PATH':str(TOOL)+os.pathsep+os.environ['PATH'],'CARGO_HOME':'/private/tmp/weft-toolchain/cargo','CARGO_TARGET_DIR':'/private/tmp/umf-security-weft-bridge-target'}
command=[str(TOOL/'cargo'),'test','--offline','--locked','-p','weft-core','--lib','--','--nocapture']
r=subprocess.run(command,cwd=OWNER,env=env,capture_output=True,text=True,timeout=300)
summaries=re.findall(r'^test result: ok\. (\d+) passed; (\d+) failed; (\d+) ignored; (\d+) measured; (\d+) filtered out; finished in [^\n]+$',r.stdout,re.MULTILINE)
current_paths,current_presence,current_aliases=selected_inputs(); current_paths.add(SELF)
fresh=inventory_path.read_bytes()==inventory_bytes and paths==current_paths and presence==current_presence and aliases==current_aliases and all(digest(p)==h for p,h in pins.items())
ok=r.returncode==0 and summaries==[('118','0','0','0','0')] and fresh
receipt={'status':'private-semantic-allocation-tests-passed' if ok else 'failed','sourceDigests':pins,'sourcesUnchanged':fresh,'configPresence':presence,'symlinkTargets':aliases,'execution':{'command':command,'cwd':str(OWNER),'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr},'testCount':118,'nativeImplementationQualified':False,'acceptanceCasesPromoted':[],'acceptanceCriteria':['US-056-AC7','US-056-AC10'],'scope':'Actual complete118-test core library execution, including independently authored source-to-scope correspondence, dual original-action accumulation and omission, self-join outputs/false branches, distinct complete candidates/zero-edge selection, legacy/new exact ledgers and a local 256-by256 demand-edge population. Private issuance borrows actual immutable coverage/context; no scope choice, obligation matcher, profile authentication, native execution or public lowering is qualified.'}
out=ROOT/'docs/helix/04-build/evidence/security/weft-semantic-allocation.json'
if out.exists():
 previous=out.read_bytes();archive=out.parent/'archive';archive.mkdir(exist_ok=True);(archive/('weft-semantic-allocation-'+hashlib.sha256(previous).hexdigest()+'.json')).write_bytes(previous)
out.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({'status':receipt['status'],'testCount':receipt['testCount'],'sourcesUnchanged':fresh}));raise SystemExit(0 if ok else 1)
