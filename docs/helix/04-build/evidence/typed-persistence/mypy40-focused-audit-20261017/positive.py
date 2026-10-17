from decimal import Decimal
from typing import assert_type
from commerce.models import Order, Customer
from commerce.keys import OrderKey, CustomerKey
from relationship_shop.models import Order as NullableOrder
from umf_access.dsl import AliasOwner, OptionalJoin, Query
from umf_access.dsl._expressions import Bucket
class CustomerTag: pass

def numeric_and_alias() -> None:
    assert_type(Order.c.revision.bucket_width(10), Bucket[Order,int])
    assert_type(Order.c.revision.bucket_width(Decimal('1')), Bucket[Order,Decimal])
    assert_type(Order.c.amount.bucket_width(1), Bucket[Order,Decimal])
    assert_type(Order.c.amount.bucket_width(Decimal('1')), Bucket[Order,Decimal])
    assert_type(NullableOrder.c.units.bucket_width(1), Bucket[NullableOrder,int|None])
    assert_type(NullableOrder.c.units.bucket_width(Decimal('1')), Bucket[NullableOrder,Decimal|None])
    assert_type(NullableOrder.c.amount.bucket_width(1), Bucket[NullableOrder,Decimal|None])
    assert_type(NullableOrder.c.amount.bucket_width(Decimal('1')), Bucket[NullableOrder,Decimal|None])
    aliased=Order.c.customer.to_alias(Customer.alias(CustomerTag))
    assert_type(aliased,OptionalJoin[Order,AliasOwner[Customer,CustomerTag],CustomerKey])
    assert_type(Order.objects.related(Order.c.customer),Query[Customer,Customer,CustomerKey])
    assert_type(Customer.objects.related(Order.c.customer.inverse()),Query[Order,Order,OrderKey])
