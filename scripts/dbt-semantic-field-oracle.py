"""Compare every pinned native field's serialized boundary values with the derived schema."""
import json,hashlib,copy,importlib.metadata as metadata
from pathlib import Path
from dbt_semantic_interfaces.implementations.semantic_manifest import PydanticSemanticManifest as M
from dsi_pydantic_shim import BaseModel
from pydantic.v1.schema import get_flat_models_from_model
from pydantic.v1.json import pydantic_encoder
from jsonschema import Draft202012Validator
assert metadata.version('dbt-semantic-interfaces')=='0.8.5' and metadata.version('pydantic')=='1.10.26'
base=Path('fixtures/dbt/semantic-fields');base.mkdir(parents=True,exist_ok=True)
path=Path('spec/extensions/dbt-semantic/native-schema.json');schema=json.loads(path.read_text())
inputs=[None,False,True,0,1,-1,1.5,'','example',[],{},['example'],{'example':None}]
results=[];fields=0
for model in sorted(get_flat_models_from_model(M),key=lambda m:m.__name__):
 if not issubclass(model,BaseModel):continue
 shape=schema if model is M else schema['definitions'][model.__name__]
 for name,field in model.__fields__.items():
  fields+=1
  branch=shape['properties'][field.alias]
  validator=Draft202012Validator({'$schema':schema['$schema'],'definitions':schema['definitions'],'allOf':[branch]})
  for index,value in enumerate(inputs):
   # Exercise the native field parser itself; serialization is a distinct observation.
   exception=None
   try:
    parsed,error=field.validate(copy.deepcopy(value),{},loc=name,cls=model)
   except Exception as exc:
    parsed,error=None,True;exception={'type':type(exc).__name__,'message':str(exc)}
   row={'model':model.__name__,'field':name,'alias':field.alias,'inputIndex':index,'input':value,'inputShapeValid':not list(validator.iter_errors(value)),'nativeAccepted':error is None}
   if exception is not None:row['nativeException']=exception
   if error is None:
    encoded=json.loads(json.dumps(parsed,default=pydantic_encoder));row['serialized']=encoded;row['serializedShapeValid']=not list(validator.iter_errors(encoded))
   results.append(row)
mismatches=[r for r in results if r.get('serializedShapeValid') is False]
(base/'results.json').write_text(json.dumps({'runtime':'dbt-semantic-interfaces 0.8.5, Pydantic 1.10.26 ModelField.validate and native JSON encoder, jsonschema 4.25.1','schemaSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'fields':fields,'inputValues':len(inputs),'results':results,'limits':'Isolated field boundaries only; model/root validators, complete documents, arbitrary values and metric execution are not established'},indent=2)+'\n')
assert not mismatches,mismatches
print({'fields':fields,'vectors':len(results),'accepted':sum(r['nativeAccepted'] for r in results),'serializedShapeMismatches':len(mismatches)})
for r in mismatches[:8]:print(r)
