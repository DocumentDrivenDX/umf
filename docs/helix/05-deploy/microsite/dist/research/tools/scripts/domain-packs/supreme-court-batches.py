#!/usr/bin/env python3
"""Prepare paced, immutable local-use PDF batches; append newly discovered URLs."""
import argparse
import hashlib
import json
from pathlib import Path

def prepare(root, size=50):
    root=Path(root)
    inventory=json.loads((root/'pdf-inventory.json').read_text())
    dockets=json.loads((root/'dockets.json').read_text())['dockets']
    by_url={e['url']: e for e in inventory['entries']}
    output=root/'batches'; output.mkdir(exist_ok=True)
    plan_path=root/'batch-plan.json'
    plan=json.loads(plan_path.read_text())['batches'] if plan_path.exists() else []
    seen=set()
    for batch in plan:
        raw=(output/(batch['batch']+'.json')).read_bytes()
        if hashlib.sha256(raw).hexdigest()!=batch['sha256']:
            raise ValueError('BATCH_HASH')
        config=json.loads(raw)
        for entry in config['entries']:
            if entry['url'] in seen:
                raise ValueError('DUPLICATE_BATCH_URL')
            seen.add(entry['url'])
    retained=set(seen)
    order=[]
    queues=[[p['url'] for p in docket['pdf_links'] if p['url'] in by_url] for docket in dockets]
    for i in range(max(map(len,queues),default=0)):
        for queue in queues:
            if i<len(queue) and queue[i] not in seen:
                seen.add(queue[i]); order.append(by_url[queue[i]])
    for start in range(0,len(order),size):
        batch=order[start:start+size]
        name=f'{len(plan)+1:04d}'
        config={'version':'1.0.0','id':f'supreme-court-pdfs-{name}','allowed_hosts':['www.supremecourt.gov'],
                'request_interval_ms':1000,'max_bytes':52428800,'max_total_bytes':524288000,
                'max_documents':size,'timeout_ms':30000,'retries':1,'entries':batch}
        path=output/(name+'.json')
        encoded=(json.dumps(config,ensure_ascii=False,indent=2)+'\n').encode()
        if path.exists():
            raise ValueError('UNBOUND_EXISTING_BATCH')
        path.write_bytes(encoded)
        plan.append({'batch':name,'entries':len(batch),'sha256':hashlib.sha256(encoded).hexdigest(),
                     'inventory':str(Path('batches')/(name+'.json')),'state':str(Path('pdf-state')/name)})
    result={'version':'1.0.0','ordering':'immutable_batches_round_robin_new_urls','current_pdf_urls':len(by_url),
            'pdf_urls':len(seen),'historical_urls_no_longer_in_current_inventory':len(retained-set(by_url)),
            'batches':plan}
    temp=plan_path.with_suffix('.tmp');temp.write_text(json.dumps(result,indent=2)+'\n');temp.replace(plan_path)
    print(json.dumps({'pdf_urls':len(seen),'current_pdf_urls':len(by_url),'new_urls':len(order),'batches':len(plan)}))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__); p.add_argument('--root',required=True); p.add_argument('--size',type=int,default=50)
    a=p.parse_args()
    if not 1<=a.size<=1000: p.error('size must be 1..1000')
    prepare(a.root,a.size)
