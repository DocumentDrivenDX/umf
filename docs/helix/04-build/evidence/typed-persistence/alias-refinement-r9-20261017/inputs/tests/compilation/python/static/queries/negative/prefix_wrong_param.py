"""@covers US-082-AC8: a named prefix retains its string carrier."""
from commerce import Order
from umf_access.dsl import Param, query

@query
def bad(prefix: Param[int]):
    return Order.objects.filter(Order.c.order_id.starts_with(prefix)).limit(10).all()
