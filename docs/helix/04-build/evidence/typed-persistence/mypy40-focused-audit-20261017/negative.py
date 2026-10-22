from decimal import Decimal
from typing import assert_type
from commerce.models import Order, Customer
from commerce.keys import OrderKey
from relationship_shop.models import Order as NullableOrder
from umf_access.dsl._expressions import Bucket
class BadTag: pass

def wrong_forms() -> None:
    assert_type(NullableOrder.c.units.bucket_width(1),Bucket[NullableOrder,int])
    assert_type(Order.c.amount.bucket_width(1),Bucket[Order,int])
    Order.c.customer.to_alias(Order.alias(BadTag))
    Order.c.customer.has(OrderKey(order_id='wrong-record'))
    Customer.objects.related(Order.c.customer)
