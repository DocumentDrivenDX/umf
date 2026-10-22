"""@covers US-082-AC8: prefix is a string, never a numeric operand."""
from commerce import Order
from umf_access.dsl import query

@query
def bad():
    return Order.objects.filter(Order.c.order_id.starts_with(123)).limit(10).all()
