#!/usr/bin/env python3
"""Explicit PDF batch acquisition through TableSpec Python; no scheduler or email."""
import argparse
import hashlib
import fcntl
import json
import urllib.robotparser
from pathlib import Path
from tablespec.document_loader import fetch_sources, load_publication, export_bag, validate_bag, fixity_audit

REPO=Path(__file__).resolve().parents[2]

def acquire(root, start, count):
    root=Path(root)
    plan=json.loads((root/'batch-plan.json').read_text())
    latest=json.loads((root/'latest.json').read_text())
    robot=urllib.robotparser.RobotFileParser()
    robot.parse((root/'objects'/latest['https://www.supremecourt.gov/robots.txt']['sha256']).read_text().splitlines())
    pack=REPO/'spec/domain-packs/legal-supreme-court/companion.json'
    receipts=root/'pdf-acquisition.json'
    results=json.loads(receipts.read_text()) if receipts.exists() else []
    by_batch={r['batch']:r for r in results}
    failed=False
    for batch in plan['batches'][start-1:start-1+count]:
        number=batch['batch']; state=root/'pdf-state'/number
        inv=root/'batches'/(number+'.json')
        raw=inv.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=batch['sha256']:
            raise ValueError('BATCH_HASH')
        config=json.loads(raw)
        agent='UMF document-loader/1.0.0'
        if any(not robot.can_fetch(agent,e['url']) for e in config['entries']):
            raise ValueError('ROBOTS_DISALLOW')
        if config['request_interval_ms'] < max(1,robot.crawl_delay(agent) or 1)*1000:
            raise ValueError('ROBOTS_PACING')
        handoff=root/'handoff'/number
        read_only_handoff=handoff.exists() and not (state/'current.json').exists()
        if read_only_handoff:
            checked=validate_bag(handoff)
            rows=load_publication(checked)['manifest']['rows']
            receipt={'status':'complete','operation':'verified-offline-handoff','items':[{'id':r['id'],'status':'complete','sha256':r['sha256']} for r in rows]}
        elif (state/'current.json').exists():
            receipt=fetch_sources(pack,None,state,mode='replay',rights='local-use')
        else:
            receipt=fetch_sources(pack,inv,state,rights='local-use')
        result={'batch':number,'receipt':receipt}
        if receipt['status']=='complete':
            if not read_only_handoff:
                result['replay']=fetch_sources(pack,None,state,mode='replay',rights='local-use')
            if not handoff.exists():
                result['handoff']=export_bag(state,handoff)
            checked=validate_bag(handoff)
            result['audit']=fixity_audit(checked)
            rows=load_publication(checked if read_only_handoff else state)['manifest']['rows']
            result['rows']=len(rows); result['bytes']=sum(r['bytes'] for r in rows)
        else:
            failed=True
        by_batch[number]=result
        temp=receipts.with_suffix('.tmp')
        temp.write_text(json.dumps(list(by_batch.values()),indent=2)+'\n'); temp.replace(receipts)
        coverage_path=root/'coverage.json'
        coverage=json.loads(coverage_path.read_text())
        completed=[r for r in by_batch.values() if r['receipt']['status']=='complete']
        acquired=sum(r.get('rows',0) for r in completed)
        attempted=sum(len(r['receipt'].get('items',[])) for r in by_batch.values())
        coverage.update(acquired_pdf_urls=acquired,pending_pdf_urls=coverage['discovered_pdf_urls']-acquired,
            unattempted_pdf_urls=coverage['discovered_pdf_urls']-attempted,
            pdf_bytes=sum(r.get('bytes',0) for r in completed), successful_pdf_batches=[r['batch'] for r in completed],
            failed_pdf_batches=[r['batch'] for r in by_batch.values() if r['receipt']['status']!='complete'],
            pdf_coverage_note='Only successful current publications counted; no all-PDF completeness claim.')
        temporary=coverage_path.with_suffix('.tmp');temporary.write_text(json.dumps(coverage,indent=2)+'\n');temporary.replace(coverage_path)
        print(json.dumps({'batch':number,'status':receipt['status'],'rows':result.get('rows',0),'bytes':result.get('bytes',0)}),flush=True)
    return failed

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__); p.add_argument('--root',required=True); p.add_argument('--start',type=int,default=1); p.add_argument('--count',type=int,required=True)
    a=p.parse_args()
    if a.start<1 or a.count<1: p.error('start and count must be positive')
    with (Path(a.root)/'acquisition.lock').open('a') as lock:
        try:
            fcntl.flock(lock,fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('ACQUISITION_BUSY')
        raise SystemExit(int(acquire(a.root,a.start,a.count)))
