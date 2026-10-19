# SPDX-License-Identifier: MIT OR Apache-2.0
"""Independent finite S21/S22/S23 declaration oracle. No UMF imports or execution."""
import copy,json
from pathlib import Path
HERE=Path(__file__).resolve().parent
D='independent-protection-core'; M='records'
def ref(e):return {'documentId':D,'moduleId':M,'elementId':e}
def field(e,t):return {'id':e,'kind':'field','scalarType':t,'cardinality':'one','nullability':'required','extensions':{}}
def record(e,fields,key):return {'id':e,'kind':'record','members':[{'module':M,'element':f} for f in fields],'keys':[{'id':'pk','name':e+' identity','fields':[{'module':M,'element':key}]}],'extensions':{}}
records=[('Staff',['staffId'],'staffId'),('Resource',['resourceId','amount','token','cipher','hash'],'resourceId'),('DTO',['dtoId','otherAmount','otherToken'],'dtoId')]
elements=[field(k,t) for k,t in [('staffId','string'),('resourceId','string'),('amount','integer'),('token','string'),('cipher','binary'),('hash','string'),('dtoId','string'),('otherAmount','integer'),('otherToken','string')]]+[record(*r) for r in records]
doc={'umf':'0.8.0','id':D,'vocabularies':{},'modules':[{'id':M,'namespace':'','elements':elements}]}
pins=[{'documentId':D,'revision':'core-r1'}]
actions=[('alpha','read'),('beta','field'),('gamma','original-authorized'),('delta','reverse'),('epsilon','reverse'),('zeta','vault-write'),('eta','vault-write'),('theta','other')]
ontology={'version':'0.2.0','documentId':'independent-ontology','revision':'ontology-r1','documents':pins,'subject':ref('Staff'),'entities':[{'type':ref(r),'keyId':'pk','fields':[{'ref':ref(f),'protection':'protected' if f=='amount' else 'unprotected'} for f in fs]} for r,fs,_ in records],'associations':[],'context':[],'actions':[a for a,_ in actions],'actionPurposes':[{'action':a,'purposes':[p]} for a,p in actions]}
channels=['history','snapshots','exports','feeds','caches']
def custody(owner,key,vault_action):return {'owner':owner,**key,'formatPreserving':False,'storageEffect':'stored-transformed','propagation':{c:'retain opaque '+c+' \u2603' for c in channels},'vaultWriteAction':vault_action}
def transform(i,k,out,rev='none'):return {'id':i,'version':'recipe-r1','kind':k,'inputDomain':ref('amount'),'outputDomain':ref(out),'determinism':'deterministic','reversibility':rev,'parameters':[],'disclosureProfile':[],'queryUse':{}}
h0=transform('unsalted','hash','hash');h0.update(algorithm='declared-hash/v7',saltCustody={'kind':'none'})
h1=transform('salted','hash','hash');h1.update(algorithm='declared-hash/v8',saltCustody={'kind':'keyed','owner':'salt-owner','keyRef':'salt-reference'})
t0=transform('vault-token','tokenize','token','vault');t0.update(determinism='random',reverseAction='delta',custody=custody('vault-owner',{'vaultRef':'vault-reference'},'zeta'))
e0=transform('key-cipher','encrypt','cipher','keyed');e0.update(reverseAction='epsilon',custody=custody('cipher-owner',{'keyRef':'cipher-reference'},'eta'))
transforms=[h0,h1,t0,e0]
catalog={'vocabulary':'umf.security.protection','version':'0.1.0','id':'independent-catalog','revision':'catalog-r1','transforms':transforms,'native':{'unverified':'opaque backend bytes \u0000 \U0001f512'}}
def rule(i,t):return {'id':'rule-'+str(i),'effect':'permit','actions':['alpha'],'target':[ref('Resource')],'condition':{'op':'literal','value':True},'disclosure':[{'field':ref('amount'),'disposition':{'kind':'transformed','vocabulary':'umf.security.protection','transform':t['id'],'version':t['version'],'field':copy.deepcopy(t['outputDomain'])}}]}
rules=[rule(i,t) for i,t in enumerate(transforms)]+[{'id':'legitimate-reversal-grant','effect':'permit','actions':['delta','epsilon','zeta','eta'],'target':[ref('Resource')],'condition':{'op':'literal','value':True}}]
policy={'vocabulary':'umf.security','version':'0.2.0','id':'independent-policy','revision':'policy-r1','ontology':{'documentId':ontology['documentId'],'revision':ontology['revision']},'protection':{'id':catalog['id'],'revision':catalog['revision']},'rules':rules,'native':{'opaque':'not executable'}}
base={'policy':policy,'catalog':catalog,'closure':{'pins':pins,'documents':[{'revision':'core-r1','document':doc}]},'ontology':ontology}
WARNING='Unsalted hashes expose equality and need assessment for dictionary attacks; no algorithm or custody enforcement is verified.'
def expected_obligations(f):
    out=[]
    def add(t,k,v):out.append({'transform':{'id':t['id'],'version':t['version']},'kind':k,'status':'unverified','declaration':copy.deepcopy(v)})
    for t in f['catalog']['transforms']:
        if t['kind']=='hash':
            add(t,'hash-algorithm',{'algorithm':t['algorithm']});add(t,'salt-custody',t['saltCustody'])
            if t['saltCustody']['kind']=='none':add(t,'dictionary-attack-warning',{'code':'UNSALTED_HASH_DICTIONARY_ATTACK','warning':WARNING})
        if 'custody' in t:
            c=t['custody'];add(t,'stored-custody',c)
            for channel in channels:add(t,'propagation',{'channel':channel,'declaration':c['propagation'][channel]})
            if 'vaultWriteAction' in c:add(t,'vault-write-action',{'action':c['vaultWriteAction']})
        if t['reversibility'] in ('keyed','vault'):add(t,'reverse-action',{'action':t['reverseAction'],'reversibility':t['reversibility']})
    return out
cases=[]
def edit(path,value=None,remove=False):return {'op':'remove' if remove else 'set','path':path,**({} if remove else {'value':value})}
def apply(f,op):
    parts=op['path'].strip('/').split('/');at=f
    for p in parts[:-1]:at=at[int(p)] if isinstance(at,list) else at[p]
    p=int(parts[-1]) if isinstance(at,list) else parts[-1]
    if op['op']=='remove':del at[p]
    else:at[p]=copy.deepcopy(op['value'])
def case(group,id,changes=(),ok=False,mode='obligations',expand=None,code=None):
    f=copy.deepcopy(base)
    for op in changes:apply(f,op)
    if expand and expand['kind']=='purposes':
        n=expand['count'];f['ontology']['actions']=['purpose-'+str(i) for i in range(n)];f['ontology']['actionPurposes']=[{'action':a,'purposes':['other']} for a in f['ontology']['actions']]
    if expand and expand['kind']=='action':
        a='x'*expand['length'];f['ontology']['actions'][0]=a;f['ontology']['actionPurposes'][0]['action']=a
    c={'id':id,'group':group,'mode':mode,'changes':list(changes),'expected':'declared-obligations' if ok else 'refused'}
    if mode=='purposes':c['expected']='resolved-purposes' if ok else 'refused';c['expectedPurposes']=f['ontology'].get('actionPurposes',[]) if ok else []
    elif mode=='obligations':c['expectedObligations']=expected_obligations(f) if ok else []
    if expand:c['expand']=expand
    if code:c['code']=code
    cases.append(c)
# S21: exact report, nonexecuting declarations, algorithms/salt, whole-source and atomic closure.
case('S21','complete-four-transform-exact-obligations',ok=True)
case('S21','algorithm-name-opaque-not-executed',[edit('/catalog/transforms/0/algorithm','(()=>{throw new Error("must not execute")})()')],ok=True)
for idx in [0,1]:
 for name,value,remove in [('missing',None,True),('empty','',False),('wrong',False,False)]:
  case('S21','hash-'+str(idx)+'-algorithm-'+name,[edit('/catalog/transforms/'+str(idx)+'/algorithm',value,remove)])
 for name,value,remove in [('missing',None,True),('null',None,False),('unknown',{'kind':'future'},False),('extra',{'kind':'none','opaque':1},False)]:
  case('S21','hash-'+str(idx)+'-salt-'+name,[edit('/catalog/transforms/'+str(idx)+'/saltCustody',value,remove)])
for k in ['owner','keyRef']:
 for remove,value in [(True,None),(False,''),(False,{'opaque':'unknown'})]:case('S21','salt-keyed-'+k+'-'+str(remove)+'-'+str(value),[edit('/catalog/transforms/1/saltCustody/'+k,value,remove)])
case('S21','unsalted-random-no-equality',[edit('/catalog/transforms/0/determinism','random')],code='PROTECTION_DECLARATIONS')
case('S21','unsalted-random-authored-equality',[edit('/catalog/transforms/0/determinism','random'),edit('/catalog/transforms/0/disclosureProfile',['equality'])],ok=True)
case('S21','unsalted-keyed-determinism-implies-equality',[edit('/catalog/transforms/0/determinism','keyed-deterministic')],ok=True)
case('S21','salted-random-no-equality-no-dictionary-warning',[edit('/catalog/transforms/1/determinism','random')],ok=True)
case('S21','explicit-equality-also-retains-warning',[edit('/catalog/transforms/0/disclosureProfile',['equality'])],ok=True)
for idx in [2,3]:
 for k in ['custody','reverseAction']:
  case('S21','transform'+str(idx)+'-missing-'+k,[edit('/catalog/transforms/'+str(idx)+'/'+k,remove=True)])
 for k in ['owner','formatPreserving','storageEffect','vaultRef' if idx==2 else 'keyRef']:
  case('S21','transform'+str(idx)+'-missing-custody-'+k,[edit('/catalog/transforms/'+str(idx)+'/custody/'+k,remove=True)])
 case('S21','transform'+str(idx)+'-wrong-storage',[edit('/catalog/transforms/'+str(idx)+'/custody/storageEffect','canonical')])
 case('S21','transform'+str(idx)+'-unknown-custody',[edit('/catalog/transforms/'+str(idx)+'/custody/future',{'must':'preserve'})])
 case('S21','transform'+str(idx)+'-optional-vault-write-absent',[edit('/catalog/transforms/'+str(idx)+'/custody/vaultWriteAction',remove=True)],ok=True)
case('S21','none-with-reverse-contradiction',[edit('/catalog/transforms/0/reverseAction','delta')],code='PROTECTION_DECLARATIONS')
for path,value in [('/policy/ontology/revision','stale'),('/policy/ontology/documentId','foreign'),('/policy/protection/revision','stale'),('/policy/protection/id','foreign'),('/closure/pins/0/revision','stale'),('/closure/documents/0/revision','stale'),('/ontology/documents/0/revision','stale'),('/catalog/version','9.9.9'),('/catalog/transforms/3/kind','unknown'),('/policy/version','0.1.0'),('/ontology/version','0.1.0'),('/policy/rules/0/actions',['undeclared']),('/catalog/transforms/3/future',{'x':True}),('/closure/documents/0/document/umf','0.7.0')]:
 case('S21','source-refusal-'+path,[edit(path,value)])
case('S21','late-unused-transform-invalid-action',[edit('/policy/rules',rules[:2]+rules[4:]),edit('/catalog/transforms/3/reverseAction','alpha')],code='PROTECTION_DECLARATIONS')
case('S21','unselected-transforms-still-all-reported',[edit('/policy/rules',rules[4:])],ok=True)
for k in ['input','output']:
 path='/policy/rules/2/disclosure/0/'+('field' if k=='input' else 'disposition/field')
 case('S21','same-family-selected-'+k+'-substitution',[edit(path,ref('otherAmount' if k=='input' else 'otherToken'))],code='PROTECTION_DECLARATIONS')
case('S21','catalog-opaque-native-retained',[edit('/catalog/native',{'future':{'deep':['opaque',{'script':'never run'}]}})],ok=True)
case('S21','catalog-private-text-bound',expand={'kind':'catalog-text','length':4_000_001},code='PROTECTION_BOUND')
# S22: full exact purpose closure, exclusive secret operations, legitimate grants.
case('S22','legitimate-reverse-vault-policy-grants-do-not-invalidate-model',ok=True)
for idx,k in [(2,'reverseAction'),(3,'reverseAction'),(2,'custody/vaultWriteAction'),(3,'custody/vaultWriteAction')]:
 for action in ['alpha','beta','gamma','theta','undeclared',('zeta' if k=='reverseAction' else 'delta')]:
  case('S22','purpose-'+str(idx)+'-'+k+'-'+action,[edit('/catalog/transforms/'+str(idx)+'/'+k,action)],code='PROTECTION_DECLARATIONS')
case('S22','ordinary-purpose-combination-allowed',[edit('/ontology/actionPurposes/0/purposes',['read','field','original-authorized'])],ok=True)
case('S22','declaration-and-universe-order-independent',[edit('/ontology/actionPurposes',list(reversed(ontology['actionPurposes']))),edit('/ontology/actions',list(reversed(ontology['actions'])))],ok=True)
for kind in ['reverse','vault-write','other']:
 for extra in ['read','field','original-authorized','reverse','vault-write','other']:
  if kind!=extra:case('S22','exclusive-'+kind+'-'+extra,[edit('/ontology/actionPurposes/0/purposes',[kind,extra])])
for name,path,value,remove in [
 ('missing','/ontology/actionPurposes',None,True),('empty','/ontology/actionPurposes',[],False),('null','/ontology/actionPurposes',None,False),('missing-last','/ontology/actionPurposes/7',None,True),('duplicate','/ontology/actionPurposes',ontology['actionPurposes']+[ontology['actionPurposes'][0]],False),('foreign','/ontology/actionPurposes/0/action','foreign',False),('extra-member','/ontology/actionPurposes/0/future',{'x':True},False),('unknown-purpose','/ontology/actionPurposes/0/purposes',['future'],False),('duplicate-purpose','/ontology/actionPurposes/0/purposes',['read','read'],False),('empty-purpose','/ontology/actionPurposes/0/purposes',[],False),('null-purpose','/ontology/actionPurposes/0/purposes',None,False),('boolean-purpose','/ontology/actionPurposes/0/purposes',[True],False),('missing-action','/ontology/actionPurposes/0/action',None,True),('duplicate-action','/ontology/actions',ontology['actions']+[ontology['actions'][0]],False),('extra-action','/ontology/actions',ontology['actions']+['unclassified'],False)]:
 case('S22','purpose-closure-'+name,[edit(path,value,remove)])
# Swapped lexical names do not manufacture source purposes: preserve explicit mapping only.
renamed=copy.deepcopy(base)
rename={'alpha':'reverse','delta':'read','zeta':'query-original'}
for e in renamed['ontology']['actionPurposes']:e['action']=rename.get(e['action'],e['action'])
renamed['ontology']['actions']=[rename.get(a,a) for a in renamed['ontology']['actions']]
for r in renamed['policy']['rules']:r['actions']=[rename.get(a,a) for a in r['actions']]
renamed['catalog']['transforms'][2]['reverseAction']='read';renamed['catalog']['transforms'][2]['custody']['vaultWriteAction']='query-original'
case('S22','spelling-is-not-purpose-or-owner-designation',[edit('/ontology',renamed['ontology']),edit('/policy',renamed['policy']),edit('/catalog',renamed['catalog'])],ok=True)
for n in [256,257]:case('S22','purpose-count-'+str(n),mode='purposes',ok=n==256,expand={'kind':'purposes','count':n})
for n in [4096,4097]:case('S22','action-length-'+str(n),mode='purposes',ok=n==4096,expand={'kind':'action','length':n})
case('S22','purpose-private-text-bound',mode='purposes',expand={'kind':'purpose-text','length':4_000_001},code='SECURITY_ACTION_PURPOSE_BOUND')
# S23 all five channels, full opaque source and atomic refusal.
case('S23','five-channels-both-storage-transforms-exact',ok=True)
for idx in [2,3]:
 for ch in channels:
  for name,value,remove in [('missing',None,True),('empty','',False),('unknown-object',{'future':'unknown'},False),('boolean',True,False),('null',None,False)]:case('S23',str(idx)+'-'+ch+'-'+name,[edit('/catalog/transforms/'+str(idx)+'/custody/propagation/'+ch,value,remove)])
  case('S23',str(idx)+'-'+ch+'-opaque-declaration-retained',[edit('/catalog/transforms/'+str(idx)+'/custody/propagation/'+ch,'not executable: (() => { throw 1; })(); \n\u0000\U0001f512')],ok=True)
 for name,value,remove in [('missing',None,True),('null',None,False),('empty',{},False)]:case('S23',str(idx)+'-propagation-'+name,[edit('/catalog/transforms/'+str(idx)+'/custody/propagation',value,remove)])
 case('S23',str(idx)+'-unknown-channel',[edit('/catalog/transforms/'+str(idx)+'/custody/propagation/future','must preserve')])
case('S23','unselected-late-missing-cache-clears-all',[edit('/policy/rules',rules[:3]+rules[4:]),edit('/catalog/transforms/3/custody/propagation/caches',remove=True)])
# Source provenance cannot be replaced by request/native metadata; exact opaque IDs include special object spellings.
case('S22','policy-native-cannot-supply-purpose-closure',[edit('/ontology/actionPurposes',remove=True),edit('/policy/native',{'actionPurposes':ontology['actionPurposes']})])
case('S22','catalog-native-cannot-supply-purpose-closure',[edit('/ontology/actionPurposes',remove=True),edit('/catalog/native',{'actionPurposes':ontology['actionPurposes']})])
for spelling in ['__proto__','constructor','read\u0000reverse','re\u0301verse','r\u00e9verse']:
    case('S22','opaque-action-'+spelling,[edit('/ontology/actions/0',spelling),edit('/ontology/actionPurposes/0/action',spelling)],ok=True,mode='purposes')
# The data codec carries stored canonical tokens; it does not reverse or authenticate.
batch={'version':'umf.security.disclosure/0.2.0','policy':{'id':policy['id'],'revision':policy['revision']},'protection':policy['protection'],'domains':pins,'columns':[{'field':ref('token'),'storageEffect':'stored-transformed','storageTransform':{'id':'vault-token','version':'recipe-r1'}}],'rows':[[{'disposition':'original','value':{'string':'opaque-token/\u0000/\U0001f512'}}]]}
base['batch']=batch
for name,changes,ok in [
 ('original-stored-token',[],True),('withheld-stored-token',[edit('/batch/rows',[[{'disposition':'withheld'}]])],True),('required-token-absent-refuses',[edit('/batch/rows',[[{'disposition':'absent'}]])],False),('nullable-token-absent',[edit('/closure/documents/0/document/modules/0/elements/3/nullability','absent-allowed'),edit('/batch/rows',[[{'disposition':'absent'}]])],True),
 ('original-cipher',[edit('/batch/columns',[{'field':ref('cipher'),'storageEffect':'stored-transformed','storageTransform':{'id':'key-cipher','version':'recipe-r1'}}]),edit('/batch/rows',[[{'disposition':'original','value':{'binaryHex':'0001aB'}}]])],True),
 ('wrong-plaintext-domain',[edit('/batch/rows',[[{'disposition':'original','value':{'integerToken':'12345678901234567890'}}]])],False),
 ('storage-tag-downgrade',[edit('/batch/columns/0/storageEffect','canonical'),edit('/batch/columns/0/storageTransform',remove=True)],False),
 ('storage-input-substitution',[edit('/batch/columns/0/field',ref('amount')),edit('/batch/rows',[])],False),
 ('unknown-reversed-disposition',[edit('/batch/rows',[[{'disposition':'reversed','value':{'integerToken':'123'}}]])],False),
 ('invented-original-action',[edit('/batch/rows/0/0/originalAction','gamma')],False),
 ('fake-permission',[edit('/batch/authority',True)],False),
 ('changed-canonical-field',[edit('/batch/columns/0/field',ref('otherToken')),edit('/batch/rows',[])],False),
 ('stale-catalog-pin',[edit('/batch/protection/revision','stale')],False),
 ('wrong-storage-transform',[edit('/batch/columns/0/storageTransform/version','missing')],False),
 ('reversal-grant-absent-does-not-reverse',[edit('/policy/rules',rules[:4])],True),
 ('read-grants-absent-data-only',[edit('/policy/rules',[])],True)]:
 c={'id':'codec-'+name,'group':'S22','mode':'codec','changes':changes,'expected':'validated-disclosure' if ok else 'refused'};cases.append(c)
packet={'version':'independent-protection-obligations-oracle/1','scope':'Source declarations and typed data transport only; no route/owner/native enforcement or permission. Expected records authored from CONTRACT062, not observed SDK output.','base':base,'cases':cases}
(HERE/'fixtures.json').write_text(json.dumps(packet,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'cases':len(cases),'groups':{g:sum(c['group']==g for c in cases) for g in ['S21','S22','S23']}}))
