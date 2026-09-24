"""Derive serialized field shapes from pinned DSI; preserve its raw schema separately."""
import json,hashlib,importlib.metadata as metadata
from pathlib import Path
from typing import Any
from dbt_semantic_interfaces.implementations.semantic_manifest import PydanticSemanticManifest as M
from dsi_pydantic_shim import BaseModel
from pydantic.v1.schema import get_flat_models_from_model
assert metadata.version('dbt-semantic-interfaces')=='0.8.5'
base=Path('native/dbt/semantic-sources');base.mkdir(parents=True,exist_ok=True)
raw=M.schema();derived=json.loads(json.dumps(raw));changes=[]
for model in sorted(get_flat_models_from_model(M),key=lambda m:m.__name__):
 if not issubclass(model,BaseModel):continue
 shape=derived if model is M else derived['definitions'][model.__name__]
 for name,field in model.__fields__.items():
  if field.allow_none:
   key=field.alias;shape['properties'][key]={'anyOf':[shape['properties'][key],{'type':'null'}]};changes.append({'model':model.__name__,'field':name,'reason':'native field.allow_none'})
  # Serialized nested collections in this pinned model have no constrained nullable item/value fields (Any already includes null).
  def nonnullable_children(f):
   for child in f.sub_fields or []:
    assert not child.allow_none or child.type_ is Any,(model.__name__,name,child.name)
    nonnullable_children(child)
  nonnullable_children(field)
derived['$schema']='https://json-schema.org/draft/2020-12/schema';derived['$id']='urn:umf:dbt:semantic-manifest:dsi-0.8.5:serialized'
for name,value in [('pydantic-schema.json',raw),('serialized-schema.json',derived),('nullable-fields.json',changes)]:
 (base/name).write_text(json.dumps(value,indent=2)+'\n')
dist=metadata.distribution('dbt-semantic-interfaces');files=[]
for path in sorted(dist.files,key=str):
 if str(path).endswith('.py') and str(path).startswith('dbt_semantic_interfaces/'):
  files.append({'distributionPath':str(path),'sha256':hashlib.sha256(dist.locate_file(path).read_bytes()).hexdigest()})
license_path=next(p for p in dist.files if str(p).endswith('/LICENSE'))
(base/'LICENSE').write_bytes(dist.locate_file(license_path).read_bytes())
(base/'provenance.json').write_text(json.dumps({'package':'dbt-semantic-interfaces','version':'0.8.5','pydantic':metadata.version('pydantic'),'derivation':'PydanticSemanticManifest.schema(), then anyOf null for each native allow_none field; no parser coercion, default insertion or semantic validation implied','nullableFields':len(changes),'definitions':len(derived['definitions']),'runtimeSourceFiles':files,'files':[{'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(base.iterdir()) if p.name!='provenance.json']},indent=2)+'\n')
print({'definitions':len(derived['definitions']),'nullableFields':len(changes)})
