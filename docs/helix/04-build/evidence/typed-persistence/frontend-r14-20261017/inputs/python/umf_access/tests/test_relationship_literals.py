"""Generated source capture keeps S8 operands and exact numeric families."""
import unittest
from dataclasses import replace
from decimal import Decimal

from commerce import Customer, CustomerKey, Order, OrderKey
from umf_access.capture import capture
from umf_access.dsl import CaptureError, Param, query
from umf_access.dsl.render import render_logical
from umf_access.reviewed import (
    ReadBuildError,
    parameter_signature,
    validate_list_parameters,
)


class RelationshipLiteralTests(unittest.TestCase):
    def test_real_generated_forward_metadata_and_key_identity(self):
        @query
        def selected(key: Param[CustomerKey]):
            return Order.objects.filter(Order.c.customer.has(key)).include_keys(Order.c.customer,limit=2).limit(3).all()
        text=render_logical(capture(selected).variants[0])
        self.assertIn('HAS_RELATED("r"."customer", KEY(:key__customer_id))',text)
        self.assertIn('RELATED_KEYS("r"."customer", 2)',text)

    def test_cross_record_inverse_keeps_original_canonical_relationship(self):
        # This prior generated fixture predates inverse-Key metadata. Enrich only
        # its known original primary Key to exercise the shared capture ABI;
        # the fresh R12 generator/native fixture qualifies default selection.
        relation=replace(Order.c.customer,inverse_key_target=Order.objects.ref)
        @query
        def selected(key: Param[OrderKey]):
            inverse=relation.inverse()
            return Customer.objects.filter(inverse.has(key)).include_keys(inverse,limit=2).limit(3).all()
        text=render_logical(capture(selected).variants[0])
        self.assertIn('HAS_INVERSE_RELATED("r"."customer", KEY(:key__order_id), \'commerce\', \'customer\')',text)
        self.assertIn('INVERSE_RELATED_KEYS("r"."customer", 2, \'commerce\', \'customer\')',text)

    def test_integral_decimal_and_empty_list_retains_field(self):
        @query
        def selected():
            return Order.objects.filter((Order.c.amount==Decimal('1E+2')) & Order.c.memo.is_in([]) & Order.c.order_id.not_in([])).limit(3).all()
        text=render_logical(capture(selected).variants[0])
        self.assertIn('"r"."amount" = 100.0',text)
        self.assertIn('IN_EMPTY("r"."memo")',text)
        self.assertIn('NOT (IN_EMPTY("r"."orderId"))',text)

    def test_nonempty_nullable_literal_members_are_not_erased(self):
        @query
        def selected():
            return Order.objects.filter(Order.c.memo.is_in([None,'x']) & Order.c.order_id.not_in([None,'x'])).limit(3).all()
        text=render_logical(capture(selected).variants[0])
        self.assertIn('IN (NULL, \'x\')',text)
        self.assertIn('NOT IN (NULL, \'x\')',text)

    def test_oversized_integer_is_named_capture_refusal(self):
        @query
        def selected():
            return Order.objects.filter(Order.c.revision == 10**5000).limit(3).all()
        with self.assertRaisesRegex(CaptureError,"4096-digit capture token profile"):
            capture(selected)

    def test_closed_list_signature_and_validation_before_native_dispatch(self):
        descriptor={'name':'values',**parameter_signature(list[int|None])}
        self.assertEqual(descriptor,{'name':'values','carrier':'integer','nullable':False,'container':'list','elementNullable':True,'maxItems':1000})
        validate_list_parameters([descriptor],{'values':[None,2**80,-2**80]})
        validate_list_parameters([descriptor],{'values':[]})
        for value in ((1,),None,[True],[Decimal(1)],list(range(1001))):
            with self.subTest(value_type=type(value)),self.assertRaises(ReadBuildError):validate_list_parameters([descriptor],{'values':value})
        decimal={'name':'values',**parameter_signature(list[Decimal])}
        validate_list_parameters([decimal],{'values':[Decimal('1E+2')]})
        for value in ([None],[1],[Decimal('NaN')],[Decimal('Infinity')]):
            with self.assertRaises(ReadBuildError):validate_list_parameters([decimal],{'values':value})
