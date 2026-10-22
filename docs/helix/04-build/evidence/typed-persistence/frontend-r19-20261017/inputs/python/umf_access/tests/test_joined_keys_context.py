"""Original entity-row hydration preserves joined projection and graph context."""
import unittest

from commerce import Customer, Order, OrderCustomer
from umf_access.capture import capture
from umf_access.dsl import CaptureError, query
from umf_access.dsl.render import render_logical

BINDING={"tables":[{"logical":["commerce","Customer"]}],"relationships":[{"id":"customer","source":["commerce","Order"],"target":["commerce","Customer"],"pairs":[["orderId","customerId"]],"toOne":True}]}


class JoinedKeyContextTests(unittest.TestCase):
    def test_selected_join_row_hydrates_without_erasing_join_owner(self):
        @query
        def selected():
            return (Order.objects.join(Order.c.customer).select(Order.c.order_id,Customer.c.name)
                    .include_keys(Order.c.customer,limit=2).filter(Customer.c.name!='absent')
                    .order_by(Customer.c.name.asc()).limit(3).all())
        variant=capture(selected).variants[0]
        text=render_logical(variant,binding=BINDING)
        self.assertIn('LEFT JOIN',text)
        self.assertIn('RELATED_KEYS("r"."customer", 2)',text)
        self.assertIn('"j1"."name"',text)

    def test_declared_projection_model_hydrates(self):
        @query
        def selected():
            return Order.objects.join(Order.c.customer).into(OrderCustomer).include_keys(Order.c.customer,limit=2).limit(3).all()
        self.assertIn('RELATED_KEYS',render_logical(capture(selected).variants[0],binding=BINDING))

    def test_grouped_original_entity_identity_is_not_invented(self):
        @query
        def wrong():
            return Order.objects.join(Order.c.customer).group_by(Order.c.order_id).include_keys(Order.c.customer,limit=2).limit(3).all()
        with self.assertRaisesRegex(CaptureError,'original entity row'):
            capture(wrong)
