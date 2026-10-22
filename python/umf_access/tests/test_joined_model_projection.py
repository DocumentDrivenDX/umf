# SPDX-License-Identifier: MIT OR Apache-2.0
"""Generated model-class projection capture matches existing owned wrappers."""
import unittest

from commerce import (
    Customer,
    Order,
    OrderCustomer,
    OrderCustomerProjection,
)
from umf_access.capture import capture
from umf_access.dsl import query


class JoinedModelProjectionTests(unittest.TestCase):
    def test_joined_model_matches_original_wrapper(self):
        @query
        def model():return Order.objects.join(Order.c.customer).into(OrderCustomer).limit(3).all()
        @query
        def wrapper():return Order.objects.join(Order.c.customer).into(OrderCustomerProjection).limit(3).all()
        self.assertEqual(capture(model).variants[0].node,capture(wrapper).variants[0].node)
    def test_grouped_model_matches_original_wrapper(self):
        @query
        def model():return Order.objects.join(Order.c.customer).group_by(Order.c.order_id,Customer.c.name).into(OrderCustomer).limit(3).all()
        @query
        def wrapper():return Order.objects.join(Order.c.customer).group_by(Order.c.order_id,Customer.c.name).into(OrderCustomerProjection).limit(3).all()
        self.assertEqual(capture(model).variants[0].node,capture(wrapper).variants[0].node)
