import json
from pathlib import Path
s=json.loads(Path('spec/core/relationship-document.schema.json').read_text())
s['$id']='urn:umf:core:0.8.0';s['title']='UMF 0.8.0 experimental schema properties';s['properties']['umf']['const']='0.8.0'
s['description']='Shared annotations, literal defaults and exact value/collection bounds; semantic validator required.'
d=s['$defs']; safe={'type':'integer','minimum':0,'maximum':9007199254740991}
token={'type':'string','pattern':r'^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$(?![\s\S])'}
branches=[{'type':'null'}]
for k,v in {'boolean':{'type':'boolean'},'integerToken':token,'decimalToken':token,'string':{'type':'string'},'binaryHex':{'type':'string','pattern':r'^([0-9a-fA-F]{2})*$(?![\s\S])'},'floatToken':token,'date':{'type':'string'},'time':{'type':'string'},'timestamp':{'type':'string'},'array':{'type':'array','items':{'$ref':'#/$defs/literal'}},'map':{'type':'object','additionalProperties':{'$ref':'#/$defs/literal'}}}.items():
 branches.append({'type':'object','required':[k],'properties':{k:v},'additionalProperties':False})
d['literal']={'oneOf':branches}
annotations={'title':{'type':'string'},'aliases':{'type':'array','uniqueItems':True,'items':{'type':'string','minLength':1}}}
for props in [s['properties'],d['module']['properties'],d['element']['properties']]: props.update(annotations)
del d['element']['allOf'][5]['then']['properties']['cardinality']
e=d['element']['properties'];e.update({'examples':{'type':'array','items':{'$ref':'#/$defs/literal'}},'allowedValues':{'type':'array','minItems':1,'items':{'$ref':'#/$defs/literal'}},'default':{'type':'object','required':['value','on'],'properties':{'value':{'$ref':'#/$defs/literal'},'on':{'enum':['missing','null','missing-or-null']}},'additionalProperties':True}})
# Locate the shared facets definition, not its conditional scalar restrictions.
f=d['facets']['properties']
f['length']={'type':'object','required':['unit'],'anyOf':[{'required':['min'],'properties':{'min':{}}},{'required':['max'],'properties':{'max':{}}}],'properties':{'min':safe,'max':safe,'unit':{'type':'string','minLength':1}},'additionalProperties':True}
f['collectionSize']={'type':'object','anyOf':[{'required':['min'],'properties':{'min':{}}},{'required':['max'],'properties':{'max':{}}}],'properties':{'min':safe,'max':safe},'additionalProperties':True}
f['range']={'type':'object','anyOf':[{'required':['min'],'properties':{'min':{}}},{'required':['max'],'properties':{'max':{}}}],'properties':{'min':{'$ref':'#/$defs/literal'},'max':{'$ref':'#/$defs/literal'},'minInclusive':{'type':'boolean'},'maxInclusive':{'type':'boolean'}},'additionalProperties':True}
# New annotations are on any element; value declarations require explicit Field.
for key in ['examples','allowedValues','default']:
 d['element'].setdefault('allOf',[]).append({'if':{'required':[key],'properties':{key:{}}},'then':{'required':['kind'],'properties':{'kind':{'const':'field'}}}})
Path('spec/core/schema-properties-document.schema.json').write_text(json.dumps(s,indent=2)+'\n')

selection=json.loads(Path('spec/core/relationship-selection.schema.json').read_text())
selection=json.loads(json.dumps(selection).replace('urn:umf:core:0.7.0','urn:umf:core:0.8.0'))
selection['$id']='urn:umf:core:schema-properties-selection:1.0.0'
selection['title']='UMF 0.8.0 retained element selection'
selection['$defs']=s['$defs']
Path('spec/core/schema-properties-selection.schema.json').write_text(json.dumps(selection,indent=2)+'\n')
def shape(properties,required=None): return {'type':'object','properties':properties,'required':list(properties) if required is None else required,'additionalProperties':False}
ref08={'$ref':'urn:umf:core:0.8.0'}; ref07={'$ref':'urn:umf:core:0.7.0'}
identity={'oneOf':[shape({'scope':{'const':'document'}}),shape({'scope':{'const':'module'},'module':{'type':'string','minLength':1}}),shape({'scope':{'const':'element'},'module':{'type':'string','minLength':1},'element':{'type':'string','minLength':1}})]}
def external(value): return json.loads(json.dumps(value).replace('#/$defs/literal','urn:umf:core:0.8.0#/$defs/literal'))
patch=shape({**{k:external(e[k]) for k in ['title','aliases','examples','allowedValues','default']},'facets':shape({k:external(f[k]) for k in ['length','collectionSize','range']},[])},[])
patch['minProperties']=1
for group in patch['properties']['facets']['properties'].values(): group.pop('anyOf',None)
provenance=shape({'origin':{'const':'authored'},'path':{'type':'string'},'basis':{'const':'explicit-author-declaration'}})
declaration=shape({'operation':{'const':'declare-core-schema-properties'},'version':{'const':'1.0.0'},'source':ref08,'target':ref08,'identity':identity,'request':patch,'provenance':provenance})
upgrade=shape({'operation':{'const':'upgrade-schema-properties-envelope'},'version':{'const':'1.0.0'},'source':ref07,'target':ref08,'residuals':{'type':'array','items':shape({'path':{'type':'string'},'value':{},'reason':{'const':'Legacy content retained without reinterpretation'}})}})
operation={'$schema':'https://json-schema.org/draft/2020-12/schema','$id':'urn:umf:core:schema-properties-receipt:1.0.0','title':'Schema property authoring and transition receipts','$defs':{'identity':identity,'patch':patch,'declaration':declaration,'upgrade':upgrade},'oneOf':[{'$ref':'#/$defs/declaration'},{'$ref':'#/$defs/upgrade'},shape({'operation':{'const':'rollback-schema-properties-envelope'},'version':{'const':'1.0.0'},'source':ref08,'target':ref07,'receipt':{'$ref':'#/$defs/upgrade'},'reason':{'const':'Original envelope restored; subsequent content retained in source'}})]}
Path('spec/core/schema-properties-receipt.schema.json').write_text(json.dumps(operation,indent=2)+'\n')
