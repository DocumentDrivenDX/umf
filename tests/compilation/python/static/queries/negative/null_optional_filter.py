# @covers US-082-AC2
from commerce import Order
from umf_access.dsl import Param, if_present, query

@query
def declaration(status: Param[str | None]):
    return Order.objects.filter(if_present(status, lambda value: Order.c.memo == value)).limit(10).all()
