"""US-903-AC6 independent Python consumer of owner-authored manifest cases.
No UMF JS, shared schema validator, or native executor is imported.
"""
import hashlib,json,re
from pathlib import Path
from decimal import Decimal

def unique(pairs):
    result={}
    for key,value in pairs:
        if key in result: raise ValueError('duplicate JSON member')
        result[key]=value
    return result

def artifact(value):
    text=value['utf8']; encoded=text.encode('utf-8',errors='strict')
    assert value['mediaType']=='application/json' and hashlib.sha256(encoded).hexdigest()==value['sha256']
    return json.loads(text,object_pairs_hook=unique,parse_constant=lambda _: (_ for _ in ()).throw(ValueError('nonfinite')))

def exact(obj,keys):
    assert isinstance(obj,dict) and set(obj)==set(keys)

def literal(value):
    assert isinstance(value,dict) and len(value)==1
    key,text=next(iter(value.items()))
    if key=='integerToken':
        decimal=Decimal(text); assert decimal==decimal.to_integral_value();return ('integer',int(decimal))
    if key=='string': assert isinstance(text,str);return ('string',text)
    if key=='boolean': assert isinstance(text,bool);return ('boolean',text)
    if key=='array': assert isinstance(text,list);return ('array',tuple(literal(v) for v in text))
    if key=='map': assert isinstance(text,dict);return ('map',tuple(sorted((k,literal(v)) for k,v in text.items())))
    raise AssertionError('outside original fixture domains')

def eligible(case):
    try:
        manifest=artifact(case['manifest']); model=artifact(case['model']);plan=artifact(manifest['plan'])
        exact({k:v for k,v in manifest.items() if k!='annotations'},['protocol','plan','action','basis','items','batches'])
        assert manifest['protocol']=='umf.actions.manifest/1' and plan['protocol']=='umf.actions.plan/1'
        assert plan['model']['sha256']==case['model']['sha256'] and plan['model']['documentId']==model['id']
        action=manifest['action'];exact(action,['target','documentSha256','invocation']);assert action['documentSha256']==plan['action']['documentSha256']
        assert {k:action['target'][k] for k in ['module','action']}==plan['action']['identity'] and action['invocation']==plan['action']['invocation']
        basis=manifest['basis'];exact(basis,['profile','store','epoch','cut','selectionSha256']);assert basis['selectionSha256']==plan['selection']['artifact']['sha256']
        artifact(plan['selection']['artifact']);artifact(plan['source'])
        items=manifest['items'];assert len(items)<=plan['limits']['maxItems'] and len(case['manifest']['utf8'].encode())<=plan['limits']['maxManifestBytes']
        size=plan['execution']['batchSize'];expected=[{'ordinal':i,'start':i*size,'count':min(size,len(items)-i*size)} for i in range((len(items)+size-1)//size)]
        assert manifest['batches']==expected
        declared=next(a for a in model['modules'][0]['extensions']['umf.actions']['actions'] if a['id']==action['target']['action'])
        frames=[f['id'] for f in declared['reads']+declared['writes']];identities=set();keys=set();guard_profile=None
        for ordinal,item in enumerate(items):
            exact(item,['ordinal','entity','guard','inputs','expectedVersions']);assert item['ordinal']==ordinal
            guard=item['guard'];exact(guard,['profile','store','epoch','identity','version']);assert (guard['store'],guard['epoch'])==(basis['store'],basis['epoch'])
            if guard_profile is None:guard_profile=guard['profile']
            assert guard['profile']==guard_profile and guard['identity'] not in identities;identities.add(guard['identity'])
            entity=item['entity'];exact(entity,['key','components']);assert entity['key']==plan['target'];key=tuple(literal(v) for v in entity['components']);assert key not in keys;keys.add(key)
            inputs=item['inputs'];assignments=plan['inputs']['assignments'];assert set(inputs)=={plan['inputs']['entityParameter']}|{a['input'] for a in assignments}
            supplied=inputs[plan['inputs']['entityParameter']];exact(supplied,['key','components']);assert supplied['key']==entity['key'] and tuple(literal(v) for v in supplied['components'])==key
            for assignment in assignments:assert literal(inputs[assignment['input']])==literal(assignment['value'])
            assert item['expectedVersions']==[{'frame':frame,'version':guard['version']} for frame in frames]
        return True
    except (AssertionError,ValueError,KeyError,TypeError,UnicodeError):return False

def item_token(namespace,job,batch,item):
    assert re.fullmatch(r'[A-Za-z0-9_-]{1,128}',namespace) and re.fullmatch(r'[A-Za-z0-9_-]{1,128}',job)
    assert isinstance(batch,int) and batch>=0 and isinstance(item,int) and item>=0
    return f'pap1/{namespace}/{job}/{batch}/{item}'

def valid_bulk(case):
    try:
        value=artifact(case['outcome']);status=value['status']
        if status=='sealed':exact(value,['status','manifest']);artifact(value['manifest']);return True
        if status=='committed':
            exact(value,['status','job','batch','manifest','items','receipt']);assert 1<=len(value['items'])<=100
            assert [i['ordinal'] for i in value['items']]==list(range(value['items'][0]['ordinal'],value['items'][0]['ordinal']+len(value['items'])))
            for item in value['items']:
                exact(item,['ordinal','result']);r=item['result'];exact(r,['status','revision','outputs','changes','version','receipt','noOp','verification'])
                assert r['status']=='committed' and isinstance(r['noOp'],bool) and r['noOp']==(len(r['changes'])==0)
                exact(r['revision'],['module','action','revision']);exact(r['receipt'],['store','epoch','version'])
                assert len(r['outputs'])<=128
                for output_id,output in r['outputs'].items():
                    assert 1<=len(output_id.encode('utf-16-le'))//2<=256
                    if isinstance(output,dict) and 'key' in output:
                        exact(output,['key','components']);exact(output['key'],['module','element','key'])
                        for identity in output['key'].values():assert 1<=len(identity.encode('utf-16-le'))//2<=256
                        for component in output['components']:literal(component)
                    else:literal(output)
                v=r['verification'];assert v['frames']=='enforced' and v['constraints']=='verified'
                if v['kind']=='recipe':
                    exact(v,['kind','effects','postconditions','frames','constraints']);assert 1<=len(v['effects'])<=256 and not r['outputs'] and len({e['effect'] for e in v['effects']})==len(v['effects'])
                    for effect in v['effects']:exact(effect,['effect','status','outcome']);assert effect['status']=='verified' and effect['outcome'] in ['changed','no-op']
                else:
                    exact(v,['kind','deployment','postconditions','frames','constraints','outputs']);assert v['kind']=='handler' and v['outputs']=='verified';exact(v['deployment'],['id','version','build'])
                assert len({c['condition'] for c in v['postconditions']})==len(v['postconditions'])
                for condition in v['postconditions']:exact(condition,['condition','status']);assert condition['status']=='satisfied'
            return True
        if status in ['indeterminate','failed']:
            exact(value,['status','recovery']+(['code'] if status=='failed' else []));recovery=value['recovery'];exact(recovery,['id','operation']);assert recovery['operation'] in ['submit','claim','cancel','reconcile','materialize']
            if status=='failed':assert value['code']=='PAP_CONTROL_NONCOMMIT'
            return True
        if status in ['denied','unsupported','expired']:exact(value,['status','code']);return True
        if status in ['queued','running','reconciling','completed','stopped','cancelled']:
            exact(value,['status','job','manifest','nextBatch','committedBatches','unresolvedBatch','stop']);assert (value['stop'] is not None)==(status=='stopped')
            if status=='cancelled':assert value['unresolvedBatch'] is None
            if value['stop'] is not None:exact(value['stop'],['batch','code'])
            return True
        return False
    except (AssertionError,ValueError,KeyError,TypeError,UnicodeError):return False

source=Path(__file__).resolve().parents[1]/'docs/helix/03-test/fixtures/bulk-update/manifest-oracle.json'
fixture=json.loads(source.read_text());cases=fixture['cases']
for case in cases:assert eligible(case)==case['expectedEligible'],case['id']
for case in fixture['bulkCases']:assert valid_bulk(case)==case['expectedValid'],case['id']
# Independently specified namespace encoding collision and immutable state controls.
assert item_token('one','same',0,0)!=item_token('two','same',0,0)
assert item_token('ab','c',1,2)!=item_token('a','bc',1,2)
try:item_token('a/b','c',0,0);raise RuntimeError('illegal delimiter accepted')
except AssertionError:pass
for count,size,expected in [(0,2,[]),(1,2,[1]),(3,2,[2,1]),(10000,100,[100]*100)]:
    assert [min(size,count-start) for start in range(0,count,size)]==expected
print(json.dumps({'owner':'US-903-AC6','manifestCases':len(cases),'bulkCases':len(fixture['bulkCases']),'partitionControls':4,'tokenControls':3,'passed':True,'nativeExecution':False}))
