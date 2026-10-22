"""Fault-inject campaign receipt failures in child processes; no native execution."""
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--fixture-root',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
runner=Path(__file__).resolve().parents[1]/'aggregate_native_e2e.py'
base=args.output.resolve();base.mkdir(parents=True,exist_ok=False)
results=[]
for mode in ('connect_failure','source_changed','receipt_write_failure'):
 work=base/mode;shutil.copytree(args.fixture_root.resolve(),work)
 (work/'aggregate-result.json').unlink(missing_ok=True)
 code='''import sys,types,runpy,os
from pathlib import Path
runner=Path(sys.argv[1]).resolve();mode=sys.argv[3];changed=False
original_read=Path.read_bytes;original_write=Path.write_text
def read(self):
 value=original_read(self)
 return value+b"# controlled source mutation" if changed and self.resolve()==runner else value
def write(self,*args,**kwargs):
 if mode=="receipt_write_failure" and self.name=="aggregate-result.json":raise OSError("controlled receipt write failure")
 return original_write(self,*args,**kwargs)
def connect(*args,**kwargs):
 global changed
 changed=mode=="source_changed"
 raise RuntimeError("controlled connect failure; native execution forbidden")
Path.read_bytes=read;Path.write_text=write
sys.modules["psycopg"]=types.SimpleNamespace(connect=connect)
os.environ["UMF_PG_TEST_DSN"]="controlled-no-native"
sys.argv=[str(runner),sys.argv[2]]
runpy.run_path(str(runner))
'''
 r=subprocess.run([sys.executable,'-I','-B','-c',code,str(runner),str(work),mode],capture_output=True,text=True,check=False)
 (work/'child.log').write_text(r.stdout+r.stderr)
 assert r.returncode!=0 and 'Exception ignored in atexit' not in r.stderr,(mode,r.stdout,r.stderr)
 receipt=work/'aggregate-result.json'
 if mode=='receipt_write_failure':
  assert not receipt.exists() and 'controlled receipt write failure' in r.stderr
 else:
  obj=json.loads(receipt.read_text());assert obj['status']=='FAILED' and obj['fixtureCleanupComplete']
  assert obj['sourceUnchanged']==(mode!='source_changed')
  assert ('source changed during aggregate qualification' if mode=='source_changed' else 'controlled connect failure') in r.stderr
 results.append({'case':mode,'exitCode':r.returncode,'passed':True})
(base/'result.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results))
