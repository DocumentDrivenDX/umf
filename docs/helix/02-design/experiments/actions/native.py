"""Host-only design experiment; generic history interpreter and independent assertions."""
import concurrent.futures, hashlib, json, os, subprocess, sys, threading, time
from pathlib import Path
BASE = Path(__file__).resolve().parent
CONTAINER = os.environ.get("UMF_ACTION_CONTAINER", "umf-actions-design-proof")

def quote(value):
    if value is None: return "NULL"
    if isinstance(value, bool): return "true" if value else "false"
    if isinstance(value, (int, float)): return str(value)
    return "'" + str(value).replace("'", "''") + "'"

def sql(text, failure_ok=False):
    p = subprocess.run(["docker", "exec", "-i", CONTAINER, "psql", "-X", "-qAt", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
                       input="SET search_path=umf_actions_design;\n"+text, text=True, capture_output=True, timeout=15)
    if p.returncode and not failure_ok: raise RuntimeError(p.stderr)
    return p

def value(text): return json.loads(sql(text).stdout.strip())

def setup(case):
    sql("TRUNCATE grants,clock,inventory,orders,links,sentinel,outcomes,outbox,projection,referenced,deployments,projected_orders CASCADE;")
    for tenant, state in case["initialState"]["tenants"].items():
        t=quote(tenant)
        sql(f"INSERT INTO clock VALUES({t},{state['commitVersion']}); INSERT INTO inventory VALUES({t},'p1',{state['stock']},{state['resourceVersion']}); INSERT INTO sentinel VALUES({t},{quote(state['sentinel'])}); INSERT INTO projection VALUES({t},{state['projectionWatermark']});")
        for actor, grant in state["grants"].items():
            sql(f"INSERT INTO grants VALUES({t},{quote(actor)},{quote(grant['kind'])},{quote(grant['allowed'])});")
        for record, status in state["orders"].items(): sql(f"INSERT INTO orders VALUES({t},{quote(record)},{quote(status)});")
        for ref in state["references"]: sql(f"INSERT INTO referenced VALUES({t},{quote(ref['id'])},{quote(ref['kind'])},{quote(ref['state'])});")
        for action in ('reserve','create-link','approve'): sql(f"INSERT INTO deployments VALUES({t},{quote(action)},'r1');")

def invoke(request, step, variant):
    args=[request['tenant'],request['actor'],request['action'],request['token'],request['revision'],json.dumps(request['input']),request['expectedVersion'],step.get('fault',''),variant]
    start=time.monotonic()
    p=sql("BEGIN; SELECT invoke_action("+','.join(quote(x) for x in args)+"); COMMIT;",failure_ok=True)
    end=time.monotonic()
    durable=json.loads(p.stdout.strip()) if not p.returncode else None
    observed={'status':'failed','code':'EXECUTION_ROLLED_BACK'} if durable is None else durable
    if step.get('loseAcknowledgement'): observed={'status':'indeterminate'}
    return {'request':request['id'],'observed':observed,'returnedPayload':durable,'start':start,'end':end,'processExit':p.returncode}

def snapshot():
    return value("SELECT json_build_object('tenants',coalesce((SELECT json_object_agg(c.tenant,json_build_object('stock',(SELECT stock FROM inventory i WHERE i.tenant=c.tenant),'resourceVersion',(SELECT version FROM inventory i WHERE i.tenant=c.tenant),'version',c.version,'orders',(SELECT count(*) FROM orders o WHERE o.tenant=c.tenant),'events',(SELECT count(*) FROM outbox b WHERE b.tenant=c.tenant),'outcomeRecords',(SELECT count(*) FROM outcomes x WHERE x.tenant=c.tenant),'links',(SELECT count(*) FROM links l WHERE l.tenant=c.tenant),'untouched',(SELECT value='untouched' FROM sentinel s WHERE s.tenant=c.tenant) AND NOT EXISTS(SELECT 1 FROM referenced z WHERE z.tenant=c.tenant AND z.state NOT IN ('unchanged','untouched')),'orderStates',(SELECT json_object_agg(o.id,o.status) FROM orders o WHERE o.tenant=c.tenant))) FROM clock c),'{}'::json));")

def run(case,variant=''):
    setup(case);requests={r['id']:r for r in case['requests']};out=[];deliveries=0
    for step in case['steps']:
        kind=step['kind']
        if kind=='invoke':out.append(invoke(requests[step['request']],step,variant))
        elif kind=='concurrent':
            barrier=threading.Barrier(len(step['requests']))
            def call(id):
                barrier.wait(timeout=5)
                return invoke(requests[id],{'fault':'pause'},variant)
            with concurrent.futures.ThreadPoolExecutor(max_workers=len(step['requests'])) as pool:
                out.extend(list(pool.map(call,step['requests'])))
        elif kind=='deploy':sql(f"UPDATE deployments SET revision={quote(step['revision'])} WHERE tenant={quote(step['tenant'])} AND action={quote(step['action'])};")
        elif kind=='authorize':sql(f"UPDATE grants SET allowed={quote(step['allowed'])} WHERE tenant={quote(step['tenant'])} AND actor={quote(step['actor'])};")
        elif kind=='replenish':sql(f"UPDATE inventory SET stock={step['stock']},version=version+1 WHERE tenant={quote(step['tenant'])};")
        elif kind=='expire':
            r=requests[step['request']];sql(f"UPDATE outcomes SET expired=true WHERE tenant={quote(r['tenant'])} AND actor={quote(r['actor'])} AND action={quote(r['action'])} AND token={quote(r['token'])};")
        elif kind=='read':
            receipt=out[step['outcome']]['returnedPayload']['receipt'];t=quote(step['tenant'])
            row=value(f"SELECT json_build_object('watermark',p.watermark,'orders',coalesce((SELECT json_object_agg(o.id,o.status) FROM projected_orders o WHERE o.tenant=p.tenant),'{{}}'::json)) FROM projection p WHERE tenant={t};")
            ready=row['watermark']>=receipt['watermark'] or variant=='premature-visible'
            result={'status':'visible' if ready else 'pending','watermark':row['watermark'],'orders':row['orders'] if ready else None}
            out.append({'observed':result,'returnedPayload':None})
        elif kind=='catchup':
            t=quote(step['tenant'])
            sql(f"BEGIN; DELETE FROM projected_orders WHERE tenant={t}; INSERT INTO projected_orders SELECT * FROM orders WHERE tenant={t}; UPDATE projection SET watermark=(SELECT version FROM clock WHERE tenant={t}) WHERE tenant={t}; COMMIT;")
        elif kind=='deliver':deliveries+=value(f"SELECT count(*) FROM outbox WHERE tenant={quote(step['tenant'])};")
        else: raise ValueError(kind)
    state=snapshot(); failures=[];expect=case['expected'];statuses=[o['observed']['status'] for o in out]
    if expect.get('statusOrder')=='unordered':statuses=sorted(statuses);wanted=sorted(expect['statuses'])
    else:wanted=expect['statuses']
    if statuses!=wanted:failures.append(f"statuses {statuses} != {wanted}")
    totals={'orders':sum(t['orders'] for t in state['tenants'].values()),'events':sum(t['events'] for t in state['tenants'].values()),'outcomeRecords':sum(t['outcomeRecords'] for t in state['tenants'].values()),'links':sum(t['links'] for t in state['tenants'].values()),'deliveries':deliveries}
    totals.update({k:state['tenants']['t1'][k] for k in ('stock','resourceVersion','version','untouched')})
    if expect.get('status'):totals['status']=state['tenants']['t1']['orderStates']['o1']
    for key,want in expect.items():
        if key in totals and totals[key]!=want:failures.append(f"{key}: {totals[key]} != {want}")
    for i,j in case['sameResultPairs']:
        if out[i]['returnedPayload']!=out[j]['returnedPayload'] or out[i]['returnedPayload'] is None:failures.append(f"durable result mismatch {i}/{j}")
    if expect.get('freshNoOp') and not out[-1]['returnedPayload']['noOp']:failures.append('fresh-token no-op missing')
    if expect.get('visibleOrder'):
        want=expect['visibleOrder'];seen=out[-1]['observed'].get('orders')
        if not seen or seen.get(want['id'])!=want['status']:failures.append('projection content missing')
    for tenant,properties in expect.get('tenants',{}).items():
        for key,want in properties.items():
            if state['tenants'][tenant][key]!=want:failures.append(f"{tenant}/{key} mismatch")
        req=[r for r in case['requests'] if r['tenant']==tenant][0]
        outcome=[o for o in out if o.get('request')==req['id']][0]['returnedPayload']
        if outcome['receipt']['tenant']!=tenant or outcome['identities']!=[req['input']['order']]:failures.append(f'{tenant} result identity mismatch')
    overlapping_calls=[o for o in out if 'start' in o]
    if any(s['kind']=='concurrent' for s in case['steps']) and max(o['start'] for o in overlapping_calls)>=min(o['end'] for o in overlapping_calls):failures.append('calls did not overlap')
    return {'id':case['id'],'variant':variant,'pass':not failures,'failures':failures,'observations':out,'state':state,'deliveries':deliveries}

def main():
    for _ in range(30):
        ready=subprocess.run(['docker','exec',CONTAINER,'pg_isready','-U','postgres'],capture_output=True)
        if ready.returncode==0:break
        time.sleep(.2)
    sql('DROP SCHEMA IF EXISTS umf_actions_design CASCADE; CREATE SCHEMA umf_actions_design;'+(BASE/'store.sql').read_text()+"\nCREATE TABLE projected_orders(LIKE orders INCLUDING ALL);")
    cases=json.loads((BASE/'histories.json').read_text())['cases']
    results=[run(c) for c in cases]
    mutations=[('revision-namespace','H06'),('stale-auth','H08'),('missing-rollback','H09'),('premature-visible','H13'),('frame-bypass','H15')]
    mutant_results=[run(next(c for c in cases if c['id']==id),v) for v,id in mutations]
    # The oracle must reject each intentionally incorrect variant.
    rejected=all(not r['pass'] for r in mutant_results)
    evidence={'profile':'actions-feasibility-1','python':sys.version,'postgresql':sql('SHOW server_version;').stdout.strip(),
      'historyCount':len(results),'passed':sum(r['pass'] for r in results),'mutationCount':len(mutant_results),'mutantsRejected':sum(not r['pass'] for r in mutant_results),
      'sources':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (BASE/'store.sql',BASE/'native.py',BASE/'histories.json')},
      'limits':['Synthetic grants, no real authentication','Read projection copies consistent same-store prefix; no warehouse integration','Lost acknowledgement injected after confirmed native commit; no real network partition','Bounded integer/string-key profile, not a public UMF executor'],
      'results':results,'mutations':mutant_results}
    (BASE/'native-results.json').write_text(json.dumps(evidence,indent=2)+'\n')
    print(json.dumps({k:evidence[k] for k in ('postgresql','historyCount','passed','mutationCount','mutantsRejected')}))
    for r in results:
        if not r['pass']:print(r['id'],r['failures'])
    if not all(r['pass'] for r in results) or not rejected:raise SystemExit(1)

if __name__=='__main__':main()
