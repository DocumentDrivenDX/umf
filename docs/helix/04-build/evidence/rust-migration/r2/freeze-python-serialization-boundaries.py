#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Reviewer-owned predecessor serializer observations; never execute candidate.
Pass archived origin/main python/src/umf directory and cached ruamel distribution.
The unused Document import is stubbed to avoid unrelated model initialization.
No predecessor reader/writer/admission function is substituted or modified.
"""
import sys,types,importlib,json,pathlib,hashlib,struct
archive=pathlib.Path(sys.argv[1]).resolve();vendor=pathlib.Path(sys.argv[2]).resolve();sys.path.insert(0,str(vendor))
package=types.ModuleType('umf_predecessor');package.__path__=[str(archive)];sys.modules[package.__name__]=package
models=types.ModuleType('umf_predecessor.models');models.Document=object;sys.modules[models.__name__]=models
module=importlib.import_module('umf_predecessor.serialization')
def view(value):
 if type(value) is str:return {'kind':'str','codepoints':list(map(ord,value))}
 if type(value) is float:return {'kind':'float','bits':struct.pack('>d',value).hex()}
 if type(value) is int:return {'kind':'int','decimal':str(value)}
 if type(value) is dict:return {'kind':'dict','entries':[[view(k),view(v)] for k,v in value.items()]}
 if type(value) is list:return {'kind':'list','items':[view(v) for v in value]}
 return {'kind':type(value).__name__,'value':value}
reads=[]
for raw in ['-0xA','+0xA','0xA','1_000','1_0.5','-0o12','+0o12','0o12','0b10','1:20','2020-01-01','1','1.0','1e0','-0','-0.0','01','1_0e1']:
 reads.append(('yaml-'+raw,'yaml','x: '+raw+'\n'))
for raw in ['1','1.0','1e0','1e-7','-0','-0.0','9007199254740991','9007199254740992']:
 reads.append(('json-number-'+raw,'json',raw))
pair=chr(0xd800)+chr(0xdc00);astral=chr(0x10000);slash=chr(92)
for format in ['json','yaml']:
 for name,text in [('raw-pair',pair),('astral',astral),('raw-isolated',chr(0xd800))]:reads.append((format+'-'+name,format,'"'+text+'"'))
 reads.append((format+'-escaped-pair',format,'"'+slash+'uD800'+slash+'uDC00"'))
 reads.append((format+'-escaped-isolated',format,'"'+slash+'uD800"'))
 reads.append((format+'-dual-key-origin',format,'{"'+pair+'":1,"'+astral+'":2}'))
 reads.append((format+'-duplicate-exact-key',format,'{"a":1,"a":2}'))
results=[]
for id,format,source in reads:
 try:result={'status':'value','value':view(module.read_json_value(source,format))}
 except Exception as e:result={'status':'error','type':type(e).__name__,'message':str(e)}
 results.append({'id':id,'operation':'read','format':format,'sourceCodepoints':list(map(ord,source)),'predecessor':result})
values=[('pair',pair),('astral',astral),('isolated',chr(0xd800)),('string-underscore','1_000'),('string-signed-hex','-0xA'),('string-signed-octal','+0o12'),('string-float','1.0'),('int',1),('float',1.0),('index-order',{'2':'two','1':'one','a':'a'}),('dual-keys',{pair:1,astral:2})]
for format in ['json','yaml']:
 for name,value in values:
  try:
   source=module.write_json_value(value,format)
   result={'status':'value','value':view(source)}
   try:result['readBack']=view(module.read_json_value(source,format))
   except Exception as e:result['readBackError']={'type':type(e).__name__,'message':str(e)}
  except Exception as e:result={'status':'error','type':type(e).__name__,'message':str(e)}
  results.append({'id':'write-'+name+'-'+format,'operation':'write','format':format,'input':view(value),'predecessor':result})
files=sorted((vendor/'ruamel/yaml').rglob('*.py'));digest=hashlib.sha256()
for path in files:digest.update(path.relative_to(vendor).as_posix().encode()+b'\0'+path.read_bytes())
record={'profile':'umf.sol-python-serialization-boundaries/1','python':sys.version,'executable':sys.executable,'executableSha256':hashlib.sha256(pathlib.Path(sys.executable).resolve().read_bytes()).hexdigest(),'yaml':__import__('ruamel.yaml',fromlist=['__version__']).__version__,'yamlPythonSourcesSha256':digest.hexdigest(),'sourceHashes':{name:hashlib.sha256((archive/name).read_bytes()).hexdigest() for name in ['serialization.py','json.py']},'generatorSha256':hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),'qualification':__doc__,'cases':results}
print(json.dumps(record,ensure_ascii=True,separators=(',',':')))
