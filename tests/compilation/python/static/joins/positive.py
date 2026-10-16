from typing import assert_type
from commerce import Order, Customer, OrderCustomer, OrderCustomerProjection, OrderKey
from umf_access.dsl import Param, Terminal, query

@query
def joined(name: Param[str]) -> Terminal[list[OrderCustomer]]:
    return (Order.objects.join(Order.c.customer)
            .filter(Customer.c.name == name)
            .order_by(Customer.c.name.asc())
            .into(OrderCustomerProjection).limit(10).all())

@query
def selected() -> Terminal[list[tuple[str, str | None]]]:
    value = Order.objects.join(Order.c.customer).select(Order.c.order_id, Customer.c.name).limit(10).all()
    assert_type(value, Terminal[list[tuple[str, str | None]]])
    return value
