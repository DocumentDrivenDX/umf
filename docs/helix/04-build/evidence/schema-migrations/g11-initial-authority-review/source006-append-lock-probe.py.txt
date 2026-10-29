import sys,signal,json,multiprocessing,time
from pathlib import Path
signal.alarm(20)
root=Path('/private/tmp/g11-initial-authority-source-006')
sys.path[:0]=[str(root/'source'),str(root/'tests'),'/private/tmp/g11-owner-authority-crypto-001/venv/lib/python3.12/site-packages','/private/tmp/umf056-public-wheel-verify/venv/lib/python3.12/site-packages']
from test_generation_enrollment_authority import GenerationEnrollmentAuthorityTests
from umf_access.lifecycle import generation_enrollment_authority as a
from unittest.mock import patch
f=GenerationEnrollmentAuthorityTests();f.setUp();ctx=multiprocessing.get_context('fork')
first_inside=ctx.Event();release=ctx.Event();second_started=ctx.Event();second_inside=ctx.Event()
def writer(first):
    original=a._Ledger._read_locked
    def read(self,*,create):
        (first_inside if first else second_inside).set()
        if first:assert release.wait(5),'parent never released first writer'
        return original(self,create=create)
    if not first:second_started.set()
    with patch.object(a._Ledger,'_read_locked',read),patch.object(a._Ledger,'_append_locked',return_value={}):
        f.auth._ledger._append('probe',{})
children=[]
try:
    before=(f.root/'approvals.jsonl').read_bytes()
    one=ctx.Process(target=writer,args=(True,));children.append(one);one.start();assert first_inside.wait(5)
    two=ctx.Process(target=writer,args=(False,));children.append(two);two.start();assert second_started.wait(5)
    assert not second_inside.wait(.3),'second append entered read/replay while first held append lock'
    release.set()
    for child in children:child.join(5);assert not child.is_alive() and child.exitcode==0
    assert second_inside.is_set() and (f.root/'approvals.jsonl').read_bytes()==before
    print(json.dumps({'control':'actual-two-process-append-lock-blocks-second-read-until-first-releases','pass':True,'ledgerBytesUnchanged':True,'nativeEffects':False,'limits':'real flock/_append sequencing; append serialization tested with inert transition body, not a native effect test'}))
finally:
    release.set()
    for child in children:
        if child.is_alive():child.terminate();child.join(3)
        assert not child.is_alive()
    f.tearDown()
