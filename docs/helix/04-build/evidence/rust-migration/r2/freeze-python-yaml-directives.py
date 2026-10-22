#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Independent native directive lexical grammar controls; no candidate."""
import contextlib,hashlib,io,json,pathlib,runpy,sys
archive,vendor=sys.argv[1:];base=pathlib.Path(__file__).with_name('freeze-python-serialization-boundaries.py');sys.argv=[str(base),archive,vendor]
with contextlib.redirect_stdout(io.StringIO()):namespace=runpy.run_path(str(base))
m=namespace['module'];view=namespace['view'];sources=[]
for name in ['FOO','FOO p','FOO p q','#FOO','FOO:._-123','FOÖ','FOO'+chr(0x2028)+'part','FOO\tp','YAML 1.2','YAML 1.1','YAML 1.3','TAG !e! tag:example.test,2024:']:
 for separator in ['\n',chr(0x85)+'\n']:
  sources.append(('%'+name+separator+'---\nx: 1\n'))
for source in ['%FOO\n---\nx: 1\n','%FOO p #comment\n---\nx: 1\n','%FOO p'+chr(0x85)+'\n---\nx: 1\n','%FOO\t'+chr(0x85)+'\n---\nx: 1\n','%YAML 1.2 #comment\n---\nx: 1\n']:
 sources.append(source)
cases=[]
for source in sources:
 try:result={'status':'value','value':view(m.read_json_value(source,'yaml'))}
 except Exception as e:result={'status':'error','type':type(e).__name__,'message':str(e)}
 cases.append({'id':f'python-yaml-directive-{len(cases):03d}','operation':'read','format':'yaml','sourceCodepoints':list(map(ord,source)),'predecessor':result})
original=namespace['record'];record={k:original[k] for k in ['python','executable','executableSha256','yaml','yamlPythonSourcesSha256','sourceHashes']};record.update({'profile':'umf.sol-python-yaml-directives/1','generatorSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'baseGeneratorSha256':original['generatorSha256'],'qualification':__doc__,'cases':cases});print(json.dumps(record,ensure_ascii=True,separators=(',',':')))
