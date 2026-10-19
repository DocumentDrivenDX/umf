"""Canonical proposed0.2 wire grammar: preserve prototype + add protection refs."""
import copy,json
from pathlib import Path
base=json.loads(Path('docs/helix/02-design/spikes/security/policy-v0.2.schema.json').read_text())
active=json.loads(Path('spec/extensions/security/schema.json').read_text())
assert base['$defs']['literal']==active['$defs']['literal'], 'Legacy literal grammar drift requires explicit authoring'
assert base['properties']['native']==active['properties']['native'], 'Native archive must stay opaque'
schema=copy.deepcopy(base);assert schema['properties']['version']=={'const':'0.2.0'}
schema['$id']='urn:umf:security:0.2.0';schema['title']='Proposed security0.2 policy wire representation; no activation'
text={'type':'string','minLength':1}
def obj(props,required):return {'type':'object','properties':props,'required':required,'additionalProperties':True}
def present(key):return {'type':'object','properties':{key:{}},'required':[key]}
legacy=schema['$defs']['disposition']['oneOf'][1];assert legacy['properties']['transform']=={'const':'constant'}
legacy['not']=present('vocabulary')
reference=obj({'kind':{'const':'transformed'},'vocabulary':{'const':'umf.security.protection'},'transform':text,'version':text,'field':{'$ref':'#/$defs/ref'}},['kind','vocabulary','transform','version','field']);reference['not']=present('value')
schema['$defs']['disposition']['oneOf'].append(reference)
schema['$defs']['protectionRef']=obj({'id':text,'revision':text},['id','revision'])
schema['properties']['protection']={'$ref':'#/$defs/protectionRef'}
# A pin is required only for an actual transformed catalog reference, never a
# reserved-looking member on an original/withheld disposition.
match=obj({'kind':{'const':'transformed'},'vocabulary':{'const':'umf.security.protection'}},['kind','vocabulary'])
disclosure=obj({'disposition':match},['disposition'])
rule=obj({'disclosure':{'type':'array','contains':disclosure}},['disclosure'])
schema['allOf']=[{'if':obj({'rules':{'type':'array','contains':rule}},['rules']),'then':obj({'protection':{'$ref':'#/$defs/protectionRef'}},['protection'])}]
manifest={'id':'umf.security','version':'0.2.0','coreVersion':'0.1.0','description':'Proposed security0.2 wire representation and loss-aware source migration; no activation','schema':schema,'semantics':'CONTRACT-062; combines the preserved narrower record/relationship prototype grammar and protection reference carrier. Wire validation and source address matching only; no general0.2/protection interpretation or native admission. The separate legacy-body access embedding delegates only the fully admitted0.1 body subset to the existing evaluator.','scopes':['document'],'capabilities':{'validation':'structural','directions':['import','export'],'evidence':['tests/security/protection/policy-v2.test.ts'],'native':{'system':'UMF-authored security representation','version':'0.2.0','subset':'Wire grammar, immutable representation migration and exact catalog source lookup only; no typed domain/function/query closure or native enforcement'}}}
out=Path('spec/extensions/security-v0.2');out.mkdir(exist_ok=True)
for name,data in [('schema.json',schema),('package.json',manifest)]: (out/name).write_text(json.dumps(data,indent=2)+'\n')
