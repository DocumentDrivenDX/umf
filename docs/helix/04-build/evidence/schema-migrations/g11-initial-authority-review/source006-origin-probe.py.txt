import sys,json,copy,uuid,signal
from pathlib import Path
signal.alarm(20)
root=Path('/private/tmp/g11-initial-authority-source-006')
sys.path[:0]=[str(root/'source'),str(root/'tests'),'/private/tmp/g11-owner-authority-crypto-001/venv/lib/python3.12/site-packages','/private/tmp/umf056-public-wheel-verify/venv/lib/python3.12/site-packages']
from test_generation_enrollment_authority import GenerationEnrollmentAuthorityTests
from umf_access.lifecycle import generation_enrollment_authority as a
class CallerIssuer(a._SourceTestGenerationTrustIssuer):
    def _projection(self,entry):
        value=super()._projection(entry)
        value.pop('sourceTestOnly',None)
        return value
    def resolve_generation_authority_context(self,handle):
        return handle
f=GenerationEnrollmentAuthorityTests();f.setUp()
try:
    issuer=CallerIssuer(a._SOURCE_TEST_ISSUER_SEAL,registry_id=str(uuid.uuid4()),registry=object(),supervisor=f.supervisor,custodian=f.custodian,ingress_store=f.ingress,registry_path=f.root/'caller-contexts.jsonl')
    config=copy.deepcopy(f.config);config['purpose']='production'
    statement=json.loads(f.trust._statement_bytes);statement['enrollmentId']=str(uuid.uuid4());statement['configurationDigest']=a._sha(a._canonical(config))
    ledger=f.root/'caller-ledger.jsonl'
    trust=issuer._issue_original_trust_entry(statement,config,ledger_path=ledger)
    context=issuer.enroll_generation_authority(trust,f.supervisor,f.custodian,f.ingress)
    try:
        a.ConfiguredGenerationEnrollmentAuthority(config,context=context,ledger_path=ledger)
    except a.GenerationEnrollmentAuthorityError as error:
        assert error.code=='generation-authority-context-unverified'
        print(json.dumps({'originalSubclassOriginProbe':'refused','code':error.code,'nativeEffects':False}))
    else:
        raise AssertionError('original caller subclass still accepted')

finally:f.tearDown()
