#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Independent exact timestamp-tag and shared-scanner profile edge observations; no candidate."""
import contextlib,hashlib,io,json,pathlib,runpy,sys
archive,vendor=sys.argv[1:];base=pathlib.Path(__file__).with_name('freeze-python-serialization-boundaries.py');sys.argv=[str(base),archive,vendor]
with contextlib.redirect_stdout(io.StringIO()):namespace=runpy.run_path(str(base))
m=namespace['module'];view=namespace['view'];sources=[]
for date in ['2001-12-15T2:3:4','2001-12-15T2:03:04','2001-12-15T2:3:04','2001-12-15T2:03:4','2001-12-15T2:03:04z','2001-12-15T2:03:04Z','2001-12-15T2:03:04+1:2','2001-12-15T2:03:04+1:02','2001-12-15T2:03:04 ','2001-1-1T2:03:04','2001-01-1','2001-1-01','2001-01-01','2001-01-01  ','2001-12-15T2:03:04.','2001-12-15T2:03:04  Z']:
 for context in ['key','quoted-key','value']:
  source=(date+': value\n') if context=='key' else ((json.dumps(date)+': value\n') if context=='quoted-key' else ('x: '+date+'\n'))
  sources.append(('timestamp-'+context,source))
for char in [chr(0x85),chr(0x2028),chr(0x2029)]:
 for source in ['x: &a'+char+'value\n','x: &a'+char+'  value\n','[&a'+char+'value]','&a'+char+'value','%FOO'+char+'---\nx: 1\n','%FOO p'+char+'---\nx: 1\n','%YAML 1.2'+char+'---\nx: 1\n','%FOO'+char+'\n---\nx: 1\n','x: |\n  a'+char+'\n  b','x: |+\n  a'+char,'x: >\n  a'+char+'\n  b']:
  sources.append(('scanner-'+hex(ord(char)),source))
cases=[]
for family,source in sources:
 try:result={'status':'value','value':view(m.read_json_value(source,'yaml'))}
 except Exception as e:result={'status':'error','type':type(e).__name__,'message':str(e)}
 cases.append({'id':f'python-yaml-edge-{len(cases):03d}','family':family,'operation':'read','format':'yaml','sourceCodepoints':list(map(ord,source)),'predecessor':result})
original=namespace['record'];record={k:original[k] for k in ['python','executable','executableSha256','yaml','yamlPythonSourcesSha256','sourceHashes']};record.update({'profile':'umf.sol-python-yaml-profile-edges/1','generatorSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'baseGeneratorSha256':original['generatorSha256'],'qualification':__doc__,'cases':cases});print(json.dumps(record,ensure_ascii=True,separators=(',',':')))
