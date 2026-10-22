#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Additive independent native YAML character/read/write controls; no candidate."""
import contextlib,hashlib,io,json,pathlib,runpy,sys
archive,vendor=sys.argv[1:];base=pathlib.Path(__file__).with_name('freeze-python-serialization-boundaries.py');sys.argv=[str(base),archive,vendor]
with contextlib.redirect_stdout(io.StringIO()):namespace=runpy.run_path(str(base))
module=namespace['module'];view=namespace['view'];cases=[]
points=[0,1,7,8,9,10,11,12,13,14,31,32,126,127,128,132,133,134,159,160,0xd7ff,0xd800,0xdc00,0xdfff,0xe000,0xfffd,0xfffe,0xffff,0x10000,0x10ffff,0x10fffe]
def read(id,source):
 try:r={'status':'value','value':view(module.read_json_value(source,'yaml'))}
 except Exception as e:r={'status':'error','type':type(e).__name__,'message':str(e)}
 cases.append({'id':id,'operation':'read','format':'yaml','sourceCodepoints':list(map(ord,source)),'predecessor':r})
for p in points:
 value='a'+chr(p)+'b'
 read(f'yaml-character-{p:06x}-raw','"'+value+'"')
 read(f'yaml-character-{p:06x}-escaped','"a'+chr(92)+(f'u{p:04x}' if p<=0xffff else f'U{p:08x}')+'b"')
 try:
  source=module.write_json_value(value,'yaml');r={'status':'value','value':view(source),'readBack':view(module.read_json_value(source,'yaml'))}
 except Exception as e:r={'status':'error','type':type(e).__name__,'message':str(e)}
 cases.append({'id':f'yaml-character-{p:06x}-write','operation':'write','format':'yaml','input':view(value),'predecessor':r})
for name,source in [('singlequoted',"'a\u0085b'"),('plain','x: a\u0085  b\n'),('literal','x: |\n  a\u0085  b\n'),('folded','x: >\n  a\u0085  b\n'),('document','a: 1\u0085b: 2\u0085')]:read('yaml-nel-'+name,source)
original=namespace['record'];record={k:original[k] for k in ['python','executable','executableSha256','yaml','yamlPythonSourcesSha256','sourceHashes']};record.update({'profile':'umf.sol-python-yaml-characters/1','generatorSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'baseGeneratorSha256':original['generatorSha256'],'qualification':__doc__,'cases':cases});print(json.dumps(record,ensure_ascii=True,separators=(',',':')))
