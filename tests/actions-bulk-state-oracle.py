# SPDX-License-Identifier: MIT OR Apache-2.0
"""US-907-AC8 independent Python consumer of the owner transition fixture.

Hand-coded from CONTRACT-904; imports no UMF JS and shares no code with the TypeScript model.
It checks that an independently written evaluator reproduces every owner-authored expectation
in transitions.json (transitions, exhaustive state/event pairs, decision order, tokens, fences).
"""
import copy, json, re, sys
from pathlib import Path

FIXTURE = Path(__file__).resolve().parent.parent / 'docs/helix/03-test/fixtures/bulk-update/transitions.json'
TERMINAL = ('completed', 'stopped', 'cancelled')
SEG = re.compile(r'^[A-Za-z0-9_-]{1,128}$')
CANON = re.compile(r'^(0|[1-9][0-9]*)$')

def refuse(code=None):
    r = {'ok': False}
    if code: r['code'] = code
    return r

def accept(state, basis=None):
    r = {'ok': True, 'state': state}
    if basis: r['basis'] = basis
    return r

def next_fence(f):
    if not isinstance(f, str) or not re.fullmatch(r'(0|[1-9][0-9]*)', f, re.ASCII): raise ValueError('fence')
    return str(int(f) + 1)

def apply(state, event):
    k = event['kind']
    if state is None:
        if k != 'submit': return refuse()
        n = event['batchCount']
        s = dict(status='completed' if n == 0 else 'queued', batchCount=n, nextBatch=0, committedBatches=0,
                 fence='0', claim=None, cancelRequested=False, stop=None)
        return accept(s, 'empty-manifest' if n == 0 else 'seal-delegation-intent-capacity')
    s = copy.deepcopy(state); st = s['status']
    if st in TERMINAL:
        if k == 'cancel': return accept(s, 'terminal-noop')
        if st == 'cancelled' and k in ('claim', 'execute'): return refuse('PAP_CANCELLED')
        return refuse()
    if k == 'cancel':
        c = s['claim']
        if st == 'queued' or (st == 'running' and not c['effectAdmitted']):
            s.update(status='cancelled', claim=None); return accept(s)
        s['cancelRequested'] = True; return accept(s, 'cancel-requested')
    if st == 'queued':
        if k == 'claim':
            f = next_fence(s['fence']); s.update(status='running', fence=f, claim={'batch': s['nextBatch'], 'fence': f, 'effectAdmitted': False}); return accept(s)
        if k == 'execute': return refuse('PAP_FENCE')
        return refuse()
    c = s['claim']
    if st == 'running':
        if k == 'execute':
            if s['cancelRequested']: return refuse('PAP_CANCELLED')
            if event['fence'] != c['fence']: return refuse('PAP_FENCE')
            if event['batch'] != c['batch']: return refuse('PAP_ORDER')
            if c['effectAdmitted']: return refuse()
            c['effectAdmitted'] = True; return accept(s)
        if k == 'commit':
            if not c['effectAdmitted']: return refuse()
            n = s['nextBatch'] + 1; s.update(nextBatch=n, committedBatches=s['committedBatches'] + 1, claim=None)
            s['status'] = 'cancelled' if s['cancelRequested'] else ('completed' if n == s['batchCount'] else 'queued'); return accept(s)
        if k == 'failure':
            s.update(status='stopped', stop={'batch': c['batch'], 'code': event['code']}, claim=None); return accept(s)
        if k == 'lose-custody':
            if not c['effectAdmitted']: return refuse()
            s['status'] = 'reconciling'; return accept(s)
        if k == 'expire-claim':
            if c['effectAdmitted'] or not event['confirmedNoExecution']: return refuse()
            s.update(status='queued', claim=None); return accept(s)
        return refuse()
    if st == 'reconciling':
        if k != 'reconcile': return refuse()
        e = event['evidence']
        if e == 'committed':
            n = s['nextBatch'] + 1; s.update(nextBatch=n, committedBatches=s['committedBatches'] + 1, claim=None)
            s['status'] = 'cancelled' if s['cancelRequested'] else ('completed' if n == s['batchCount'] else 'queued'); return accept(s)
        if e == 'noncommit-admitted':
            s.update(status='stopped', stop={'batch': c['batch'], 'code': 'PAP_ABORT_DISPOSITION_UNKNOWN'}, claim=None); return accept(s)
        return accept(s, 'unresolved')
    return refuse()

def decide(i):
    if i['delegation'] != 'valid': return dict(status='denied', code='AUTHORIZATION', tx1Invoked=False, itemOutcome=False)
    if i['guards'] != 'pass': return dict(status='conflict', code='PAP_GUARD', item=i['guardItem'], tx1Invoked=False, itemOutcome=False)
    t = i['tx1']; d = t['decision']
    if d == 'committed': return dict(status='committed', tx1Invoked=True, itemOutcome=True)
    if d in ('conflict', 'rejected'): return dict(status=d, code=t['code'], item=t['item'], tx1Invoked=True, itemOutcome=True)
    return dict(status='rejected', code='ENTITY_MISSING', item=t['item'], tx1Invoked=True, itemOutcome=True, qualificationFault=True)

def token(ns, id_, b, i):
    for v in (ns, id_):
        if not isinstance(v, str) or not SEG.fullmatch(v): raise ValueError('segment')
    for v in (b, i):
        if not (isinstance(v, int) and not isinstance(v, bool) and v >= 0): raise ValueError('ordinal')
    return 'pap1/%s/%s/%d/%d' % (ns, id_, b, i)

def parse(key):
    p = key.split('/')
    if len(p) != 5 or p[0] != 'pap1' or not SEG.fullmatch(p[1]) or not SEG.fullmatch(p[2]) or not CANON.fullmatch(p[3]) or not CANON.fullmatch(p[4]): raise ValueError('token')
    return dict(namespace=p[1], id=p[2], batch=int(p[3]), item=int(p[4]))

def subset(want, got):
    if isinstance(want, dict):
        return isinstance(got, dict) and all(k in got and subset(v, got[k]) for k, v in want.items())
    return want == got

def raises(fn, *a):
    try: fn(*a)
    except Exception: return True
    return False

def main():
    fx = json.loads(FIXTURE.read_text(encoding='utf-8')); errs = []
    def chk(cond, msg):
        if not cond: errs.append(msg)
    for c in fx['transitions']:
        r = apply(c['state'], c['event']); e = c['expect']
        chk(r['ok'] == e['ok'], c['id'] + ': ok')
        if e['ok'] and r['ok']:
            chk(subset(e['state'], r['state']), c['id'] + ': state'); chk(e.get('basis') in (None, r.get('basis')), c['id'] + ': basis')
        elif not e['ok'] and 'code' in e: chk(r.get('code') == e['code'], c['id'] + ': code')
    permitted = {tuple(p) for p in fx['permittedPairs']}
    for sk, s in fx['samples'].items():
        for ek, ev in fx['eventSamples'].items():
            chk(apply(s, ev)['ok'] == ((sk, ek) in permitted), 'pair %s|%s' % (sk, ek))
    for c in fx['decisionOrder']: chk(subset(c['expect'], decide(c['input'])), c['id'])
    for a, b in fx['fences']['next']: chk(next_fence(a) == b, 'fence ' + a)
    for bad in fx['fences']['invalid']: chk(raises(next_fence, bad), 'fence invalid %r' % bad)
    t = fx['tokens']
    for v in t['valid']:
        k = token(v['ns'], v['id'], v['batch'], v['item']); chk(k == v['token'] and len(k) <= t['maxTokenUnits'], 'token ' + v['token'][:30]); chk(parse(k)['id'] == v['id'], 'parse ' + k[:30])
    for v in t['invalid']: chk(raises(token, v['ns'], v['id'], v['batch'], v['item']), 'token invalid %r' % (v,))
    for a, b in t['distinct']: chk(token(a['ns'], a['id'], a['batch'], a['item']) != token(b['ns'], b['id'], b['batch'], b['item']), 'distinct')
    for k in t['parseRefuse']: chk(raises(parse, k), 'parse refuse ' + k)
    for k in t['reserved']: chk(k.startswith('pap1/'), 'reserved ' + k)
    for k in t['notReserved']: chk(not k.startswith('pap1/'), 'notReserved ' + k)
    for r in fx['tableRows']: chk(any(c['row'] == r for c in fx['transitions']), 'row ' + r)
    for name in fx['controls']: chk(any(c.get('control') == name for c in fx['transitions'] + fx['decisionOrder']), 'control ' + name)
    print(json.dumps({'cases': len(fx['transitions']), 'pairs': len(fx['samples']) * len(fx['eventSamples']), 'decisionOrder': len(fx['decisionOrder']), 'errors': errs}, indent=1))
    return 1 if errs else 0

if __name__ == '__main__': sys.exit(main())
