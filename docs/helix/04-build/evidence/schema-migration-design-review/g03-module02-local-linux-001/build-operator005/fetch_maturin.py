#!/usr/bin/env python3
"""Fetch only the preselected Linux Maturin wheel and verify the pinned PyPI metadata."""
import hashlib, json, os, pathlib, sys, urllib.request
PIN='ff36b1d43664c264059608e2c475db66efe93264c894a80f6b0181b2f85bdf4e'
WHEEL='maturin-1.9.6-py3-none-manylinux_2_12_x86_64.manylinux2010_x86_64.musllinux_1_1_x86_64.whl'
SHA='0246202377c49449315305209f45c8ecef6e2d6bd27a04b5b6f1ab3e4ea47238'
SIZE=8641010
metadata=pathlib.Path('/operator/maturin-1.9.6-pypi.json')
data=metadata.read_bytes()
if hashlib.sha256(data).hexdigest()!=PIN: raise SystemExit('pinned PyPI metadata SHA mismatch')
doc=json.loads(data)
entries=[x for x in doc['urls'] if x['filename']==WHEEL]
if len(entries)!=1 or entries[0]['digests']['sha256']!=SHA or entries[0]['size']!=SIZE:
 raise SystemExit('wheel descriptor differs from frozen PyPI record')
outdir=pathlib.Path(sys.argv[1]); destination=outdir/WHEEL
if destination.exists() or destination.is_symlink(): raise SystemExit('wheel target already exists')
h=hashlib.sha256(); total=0
with urllib.request.urlopen(entries[0]['url'],timeout=30) as response, destination.open('xb') as out:
 while True:
  block=response.read(1024*1024)
  if not block: break
  total+=len(block)
  if total>SIZE: raise SystemExit('wheel exceeded frozen size')
  h.update(block); out.write(block)
 out.flush(); os.fsync(out.fileno())
if total!=SIZE or h.hexdigest()!=SHA:
 destination.unlink(missing_ok=True)
 raise SystemExit('downloaded Maturin wheel differs from pinned size/hash')
receipt={'version':'1.9.6','wheel':WHEEL,'sizeBytes':total,'sha256':h.hexdigest(),
 'metadataPath':str(metadata),'metadataSha256':PIN,'pypiJsonUrl':'https://pypi.org/pypi/maturin/1.9.6/json',
 'wheelUrl':entries[0]['url'],'source':'exact wheel selected from frozen official release JSON'}
pathlib.Path(sys.argv[2]).write_text(json.dumps(receipt,sort_keys=True,indent=2)+'\n')
