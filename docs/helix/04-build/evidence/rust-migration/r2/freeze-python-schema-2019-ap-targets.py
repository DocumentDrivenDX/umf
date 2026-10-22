# SPDX-License-Identifier: MIT OR Apache-2.0
# Explicit proposal targets: only legacy schema-valued AP annotation defect changes.
import sys,json,hashlib,platform,types,inspect,contextlib,io,runpy
from pathlib import Path
old=Path('/private/tmp/umf-r2-predecessor-53de049/python/src');pkg=types.ModuleType('umf');pkg.__path__=[str(old/'umf')];sys.modules['umf']=pkg
import jsonschema._legacy_keywords as legacy
from jsonschema.exceptions import ValidationError
helper=inspect.getsource(legacy.find_evaluated_property_keys_by_schema)
insert='''            schema_value = schema[keyword]
            if keyword == "additionalProperties" and validator.is_type(schema_value, "object"):
                declared = schema.get("properties", {})
                patterns = schema.get("patternProperties", {})
                for property, value in instance.items():
                    if property in declared or any(re.search(pattern, property) for pattern in patterns):
                        continue
                    if next(validator.descend(value, schema_value), None) is None:
                        evaluated_keys.append(property)
                continue
'''
needle='            schema_value = schema[keyword]\n';assert helper.count(needle)==1
corrected=helper.replace(needle,insert)
mode=sys.argv[1]if len(sys.argv)>1 else'native';assert mode in ['native','target']
if mode=='target':exec(compile(corrected,'<reviewed-legacy2019-ap-annotation-target>','exec'),legacy.__dict__)
sys.argv=[sys.argv[0],'legacy2019']
with contextlib.redirect_stdout(io.StringIO()):n=runpy.run_path(str(Path(__file__).with_name('freeze-python-schema-annotation-mechanism.py')),run_name='__main__')
schema_validator=n['schema_validator'];typed=n['typed'];sig=n['sig'];fail=n['fail'];cases=n['cases'];uri=n['uris'][4]
extras=[
 ('ap-empty-rule',{'unevaluatedProperties':False,'additionalProperties':{}},{'x':'ok'}),
 ('ap-valid-extra',{'unevaluatedProperties':False,'additionalProperties':{'type':'string'}},{'x':'ok'}),
 ('ap-valid-before-type',{'unevaluatedProperties':False,'type':'string','additionalProperties':{'type':'string'}},{'x':'ok'}),
 ('ap-invalid-extra',{'unevaluatedProperties':False,'additionalProperties':{'type':'string'}},{'x':0}),
 ('ap-mixed-extra',{'unevaluatedProperties':False,'additionalProperties':{'type':'string'}},{'x':'ok','y':0}),
 ('ap-pattern-exclusion',{'unevaluatedProperties':False,'patternProperties':{'^p$':{'type':'number'}},'additionalProperties':{'type':'string'}},{'p':0,'x':'ok'}),
 ('ap-declared-exclusion',{'unevaluatedProperties':False,'properties':{'foo':{'type':'string'}},'additionalProperties':{'type':'string'}},{'foo':0,'bar':'ok'}),
 ('ap-rule-member-collision',{'unevaluatedProperties':False,'additionalProperties':{'type':'string'}},{'type':0}),
 ('ap-original-correction001',{'type':'object','properties':{'foo':{'type':'string'}},'additionalProperties':{'type':'string'},'unevaluatedProperties':False},{'foo':'foo','bar':'bar'}),
]
for name,rule,instance in extras:
 schema={'$schema':uri,**rule};row={'id':'draft4-'+name,'schemaText':json.dumps(schema,ensure_ascii=True,separators=(',',':')),'instanceRecipe':typed(instance),'methods':{}}
 try:v=schema_validator(schema)
 except BaseException as e:row['schemaError']={'type':type(e).__name__,'message':str(e)};cases.append(row);continue
 for method in ['is_valid','validate','iterate']:
  try:
   if method=='is_valid':result={'status':'validity','valid':v.is_valid(instance)}
   elif method=='validate':
    try:v.validate(instance);result={'status':'valid'}
    except ValidationError as e:result={'status':'validation-error','error':sig(e)}
   else:
    prefix=[];it=v.iter_errors(instance)
    while True:
     try:prefix.append(sig(next(it)))
     except StopIteration:result={'status':'end','prefix':prefix};break
     except BaseException as e:result={**fail(e),'prefix':prefix};break
  except BaseException as e:result=fail(e)
  row['methods'][method]=result
 cases.append(row)
print(json.dumps({'profile':'umf.r2-sol-python-schema-2019-ap-'+mode+'/1','python':platform.python_version(),'jsonschema':n['importlib'].metadata.version('jsonschema'),'schemaSourceSha256':n['source_sha'],'nativeHelperSha256':hashlib.sha256(helper.encode()).hexdigest(),'targetHelperSha256':hashlib.sha256(corrected.encode()).hexdigest(),'scope':'Unchanged native baseline or explicitly proposed corrected target, selected by mode. The target changes only legacy2019 schema-valued additionalProperties annotation collection: successful actual extras, excluding declared/pattern-matched names, contribute annotations. All native scalar/descend/predicate kernels and all other legacy annotation branches remain unchanged. No candidate outputs used. Original28legacy mechanism records are included unchanged in native mode plus9ordinary AP controls.','cases':cases},ensure_ascii=True,indent=2))
