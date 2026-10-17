from commerce import Customer, CustomerKey, Order, OrderCustomer
from umf_access.dsl import Terminal, WithKeys, query

@query
def joined_tuple() -> Terminal[list[WithKeys[tuple[str,str|None],CustomerKey]]]:
    return Order.objects.join(Order.c.customer).select(Order.c.order_id,Customer.c.name).include_keys(Order.c.customer,limit=2).filter(Customer.c.name!='x').limit(3).all()

@query
def joined_model() -> Terminal[list[WithKeys[OrderCustomer,CustomerKey]]]:
    return Order.objects.join(Order.c.customer).into(OrderCustomer).include_keys(Order.c.customer,limit=2).limit(3).all()

class RootOrder:
    pass
class JoinedCustomer:
    pass
root=Order.alias(RootOrder)
customer=Customer.alias(JoinedCustomer)
@query
def aliased_root() -> Terminal[list[WithKeys[tuple[str,str|None],CustomerKey]]]:
    return root.objects.join(root.c.customer.to_alias(customer)).select(root.c.order_id,customer.c.name).include_keys(root.c.customer,limit=2).filter(customer.c.name!='x').limit(3).all()
