import copy,json,hashlib
from unittest.mock import patch
import test_supervisor_journal_codec as tests
from umf_access.lifecycle import ingress_local_postgres as native
codec=tests.codec;capture=[];original=codec.validate_legacy_record
def save(raw,**kw):
 result=original(raw,**kw);capture.append((json.loads(raw),kw));return result
with patch.object(codec,'validate_legacy_record',save):
 tests.SupervisorJournalCodecTests('test_legacy_01_nonzero_physical_history_keeps_existing_replay_semantics').test_legacy_01_nonzero_physical_history_keeps_existing_replay_semantics()
doc,kw=max(capture,key=lambda v:len(v[0]['events']));doc=copy.deepcopy(doc);doc['events']=doc['events'][:4];assert doc['events'][-1]['kind']=='launch-confirmed'
payload={'reservationId':'abababab-abab-4bab-8bab-abababababab','scope':'native-store-creation','effectKey':['native-store-creation','old-store'],'purpose':'native-acceptance','requestId':'bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc','requestDigest':'1'*64,'approvalId':'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd','approvalDigest':'2'*64,'stage':'dispatch','payloadDigest':'3'*64}
tests._append(doc['events'],'native-effect-intent',payload,'0'*64);doc['sequence']=len(doc['events']);doc['headDigest']=doc['events'][-1]['recordDigest'];raw=codec.canonical(doc)
n=object.__new__(native._SupervisorJournal);n.supervisor_id=doc['supervisorId'];n._replay(doc['events'])
result={'case':'legacy.1-native-store-creation-intent','actualRetainedNativeReplay':'ACCEPT'}
try:original(raw,**kw);result['newPureLegacyCodec']='ACCEPT'
except codec.SupervisorJournalCodecError as e:result['newPureLegacyCodec']='REFUSE';result['error']=e.code
print(json.dumps(result,indent=2))
open('/private/tmp/g11-journal005-independent-review001/legacy-journal.json','wb').write(raw)
assert result['newPureLegacyCodec']=='ACCEPT','New pure legacy codec disagrees with actual retained native reader'
