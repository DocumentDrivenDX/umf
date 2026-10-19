# SPDX-License-Identifier: MIT OR Apache-2.0
"""Exact result and cursor trust boundaries; native scheduling is tested separately."""
import copy
import unittest

from umf_access.unified import SessionError, SessionIdentity, SessionPolicy
from umf_access.unified.operation_values import (
    bounded_size,
    key_literal,
    loads,
    result_frame,
    token_decode,
    token_encode,
    value_from_native,
)


class TableReadValues(unittest.TestCase):
    def test_wire_budget_includes_repeated_field_identities(self):
        name='x'*2000
        with self.assertRaises(SessionError):bounded_size([{name:'a'} for _ in range(5000)])
    def test_exact_scalar_values_never_pass_through_float(self):
        for carrier, text, wire in [
            ('integer','9007199254740993123456789',{'integerToken':'9007199254740993123456789'}),
            ('decimal','1234567890123456789.123456789',{'decimalToken':'1234567890123456789.123456789'}),
            ('uuid','00000000-0000-0000-0000-000000000001',{'uuid':'00000000-0000-0000-0000-000000000001'}),
            ('bits128','ff'*16,{'bits128Hex':'ff'*16}),
            ('string','雪%_"', '雪%_"'),
            ('boolean',True,True),
        ]:
            self.assertEqual(value_from_native(text,{'carrier':carrier,'nullable':False}),wire)
            self.assertEqual(key_literal(wire,carrier),
                             {'string':wire} if carrier=='string' else {'boolean':wire} if carrier=='boolean' else wire)
        self.assertIsNone(value_from_native(None,{'carrier':'string','nullable':True}))

    def test_native_values_cannot_lie_about_carriers_or_required_presence(self):
        for carrier,value in [('integer',1),('integer','01'),('decimal','NaN'),('decimal','Infinity'),
                              ('decimal',1.5),('boolean',1),('string',b'text'),('uuid','invalid'),
                              ('bits128','FF'*16),('string',None)]:
            with self.subTest(carrier=carrier,value=value), self.assertRaises(SessionError):
                value_from_native(value,{'carrier':carrier,'nullable':False})

    def test_page_tokens_bind_host_identity_and_policy_without_accepting_raw_keys(self):
        policy=SessionPolicy({'alice':'alice','bob':'bob'},{'job':'batch'},'plugin',catalog_only=True)
        a=SessionIdentity('person','alice');root=b'x'*32
        key=policy.cursor_secret(a,root)
        scope={'operation':'page','inputsDigest':'a'*64,'principalOid':12,'roleScopeDigest':'b'*64}
        token=token_encode(key,scope,[{'integerToken':'9007199254740993'}])
        self.assertEqual(token_decode(key,token)['after'],[{'integerToken':'9007199254740993'}])
        for other in [policy.cursor_secret(SessionIdentity('person','bob'),root),
                      policy.cursor_secret(SessionIdentity('batch','job'),root),b'z'*32]:
            with self.assertRaises(SessionError):token_decode(other,token)
        for invalid in ['', 'raw-key', token+'.extra', token[:-1]+'x', 'x'*16385, None]:
            with self.assertRaises(SessionError):token_decode(key,invalid)
        with self.assertRaises(SessionError):token_encode(key,scope,[{'string':'x'*16384}])

    def test_duplicate_json_keys_and_nonfinite_json_never_enter_a_program(self):
        for invalid in ['{"a":1,"a":2}','{"a":NaN}', '{"a":Infinity}', '{']:
            with self.assertRaises(SessionError):loads(invalid)

    def test_count_cardinality_and_whole_wire_frame_bound(self):
        p={'module':'demo','operation':'count','binding':{'modelSha256':'a'*64},
           'outputs':[{'name':'umf_count','carrier':'integer','nullable':False}],
           'result':{'kind':'count','maxRows':1}}
        self.assertEqual(result_frame(p,[('1234567890123456789',)],{},b'x'*32)['count'],
                         {'integerToken':'1234567890123456789'})
        for rows in [[],[('-1',)],[('1',),('2',)],[('1','2')]]:
            with self.assertRaises(SessionError):result_frame(p,rows,{},b'x'*32)
        text=copy.deepcopy(p)
        text['result']['kind']='many'
        text['outputs']=[{'name':'value','field':{'module':'demo','element':'text'},'carrier':'string','nullable':False}]
        # Native octets fit, but JSON escaping exceeds the wire limit: no frame
        # or partial response can escape the final SDK bound.
        with self.assertRaises(SessionError):result_frame(text,[('\x01'*1_500_000,)],{},b'x'*32)


if __name__=='__main__':unittest.main()
