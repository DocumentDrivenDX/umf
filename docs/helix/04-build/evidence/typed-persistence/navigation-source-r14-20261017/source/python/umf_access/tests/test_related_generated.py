"""Original generated target-set navigation retains both query meanings."""
import unittest

from commerce import Customer, Order
from umf_access.capture import capture
from umf_access.dsl import CaptureError, Param, query
from umf_access.dsl.render import render_related_logical


class RelatedGeneratedTests(unittest.TestCase):
    def test_forward_source_has_no_invented_cap(self):
        @query
        def selected(amount: Param[int]):
            return Order.objects.filter(Order.c.revision > amount).related(Order.c.customer).limit(5).all()
        rendered = render_related_logical(capture(selected).variants[0])
        self.assertIsNotNone(rendered)
        self.assertIn('"commerce"."Order"', rendered.source_sql)
        self.assertIn(':amount', rendered.source_sql)
        self.assertNotIn('LIMIT', rendered.source_sql)
        self.assertIn('"commerce"."Customer"', rendered.target_sql)
        self.assertTrue(rendered.target_sql.endswith('LIMIT 5'))
        self.assertEqual(rendered.relationship, {'module':'commerce','id':'customer','direction':'forward'})

    def test_inverse_preserves_explicit_source_selection(self):
        @query
        def selected():
            return Customer.objects.order_by(Customer.c.customer_id.asc()).limit(2).related(Order.c.customer.inverse()).limit(7).all()
        rendered = render_related_logical(capture(selected).variants[0])
        self.assertIn('ORDER BY', rendered.source_sql)
        self.assertTrue(rendered.source_sql.endswith('LIMIT 2'))
        self.assertTrue(rendered.target_sql.endswith('LIMIT 7'))
        self.assertEqual(rendered.relationship['direction'], 'inverse')

    def test_owner_page_bound_does_not_cap_source_or_rewrite_queries(self):
        @query
        def selected(amount: Param[int]):
            return Order.objects.filter(Order.c.revision > amount).limit(17).related(Order.c.customer).all()
        variant = capture(selected).variants[0]
        with self.assertRaises(CaptureError):
            render_related_logical(variant)
        rendered = render_related_logical(variant, owner_bound=True)
        self.assertTrue(rendered.source_sql.endswith('LIMIT 17'))
        self.assertIn(':amount', rendered.source_sql)
        self.assertNotIn('LIMIT', rendered.target_sql)
        self.assertNotIn('EXISTS', rendered.target_sql)
        self.assertEqual(rendered.relationship, {'module':'commerce','id':'customer','direction':'forward'})

    def test_wrong_source_and_nested_profile_refuse(self):
        @query
        def wrong():
            return Customer.objects.related(Order.c.customer).limit(1).all()
        with self.assertRaises((TypeError, CaptureError)):
            capture(wrong)
        @query
        def nested():
            return Order.objects.related(Order.c.customer).related(Order.c.customer.inverse()).limit(1).all()
        with self.assertRaisesRegex(CaptureError, 'WR-A6 nested'):
            render_related_logical(capture(nested).variants[0])
