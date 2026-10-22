#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Additive reviewer-owned predecessor key ordering observations; no candidate."""
import contextlib,hashlib,io,json,pathlib,runpy,sys
archive,vendor=sys.argv[1:]
base=pathlib.Path(__file__).with_name('freeze-python-serialization-boundaries.py')
sys.argv=[str(base),archive,vendor]
with contextlib.redirect_stdout(io.StringIO()):namespace=runpy.run_path(str(base))
module=namespace['module'];view=namespace['view']
values=[('numeric-looking',{'2':2,'10':10,'1':1,'a':0}),('ascii',{'z':0,'a':1,'A':2,'_':3,'aa':4}),('unicode',{chr(0x10000):0,chr(0xffff):1,chr(0xe000):2,chr(0xd800)+chr(0xdc00):3,chr(0xd800):4,'é':5,'e\u0301':6,'Å':7,'a':8,'Z':9}),('nested',{'z':{'b':1,'a':2},'a':[{'2':2,'10':10,'1':1}]})]
cases=[]
for format in ['json','yaml']:
 for name,value in values:
  source=module.write_json_value(value,format);back=module.read_json_value(source,format)
  cases.append({'id':'write-order-'+name+'-'+format,'operation':'write','format':format,'input':view(value),'predecessor':{'status':'value','value':view(source),'readBack':view(back)}})
for format,source in [('json','{"z":1,"a":2,"10":3,"2":4}'),('yaml','z: 1\na: 2\n"10": 3\n"2": 4\n')]:
 cases.append({'id':'read-source-order-'+format,'operation':'read','format':format,'sourceCodepoints':list(map(ord,source)),'predecessor':{'status':'value','value':view(module.read_json_value(source,format))}})
base_record=namespace['record']
print(json.dumps({'profile':'umf.sol-python-serialization-ordering/1','python':base_record['python'],'executable':base_record['executable'],'executableSha256':base_record['executableSha256'],'yaml':base_record['yaml'],'yamlPythonSourcesSha256':base_record['yamlPythonSourcesSha256'],'sourceHashes':base_record['sourceHashes'],'generatorSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'baseGeneratorSha256':base_record['generatorSha256'],'qualification':__doc__,'cases':cases},ensure_ascii=True,separators=(',',':')))
