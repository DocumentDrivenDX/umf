#!/usr/bin/env python3
"""Independent finite contract expectations, authored without executing UMF.
S24: each changed Field needs original-read OR its exact mapped blind grant,
plus ordinary permissions in every required state. S25 additionally needs the
selected stored transform's exact vault-write grant. Graph population controls
exercise the whole logical transaction; no native-effect or authority oracle.
"""
import copy,json,sys
from pathlib import Path
D='review-domain'
def ref(n,m='entities'): return dict(documentId=D,moduleId=m,elementId=n)
def literal(x): return dict(op='literal',value=x)
TRUE=literal(True)
def core_field(n,t='string',nullable=False,**extra): return dict(id=n,kind='field',scalarType=t,cardinality='one',nullability='absent-allowed' if nullable else 'required',extensions={},**extra)
def fixture(mode='flat'):
    definitions=[('Person',[('person-key','string',False),('person-label','string',True)]),('Asset',[('asset-key','string',False),('amount','integer',True)]),('Link',[('link-key','string',False),('link-person','string',False),('link-asset','string',False),('note','string',True)])]
    elements=[];entities=[]
    for name,fs in definitions:
        members=[dict(module='entities',element=n) for n,t,b in fs]
        elements.append(dict(id=name,kind='record',members=members,keys=[dict(id='pk',name='Primary',fields=[members[0]])],extensions={}))
        elements.extend(core_field(n,t,b) for n,t,b in fs)
        entities.append(dict(type=ref(name),keyId='pk',fields=[dict(ref=ref(n),protection='protected' if n=='amount' else 'unprotected') for n,t,b in fs]))
    document=dict(umf='0.8.0',id=D,vocabularies={},modules=[dict(id='entities',namespace='',elements=elements),dict(id='domains',namespace='',elements=[core_field('dto-number','integer',True),core_field('dto-text','string',True),core_field('dto-required')])])
    ordinary=['create','update','delete','write-field','change-owner','change-policy']
    actions=['read']+ordinary+['blind']
    ontology=dict(version='0.2.0',documentId='review-ontology',revision='ontology-r1',documents=[dict(documentId=D,revision='model-r1')],subject=ref('Person'),entities=entities,associations=[dict(kind='record-members',type=ref('Link'),keyId='pk',endpoints=[dict(role='person',target=ref('Person'),fields=[ref('link-person')]),dict(role='asset',target=ref('Asset'),fields=[ref('link-asset')])])],context=[],actions=actions,actionPurposes=[dict(action=a,purposes=['read' if a=='read' else 'field']) for a in actions])
    policy=dict(vocabulary='umf.security',version='0.2.0',id='review-policy',revision='policy-r1',ontology=dict(documentId=ontology['documentId'],revision=ontology['revision']),rules=[dict(id='read-rule',effect='permit',actions=['read'],target=[ref('Asset')],condition=TRUE,disclosure=[dict(field=ref('amount'),disposition=dict(kind='original'))]),dict(id='ordinary',effect='permit',actions=ordinary,target=[e['type'] for e in entities],condition=TRUE),dict(id='blind-grant',effect='permit',actions=['blind'],target=[e['type'] for e in entities],condition=TRUE)])
    owner=dict(version='umf.security.logical-owner/0.1',id='review-owner',revision='owner-r1',storage=[dict(type=e['type'],field=f['ref'],storageEffect='canonical') for e in entities for f in e['fields']])
    def fact(t,k,values): return dict(type=ref(t),key=[dict(string=k)],fields=[dict(field=ref(n),value=v) for n,v in values],absent=[])
    cut=dict(version='umf.security.logical-facts/0.1',trusted=True,generation='g1',expectedGeneration='g1',policy=dict(id=policy['id'],revision=policy['revision']),ontology=policy['ontology'],protection=None,domains=ontology['documents'],owner=dict(id=owner['id'],revision=owner['revision']),subject=dict(type=ref('Person'),key=[dict(string='p1')]),facts=[fact('Person','p1',[('person-key',dict(string='p1')),('person-label',None)]),fact('Asset','a1',[('asset-key',dict(string='a1')),('amount',dict(integerToken='1'))]),fact('Link','l1',[('link-key',dict(string='l1')),('link-person',dict(string='p1')),('link-asset',dict(string='a1')),('note',None)])],graphs=[],coverage=[dict(type=e['type'],complete=True,fields=[f['ref'] for f in e['fields']]) for e in entities],graphCoverage=[],context=[],valueProfiles=[],maxFacts=1000,maxSteps=1000000)
    if mode!='flat':
        rel=dict(documentId=D,moduleId='entities',relationshipId='DirectLink');opaque=mode=='opaque'
        relation=dict(id='DirectLink',name='DirectLink',directed=True,sourceMultiplicity=dict(min=0,max=1),targetMultiplicity=dict(min=0,max=2),targetLifecycle='independent',source=[dict(module='entities',element='Person')],target=[dict(module='entities',element='Asset',key='pk')])
        if not opaque: relation['associationRecord']=dict(module='entities',element='Link')
        document['modules'][0]['relationships']=[relation]
        witness=dict(kind='opaque-existential') if opaque else dict(kind='record-key',type=ref('Link'),keyId='pk')
        ontology['associations']=[dict(kind='core-relationship',relationship=rel,witness=witness,endpoints=[dict(role='person',side='source',target=ref('Person'),keyId='pk'),dict(role='asset',side='target',target=ref('Asset'),keyId='pk')])]
        cut['graphs']=[dict(relationship=rel,witness=dict(kind='opaque-existential',id='w1') if opaque else dict(kind='record-key',type=ref('Link'),key=[dict(string='l1')]),endpoints=[dict(role='person',key=[dict(string='p1')]),dict(role='asset',key=[dict(string='a1')])])]
        cut['graphCoverage']=[dict(relationship=rel,complete=True,roles=['person','asset'],fields=[] if opaque else [f['ref'] for f in entities[2]['fields']])]
    profile=dict(version='umf.security.catalog-write/0.1',id='independent-write',revision='v1',owner=cut['owner'],types=[dict(type=e['type'],createAction='create',updateAction='update',deleteAction='delete',fieldActions=[dict(field=f['ref'],action='write-field') for f in e['fields']],policyAction='change-policy',policyFields=[f['ref'] for f in e['fields']],ownershipAction='change-owner',ownershipFields=[],readProtection=dict(version='umf.security.write-read/0.1.0',readAction='read',blindWriteActions=[dict(field=f['ref'],action='blind') for f in e['fields']])) for e in entities],associations=[dict(source=dict(kind=a['kind'],ref=a['type'] if a['kind']=='record-members' else a['relationship']),mode='immutable') for a in ontology['associations']])
    request=dict(version='umf.security.catalog-transaction/0.1',profile=dict(id=profile['id'],revision=profile['revision']),before=copy.deepcopy(cut),after=copy.deepcopy(cut),mutations=[mutation('Asset','a1')],maxSteps=1000000,maxFacts=1000)
    f=dict(policy=policy,catalog=None,ontology=ontology,closure=dict(pins=ontology['documents'],documents=[dict(revision='model-r1',document=document)]),owner=owner,profile=profile,request=request)
    setv(f['request']['after'],'Asset','amount',dict(integerToken='2'))
    return copy.deepcopy(f)
def mutation(t,k,op='update'): return dict(operation=op,type=ref(t),key=[dict(string=k)])
def row(c,t='Asset'): return next(r for r in c['facts'] if r['type']==ref(t))
def field(f,n): return next(x for x in f['closure']['documents'][0]['document']['modules'][0]['elements'] if x['id']==n)
def profile(f,t='Asset'): return next(p for p in f['profile']['types'] if p['type']==ref(t))
def setv(c,t,n,v): next(p for p in row(c,t)['fields'] if p['field']==ref(n))['value']=v
def absent(c,t,n):
    r=row(c,t);r['fields']=[p for p in r['fields'] if p['field']!=ref(n)];r['absent'].append(ref(n))
def rule(f,n): return next(r for r in f['policy']['rules'] if r['id']==n)
def no_blind(f,t='Asset'): profile(f,t)['readProtection']['blindWriteActions']=[]
def condition_for(states,n='amount'):
    values={'before':'1','after':'2'}
    if len(states)==2:return TRUE
    if not states:return literal(False)
    return dict(op='eq',left=dict(kind='resource',field=ref(n)),right=dict(kind='constant',field=ref('dto-number','domains'),value=dict(integerToken=values[states[0]])))
def grant_states(f,name,states):
    r=rule(f,name);r['target']=[ref('Asset')];r['condition']=condition_for(states)
def disposition(f,kind):
    d=dict(kind=kind)
    if kind=='inline':d=dict(kind='transformed',transform='constant',version='0.1.0',field=ref('dto-number','domains'),value=dict(integerToken='0'))
    if kind=='catalog':
        f['catalog']=dict(vocabulary='umf.security.protection',version='0.1.0',id='mask',revision='v1',transforms=[dict(id='constant',version='v1',kind='mask',function='constant',inputDomain=ref('amount'),outputDomain=ref('dto-number','domains'),parameters=[dict(name='value',field=ref('dto-number','domains'),value=dict(integerToken='0'))],determinism='deterministic',reversibility='none',disclosureProfile=[],queryUse={})])
        f['policy']['protection']=dict(id='mask',revision='v1')
        for s in ['before','after']:f['request'][s]['protection']=copy.deepcopy(f['policy']['protection'])
        d=dict(kind='transformed',vocabulary='umf.security.protection',transform='constant',version='v1',field=ref('dto-number','domains'))
    rule(f,'read-rule')['disclosure'][0]['disposition']=d

def stored(kind='tokenize'):
    f=fixture();t=ref('token')
    field(f,'Asset')['members'].append(dict(module='entities',element='token'))
    f['closure']['documents'][0]['document']['modules'][0]['elements'].append(core_field('token',nullable=True))
    f['ontology']['entities'][1]['fields'].append(dict(ref=t,protection='protected'))
    f['ontology']['actions']+=['reverse-token','vault','other-vault']
    f['ontology']['actionPurposes']+=[dict(action='reverse-token',purposes=['reverse']),dict(action='vault',purposes=['vault-write']),dict(action='other-vault',purposes=['vault-write'])]
    f['catalog']=dict(vocabulary='umf.security.protection',version='0.1.0',id='stored',revision='v1',transforms=[dict(id='stored-transform',version='v1',kind=kind,inputDomain=ref('amount'),outputDomain=t,parameters=[],determinism='random',reversibility='vault' if kind=='tokenize' else 'keyed',reverseAction='reverse-token',disclosureProfile=[],queryUse={},custody=dict(owner='owner',vaultRef='opaque',formatPreserving=False,storageEffect='stored-transformed',propagation={c:'declared' for c in ['history','snapshots','exports','feeds','caches']},vaultWriteAction='vault'))])
    if kind=='encrypt':
        f['catalog']['transforms'][0]['custody']['keyRef']=f['catalog']['transforms'][0]['custody'].pop('vaultRef')
    f['policy']['protection']=dict(id='stored',revision='v1')
    rule(f,'read-rule')['disclosure'].append(dict(field=t,disposition=dict(kind='original')))
    f['policy']['rules'].append(dict(id='vault-grant',effect='permit',actions=['vault'],target=[ref('Asset')],condition=TRUE))
    f['owner']['storage'].append(dict(type=ref('Asset'),field=t,storageEffect='stored-transformed',storageTransform=dict(id='stored-transform',version='v1')))
    p=profile(f);p['fieldActions'].append(dict(field=t,action='write-field'));p['policyFields'].append(t);p['readProtection']['blindWriteActions'].append(dict(field=t,action='blind'))
    for s,v in [('before','old-token'),('after','new-token')]:
        c=f['request'][s];c['protection']=copy.deepcopy(f['policy']['protection']);next(x for x in c['coverage'] if x['type']==ref('Asset'))['fields'].append(t);row(c)['fields'].append(dict(field=t,value=dict(string=v)));setv(c,'Asset','amount',dict(integerToken='1'))
    return f

def no_links(f):
    for s in ['before','after']:
        c=f['request'][s];c['facts']=[r for r in c['facts'] if r['type']!=ref('Link')];c['graphs']=[]
def operation(f,op):
    if op=='create':
        f['request']['before']['facts']=[r for r in f['request']['before']['facts'] if r['type']!=ref('Asset')]
        f['request']['before']['graphs']=[]
    elif op=='delete':
        f['request']['after']['facts']=[r for r in f['request']['after']['facts'] if r['type']!=ref('Asset')]
        f['request']['after']['graphs']=[]
    if op!='update':no_links(f)
    f['request']['mutations']=[mutation('Asset','a1',op)]
def owned(f): f['profile']['associations'][0].update(mode='owned',ownerType=ref('Asset'),anchor=dict(kind='endpoint',role='asset'))

def generate():
    out=[]
    def add(case,name,f,expected):out.append(dict(case=case,id=name,input=copy.deepcopy(f),expected=expected))
    subsets=[[],['before'],['after'],['before','after']]
    # Independently evaluate the required two-state OR, not implementation output.
    for d in ['original','withheld','inline','catalog']:
      for reads in subsets:
       for blinds in subsets:
        f=fixture();disposition(f,d);grant_states(f,'read-rule',reads);grant_states(f,'blind-grant',blinds)
        ok=all(s in blinds or d=='original' and s in reads for s in ['before','after'])
        add('S24','two-state-'+d+'-read'+str(subsets.index(reads))+'-blind'+str(subsets.index(blinds)),f,'permit' if ok else 'deny')
    for op in ['create','update','delete']:
      for d in ['original','withheld','inline','catalog']:
       for blind in [False,True]:
        f=fixture();operation(f,op);disposition(f,d)
        if not blind:no_blind(f)
        add('S24',op+'-'+d+'-'+str(blind),f,'permit' if blind or d=='original' else 'deny')
    for d in ['withheld','inline','catalog']:
      for value in ['0','9']:
        f=fixture();disposition(f,d);no_blind(f);setv(f['request']['after'],'Asset','amount',dict(integerToken=value));add('S24','mask-equal-distinct-'+d+'-'+value,f,'deny')
    for old,new in [(None,dict(integerToken='2')),(dict(integerToken='1'),None),(None,'absent'),('absent',None)]:
      f=fixture();no_blind(f)
      for s,v in [('before',old),('after',new)]:
        if v=='absent':absent(f['request'][s],'Asset','amount')
        else:setv(f['request'][s],'Asset','amount',v)
      add('S24','original-null-absence-'+str(len(out)),f,'permit')
    for op in ['create','delete']:
      f=fixture();operation(f,op);owned(f);rule(f,'ordinary')['actions'].remove('change-owner');add('S24',op+'-empty-owned-inventory-still-needs-owner',f,'deny')
    f=fixture();disposition(f,'withheld');profile(f)['readProtection']['blindWriteActions']=[dict(field=ref('asset-key'),action='blind')];add('S24','wrong-field-blind-map',f,'deny')
    f=fixture();disposition(f,'withheld');profile(f)['readProtection']['blindWriteActions']=[];add('S24','blind-grant-without-map',f,'deny')
    for state in ['before','after']:
      f=fixture();grant_states(f,'ordinary',[s for s in ['before','after'] if s!=state]);add('S24','ordinary-required-'+state,f,'deny')
      f=fixture();rule(f,'ordinary')['actions'].remove('write-field');f['policy']['rules'].append(dict(id='field-state',effect='permit',actions=['write-field'],target=[ref('Asset')],condition=condition_for([s for s in ['before','after'] if s!=state])));add('S24','field-grant-required-'+state,f,'deny')
    for mode in ['flat','record','opaque']:
      f=fixture(mode);add('S24',mode+'-positive',f,'permit')
      f=fixture(mode);owned(f)
      if mode=='flat':setv(f['request']['after'],'Link','note',dict(string='changed'));f['request']['mutations'].append(mutation('Link','l1'))
      else:f['request']['after']['graphs']=[]
      add('S24',mode+'-owned-delta',f,'permit')
      rule(f,'ordinary')['actions'].remove('change-owner');add('S24',mode+'-ownership-required',f,'deny')
    for mode in ['flat','record']:
      f=fixture(mode);owned(f);setv(f['request']['after'],'Link','note',dict(string='changed'));f['request']['mutations'].append(mutation('Link','l1'));no_blind(f,'Link');f['ontology']['entities'][2]['fields'][-1]['protection']='protected';add('S24',mode+'-association-field-cannot-bypass-read',f,'deny')
    # Conservative full-population and exact-source boundaries are failures, not empty permits.
    for name in ['unlisted','subject','coverage','generation','pin','profile','blind-alias','cross-type-alias']:
      f=fixture()
      if name=='unlisted':setv(f['request']['after'],'Link','note',dict(string='changed'))
      elif name=='subject':setv(f['request']['after'],'Person','person-label',dict(string='changed'));f['request']['mutations'].append(mutation('Person','p1'))
      elif name=='coverage':f['request']['after']['coverage'][0]['fields'].pop()
      elif name=='generation':f['request']['after']['generation']=f['request']['after']['expectedGeneration']='g2'
      elif name=='pin':f['request']['after']['policy']['revision']='stale'
      elif name=='profile':del profile(f)['readProtection']
      elif name=='blind-alias':profile(f)['readProtection']['blindWriteActions'][0]['action']='write-field'
      else:
        profile(f,'Link')['fieldActions'][0]['action']='blind';no_blind(f,'Link')
      add('S24',name,f,'indeterminate')
    for state in ['before','after']:
      for x in ['1000000',1000.5,0,1]:
        f=fixture();f['request'][state]['maxSteps']=x;add('S24','state-budget-'+state+'-'+str(x),f,'indeterminate')
    for permission in [False,True]:
      f=fixture();setv(f['request']['after'],'Asset','amount',dict(integerToken='1.0'));no_blind(f);disposition(f,'withheld');rule(f,'ordinary')['actions']=['update' if permission else 'create'];add('S24','no-op-object-required-'+str(permission),f,'permit' if permission else 'deny')
    for field_name in ['amount','note']:
      f=fixture();t='Asset' if field_name=='amount' else 'Link';owned(f)
      if t=='Link':setv(f['request']['after'],'Link','note',dict(string='changed'));f['request']['mutations'].append(mutation('Link','l1'))
      no_blind(f,t);f['policy']['rules'].append(dict(id='forbid-read',effect='forbid',actions=['read'],target=[ref(t)],condition=TRUE));add('S24','read-forbidden-'+field_name,f,'deny')
    f=fixture();no_blind(f);disposition(f,'inline');r=copy.deepcopy(rule(f,'read-rule'));r['id']='second-mask';r['disclosure'][0]['disposition']['value']=dict(integerToken='1');f['policy']['rules'].append(r);add('S24','conflicting-effective-masks',f,'indeterminate')
    # Unknown read/blind conditions may be bypassed only by the other actual permit.
    for read_ok,blind_ok in [(True,False),(False,True),(False,False)]:
      f=fixture();absent(f['request']['before'],'Asset','amount')
      if not read_ok:rule(f,'read-rule')['condition']=condition_for(['after'])
      if not blind_ok:grant_states(f,'blind-grant',['after'])
      add('S24','read-blind-unknown-OR-'+str(read_ok)+'-'+str(blind_ok),f,'permit' if read_ok or blind_ok else 'indeterminate')
    for size,decision in [(1000,'permit'),(8000,'indeterminate')]:
      f=fixture()
      for state in ['before','after']:setv(f['request'][state],'Person','person-label',dict(string='x'*size))
      add('S24','whole-operation-literal-ledger-'+str(size),f,decision)
    f=fixture();f['request']['maxSteps']=3000;add('S24','whole-operation-step-ledger',f,'indeterminate')
    for kind in ['tokenize','encrypt']:
      for op in ['create','update','delete']:
       for vault in [False,True]:
        for blind in [False,True]:
         f=stored(kind);operation(f,op)
         if not vault:rule(f,'vault-grant')['condition']=literal(False)
         if not blind:no_blind(f)
         add('S25',kind+'-'+op+'-vault'+str(vault)+'-blind'+str(blind),f,'permit' if vault else 'deny')
      for reads in subsets:
        f=stored(kind);g=rule(f,'vault-grant')
        g['condition']=TRUE if len(reads)==2 else literal(False) if not reads else dict(op='eq',left=dict(kind='resource',field=ref('token')),right=dict(kind='constant',field=ref('dto-text','domains'),value=dict(string='old-token' if reads==['before'] else 'new-token')))
        add('S25',kind+'-vault-states'+str(subsets.index(reads)),f,'permit' if len(reads)==2 else 'deny')
      for substitute in ['read','write-field','blind','reverse-token','other-vault']:
        f=stored(kind);rule(f,'vault-grant')['actions']=[substitute];add('S25',kind+'-no-vault-substitute-'+substitute,f,'deny')
      for label in ['missing','canonical','wrong-domain','wrong-transform','wrong-version','null-change','absence-change','none-read-or-blind']:
        f=stored(kind);expected='indeterminate'
        if label=='missing':del f['catalog']['transforms'][0]['custody']['vaultWriteAction'];f['policy']['rules']=[r for r in f['policy']['rules'] if r['id']!='vault-grant']
        elif label=='canonical':f['owner']['storage'][-1]=dict(type=ref('Asset'),field=ref('token'),storageEffect='canonical')
        elif label=='wrong-domain':setv(f['request']['after'],'Asset','token',dict(integerToken='2'))
        elif label=='wrong-transform':f['owner']['storage'][-1]['storageTransform']['id']='foreign'
        elif label=='wrong-version':f['owner']['storage'][-1]['storageTransform']['version']='v2'
        elif label=='null-change':setv(f['request']['after'],'Asset','token',None);expected='permit'
        elif label=='absence-change':absent(f['request']['after'],'Asset','token');expected='permit'
        else:no_blind(f);rule(f,'read-rule')['disclosure'][-1]['disposition']=dict(kind='withheld');expected='deny'
        add('S25',kind+'-'+label,f,expected)
    return dict(version='independent-catalog-write-fixtures/0.1',fixtures=out)
if __name__=='__main__':
    target=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).with_name('fixtures.json')
    target.write_text(json.dumps(generate(),ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')

    print(json.dumps(dict(version="independent-catalog-write-fixtures/0.1",counts={k:sum(f["case"]==k for f in generate()["fixtures"]) for k in ["S24","S25"]})))
