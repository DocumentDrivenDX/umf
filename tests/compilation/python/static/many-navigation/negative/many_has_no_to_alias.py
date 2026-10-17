from many_keys import Order, Customer
from umf_access.dsl import query
@query
def invalid():
    return Order.c.customers.to_alias(None)
