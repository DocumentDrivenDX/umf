#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Pin explicitly selected conformance files to Git source bytes. Does not acquire or execute."""
import argparse, hashlib, json, subprocess
from pathlib import Path

def safe(path):
 if not isinstance(path,str) or not path or '\\' in path or ':' in path or any(ord(c)<32 or ord(c)==127 for c in path):raise ValueError('Unsafe path')
 parts=path.split('/')
 if any(p in ('','.','..') for p in parts):raise ValueError('Unsafe path')
 return path

def build(root,revision,selection_file):
 def git(*args):return subprocess.check_output(['git','-C',str(root),*args])
 if len(revision) not in (40,64) or any(c not in '0123456789abcdef' for c in revision):raise ValueError('Exact source commit required')
 if git('rev-parse',revision+'^{commit}').decode().strip()!=revision:raise ValueError('Source revision mismatch')
 config=json.loads(selection_file.read_text())
 if not isinstance(config.get('id'),str) or not config['id']:raise ValueError('Suite id required')
 selections=config.get('selections')
 if not isinstance(selections,dict) or not selections:raise ValueError('Explicit selections required')
 needed=set();out={}
 for key,value in selections.items():
  cases=value.get('caseIds');paths=value.get('paths')
  if not key or not isinstance(cases,list) or not cases or any(not isinstance(c,str) or not c for c in cases) or len(set(cases))!=len(cases):raise ValueError('Explicit case inventory required')
  if not isinstance(paths,list) or not paths or len(set(paths))!=len(paths):raise ValueError('Explicit unique paths required')
  for p in paths:needed.add(safe(p))
  item={'assets':paths,'caseIds':cases}
  if value.get('entrypoint') is not None:
   entry=safe(value['entrypoint'])
   if entry not in paths:raise ValueError('Entrypoint outside selection')
   item['entrypoint']=entry
  out[key]=item
 entries={}
 for raw in git('ls-tree','-rz','-l',revision,*(['--',*sorted(needed)] if len(needed)<=256 else [])).split(b'\0'):
  if not raw:continue
  meta,name=raw.split(b'\t',1);path=name.decode()
  if path not in needed:continue
  mode,kind,oid,size=meta.decode().split()
  if kind!='blob' or mode not in ('100644','100755'):raise ValueError('Unsupported mode '+path)
  entries[path]=(mode,oid,int(size))
 if set(entries)!=needed:raise ValueError('Selection missing from source commit: '+str(sorted(needed-set(entries))))
 assets=[]
 child=subprocess.Popen(['git','-C',str(root),'cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE)
 try:
  for path,(mode,oid,size) in sorted(entries.items()):
   child.stdin.write((oid+'\n').encode());child.stdin.flush()
   if child.stdout.readline().decode().split()!=[oid,'blob',str(size)]:raise ValueError('Source object mismatch')
   sha=hashlib.sha256();git_sha=hashlib.sha1(b'blob '+str(size).encode()+b'\0');remaining=size
   while remaining:
    chunk=child.stdout.read(min(remaining,1024*1024))
    if not chunk:raise ValueError('Truncated object')
    remaining-=len(chunk);sha.update(chunk);git_sha.update(chunk)
   if child.stdout.read(1)!=b'\n' or git_sha.hexdigest()!=oid:raise ValueError('Object integrity')
   assets.append({'id':path,'path':path,'bytes':size,'sha256':sha.hexdigest(),'mode':mode,
                  'sourceId':revision+':'+path,'mediaType':'application/octet-stream','rights':'unknown',
                  'provenance':{'gitBlobOid':oid,'sourceCommit':revision}})
 finally:
  child.stdin.close();child.stdout.close();child.wait()
 if child.returncode:raise ValueError('Git object read failed')
 return {'version':1,'kind':'conformance','id':config['id'],'revision':revision,
         'allowedHosts':[],'assets':assets,'selections':out}

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,required=True);p.add_argument('--revision',required=True);p.add_argument('--selection',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 raw=(json.dumps(build(a.root,a.revision,a.selection),indent=2)+'\n').encode()
 # Exclusive creation avoids replacing a reviewed lock or qualification receipt.
 with a.output.open('xb') as f:f.write(raw)
 print(json.dumps({'output':str(a.output),'sha256':hashlib.sha256(raw).hexdigest(),'revision':a.revision}))
if __name__=='__main__':main()
