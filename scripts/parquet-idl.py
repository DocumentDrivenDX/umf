"""Derive all declaration descriptors from the pinned IDL using thriftpy2's compiler."""
import hashlib,json,re
from pathlib import Path
import thriftpy2
base=Path('native/parquet/sources');manifest=json.loads((base/'manifest.json').read_text())
for f in manifest['files']:assert hashlib.sha256((base/f['local']).read_bytes()).hexdigest()==f['sha256']
m=thriftpy2.load(str(base/'parquet.thrift'),module_name='umf_parquet_thrift')
text=(base/'parquet.thrift').read_text();text=re.sub(r'/\*.*?\*/','',text,flags=re.S);text=re.sub(r'//[^\n]*','',text)
declarations=re.findall(r'\b(enum|struct|union)\s+(\w+)\s*\{',text);definitions={}
primitive={2:'bool',3:'i8',4:'double',6:'i16',8:'i32',10:'i64',11:'string',18:'binary'}
def type_of(code,detail=None):
 if detail is not None and hasattr(detail,'__name__'):return {'ref':detail.__name__}
 if code in primitive:return {'kind':primitive[code]}
 if code in [14,15]:
  args=detail if isinstance(detail,tuple) else (detail,)
  return {'kind':'list' if code==15 else 'set','item':type_of(*args)}
 if code==13:return {'kind':'map','key':type_of(*(detail[0] if isinstance(detail[0],tuple) else (detail[0],))),'value':type_of(*(detail[1] if isinstance(detail[1],tuple) else (detail[1],)))}
 raise AssertionError((code,detail))
for kind,name in declarations:
 c=getattr(m,name)
 if kind=='enum':definitions[name]={'kind':kind,'values':c._NAMES_TO_VALUES};continue
 defaults=dict(c.default_spec);fields=[]
 for id,spec in c.thrift_spec.items():
  field={'id':id,'name':spec[1],'required':spec[-1],'type':type_of(spec[0],spec[2] if len(spec)==4 else None)}
  assert not field['name'].startswith('$')
  if defaults[field['name']] is not None:field['default']=defaults[field['name']]
  fields.append(field)
 definitions[name]={'kind':kind,'fields':fields}
assert len(definitions)==len(declarations)
output={'commit':manifest['commit'],'compiler':'thriftpy2 0.5.3','definitions':definitions};Path('spec/extensions/parquet/idl.json').write_text(json.dumps(output,indent=2)+'\n');print({'definitions':len(definitions),'fields':sum(len(d.get('fields',[])) for d in definitions.values())})
