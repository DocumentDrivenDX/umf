# SPDX-License-Identifier: MIT OR Apache-2.0
"""Effect-receipt custody, occupied-slot and exact-bound negative controls."""
import hashlib
import hmac
import json
import unittest
from typing import ClassVar
from unittest.mock import patch

from umf_access.unified import SessionError, SessionIdentity, outcome_values
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

    def test_default_rust_path_matches_domain_separated_hmac_vectors(self):
        value={'inputs':{'雪':'non-BMP 🐈'}}
        raw=json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
        expected=hmac.new(self.secret,b'umf.table-outcome/0.1\0invocation\0'+raw,hashlib.sha256).hexdigest()
        self.assertEqual(outcome_invocation(self.secret,value),expected)
        self.assertEqual(outcome_invocation(bytearray(self.secret),value),expected)

        row=outcome_record(self.secret,self.principal,self.slot,self.metadata,[1],{'ok':True})
        payload=json.loads(row['payload'])
        response=json.dumps({'ok':True},sort_keys=True,separators=(',',':')).encode()
        self.assertEqual(payload['responseDigest'],hmac.new(
            self.secret,b'umf.table-outcome/0.1\0response\0'+response,hashlib.sha256
        ).hexdigest())
        self.assertEqual(self.verify(tuple(row[key] for key in (
            'invocationDigest','scopeDigest','payload','signature'
        )))['effects'],[{'integerToken':'1'}])

    def test_default_receipt_path_reaches_native_primitives(self):
        calls=[]
        crypto=outcome_values.rust_outcome_values
        native_hmac=crypto.hmac_sha256
        native_slot=crypto.slot_sha256
        native_compare=crypto.signature_matches

        def hmac_call(secret,message):
            calls.append('hmac')
            return native_hmac(secret,message)
        def slot_call(message):
            calls.append('slot')
            return native_slot(message)
        def compare_call(left,right):
            calls.append('compare')
            return native_compare(left,right)

        actor=SessionIdentity('person','alice')
        with patch.object(crypto,'hmac_sha256',hmac_call), \
             patch.object(crypto,'slot_sha256',slot_call), \
             patch.object(crypto,'signature_matches',compare_call):
            outcome_invocation(self.secret,{'v':1})
            outcome_slot(actor,42,{'schema':'plugin','module':'demo'},'create','key')
            stored=self.record()
            self.verify(stored)
        self.assertEqual(calls.count('slot'),1)
        self.assertGreaterEqual(calls.count('hmac'),4)
        self.assertEqual(calls.count('compare'),1)

    def test_invalid_hmac_key_and_bad_value_keep_predecessor_order(self):
        with self.assertRaisesRegex(TypeError,"key: expected bytes or bytearray"):
            outcome_invocation(memoryview(b'x'*32),{'v':1})
        with self.assertRaisesRegex(SessionError,'invalid operation JSON'):
            outcome_invocation(object(),"\ud800")

    def test_secret_carriers_and_signature_length_gate_keep_predecessor_rules(self):
        class BytesSubclass(bytes):
            pass

        value={'v':'🐈'}
        expected=outcome_invocation(self.secret,value)
        self.assertEqual(outcome_invocation(BytesSubclass(self.secret),value),expected)
        for length in (0,31):
            with self.subTest(length=length),self.assertRaisesRegex(ValueError,'at least256 bits'):
                outcome_values._signature(b'x'*length,self.principal,self.slot,{
                    'invocationDigest':'5'*64,'scopeDigest':'6'*64,'payload':'{}'
                })
        for length in (32,64,65):
            with self.subTest(length=length):
                signature=outcome_values._signature(b'x'*length,self.principal,self.slot,{
                    'invocationDigest':'5'*64,'scopeDigest':'6'*64,'payload':'{}'
                })
                self.assertEqual(len(signature),64)
        with self.assertRaisesRegex(ValueError,'at least256 bits'):
            outcome_record(bytearray(self.secret),self.principal,self.slot,self.metadata,[1],{})
        with self.assertRaisesRegex(ValueError,'at least256 bits'):
            outcome_record(BytesSubclass(self.secret),self.principal,self.slot,self.metadata,[1],{})

    def test_secret_subclass_conversion_does_not_call_overridden_bytes(self):
        class BytesSubclass(bytes):
            def __bytes__(self):
                raise RuntimeError('bytes override must not run')

        class BytearraySubclass(bytearray):
            def __bytes__(self):
                raise RuntimeError('bytes override must not run')

        value={'v':'🐈'}
        message=b'umf.table-outcome/0.1\0invocation\0'+outcome_values.canonical(value).encode()
        for secret in (BytesSubclass(self.secret), BytearraySubclass(self.secret)):
            with self.subTest(carrier=type(secret).__name__):
                expected=hmac.new(secret,message,hashlib.sha256).hexdigest()
                self.assertEqual(outcome_invocation(secret,value),expected)
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
