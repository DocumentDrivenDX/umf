"""Pure, bounded constructor-prefix counters. No UMF/native import on import."""
import hashlib

EVENT_CAP = 1_000_000
ROOTS = ('unassigned','core','reference','package','operation','binding','tables','actions','actions-literal','actions-action',
         'registration-tables','registration-actions','registration-binding','registration-stable')
COMPILE_SITES = ('admission-copy','proof-lookup','preflight-root','preflight-catalogue','reference','meta-materialize',
                 'meta-evaluation','registry-manifest')
CONVERSION_SITES = ('factory','visit','frontier','text-decode','text-normalize','utf16',
                    'key-collision','path','owned-validation','array-index')
SLOTS = tuple((root,site) for root in ROOTS for site in COMPILE_SITES) + tuple(
    ('conversion',site) for site in CONVERSION_SITES) + (
    ('constraints','admission-copy'),('literal-policy','admission-copy'),('unassigned','other'))
assert len(SLOTS) == len(set(SLOTS)) == 125 <= 128
INDEX = {pair:i for i,pair in enumerate(SLOTS)}
LEGACY_PHASES = frozenset(('native-resource-conversion','native-resource-compilation',
    'native-core-copy','native-schema-compilation','native-schema-validation','native-result-envelope'))
CTOR_PHASES = frozenset('ctor.'+site for site in COMPILE_SITES+CONVERSION_SITES+('other',))
TARGET = {'total':34055317,'eventCount':1000001,
          'amountSequenceSHA256':'725818593ddfbebfd435a776098f4326ee8d48fe588960bea6ead4f171e3db87',
          'deniedAmount':1,'deniedIndex':1000000,
          'ordinaryPhases':{'conversionWork':1208128,'conversionEvents':125749,
                            'compilationWork':32847189,'compilationEvents':874252},
          'terminal':{'type':'UmfCoreError','code':'RESOURCE_LIMIT',
                      'message':'Private attribution event/counter cap exceeded','path':'/private/attribution'}}


def slot_for(phase,root):
    if type(phase)is not str or type(root)is not str or phase not in LEGACY_PHASES|CTOR_PHASES:
        raise ValueError('Unknown constructor observation label')
    if root not in ROOTS+('conversion','constraints','literal-policy'):
        raise ValueError('Unknown constructor site/root role')
    # Known but unclassified work must never imply copying or admission.
    if phase in ('ctor.other','native-resource-compilation','native-schema-compilation','native-result-envelope'):
        return INDEX[('unassigned','other')]
    if root == 'conversion':
        site = phase[5:] if phase.startswith('ctor.') else (
            'owned-validation' if phase=='native-core-copy' else 'factory')
    elif phase == 'native-core-copy':
        site='admission-copy'
    elif phase == 'native-schema-validation':
        if not root.startswith('registration-'):
            return INDEX[('unassigned','other')]
        site='registry-manifest'
    elif phase.startswith('ctor.'):
        site=phase[5:]
    else:
        return INDEX[('unassigned','other')]
    pair=(root,site)
    if pair not in INDEX:raise ValueError('Unknown constructor site/root slot')
    return INDEX[pair]


class PrefixTrace:
    """125 fixed slots; no event history. Counts include the first denied event."""
    def __init__(self,attributed,cap=EVENT_CAP):
        if type(cap)is not int or not 0<=cap<=EVENT_CAP:raise ValueError('Invalid event cap')
        self.attributed=attributed;self.cap=cap;self.total=0;self.count=0
        self.work=[0]*len(SLOTS);self.events=[0]*len(SLOTS)
        self.digest=hashlib.sha256();self.last=None;self.denial=None;self.after_denial=0
    def __call__(self,amount,phase,root=None):
        if self.denial is not None:
            self.after_denial+=1;raise AssertionError('Callback after first prefix denial')
        if type(amount)is not int or not 0<=amount<=0xffffffff:raise ValueError('Invalid charge')
        if self.attributed:
            slot=slot_for(phase,root)
        else:
            if root is not None or phase not in ('native-resource-conversion','native-resource-compilation'):
                raise ValueError('Ordinary factory callback protocol changed')
            slot=INDEX[('conversion','factory') if phase=='native-resource-conversion' else ('unassigned','other')]
        self.count+=1;self.total+=amount
        self.work[slot]+=amount;self.events[slot]+=1
        self.digest.update(amount.to_bytes(8,'little'))
        self.last={'amount':amount,'index':self.count-1,'cumulative':self.total,'slot':slot}
        if self.count>self.cap or self.total>2**64-1:
            self.denial=dict(self.last)
            return ('RESOURCE_LIMIT','Private attribution event/counter cap exceeded','/private/attribution')
        return None
    def summary(self):
        return {'total':self.total,'eventCount':self.count,'amountSequenceSHA256':self.digest.hexdigest(),
                'lastEvent':self.last,'firstDenial':self.denial,'afterDenial':self.after_denial,
                'slots':[{'root':root,'site':site,'work':self.work[i],'events':self.events[i]}
                         for i,(root,site) in enumerate(SLOTS)]}


def compare_prefix(report,target=TARGET):
    if report.get('completedHandle')is not False:raise ValueError('Expected partial refusal, never a handle')
    if report.get('terminal')!=target['terminal']:raise ValueError('Terminal failure differs')
    if report.get('afterDenial')!=0:raise ValueError('Charge after first denial')
    for key in ('total','eventCount','amountSequenceSHA256'):
        if report.get(key)!=target[key]:raise ValueError('Original prefix mismatch: '+key)
    d=report.get('firstDenial');last=report.get('lastEvent')
    if type(d)is not dict or d!=last or (d.get('amount'),d.get('index'),d.get('cumulative'))!=(target['deniedAmount'],target['deniedIndex'],target['total']):
        raise ValueError('First/last denied charge differs')
    slots=report.get('slots',[])
    if [(r['root'],r['site']) for r in slots]!=list(SLOTS):raise ValueError('Slot roster differs')
    if any(type(r[k])is not int or r[k]<0 for r in slots for k in ('work','events')):
        raise ValueError('Invalid slot counter')
    if sum(r['work'] for r in slots)!=report['total'] or sum(r['events'] for r in slots)!=report['eventCount']:
        raise ValueError('Site counters do not reconcile')
    if target.get('ordinaryPhases') and report.get('attributed') is False:
        c=slots[INDEX[('conversion','factory')]];k=slots[INDEX[('unassigned','other')]]
        actual={'conversionWork':c['work'],'conversionEvents':c['events'],
                'compilationWork':k['work'],'compilationEvents':k['events']}
        if actual!=target['ordinaryPhases']:raise ValueError('Original coarse phase prefix differs')
    return True
