"""@covers US-082-AC8: nullable parameters retain their scalar type."""
from commerce import Order
from umf_access.dsl import Param, query

@query
def bad(value: Param[int | None]):
    return Order.objects.filter(Order.c.order_id.is_not_distinct_from(value)).limit(10).all()
