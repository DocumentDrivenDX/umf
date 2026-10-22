#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Additive native timestamp-key and NEL lexical-context observations; no candidate."""
import contextlib,hashlib,io,json,pathlib,runpy,sys
archive,vendor=sys.argv[1:];base=pathlib.Path(__file__).with_name('freeze-python-serialization-boundaries.py');sys.argv=[str(base),archive,vendor]
with contextlib.redirect_stdout(io.StringIO()):namespace=runpy.run_path(str(base))
m=namespace['module'];view=namespace['view'];sources=[]
for date in ['2024-01-01','2024-99-99','2001-12-15T02:59:43.1Z','2001-12-15 2:59:43.1 -05:00','2024-1-1','2024-01-01x']:
 sources.extend([('timestamp-plain-key',date+': value\n'),('timestamp-quoted-key',json.dumps(date)+': value\n'),('timestamp-value','x: '+date+'\n')])
nel=chr(0x85)
for quote in ['"',"'"]:
 for middle in [nel,nel+nel,nel+'\n','\n'+nel,' '+nel+'  ',nel+'  ',nel+'\n'+nel]:sources.append(('nel-quoted',quote+'a'+middle+'b'+quote))
for style in ['|','|-','|+','>','>-','>+']:
 for tail in [nel,nel+'\n',nel+'\n  b\n',nel+'  b\n',nel+'       b\n',nel+'#comment\n',nel+'\n\n  b\n']:
  sources.append(('nel-block','x: '+style+'\n  a'+tail))
for source in ['a: 1'+nel+'b: 2','a: 1'+nel+'b: 2\n','a:'+nel+'  b\n','x: a'+nel+'b\n','#comment'+nel+'a: 1\n','a: 1 #comment'+nel+'b: 2\n','[a,'+nel+'b]','[a'+nel+'b]',nel+'a: 1\n','"a'+chr(92)+nel+'b"','---'+nel+'a: 1\n','a: 1'+nel+'#comment\n','x: [a,'+nel+'b]\n']:
 sources.append(('nel-other-context',source))
cases=[]
for family,source in sources:
 try:result={'status':'value','value':view(m.read_json_value(source,'yaml'))}
 except Exception as e:result={'status':'error','type':type(e).__name__,'message':str(e)}
 cases.append({'id':f'python-yaml-source-{len(cases):03d}','family':family,'operation':'read','format':'yaml','sourceCodepoints':list(map(ord,source)),'predecessor':result})
original=namespace['record'];record={k:original[k] for k in ['python','executable','executableSha256','yaml','yamlPythonSourcesSha256','sourceHashes']};record.update({'profile':'umf.sol-python-yaml-source-contexts/1','generatorSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'baseGeneratorSha256':original['generatorSha256'],'qualification':__doc__,'cases':cases});print(json.dumps(record,ensure_ascii=True,separators=(',',':')))
