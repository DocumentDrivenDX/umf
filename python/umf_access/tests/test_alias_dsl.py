"""Real generated aliases; compiler/native qualification remains separate."""
import unittest
from dataclasses import replace

from commerce import Customer, Order
from umf_access.capture import capture
from umf_access.dsl import RecordAlias, query
from umf_access.dsl.render import render_logical


class FirstCustomer:
    pass
class SecondCustomer:
    pass
class RootOrder:
    pass

class AliasedDeclarations(unittest.TestCase):
    def test_repeated_original_target_has_distinct_allocated_aliases(self):
        first, second = Customer.alias(FirstCustomer), Customer.alias(SecondCustomer)
        @query
        def declaration():
            return Order.objects.join(Order.c.customer.to_alias(first)).join(Order.c.customer.to_alias(second)).select(first.c.name, second.c.name).limit(3).all()
        variant = capture(declaration).variants[0]
        binding = {"relationships": [{"id": "customer", "source": ["commerce", "Order"], "target": ["commerce", "Customer"], "toOne": True, "pairs": [["customerId", "customerId"]]}], "tables": [{"logical": ["commerce", "Customer"]}]}
        sql = render_logical(variant, binding=binding)
        self.assertIn('SELECT "j1"."name", "j2"."name"', sql)
        self.assertIn('LEFT JOIN "commerce"."Customer" AS "j1"', sql)
        self.assertIn('LEFT JOIN "commerce"."Customer" AS "j2"', sql)
        self.assertNotIn("FirstCustomer", sql)
        self.assertNotIn("SecondCustomer", sql)

    def test_root_alias_retains_original_source_and_complete_key(self):
        root = Order.alias(RootOrder)
        self.assertEqual(root.ref.source, Order.objects.ref.source)
        self.assertEqual(root.ref.key_id, Order.objects.ref.key_id)
        self.assertTrue(all(field.alias == root.ref.alias for field in root.ref.key))
        @query
        def declaration():
            return root.objects.select(root.c.order_id).limit(2).all()
        self.assertIn('SELECT "r"."orderId"', render_logical(capture(declaration).variants[0]))

    def test_wrong_original_target_and_tampered_metadata_refuse(self):
        with self.assertRaisesRegex(TypeError, "Record/Key"):
            Order.c.customer.to_alias(Order.alias(RootOrder))
        alias = Customer.alias(FirstCustomer)
        with self.assertRaisesRegex(TypeError, "original generated"):
            Order.c.customer.to_alias(RecordAlias(replace(alias.ref, logical_name="Wrong"), FirstCustomer))

    def test_duplicate_alias_and_unjoined_alias_refuse(self):
        first, second = Customer.alias(FirstCustomer), Customer.alias(SecondCustomer)
        @query
        def duplicate():
            return Order.objects.join(Order.c.customer.to_alias(first)).join(Order.c.customer.to_alias(first)).limit(2).all()
        with self.assertRaisesRegex(ValueError, "distinct explicit alias"):
            capture(duplicate)
        @query
        def unjoined():
            return Order.objects.join(Order.c.customer.to_alias(first)).select(second.c.name).limit(2).all()
        with self.assertRaisesRegex(TypeError, "another Record"):
            capture(unjoined)
