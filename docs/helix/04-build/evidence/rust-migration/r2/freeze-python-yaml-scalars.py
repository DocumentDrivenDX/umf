#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Additive independent native YAML1.2 scalar lexical controls; no candidate."""
import contextlib,hashlib,io,json,pathlib,runpy,sys
archive,vendor=sys.argv[1:];base=pathlib.Path(__file__).with_name('freeze-python-serialization-boundaries.py');sys.argv=[str(base),archive,vendor]
with contextlib.redirect_stdout(io.StringIO()):namespace=runpy.run_path(str(base))
module=namespace['module'];view=namespace['view']
tokens=['0','1','01','_1','1_','1__0','+_1','-_1','_0','+_','1e_2','1e1_0','1_e2','1e+2','1e-2','1e+_2','1.0e_2','.5e1','.5e+1','.5e-1','+.5e1','-.5e1','._5','_.5','+_.5','-_.5','.5_e+1','.5e+1_0','1_.0','1._','1._e1','1.e1','1.e_1','1._e_1','0x_','0x_A','0xA_','0xA__B','0xg','+0x_','-0x_','0o_','0o_1','0b','0b_','0b10','0bfoo','0b2','+0b2','0B10','<<','=','null','NaN','.nan','+.nan','-.nan','.INF','0_7','_','-_','-','+','0008','٢','1.١','1e٢','_1.0','١.0','2000-01-01']
cases=[]
for token in tokens:
 for style in ['plain','quoted']:
  source='x: '+(token if style=='plain' else "'"+token+"'")+'\n'
  try:result={'status':'value','value':view(module.read_json_value(source,'yaml'))}
  except Exception as e:result={'status':'error','type':type(e).__name__,'message':str(e)}
  cases.append({'id':f'python-yaml-scalar-{len(cases):03d}','token':token,'style':style,'operation':'read','format':'yaml','sourceCodepoints':list(map(ord,source)),'predecessor':result})
for source in ['<<: 1\n','=: 1\n']:
 try:result={'status':'value','value':view(module.read_json_value(source,'yaml'))}
 except Exception as e:result={'status':'error','type':type(e).__name__,'message':str(e)}
 cases.append({'id':f'python-yaml-scalar-{len(cases):03d}','operation':'read','format':'yaml','sourceCodepoints':list(map(ord,source)),'predecessor':result})
original=namespace['record'];record={k:original[k] for k in ['python','executable','executableSha256','yaml','yamlPythonSourcesSha256','sourceHashes']};record.update({'profile':'umf.sol-python-yaml-scalars/1','generatorSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'baseGeneratorSha256':original['generatorSha256'],'qualification':__doc__,'cases':cases})
print(json.dumps(record,ensure_ascii=True,separators=(',',':')))
