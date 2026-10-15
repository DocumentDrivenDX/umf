"""Canonical proposed ontology0.2; retained narrower prototype plus action purposes."""
import copy,json
from pathlib import Path
schema=copy.deepcopy(json.loads(Path('docs/helix/02-design/spikes/security/ontology-v0.2.schema.json').read_text()))
assert schema['properties']['version']=={'const':'0.2.0'}
schema['$id']='urn:umf:security:ontology:0.2.0'
schema['title']='Proposed shared security ontology0.2; source purposes, no native admission'
schema['properties']['actionPurposes']={'type':'array','minItems':1,'maxItems':256,'items':{'type':'object','properties':{'action':{'$ref':'#/$defs/text'},'purposes':{'type':'array','minItems':1,'maxItems':6,'uniqueItems':True,'items':{'enum':['read','field','original-authorized','reverse','vault-write','other']}}},'required':['action','purposes'],'additionalProperties':True}}
out=Path('spec/extensions/security-v0.2/ontology.schema.json');out.write_text(json.dumps(schema,indent=2)+'\n')
