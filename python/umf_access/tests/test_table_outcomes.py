# SPDX-License-Identifier: MIT OR Apache-2.0
"""Effect-receipt custody, occupied-slot and exact-bound negative controls."""
import unittest
from typing import ClassVar
from unittest.mock import patch

from umf_access.unified import SessionError, SessionIdentity
from umf_access.unified.table_reads import _operation_scope
from umf_access.unified.table_writes import SyncTableWriter
from umf_access.unified.outcome_values import (
    digest,
    outcome_from_record,
    outcome_invocation,
    outcome_record,
    outcome_slot,
)


class TableOutcomes(unittest.TestCase):
    def test_historical_input_fingerprint_requires_the_host_secret(self):
        value={'inputs':{'status':{'string':'private-low-entropy-value'}}}
        self.assertEqual(outcome_invocation(b'x'*32,value),outcome_invocation(b'x'*32,value))
        self.assertNotEqual(outcome_invocation(b'x'*32,value),outcome_invocation(b'z'*32,value))
    secret=b'x'*32
    principal=42
    slot='a'*64
    metadata: ClassVar[dict]={'module':'demo','operation':'create','sourceDigest':'1'*64,'configurationDigest':'2'*64,
              'bundleDigest':'3'*64,'headDigest':'4'*64,'invocationDigest':'5'*64,'scopeDigest':'6'*64}

    def record(self, effects=None):
        row=outcome_record(self.secret,self.principal,self.slot,self.metadata,[1] if effects is None else effects,
                           {'rows':[{'private':'historical-business-value'}]})
        return tuple(row[k] for k in ('invocationDigest','scopeDigest','payload','signature'))

    def verify(self, stored, **options):
        return outcome_from_record(options.get('secret',self.secret),options.get('principal',self.principal),
                                   options.get('slot',self.slot),stored,options.get('metadata',self.metadata),items=1,max_rows=10)

    def test_signed_receipt_retains_effects_without_historical_business_rows(self):
        stored=self.record()
        self.assertNotIn('historical-business-value',stored[2])
        self.assertEqual(self.verify(stored)['effects'],[{'integerToken':'1'}])

    def test_tampering_or_different_principal_slot_or_verifier_refuses(self):
        stored=self.record()
        for kwargs in [{'secret':b'z'*32},{'principal':43},{'slot':'b'*64}]:
            with self.subTest(options=kwargs),self.assertRaises(SessionError):self.verify(stored,**kwargs)
        for index in range(4):
            changed=list(stored);changed[index]='0'*64 if index!=2 else '{}'
            with self.subTest(index=index),self.assertRaises(SessionError):self.verify(changed)

    def test_changed_invocation_or_authority_cannot_consume_a_valid_receipt(self):
        for key in self.metadata:
            changed={**self.metadata,key:'different'}
            with self.subTest(key=key),self.assertRaises(SessionError):self.verify(self.record(),metadata=changed)

    def test_even_authenticated_invalid_counts_and_item_inventory_refuse(self):
        for counts in [[],[1,2],[-1],[11],[True],[1.5]]:
            with self.subTest(counts=counts),self.assertRaises(SessionError):self.verify(self.record(counts))

    def test_slot_is_stable_across_inputs_generations_and_verifier_rotation(self):
        actor=SessionIdentity('person','alice');context={'module':'demo','schema':'plugin','headDigest':'1'*64}
        slot=outcome_slot(actor,42,context,'create','caller-key')
        self.assertEqual(slot,outcome_slot(actor,42,{**context,'headDigest':'2'*64,'inputs':'changed'},'create','caller-key'))
        for other_actor,principal,operation,key in [(SessionIdentity('person','bob'),42,'create','caller-key'),
                (actor,43,'create','caller-key'),(actor,42,'remove','caller-key'),(actor,42,'create','another-key')]:
            self.assertNotEqual(slot,outcome_slot(other_actor,principal,context,operation,key))
        for key in ['',None,'x'*257,'\0']:
            with self.assertRaises(SessionError):outcome_slot(actor,42,context,'create',key)

    def test_writer_recovery_checks_profile_digests_before_any_effect_frame(self):
        from test_operation_input_snapshot import _fixture

        actor=SessionIdentity('person','alice')
        secret=b's'*32
        principal=42
        operation='operation'
        key='caller-key'
        context={'module':'demo','schema':'plugin','sourceDigest':'1'*64,
                 'configurationDigest':'2'*64,'bundleDigest':'3'*64,'headDigest':'4'*64,
                 'referenceDigest':'5'*64}
        program={'operation':operation,'module':'demo','idempotencyKey':key,
                 'declarationDigest':'d'*64,'callKind':'single','nativeInputs':[{}],
                 'result':{'maxRows':10}}

        def run(current_profile, stored_profile):
            session,binding,_probe,_identity=_fixture('update')
            session.policy.table_operation_module_profile=current_profile
            session.transaction_owner='caller'
            writer=SyncTableWriter(session,{}, {},binding,outcome_secret=secret)
            scope=_operation_scope(context,operation,'postgresql18',{'value':1},None,None,current_profile)
            stored_scope=_operation_scope(context,operation,'postgresql18',{'value':1},None,None,stored_profile)
            slot=outcome_slot(actor,principal,scope,operation,key)
            self.assertEqual(slot,outcome_slot(actor,principal,stored_scope,operation,key))
            stored_metadata={k:stored_scope[k] for k in
                             ('module','operation','sourceDigest','configurationDigest','bundleDigest','headDigest')}
            stored_metadata.update(
                invocationDigest=outcome_invocation(secret,[stored_scope,program['declarationDigest'],program['callKind']]),
                scopeDigest=digest({k:v for k,v in stored_scope.items() if k!='inputsDigest'}),
            )
            record=outcome_record(secret,principal,slot,stored_metadata,[1],{'items':[{'id':'row'}]})
            packed=tuple(record[k] for k in ('invocationDigest','scopeDigest','payload','signature'))

            class Probe:
                def __init__(self):self.calls=[]
                def operation_steps(self):
                    if False:yield None
                    return {'principalOid':principal}
                def outcome_steps(self,action,*_args):
                    self.calls.append(action)
                    if action=='read':return packed
                    if False:yield None
                    return None

            probe=Probe()
            with patch.object(writer,'_before',return_value=None), \
                 patch('umf_access.unified.table_writes._effect_frames',
                       side_effect=AssertionError('stored-slot recovery must not execute business effects')):
                iterator=writer._steps(actor,(probe,program,scope,secret,None),False)
                try:
                    next(iterator)
                except StopIteration as stop:
                    return stop.value,probe.calls
            self.fail('writer state machine unexpectedly yielded with an already stored receipt')

        for profile in ('weft.table-operation-module/0.1','weft.table-operation-module/0.2'):
            with self.subTest(profile=profile):
                result,calls=run(profile,profile)
                self.assertEqual(result['status'],'recovered')
                self.assertEqual(calls,['lock','read'])
        for current,stored in (('weft.table-operation-module/0.1','weft.table-operation-module/0.2'),
                               ('weft.table-operation-module/0.2','weft.table-operation-module/0.1')):
            with self.subTest(current=current,stored=stored):
                with self.assertRaises(SessionError):run(current,stored)


if __name__=='__main__':unittest.main()
