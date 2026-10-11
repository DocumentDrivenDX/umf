"""Independent sequential specification for original synthetic PG profile only.
Search concurrent linearizations respecting recorded real-time intervals.
No imported SQL/harness logic and no CONTRACT-053 implementation claim.
"""
import copy,hashlib,itertools,json
from pathlib import Path
BASE=Path(__file__).parent;ROOT=BASE.parent

def execute(state,req,step):
 t=state['tenants'][req['tenant']];inp=req['input'];act=req['action']
 grant=t['grants'].get(req['actor'],{})
 if not grant.get('allowed') or grant.get('kind')!='person':return {'status':'denied','code':'AUTHORIZATION'}
 scope=(req['tenant'],req['actor'],act,req['token'])
 fp=(req['revision'],inp,req['expectedVersion'])
 old=state['ledger'].get(scope)
 if old:
  if old['expired']:return {'status':'expired','code':'TOKEN_EXPIRED'}
  if old['fp']!=fp:return {'status':'conflict','code':'TOKEN_REUSE'}
  return copy.deepcopy(old['result'])
 if t['deployments'][act]!=req['revision']:return {'status':'unsupported','code':'REVISION'}
 noop=False;result=None
 if act=='reserve':
  if inp['product']!='p1':result={'status':'rejected','code':'MISSING_PRODUCT'}
  elif req['expectedVersion'] is not None and req['expectedVersion']!=t['resourceVersion']:result={'status':'conflict','code':'EXPECTED_VERSION'}
  elif inp['quantity']<=0:result={'status':'rejected','code':'QUANTITY'}
  elif inp['quantity']>t['stock']:result={'status':'rejected','code':'INSUFFICIENT'}
  elif inp['order'] in t['orders'] or step.get('fault') in ('after-stock','outside-frame'):return None
  else:t['stock']-=inp['quantity'];t['resourceVersion']+=1;t['orders'][inp['order']]='reserved'
 elif act=='create-link':
  if inp['order'] in t['orders']:return None
  t['orders'][inp['order']]='created';t['links']+=2
 elif act=='approve':
  if inp['order'] not in t['orders']:result={'status':'rejected','code':'MISSING_ORDER'}
  else:noop=t['orders'][inp['order']]=='approved';t['orders'][inp['order']]='approved'
 else:return {'status':'unsupported','code':'ACTION'}
 if result is None:
  if not noop:t['commitVersion']+=1;t['events']+=1
  result={'status':'committed','version':t['commitVersion'],'receipt':{'store':'isolated-postgresql','tenant':req['tenant'],'watermark':t['commitVersion']},'identities':[inp['order']],'noOp':noop}
 state['ledger'][scope]={'fp':copy.deepcopy(fp),'expired':False,'result':copy.deepcopy(result)}
 return result

def check(case,record):
 state={'tenants':copy.deepcopy(case['initialState']['tenants']),'ledger':{}}
 for t in state['tenants'].values():t.update(deployments={a:'r1' for a in ('reserve','approve','create-link')},links=0,events=0)
 observations=iter(o for o in record['observations'] if 'request' in o)
 requests={r['id']:r for r in case['requests']};linearizations=[]
 try:
  for step in case['steps']:
   kind=step['kind']
   if kind in ('invoke','concurrent'):
    ids=[step['request']] if kind=='invoke' else step['requests']
    obs=[next(observations) for _ in ids]
    accepted=None
    for order in itertools.permutations(range(len(obs))):
     if any(obs[i]['end']<=obs[j]['start'] and order.index(i)>order.index(j) for i in range(len(obs)) for j in range(len(obs))):continue
     candidate=copy.deepcopy(state);ok=True
     for i in order:
      request=requests[obs[i]['request']];expected=execute(candidate,request,step)
      if expected!=obs[i]['returnedPayload']:ok=False;break
      client={'status':'indeterminate'} if step.get('loseAcknowledgement') else ({'status':'failed','code':'EXECUTION_ROLLED_BACK'} if expected is None else expected)
      if obs[i]['observed']!=client:ok=False;break
     if ok:accepted=candidate;linearizations.append([obs[i]['request'] for i in order]);break
    if accepted is None:return {'pass':False,'reason':'No legal sequentialization of returned/client payloads','step':step}
    state=accepted
   elif kind=='deploy':state['tenants'][step['tenant']]['deployments'][step['action']]=step['revision']
   elif kind=='authorize':state['tenants'][step['tenant']]['grants'][step['actor']]['allowed']=step['allowed']
   elif kind=='replenish':
    state['tenants'][step['tenant']]['stock']=step['stock'];state['tenants'][step['tenant']]['resourceVersion']+=1
   elif kind=='expire':
    r=requests[step['request']];state['ledger'][(r['tenant'],r['actor'],r['action'],r['token'])]['expired']=True
   elif kind=='read':
    # Separate observation oracle: inspect recorded projection status/content from explicit fixture expectation.
    pass
   elif kind in ('catchup','deliver'):pass
   else:raise AssertionError(kind)
  for tenant,t in state['tenants'].items():
   actual=record['state']['tenants'][tenant]
   expected={'stock':t['stock'],'resourceVersion':t['resourceVersion'],'version':t['commitVersion'],'orders':len(t['orders']),'events':t['events'],'links':t['links'],'orderStates':t['orders'] or None,'outcomeRecords':sum(k[0]==tenant for k in state['ledger']),'untouched':True}
   for key,value in expected.items():
    if actual[key]!=value:return {'pass':False,'reason':'Final abstract state mismatch','tenant':tenant,'field':key,'expected':value,'actual':actual[key]}
  return {'pass':True,'linearizations':linearizations}
 except (KeyError,StopIteration) as error:return {'pass':False,'reason':repr(error)}

def main():
 cases={c['id']:c for c in json.loads(ROOT.joinpath('histories.json').read_text())['cases']}
 native=json.loads(ROOT.joinpath('native-results.json').read_text())
 results=[{'id':r['id'],**check(cases[r['id']],r)} for r in native['results']]
 mutants=[{'id':r['id'],'variant':r['variant'],**check(cases[r['id']],r)} for r in native['mutations'] if r['variant']!='premature-visible']
 assert all(r['pass'] for r in results),[r for r in results if not r['pass']]
 assert all(not r['pass'] for r in mutants),mutants
 out={'scope':'Sequential command/replay/state conformance for original PG synthetic profile. Projection/delivery and crashes not checked by this oracle; no general implementation refinement proof.','results':results,'mutants':mutants,'sources':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),ROOT/'native-results.json',ROOT/'histories.json']}}
 BASE.joinpath('history-results.json').write_text(json.dumps(out,indent=2)+'\n')
 print(json.dumps({'histories':len(results),'linearizable':sum(r['pass'] for r in results),'incorrectHistoriesRejected':sum(not r['pass'] for r in mutants)}))
if __name__=='__main__':main()
