"""Independent two-record SEC15 fixtures; no production fixture or SDK imports."""
import json,copy
from pathlib import Path
P=Path(__file__).parent
ref=lambda e:{'documentId':'write-oracle','moduleId':'types','elementId':e}
field=lambda e,t,n='required':{'id':e,'kind':'field','scalarType':t,'cardinality':'one','nullability':n,'extensions':{}}
record=lambda e,fs,k:{'id':e,'kind':'record','members':[{'module':'types','element':f} for f in fs],'keys':[{'id':'pk','name':e+' key','fields':[{'module':'types','element':k}]}],'extensions':{}}
elements=[field('staffKey','string'),field('resourceKey','string'),field('amount','integer','absent-allowed'),record('Staff',['staffKey'],'staffKey'),record('Resource',['resourceKey','amount'],'resourceKey')]
doc={'umf':'0.8.0','id':'write-oracle','vocabularies':{},'modules':[{'id':'types','namespace':'','elements':elements}]}
entities=[{'type':ref('Staff'),'keyId':'pk','fields':[{'ref':ref('staffKey'),'protection':'unprotected'}]},{'type':ref('Resource'),'keyId':'pk','fields':[{'ref':ref('resourceKey'),'protection':'unprotected'},{'ref':ref('amount'),'protection':'protected'}]}]
actions=['read-own','make','change','remove','mutate-key','mutate-amount','change-owner','change-policy','blind-amount','blind-key','unrelated']
ontology={'version':'0.1.0','documentId':'write-ontology','revision':'o1','documents':[{'documentId':'write-oracle','revision':'d1'}],'subject':ref('Staff'),'entities':entities,'associations':[],'context':[ref('amount')],'actions':actions}
resolution={'ontology':ontology,'documents':[{'revision':'d1','document':doc}]}
permit=lambda i,acts,condition={'op':'literal','value':True}:{'id':i,'effect':'permit','actions':acts,'target':[ref('Resource')],'condition':condition}
reader=permit('reader',['read-own']);reader['disclosure']=[{'field':ref('amount'),'disposition':{'kind':'original'}}]
policy={'vocabulary':'umf.security','version':'0.1.0','id':'write-policy','revision':'p1','ontology':{'documentId':'write-ontology','revision':'o1'},'rules':[reader,permit('ordinary-writer',['make','change','remove','mutate-key','mutate-amount','change-owner','change-policy'])]}
profile={'type':ref('Resource'),'createAction':'make','updateAction':'change','deleteAction':'remove','fieldActions':[{'field':ref('resourceKey'),'action':'mutate-key'},{'field':ref('amount'),'action':'mutate-amount'}],'policyAction':'change-policy','policyFields':[ref('amount')],'ownershipAction':'change-owner','ownershipFields':[],'ownershipAssociations':[],'readProtection':{'version':'umf.security.write-read/0.1.0','readAction':'read-own','blindWriteActions':[]}}
subject={'type':ref('Staff'),'key':[{'string':'s'}],'fields':[{'field':ref('staffKey'),'value':{'string':'s'}}],'absent':[]}
resource={'type':ref('Resource'),'key':[{'string':'r'}],'fields':[{'field':ref('resourceKey'),'value':{'string':'r'}},{'field':ref('amount'),'value':{'integerToken':'100'}}],'absent':[]}
cut={'trusted':True,'generation':'g1','expectedGeneration':'g1','policyId':'write-policy','policyRevision':'p1','ontologyDocumentId':'write-ontology','ontologyRevision':'o1','subjects':[subject],'facts':[],'coverage':[{'type':e['type'],'complete':True,'fields':[f['ref'] for f in e['fields']]} for e in entities],'context':[],'maxFacts':10,'maxSteps':100000}
original={'resource':resource,'cut':cut};proposed=copy.deepcopy(original);proposed['resource']['fields'][1]['value']={'integerToken':'200'}
base={'policy':policy,'resolution':resolution,'profile':profile,'request':{'operation':'update','original':original,'proposed':proposed}}
cases=[]
def eq(lex):return {'op':'eq','left':{'kind':'resource','field':ref('amount')},'right':{'kind':'constant','field':ref('amount'),'value':{'integerToken':lex}}}
def context_unknown():return {'op':'eq','left':{'kind':'context','field':ref('amount')},'right':{'kind':'constant','field':ref('amount'),'value':{'integerToken':'1'}}}
def form(id,admit,modify=lambda f:None):
 f=copy.deepcopy(base);modify(f);cases.append({'id':id,'expectedAdmission':admit,'expectedDecision':'permit' if admit else 'deny','input':f})
def disposition(f,d):f['policy']['rules'][0]['disclosure'][0]['disposition']=d
masked={'kind':'transformed','transform':'constant','version':'0.1.0','field':ref('amount'),'value':{'integerToken':'0'}}
def blind(f,cond=None):
 f['profile']['readProtection']['blindWriteActions']=[{'field':ref('amount'),'action':'blind-amount'}]
 f['policy']['rules'].append(permit('blind-authority',['blind-amount'],cond or {'op':'literal','value':True}))
form('original-visible-update',True)
form('withheld-no-blind',False,lambda f:disposition(f,{'kind':'withheld'}))
form('transformed-no-blind',False,lambda f:disposition(f,masked))
form('mask-output-write-back-no-blind',False,lambda f:(disposition(f,masked),f['request']['proposed']['resource']['fields'][1].update(value={'integerToken':'0'})))
form('transformed-null-no-blind',False,lambda f:disposition(f,{**masked,'value':None}))
form('read-denied-no-blind',False,lambda f:f['policy']['rules'][0].update(condition={'op':'literal','value':False}))
form('missing-protected-read-disposition',False,lambda f:f['policy']['rules'][0].pop('disclosure'))
form('conflicting-read-transform',False,lambda f:(disposition(f,masked),f['policy']['rules'].append({**copy.deepcopy(f['policy']['rules'][0]),'id':'second-mask','disclosure':[{'field':ref('amount'),'disposition':{**masked,'value':{'integerToken':'1'}}}]})))
form('original-null',True,lambda f:f['request']['original']['resource']['fields'][1].update(value=None))
form('original-absence',True,lambda f:(f['request']['original']['resource']['fields'].pop(),f['request']['original']['resource']['absent'].append(ref('amount'))))
form('proposed-absence',True,lambda f:(f['request']['proposed']['resource']['fields'].pop(),f['request']['proposed']['resource']['absent'].append(ref('amount'))))
form('equal-canonical-value-is-not-mutation',True,lambda f:(disposition(f,masked),f['request']['proposed']['resource']['fields'][1].update(value={'integerToken':'1e2'})))
form('blind-permit-withheld',True,lambda f:(disposition(f,{'kind':'withheld'}),blind(f)))
form('blind-permit-masked-output',True,lambda f:(disposition(f,masked),blind(f),f['request']['proposed']['resource']['fields'][1].update(value={'integerToken':'0'})))
form('blind-map-alone-no-grant',False,lambda f:(disposition(f,masked),f['profile']['readProtection']['blindWriteActions'].append({'field':ref('amount'),'action':'blind-amount'})))
form('unrelated-grant-not-blind',False,lambda f:(disposition(f,masked),f['profile']['readProtection']['blindWriteActions'].append({'field':ref('amount'),'action':'blind-amount'}),f['policy']['rules'].append(permit('unrelated-grant',['unrelated']))))
form('blind-wrong-field-no-substitute',False,lambda f:(disposition(f,masked),blind(f),f['profile']['readProtection']['blindWriteActions'][0].update(field=ref('resourceKey'))))
form('blind-alias-normal-field-action-refuses',False,lambda f:(blind(f),f['profile']['readProtection']['blindWriteActions'][0].update(action='mutate-amount')))
form('blind-unknown-original-permit',True,lambda f:blind(f,context_unknown()))
form('blind-permit-read-unknown',True,lambda f:(blind(f),f['policy']['rules'][0].update(condition=context_unknown())))
form('blind-unknown-masked-read-refuses',False,lambda f:(disposition(f,masked),blind(f,context_unknown())))
form('original-only-old-state-insufficient',False,lambda f:f['policy']['rules'][0].update(condition=eq('100')))
form('blind-only-old-state-insufficient',False,lambda f:(disposition(f,masked),blind(f,eq('100'))))
form('old-blind-new-original',True,lambda f:(blind(f,eq('100')),f['policy']['rules'][0].update(condition=eq('200'))))
for operation in ['create','delete']:
 def prepare(f,op=operation):
  f['request']['operation']=op;f['request'].pop('original' if op=='create' else 'proposed')
 form(operation+'-original',True,prepare)
 form(operation+'-withheld-refuses',False,lambda f,p=prepare:(p(f),disposition(f,{'kind':'withheld'})))
 form(operation+'-blind-permit',True,lambda f,p=prepare:(p(f),disposition(f,{'kind':'withheld'}),blind(f)))
form('old-unversioned-profile-no-default',False,lambda f:f['profile'].pop('readProtection'))
form('wrong-profile-version',False,lambda f:f['profile']['readProtection'].update(version='future'))
form('missing-explicit-blind-map',False,lambda f:f['profile']['readProtection'].pop('blindWriteActions'))
form('missing-read-action',False,lambda f:f['profile']['readProtection'].pop('readAction'))
form('extra-profile-member',False,lambda f:f['profile']['readProtection'].update(trusted=True))
form('mixed-generation-refuses',False,lambda f:f['request']['proposed']['cut'].update(generation='g2',expectedGeneration='g2'))
form('exhausted-budget-refuses',False,lambda f:(f['request']['original']['cut'].update(maxSteps=1),f['request']['proposed']['cut'].update(maxSteps=1)))
# Exact refusal classes follow the existing public write contract, independently
# of implementation outputs: malformed/unknown/ambiguous inputs are indeterminate;
# a valid nonoriginal read without the separately granted blind action is deny.
form('proposed-numeric-string-budget',False,lambda f:f['request']['proposed']['cut'].update(maxSteps='100000'))
form('original-numeric-string-budget',False,lambda f:f['request']['original']['cut'].update(maxSteps='100000'))
form('nonminimum-proposed-fractional-budget',False,lambda f:(f['request']['original']['cut'].update(maxSteps=10000),f['request']['proposed']['cut'].update(maxSteps=100000.5)))
form('nonminimum-original-fractional-budget',False,lambda f:(f['request']['original']['cut'].update(maxSteps=100000.5),f['request']['proposed']['cut'].update(maxSteps=10000)))
form('boolean-budget',False,lambda f:f['request']['proposed']['cut'].update(maxSteps=True))
indeterminate={
 'missing-protected-read-disposition','conflicting-read-transform',
 'blind-alias-normal-field-action-refuses','blind-unknown-masked-read-refuses',
 'old-unversioned-profile-no-default','wrong-profile-version',
 'missing-explicit-blind-map','missing-read-action','extra-profile-member',
 'mixed-generation-refuses','exhausted-budget-refuses',
 'proposed-numeric-string-budget','original-numeric-string-budget',
 'nonminimum-proposed-fractional-budget','nonminimum-original-fractional-budget',
 'boolean-budget'
}
for case in cases:
 if case['id'] in indeterminate:case['expectedDecision']='indeterminate'
(P/'fixtures.json').write_text(json.dumps({'version':'independent-write-read-design-oracle/1','scope':'Proposed .1 profile correction, not full S24/S25 or .2/native acceptance. Admission expectations fixed from explicit read-original OR permitted blind condition per selected state.','cases':cases},indent=2)+'\n');print(len(cases))
