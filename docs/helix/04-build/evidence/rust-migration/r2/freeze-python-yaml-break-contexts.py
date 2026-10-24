#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Independent shared YAML scalar line-break/folding/EOF crossproduct; no candidate."""
import contextlib,hashlib,io,json,pathlib,runpy,sys
archive,vendor=sys.argv[1:];base=pathlib.Path(__file__).with_name('freeze-python-serialization-boundaries.py');sys.argv=[str(base),archive,vendor]
with contextlib.redirect_stdout(io.StringIO()):namespace=runpy.run_path(str(base))
m=namespace['module'];view=namespace['view'];sources=[]
for br in ['\r','\n','\r\n',chr(0x85),chr(0x2028),chr(0x2029)]:
 family='break-'+','.join(hex(ord(c)) for c in br)
 for quote in ['"',"'"]:
  for middle in [br,br+br,br+'\n',' '+br+'  ',br+'  ',br+'\n'+br]:
   sources.append((family+'-quoted',quote+'a'+middle+'b'+quote))
 for source in ['a'+br+'b','x: a'+br+'  b\n','[a'+br+'b]','[a'+br+'\nb]','x: [a'+br+'b]\n']:
  sources.append((family+'-plain',source))
 for style in ['|','|-','|+','>','>-','>+']:
  for tail in ['',br,br+'\n',br+'\n  b',br+'\n  b\n',br+br+'\n  b',br+'  b\n']:
   sources.append((family+'-block-'+style,'x: '+style+'\n  a'+tail))
cases=[]
for family,source in sources:
 try:result={'status':'value','value':view(m.read_json_value(source,'yaml'))}
 except Exception as e:result={'status':'error','type':type(e).__name__,'message':str(e)}
 cases.append({'id':f'python-yaml-break-{len(cases):03d}','family':family,'operation':'read','format':'yaml','sourceCodepoints':list(map(ord,source)),'predecessor':result})
original=namespace['record'];record={k:original[k] for k in ['python','executable','executableSha256','yaml','yamlPythonSourcesSha256','sourceHashes']};record.update({'profile':'umf.sol-python-yaml-break-contexts/1','generatorSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'baseGeneratorSha256':original['generatorSha256'],'qualification':__doc__,'cases':cases});print(json.dumps(record,ensure_ascii=True,separators=(',',':')))
