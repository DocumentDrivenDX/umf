# SPDX-License-Identifier: MIT OR Apache-2.0
"""Build a static PEP503 mirror from already acquired immutable wheels; no network."""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import shutil
import zipfile
from email.parser import BytesParser
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--wheelhouse',required=True,type=Path)
parser.add_argument('--output',required=True,type=Path)
args=parser.parse_args()
if args.output.exists():
    raise SystemExit('Refusing to overwrite an existing mirror')
entries=[]
for wheel in sorted(args.wheelhouse.glob('*.whl')):
    with zipfile.ZipFile(wheel) as archive:
        names=[n for n in archive.namelist() if n.endswith('.dist-info/METADATA')]
        if len(names)!=1:raise SystemExit('Invalid wheel metadata: '+wheel.name)
        metadata=BytesParser().parsebytes(archive.read(names[0]))
    name=re.sub(r'[-_.]+','-',metadata['Name']).lower()
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',name):raise SystemExit('Invalid distribution name')
    entries.append({'filename':wheel.name,'distribution':name,'version':metadata['Version'],
                    'sha256':hashlib.sha256(wheel.read_bytes()).hexdigest(),
                    'licenseExpression':metadata.get('License-Expression'),'licenseFiles':metadata.get_all('License-File',[]),
                    'requiresDist':metadata.get_all('Requires-Dist',[])})
if not entries:raise SystemExit('No wheel files')
(args.output/'files').mkdir(parents=True)
for entry in entries:shutil.copyfile(args.wheelhouse/entry['filename'],args.output/'files'/entry['filename'])
for name in sorted({e['distribution'] for e in entries}):
    folder=args.output/'simple'/name;folder.mkdir(parents=True)
    links=['<a href="../../files/'+html.escape(e['filename'],quote=True)+'#sha256='+e['sha256']+'">'+html.escape(e['filename'])+'</a>' for e in entries if e['distribution']==name]
    (folder/'index.html').write_text('<!doctype html>\n'+ '\n'.join(links)+'\n')
(args.output/'simple/index.html').write_text('<!doctype html>\n'+'\n'.join('<a href="'+name+'/">'+name+'</a>' for name in sorted({e['distribution'] for e in entries}))+'\n')
(args.output/'manifest.json').write_text(json.dumps({'profile':'local-wheel-mirror/1','networkUsed':False,'wheels':entries},indent=2)+'\n')
print(json.dumps({'mirror':str(args.output),'wheels':len(entries)}))
