from typing import assert_type
from commerce import Customer, Order
from umf_access.dsl import AliasOwner, Column, Terminal, query

class FirstCustomer:
    pass
class SecondCustomer:
    pass
class RootOrder:
    pass

first = Customer.alias(FirstCustomer)
second = Customer.alias(SecondCustomer)
root = Order.alias(RootOrder)
assert_type(first.c.name, Column[AliasOwner[Customer, FirstCustomer], str])

@query
def repeated() -> Terminal[list[tuple[str | None, str | None]]]:
    return Order.objects.join(Order.c.customer.to_alias(first)).join(Order.c.customer.to_alias(second)).select(first.c.name, second.c.name).limit(3).all()

@query
def aliased_root() -> Terminal[list[tuple[str, str | None]]]:
    return root.objects.join(root.c.customer.to_alias(first)).select(root.c.order_id, first.c.name).limit(3).all()

@query
def eight_positions() -> Terminal[list[tuple[str, str | None, str, str | None, str, str | None, str, str | None]]]:
    return root.objects.join(root.c.customer.to_alias(first)).select(root.c.order_id, first.c.name, root.c.order_id, first.c.name, root.c.order_id, first.c.name, root.c.order_id, first.c.name).limit(3).all()
