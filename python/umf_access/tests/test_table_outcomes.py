# SPDX-License-Identifier: MIT OR Apache-2.0
"""Effect-receipt custody, occupied-slot and exact-bound negative controls."""
import unittest
from typing import ClassVar

from umf_access.unified import SessionError, SessionIdentity
from umf_access.unified.outcome_values import (
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


if __name__=='__main__':unittest.main()
