from typing import assert_type

from many_keys import Customer, Order
from many_keys.keys import CustomerKey, CustomerPkKey, OrderKey, OrderPkKey
from umf_access.dsl import InverseManyNavigation, ManyNavigation, Query, WithKeys


def forward_inverse_phantoms() -> None:
    assert_type(Order.c.customers,ManyNavigation[Order,Customer,OrderKey,CustomerKey,CustomerPkKey,OrderPkKey])
    assert_type(Order.c.customers.inverse(),InverseManyNavigation[Customer,Order,CustomerKey,OrderKey,CustomerPkKey,OrderPkKey])
    assert_type(Order.objects.related(Order.c.customers),Query[Customer,Customer,CustomerKey])
    assert_type(Customer.objects.related(Order.c.customers.inverse()),Query[Order,Order,OrderKey])
    assert_type(Order.objects.include_keys(Order.c.customers,limit=2),Query[Order,WithKeys[Order,CustomerPkKey],OrderKey])
    assert_type(Customer.objects.include_keys(Order.c.customers.inverse(),limit=2),Query[Customer,WithKeys[Customer,OrderPkKey],CustomerKey])
    Order.c.customers.has(CustomerPkKey(customer_id='x'))
    Order.c.customers.inverse().has(OrderPkKey(id='x'))
