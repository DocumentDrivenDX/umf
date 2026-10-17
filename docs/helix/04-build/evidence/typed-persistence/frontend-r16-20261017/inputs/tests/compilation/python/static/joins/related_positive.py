from typing import assert_type
from commerce import Customer, CustomerKey, Order, OrderKey
from umf_access.dsl import Query, Terminal, query

@query
def forward() -> Terminal[list[Customer]]:
    selected = Order.objects.related(Order.c.customer)
    assert_type(selected, Query[Customer, Customer, CustomerKey])
    return selected.limit(5).all()

@query
def inverse() -> Terminal[list[Order]]:
    selected = Customer.objects.related(Order.c.customer.inverse())
    assert_type(selected, Query[Order, Order, OrderKey])
    return selected.limit(5).all()

@query
def source_projection() -> Terminal[list[tuple[str]]]:
    selected = Order.objects.select(Order.c.order_id).related(Order.c.customer)
    assert_type(selected, Query[Customer, Customer, CustomerKey])
    return selected.select(Customer.c.name).limit(5).all()
