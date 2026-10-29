import base64,copy,hashlib,json,pathlib,sys
from unittest.mock import patch
PACKET=pathlib.Path('/private/tmp/g11-supervisor-journal-015-source-005')
raw=(PACKET/'manifest.json').read_bytes()
assert hashlib.sha256(raw).hexdigest()=='4c5fdf5d09bcb0f5ed468484caa7ec70a5aa4f858f985a655130a06501dc8841'
m=json.loads(raw)
# Full source005 overlay closure is independently pinned by prepare.py/assembled-closure.json.
SRC=pathlib.Path('/private/tmp/g11-journal005-independent-review001/combined/snapshot/python/umf_access')
sys.path[:0]=[str(SRC/'src'),str(SRC/'tests'),'/private/tmp/g11-owner-authority-crypto-001/venv/lib/python3.12/site-packages','/private/tmp/umf056-public-wheel-verify/venv/lib/python3.12/site-packages','/private/tmp/umf-g03-access-001/venv/lib/python3.11/site-packages']
import test_supervisor_journal_codec as tests
codec=tests.codec
original=codec.validate_record
captured=[]
def capture(raw,**kw):
    result=original(raw,**kw);captured.append((copy.deepcopy(json.loads(raw)),copy.deepcopy(kw)));return result
with patch.object(codec,'validate_record',capture):
    tests.SupervisorJournalCodecTests('test_root_mutation_events_replay_signed_original_registry_transitions').test_root_mutation_events_replay_signed_original_registry_transitions()
doc,kw=max(captured,key=lambda v:len(v[0]['events']))
results=[]
for e in doc['events']:
    if e['kind']=='generation-authority-root-mutation-intent':
        obs=next(x for x in doc['events'] if x['recordDigest']==e['payload']['validationObservationEventDigest'])
        results.append({'case':'supplied-positive-observation-correspondence','accepted':True,'operation':e['payload']['operation'],'mutationEvidenceDigest':e['payload']['nativeEvidenceDigest'],'observationEvidenceDigest':obs['payload']['nativeEvidenceDigest'],'equal':e['payload']['nativeEvidenceDigest']==obs['payload']['nativeEvidenceDigest']})

# Change only observed bytes/digest, preserving real signed request/ROOT delta.
# Rehash journal chain and original event-reference bindings in forward order.
altered=copy.deepcopy(doc);mapped={};previous=altered['anchorDigest']
def remap(v):
    if isinstance(v,str):return mapped.get(v,v)
    if isinstance(v,list):return [remap(x) for x in v]
    if isinstance(v,dict):return {k:remap(x) for k,x in v.items()}
    return v
for e in altered['events']:
    old=e['recordDigest'];e['payload']=remap(e['payload'])
    if e['kind']=='generation-authority-observed':
        data=b'not canonical JSON native evidence'
        e['payload']['nativeEvidenceDigest']=hashlib.sha256(data).hexdigest()
        e['payload']['nativeEvidence']={'encoding':'base64','data':base64.b64encode(data).decode()}
    e['previousDigest']=previous
    e['recordDigest']=codec.digest({k:e[k] for k in ('sequence','kind','payload','previousDigest')})
    mapped[old]=e['recordDigest'];previous=e['recordDigest']
altered['headDigest']=previous
try:original(codec.canonical(altered),**kw);accepted=True;error=None
except codec.SupervisorJournalCodecError as exc:accepted=False;error=exc.code
results.append({'case':'foreign-noncanonical-observation-real-signed-root-unmodified','accepted':accepted,'error':error})
bare=copy.deepcopy(doc)
index=next(i for i,e in enumerate(bare['events']) if e['kind']=='originals-store-creation-intent')
assert bare['events'][index+1]['kind']=='native-effect-intent'
bare['events']=bare['events'][:index]+bare['events'][index+1:index+2]
previous=bare['anchorDigest']
for i,e in enumerate(bare['events'],1):
    e['sequence']=i;e['previousDigest']=previous;e['recordDigest']=codec.digest({k:e[k] for k in ('sequence','kind','payload','previousDigest')});previous=e['recordDigest']
bare['sequence']=len(bare['events']);bare['headDigest']=previous
try:original(codec.canonical(bare),**{k:v for k,v in kw.items() if k!='include_root_state'});accepted=True;error=None
except codec.SupervisorJournalCodecError as exc:accepted=False;error=exc.code
results.append({'case':'bare-scope4-generic-intent-no-typed-store-parent','accepted':accepted,'error':error})

# Retain supplied legacy positive fixture, then append a legitimate stop of
# its second launch. Full journal replay must not inspect future launches when
# validating the first stop.
legacy=[];oldvalidate=codec.validate_legacy_record
def legacy_capture(raw,**kw):
    result=oldvalidate(raw,**kw);legacy.append((copy.deepcopy(json.loads(raw)),kw));return result
with patch.object(codec,'validate_legacy_record',legacy_capture):
    tests.SupervisorJournalCodecTests('test_legacy_01_nonzero_physical_history_keeps_existing_replay_semantics').test_legacy_01_nonzero_physical_history_keeps_existing_replay_semantics()
ldoc,lkw=max(legacy,key=lambda v:len(v[0]['events']))
last=ldoc['events'][-1]['payload']
tests._append(ldoc['events'],'stop-intent',{'launchId':last['launchId'],'processStartToken':last['process']['startToken']},'0'*64)
ldoc['sequence']=len(ldoc['events']);ldoc['headDigest']=ldoc['events'][-1]['recordDigest']
try:oldvalidate(codec.canonical(ldoc),**lkw);accepted=True;error=None
except codec.SupervisorJournalCodecError as exc:accepted=False;error=exc.code
results.append({'case':'actual-second-launch-legitimate-stop-intent','accepted':accepted,'error':error})
birth=copy.deepcopy(tests._birth()['birth']);birth['supervisorId']=ldoc['supervisorId']
vd=copy.deepcopy(ldoc)
vd.update({'profile':codec.JOURNAL_PROFILE_02,'journalId':birth['journalId'],'definitionDigest':birth['definitionDigest'],'anchorDigest':birth['anchorDigest']})
cp=vd['events'][0]['payload'];cp['profile']='umf.local-postgresql-create-request/0.2'
cp['supervisorJournalBirthDigest']=codec.digest(birth);cp['ownerBootstrapContextDigest']='8'*64
for length in (8,9):
    candidate=copy.deepcopy(vd);candidate['events']=candidate['events'][:length]
    previous=birth['anchorDigest']
    for e in candidate['events']:
        e['previousDigest']=previous;e['recordDigest']=codec.digest({k:e[k] for k in ('sequence','kind','payload','previousDigest')});previous=e['recordDigest']
    candidate['sequence']=length;candidate['headDigest']=previous
    try:original(codec.canonical(candidate),birth=birth,owner_bootstrap_context_digest='8'*64,generation_root_policy_digest=None);accepted=True;error=None
    except codec.SupervisorJournalCodecError as exc:accepted=False;error=exc.code
    results.append({'case':'new02-restart-prefix-'+str(length),'accepted':accepted,'error':error})
out=pathlib.Path(__file__).parent
(out/'findings.json').write_text(json.dumps(results,indent=2)+'\n')
(out/'foreign-observation-journal.json').write_bytes(codec.canonical(altered))
(out/'bare-store-intent-journal.json').write_bytes(codec.canonical(bare))
(out/'restart-stop-journal.json').write_bytes(codec.canonical(ldoc))
print(json.dumps(results,indent=2))
