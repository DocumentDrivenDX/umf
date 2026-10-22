"""Generated relationship Keys retain nominal identity through untyped capture."""
import unittest

from commerce import CustomerKey, Order, OrderKey
from umf_access.capture import capture
from umf_access.dsl import CaptureError, Param, query


class RelationshipKeyIdentityTests(unittest.TestCase):
    def test_original_declared_key_accepts(self):
        @query
        def selected(key:Param[CustomerKey]):return Order.objects.filter(Order.c.customer.has(key)).limit(1).all()
        self.assertEqual(capture(selected).variants[0].node.op,'all')
    def test_wrong_key_literal_and_parameter_refuse(self):
        @query
        def literal():return Order.objects.filter(Order.c.customer.has(OrderKey(order_id='one'))).limit(1).all()
        @query
        def parameter(key:Param[OrderKey]):return Order.objects.filter(Order.c.customer.has(key)).limit(1).all()
        for declaration in (literal,parameter):
            with self.assertRaisesRegex(CaptureError,'declared Key identity differs'):
                capture(declaration)
