# SPDX-License-Identifier: MIT OR Apache-2.0
# Pin exposed native error metadata independently of candidate display-pointer reconstruction.
import sys,json,hashlib,platform,struct,importlib.metadata
from pathlib import Path
old=Path('/private/tmp/umf-r2-predecessor-53de049/python/src');sys.path.insert(0,str(old))
from umf.schemas import schema_validator
assert Path(sys.modules['umf.schemas'].__file__).resolve()==(old/'umf/schemas.py').resolve()
assert importlib.metadata.version('jsonschema')=='4.26.0'
assert hashlib.sha256((old/'umf/schemas.py').read_bytes()).hexdigest()=='22f02d6a6903b8804a1d504b0b6f232872aa564bc20e77933c880a4f9016a402'
uris=['http://json-schema.org/draft-03/schema#','http://json-schema.org/draft-04/schema#','http://json-schema.org/draft-06/schema#','http://json-schema.org/draft-07/schema#','https://json-schema.org/draft/2019-09/schema','https://json-schema.org/draft/2020-12/schema']
def typed(value):
 if value is None:return {'kind':'null'}
 if type(value) is bool:return {'kind':'boolean','value':value}
 if type(value) is int:return {'kind':'integer','decimal':str(value)}
 if type(value) is float:return {'kind':'float','bits':struct.pack('>d',value).hex()}
 if type(value) is str:return {'kind':'string','points':[ord(x) for x in value]}
 if type(value) is list:return {'kind':'array','items':[typed(x) for x in value]}
 if type(value) is dict:return {'kind':'object','members':[[key,typed(child)] for key,child in value.items()]}
 raise TypeError(type(value))
controls=[('property-name-subject',{'propertyNames':{'minLength':2}},{'a':9}),('property-name-false-subject',{'propertyNames':False},{'a':9}),('property-false-subject',{'properties':{'x':False}},{'x':9}),('property-nested-false-subject',{'properties':{'x':{'allOf':[False]}}},{'x':9}),('property-ref-false-subject',{'definitions':{'no':False},'properties':{'x':{'$ref':'#/definitions/no'}}},{'x':9}),('item-false-subject',{'items':False},[9]),('tuple-false-subject',{'items':[False]},[9]),('prefix-false-subject',{'prefixItems':[False]},[9]),('item-ref-false-subject',{'definitions':{'no':False},'items':{'$ref':'#/definitions/no'}},[9]),('extra-property-nested-false-subject',{'additionalProperties':{'allOf':[False]}},{'x':9})]
inputs=[]
for draft,uri in enumerate(uris):
 for name,rule,instance in controls:inputs.append((f'draft{draft}-{name}',{'$schema':uri,**rule},instance))
inputs.extend([('default-root-false',False,0),('default-root-true',True,0),('draft3-implicit-required',{'$schema':uris[0],'properties':{'x':{'required':True}}},{})])
cases=[]
for name,schema,instance in inputs:
 case={'id':name,'schemaRecipe':typed(schema),'schemaText':json.dumps(schema,ensure_ascii=True,separators=(',',':')),'instanceRecipe':typed(instance)}
 try:
  validator=schema_validator(schema)
  case['errors']=[{'keyword':error.validator,'validatorValue':typed(error.validator_value),'instance':typed(error.instance),'instancePath':list(error.absolute_path),'schemaPath':list(error.absolute_schema_path)} for error in validator.iter_errors(instance)]
 except BaseException as error:case['schemaError']={'type':type(error).__name__,'message':str(error)}
 cases.append(case)
out={'profile':'umf.r2-sol-python-schema-error-subjects/1','python':platform.python_version(),'jsonschema':importlib.metadata.version('jsonschema'),'schemaSourceSha256':hashlib.sha256((old/'umf/schemas.py').read_bytes()).hexdigest(),'scope':'Exposed error.instance may be a property name or a child value even when native display instancePath is empty. Preserve display paths and actual evaluated subject separately; never recover subject solely from display pointer. Only existing facade fields are tested, without a full exception API identity claim.','cases':cases}
print(json.dumps(out,ensure_ascii=True,allow_nan=False,indent=2))
