# SPDX-License-Identifier: MIT OR Apache-2.0
"""Exact result and cursor trust boundaries; native scheduling is tested separately."""
import copy
import math
import struct
import unittest
from decimal import InvalidOperation, getcontext

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
            ('date','0001-01-01',{'date':'0001-01-01'}),
            ('timestamp','9999-12-31T23:59:59.999999Z',{'timestamp':'9999-12-31T23:59:59.999999Z'}),
        ]:
            self.assertEqual(value_from_native(text,{'carrier':carrier,'nullable':False}),wire)
            self.assertEqual(key_literal(wire,carrier),
                             {'string':wire} if carrier=='string' else {'boolean':wire} if carrier=='boolean' else wire)
        self.assertIsNone(value_from_native(None,{'carrier':'string','nullable':True}))

    def test_finite_binary64_query_results_preserve_tokens_and_signed_zero(self):
        for text in ('0','-0','1.25','5e-324','1.7976931348623157e+308'):
            self.assertEqual(value_from_native(text,{'carrier':'float','nullable':False}),{'floatToken':text})
        for value in ('NaN','Infinity','-Infinity','1e9999','01','1.0 ',1.25):
            with self.subTest(value=value),self.assertRaises(SessionError):
                value_from_native(value,{'carrier':'float','nullable':False})

    def test_binary64_native_encoding_avoids_session_float_text_rounding(self):
        output={'carrier':'float','nullable':False,'nativeEncoding':'ieee754-binary64-hex'}
        for number in (1.2345678901234567,-0.0,5e-324):
            token=value_from_native(struct.pack('!d',number).hex(),output)['floatToken']
            self.assertEqual(float(token),number)
            self.assertEqual(math.copysign(1,float(token)),math.copysign(1,number))
        for value in ('3ff000000000000','7ff0000000000000','fff0000000000000','7ff8000000000000','1.25'):
            with self.assertRaises(SessionError):value_from_native(value,output)

    def test_native_values_cannot_lie_about_carriers_or_required_presence(self):
        for carrier,value in [('integer',1),('integer','01'),('decimal','NaN'),('decimal','Infinity'),
                              ('decimal',1.5),('boolean',1),('string',b'text'),('uuid','invalid'),
                              ('bits128','FF'*16),('string',None),('date','1900-02-29'),('date','infinity'),
                              ('timestamp','2026-01-01T00:00:00.1234567Z'),('timestamp','2026-01-01T00:00:00.123456+01:00')]:
            with self.subTest(carrier=carrier,value=value), self.assertRaises(SessionError):
                value_from_native(value,{'carrier':carrier,'nullable':False})

    def test_rust_typed_token_classes_preserve_exact_text_and_refuse_noncanonical_forms(self):
        admitted = [
            ('integer','0',{'integerToken':'0'}),
            ('integer','-0',{'integerToken':'-0'}),
            ('integer','-123456789012345678901234567890',{'integerToken':'-123456789012345678901234567890'}),
            ('decimal','-0.000e-123',{'decimalToken':'-0.000e-123'}),
            ('decimal','1e999999999999999999',{'decimalToken':'1e999999999999999999'}),
            ('decimal','1.0e999999999999999999',{'decimalToken':'1.0e999999999999999999'}),
            ('decimal','0.01e1000000000000000000',{'decimalToken':'0.01e1000000000000000000'}),
            ('decimal','1e-1999999999999999997',{'decimalToken':'1e-1999999999999999997'}),
            ('uuid','00000000-0000-0000-0000-000000000001',{'uuid':'00000000-0000-0000-0000-000000000001'}),
            ('bits128','0123456789abcdef'*2,{'bits128Hex':'0123456789abcdef'*2}),
        ]
        refused = [
            ('integer','01'),('integer','+1'),('integer','1.0'),
            ('decimal','01'),('decimal','1.'),('decimal','.1'),('decimal','NaN'),
            ('decimal','1e1000000000000000000'),('decimal','1e-1999999999999999998'),
            ('decimal','0.1e-1999999999999999997'),
            ('decimal','99.99e999999999999999999'),
            ('uuid','00000000-0000-0000-0000-00000000000A'),
            ('uuid','00000000000000000000000000000001'),('bits128','FF'*16),
            ('bits128','f'*31),
        ]
        for carrier,text,expected in admitted:
            with self.subTest(carrier=carrier,text=text):
                self.assertEqual(value_from_native(text,{'carrier':carrier,'nullable':False}),expected)
        for carrier,text in refused:
            with self.subTest(carrier=carrier,text=text),self.assertRaises(SessionError):
                value_from_native(text,{'carrier':carrier,'nullable':False})

    def test_value_from_native_keeps_null_and_unicode_failure_order(self):
        class LoggedOutput(dict):
            def __init__(self,*args,**kwargs):
                super().__init__(*args,**kwargs);self.reads=[]
            def __getitem__(self,key):
                self.reads.append(key);return super().__getitem__(key)
        nullable=LoggedOutput(nullable=True)
        self.assertIsNone(value_from_native(None,nullable))
        self.assertEqual(nullable.reads,['nullable'])
        required=LoggedOutput(nullable=False)
        with self.assertRaises(SessionError):value_from_native(None,required)
        self.assertEqual(required.reads,['nullable'])
        output=LoggedOutput(carrier='integer',nullable=False)
        with self.assertRaises(UnicodeEncodeError):value_from_native('\ud800',output)
        self.assertEqual(output.reads,['carrier'])

    def test_decimal_constructor_flag_survives_rust_classification(self):
        context=getcontext()
        old_flags=context.flags.copy()
        old_trap=context.traps[InvalidOperation]
        output={'carrier':'decimal','nullable':False}
        try:
            context.traps[InvalidOperation]=old_trap
            context.clear_flags()
            with self.assertRaises(SessionError):
                value_from_native('1e1000000000000000000',output)
            self.assertTrue(context.flags[InvalidOperation])
            self.assertEqual([signal for signal,flag in context.flags.items() if flag],
                             [InvalidOperation])

            context.clear_flags()
            context.traps[InvalidOperation]=False
            with self.assertRaises(SessionError):
                value_from_native('1e1000000000000000000',output)
            self.assertTrue(context.flags[InvalidOperation])
            self.assertEqual([signal for signal,flag in context.flags.items() if flag],
                             [InvalidOperation])

            context.clear_flags()
            with self.assertRaises(SessionError):
                value_from_native('1e',output)
            self.assertFalse(context.flags[InvalidOperation])
            with self.assertRaises(SessionError):
                value_from_native('1e100000000000000000000x',output)
            self.assertFalse(context.flags[InvalidOperation])
        finally:
            context.traps[InvalidOperation]=old_trap
            for signal,flag in old_flags.items():context.flags[signal]=flag

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
