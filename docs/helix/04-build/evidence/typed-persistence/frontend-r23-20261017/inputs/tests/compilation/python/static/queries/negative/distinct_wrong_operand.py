"""@covers US-082-AC8: null-safe comparison preserves the column carrier."""
from commerce import Order
from umf_access.dsl import query

@query
def bad():
    return Order.objects.filter(Order.c.order_id.is_distinct_from(123)).limit(10).all()
